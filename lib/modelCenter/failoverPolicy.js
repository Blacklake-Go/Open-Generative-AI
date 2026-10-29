import { modelModality, normalizeGenerationTaskType } from './capabilitySchema.js';

/*
 * 跨逻辑模型备用的准入规则。
 *
 * 用户选择的是逻辑模型，而 backup_model_id 是管理员声明的“等价替代”配置。
 * 只有同时满足以下条件才允许在同一笔报价的冻结额度内切换：
 * - 任务尚未被上游受理，也没有未知的受理结果；
 * - 失败原因不是内容/参数明确拒绝（不得用换模型绕过规则）；
 * - 备用模型处于启用、可见状态，且与主模型输出模态、任务类型等价；
 * - 原报价存在可用的故障转移成本上限（maxFailoverCostCny/Usd）。
 *
 * 这里只做纯判定，不读数据库、不发请求，便于用 node --test 直接驱动。
 */

export const CROSS_MODEL_FAILOVER = Object.freeze({
  ALLOWED: 'CROSS_MODEL_FAILOVER_ALLOWED',
  ALREADY_TRIED: 'CROSS_MODEL_FAILOVER_ALREADY_TRIED',
  UNCONFIRMED_SUBMISSION: 'CROSS_MODEL_FAILOVER_UNCONFIRMED_SUBMISSION',
  NON_RETRYABLE_ERROR: 'CROSS_MODEL_FAILOVER_NON_RETRYABLE_ERROR',
  CANVAS_PINNED: 'CROSS_MODEL_FAILOVER_CANVAS_PINNED',
  NOT_CONFIGURED: 'CROSS_MODEL_FAILOVER_NOT_CONFIGURED',
  BACKUP_INACTIVE: 'CROSS_MODEL_FAILOVER_BACKUP_INACTIVE',
  BACKUP_HIDDEN: 'CROSS_MODEL_FAILOVER_BACKUP_HIDDEN',
  MODALITY_MISMATCH: 'CROSS_MODEL_FAILOVER_MODALITY_MISMATCH',
  TASK_TYPE_UNVERIFIED: 'CROSS_MODEL_FAILOVER_TASK_TYPE_UNVERIFIED',
  TASK_TYPE_MISMATCH: 'CROSS_MODEL_FAILOVER_TASK_TYPE_MISMATCH',
  QUOTE_MODEL_MISMATCH: 'CROSS_MODEL_FAILOVER_QUOTE_MODEL_MISMATCH',
  BUDGET_UNKNOWN: 'CROSS_MODEL_FAILOVER_BUDGET_UNKNOWN',
});

const ROUTE_CEILING_SOURCE = 'generation_quote_failover_ceiling';

function objectValue(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function listValues(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isDisabled(model) {
  const status = String(model?.status || '').toLowerCase();
  return model?.is_active === false || status === 'disabled' || status === 'inactive';
}

/**
 * 逻辑模型的能力声明。任务类型只认已声明的值：缺失即“未验证”，
 * 不能因为两个模型名字相似就推断等价。
 */
export function modelCapabilityProfile(model) {
  const metadata = objectValue(model?.capabilities || model?.metadata_json);
  const declared = [
    ...listValues(metadata.supported_task_types),
    ...listValues(metadata.task_types),
    ...listValues(metadata.modes),
  ];
  const nested = Array.isArray(metadata.capabilities) ? metadata.capabilities : [];
  for (const item of nested) {
    const capability = objectValue(item);
    const task = capability.taskType || capability.task_type;
    if (typeof task === 'string' && task.trim()) declared.push(task.trim());
  }
  return {
    modelId: model?.id || null,
    modality: modelModality(model || {}) || null,
    taskTypes: [...new Set(declared.map(normalizeGenerationTaskType).filter(Boolean))].sort(),
    capabilityVersion: metadata.capability_version || metadata.capabilityVersion || null,
  };
}

function fail(code, reason, evidence) {
  return { allowed: false, code, reason, evidence, routeOptions: null };
}

export function evaluateCrossModelFailover({
  studioId = null,
  requestedModel = null,
  backupModel = null,
  parameters = {},
  routeErrorCode = null,
  triggeringErrorCode = null,
  nonRetryableErrorCodes = null,
  quoteSnapshot = null,
  attemptedProviderIds = [],
  alreadyTriedBackup = false,
  hasProviderReceipt = false,
  submissionOutcomeUnknown = false,
  now = Date.now(),
} = {}) {
  const primary = modelCapabilityProfile(requestedModel);
  const backup = modelCapabilityProfile(backupModel);
  const quote = objectValue(quoteSnapshot);
  const maxCostCny = finiteNumber(quote.maxFailoverCostCny);
  const maxCostUsd = finiteNumber(quote.maxFailoverCostUsd);
  const requestedTask = normalizeGenerationTaskType(
    parameters.task_type || parameters.taskType || parameters.generation_mode || '',
  );
  const evidence = {
    studioId: studioId || null,
    primaryModelId: primary.modelId,
    backupModelId: backup.modelId,
    routeErrorCode: routeErrorCode || null,
    triggeringErrorCode: triggeringErrorCode || null,
    requestedTaskType: requestedTask || null,
    capabilityVersion: { primary: primary.capabilityVersion, backup: backup.capabilityVersion },
    modality: { primary: primary.modality, backup: backup.modality },
    taskTypes: { primary: primary.taskTypes, backup: backup.taskTypes },
    quoteId: quote.id || quote.quoteId || null,
    budget: {
      source: quote.candidates?.length || maxCostCny !== null || maxCostUsd !== null
        ? ROUTE_CEILING_SOURCE : null,
      maxCostCny,
      maxCostUsd,
      fxSnapshot: objectValue(quote.fxSnapshot),
    },
    attemptedProviderIds: [...new Set((attemptedProviderIds || []).map(String))],
    checkedAt: new Date(now).toISOString(),
  };

  // 1. 已受理或受理未知：只能恢复原任务，不能再创建第二笔可能收费的调用。
  if (hasProviderReceipt || submissionOutcomeUnknown) {
    return fail(CROSS_MODEL_FAILOVER.UNCONFIRMED_SUBMISSION,
      '上游已受理或受理结果未知，必须恢复原任务，不能切换备用模型', evidence);
  }

  // 2. 内容/参数被明确拒绝时，换模型属于绕过规则。
  const nonRetryable = triggeringErrorCode && nonRetryableErrorCodes
    && (typeof nonRetryableErrorCodes.has === 'function'
      ? nonRetryableErrorCodes.has(triggeringErrorCode)
      : nonRetryableErrorCodes.includes(triggeringErrorCode));
  if (nonRetryable) {
    return fail(CROSS_MODEL_FAILOVER.NON_RETRYABLE_ERROR,
      `错误 ${triggeringErrorCode} 属明确拒绝，不能通过切换备用模型绕过`, evidence);
  }

  if (alreadyTriedBackup) {
    return fail(CROSS_MODEL_FAILOVER.ALREADY_TRIED, '备用模型已经尝试过，不再重复切换', evidence);
  }

  // 3. Canvas 的主模型由用户明确选择，不自动更换。
  if (String(studioId || '').toLowerCase() === 'canvas') {
    return fail(CROSS_MODEL_FAILOVER.CANVAS_PINNED, 'Canvas 任务不自动切换逻辑模型', evidence);
  }

  if (!requestedModel || !backupModel || !primary.modelId || !backup.modelId
    || String(primary.modelId) === String(backup.modelId)) {
    return fail(CROSS_MODEL_FAILOVER.NOT_CONFIGURED, '未配置可用的备用逻辑模型', evidence);
  }
  if (isDisabled(backupModel)) {
    return fail(CROSS_MODEL_FAILOVER.BACKUP_INACTIVE, '备用模型未启用，不能作为故障转移目标', evidence);
  }
  if (backupModel.is_visible === false) {
    return fail(CROSS_MODEL_FAILOVER.BACKUP_HIDDEN, '备用模型不可见，不能作为故障转移目标', evidence);
  }

  // 4. 能力等价：输出模态一致，且主模型声明的任务类型被备用模型完整覆盖。
  if (!primary.modality || !backup.modality || primary.modality !== backup.modality) {
    return fail(CROSS_MODEL_FAILOVER.MODALITY_MISMATCH,
      `输出模态不一致（${primary.modality || 'unknown'} ≠ ${backup.modality || 'unknown'}）`, evidence);
  }
  if (!primary.taskTypes.length || !backup.taskTypes.length) {
    return fail(CROSS_MODEL_FAILOVER.TASK_TYPE_UNVERIFIED,
      '模型缺少任务类型声明，无法证明能力等价', evidence);
  }
  if (requestedTask && (!primary.taskTypes.includes(requestedTask) || !backup.taskTypes.includes(requestedTask))) {
    return fail(CROSS_MODEL_FAILOVER.TASK_TYPE_MISMATCH,
      `请求的任务类型 ${requestedTask} 未被主模型和备用模型同时声明`, evidence);
  }
  const missingTasks = primary.taskTypes.filter((task) => !backup.taskTypes.includes(task));
  if (missingTasks.length) {
    return fail(CROSS_MODEL_FAILOVER.TASK_TYPE_MISMATCH,
      `备用模型未声明主模型的任务类型：${missingTasks.join(',')}`, { ...evidence, missingTasks });
  }
  evidence.taskType = requestedTask || primary.taskTypes[0] || null;

  // 5. 成本上限：报价必须带有可用的故障转移上限，否则只能失败退款。
  if (maxCostCny === null && maxCostUsd === null) {
    return fail(CROSS_MODEL_FAILOVER.BUDGET_UNKNOWN,
      '原报价没有可用的故障转移成本上限，不能跨模型切换', evidence);
  }
  const quoteModelId = quote.modelId || quote.model_id || null;
  if (quoteModelId && String(quoteModelId) !== String(primary.modelId)) {
    return fail(CROSS_MODEL_FAILOVER.QUOTE_MODEL_MISMATCH,
      `报价属于模型 ${quoteModelId}，与当前任务模型 ${primary.modelId} 不一致`, evidence);
  }

  return {
    allowed: true,
    code: CROSS_MODEL_FAILOVER.ALLOWED,
    reason: `备用模型 ${backup.modelId} 与主模型 ${primary.modelId} 能力等价，且在原报价成本上限内`,
    evidence,
    routeOptions: {
      // 备用模型的候选线路不在原报价的候选白名单里，因此不再绑定原 quoteId；
      // 预算改用报价的故障转移上限，策略与汇率继续沿用报价快照。
      quoteId: null,
      routingMode: quote.routingMode || null,
      fxSnapshot: objectValue(quote.fxSnapshot),
      costCeiling: {
        maxCostCny,
        maxCostUsd,
        quoteId: evidence.quoteId,
        source: ROUTE_CEILING_SOURCE,
      },
    },
  };
}
