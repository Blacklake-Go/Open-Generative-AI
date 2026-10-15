import 'server-only';

import { logAudit } from '../admin/audit.js';
import { publicErrorMessage } from '../security/publicError.js';
import { withTransaction } from '../db/index.js';
import { commitCredits, reserveCredits, voidCredits } from '../financial/creditService.js';
import { findModelByEndpointOrId } from '../repositories/models.js';
import { assertPublicModelOrderable } from './models.js';
import {
  claimQueuedGeneration,
  createGenerationTask as insertGenerationTask,
  findCreationById,
  findUserCreationByIdempotency,
  insertGenerationEvent,
  linkReservationToCreation,
  listStaleGenerationIds,
  listDuePollingCreations,
  claimDuePollingCreation,
  scheduleNextPoll,
  updateGenerationOutcome,
  acquireCreationIdempotencyLock,
} from '../repositories/creations.js';
import { recordProviderCall } from '../repositories/providers.js';
import { getGenerationProvider } from './generationProviders.js';
import { createResilientProvider } from './providerRuntime.js';
import { assertGenerationTransition } from './generationState.js';
import { getAssetUrl, getStorageService, ingestRemoteFile } from '../storage/storageService.js';
import { getUserAssetDownload, syncCreationToAsset } from './assets.js';
import { routeGenerationTask } from './smartRouter.js';
import {
  getProviderAdapter,
  NON_RETRYABLE_ERROR_CODES,
  PROVIDER_ERROR_CODES,
  shouldTripProviderCircuitBreaker,
} from '../adapters/index.js';
import { createGenerationAttempt, updateGenerationAttemptOutcome } from '../repositories/attempts.js';
import { insertProviderCostRecord } from '../repositories/costRecords.js';
import { createGenerationQuote, verifyAndConsumeQuote } from './pricingEngine.js';
import { recordProviderSuccess, recordProviderFailure } from './circuitBreaker.js';
import { resolveCanvasOwnedAssetReferences } from './canvasAssetReferences.js';

const TASK_STATUSES = new Set(['queued', 'processing', 'succeeded', 'failed', 'cancelled']);

async function persistPrivateGenerationAsset(creation, transaction, testDependencies = null) {
  if (process.env.NODE_ENV === 'test' && testDependencies?.syncAsset === false) return null;
  const syncAsset = typeof testDependencies?.syncAsset === 'function'
    ? testDependencies.syncAsset
    : syncCreationToAsset;
  try {
    return await syncAsset(creation, { transaction, required: true });
  } catch (error) {
    if (String(error?.code || '').startsWith('STORAGE_')) throw error;
    throw Object.assign(new Error('生成结果未能写入用户私有资产库'), {
      code: 'STORAGE_ASSET_SYNC_FAILED',
      cause: error,
    });
  }
}

function inferGenerationAssetType(creation) {
  let input = creation?.input_summary_json;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { input = {}; }
  }
  const declaredType = String(
    input?.modelType
      || input?.mediaType
      || input?.outputType
      || input?.parameters?.mediaType
      || input?.parameters?.outputType
      || '',
  ).toLowerCase();
  if (declaredType.includes('video')) return 'video';
  if (declaredType.includes('audio') || declaredType.includes('music')) return 'audio';

  const studio = String(creation?.studio_id || '').toLowerCase();
  const model = String(creation?.model || '').toLowerCase();
  if (studio.includes('video') || studio.includes('motion') || studio.includes('cinema') || model.includes('video')) return 'video';
  if (studio.includes('audio') || studio.includes('music') || studio.includes('sound') || model.includes('audio')) return 'audio';
  // Legacy creations may not have modelType in input_summary_json. These
  // canonical IDs are video models even though their short IDs omit "video".
  if (['kling-2.6', 'wan-2.1', 'hailuo-02'].includes(model)) return 'video';
  return 'image';
}

async function archiveGenerationResult({ resultUrl, creation, sourceProvider, providerRequestId }) {
  // Keep provider success and storage state separate while the result is being
  // downloaded/verified. A transient COS failure must not masquerade as a
  // failed AI generation or leave an apparently ready asset without storage.
  await updateGenerationOutcome(creation.id, {
    storageStatus: 'pending',
    expectedStatus: 'processing',
  }).catch(() => {});
  const delays = String(process.env.STORAGE_INGEST_RETRY_DELAYS_MS || '0,250,1000')
    .split(',').map((value) => Math.max(0, Number(value) || 0)).slice(0, 5);
  let lastError = null;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    try {
      const stored = await ingestRemoteFile({
        url: resultUrl,
        userId: creation.user_id,
        type: inferGenerationAssetType(creation),
        taskId: creation.id,
        sourceProvider: sourceProvider || creation.provider,
        providerRequestId,
        filename: `${creation.id}.${inferGenerationAssetType(creation) === 'video' ? 'mp4' : inferGenerationAssetType(creation) === 'audio' ? 'mp3' : 'webp'}`,
      });
      return { ...stored, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
    }
  }
  throw Object.assign(lastError || new Error('生成结果归档失败'), {
    code: lastError?.code || 'STORAGE_INGEST_FAILED',
    storageAttempts: delays.length,
  });
}

async function finalizeStorageFailure({ creation, startedAt, providerRequestId = null, actualCostUsd = null, error, attemptId = null, providerId = null, providerModelId = null, estimatedCostUsd = null, priceVersionId = null, fxSnapshot = {}, dependencies = null }) {
  const errorCode = error.code || 'STORAGE_INGEST_FAILED';
  const errorReason = '生成结果无法保存，预扣积分已原路退回。请重新提交任务。';
  const executeWithTransaction = dependencies?.withTransaction || withTransaction;
  const executeVoidCredits = dependencies?.voidCredits || voidCredits;
  const executeUpdateOutcome = dependencies?.updateGenerationOutcome || updateGenerationOutcome;
  const executeCostRecord = dependencies?.insertProviderCostRecord || insertProviderCostRecord;
  const executeAddEvent = dependencies?.addGenerationEvent || addGenerationEvent;
  const executeLogAudit = dependencies?.logAudit || logAudit;
  const executeFindCreation = dependencies?.findCreationById || findCreationById;
  return executeWithTransaction(async (tx) => {
    const updated = await executeUpdateOutcome(creation.id, {
      status: 'failed',
      resultUrl: null,
      storageStatus: 'failed',
      storageErrorCode: errorCode,
      storageAttempts: error.storageAttempts || 3,
      providerRequestId,
      errorCode,
      errorReason,
      actualCostUsd,
      durationMs: Date.now() - startedAt,
      expectedStatus: 'processing',
      transaction: tx,
    });
    if (!updated) return executeFindCreation(creation.id, tx);
    if (creation.reservation_id) {
      await voidCredits({
        reservationId: creation.reservation_id,
        reason: '生成结果无法保存，释放预扣积分',
        expectedUserId: creation.user_id,
        transaction: tx,
      });
    }
    if (providerId) {
      await executeCostRecord({
        jobId: creation.id, attemptId, providerId, modelId: providerModelId || creation.model,
        creditsCharged: 0, estimatedCostUsd, actualCostUsd, currency: 'USD',
        priceVersionId, fxSnapshot,
        costSource: actualCostUsd === null ? 'estimate_only' : 'provider_reported',
        reconciliationStatus: actualCostUsd === null ? 'pending_reconciliation' : 'provider_reported',
        transaction: tx,
      });
    }
    await executeAddEvent(updated, 'STORAGE_FAILED', {
      fromStatus: 'processing',
      toStatus: 'failed',
      providerRequestId,
      metadata: { errorCode, storageStatus: 'failed', creditsReleased: Boolean(creation.reservation_id) },
      transaction: tx,
    });
    await executeLogAudit({
      actor: { id: 'system:storage', email: 'system@supdance.local' },
      action: 'generation.storage_failed',
      targetType: 'creation',
      targetId: creation.id,
      riskLevel: 'high',
      after: { userId: creation.user_id, provider: creation.provider, status: 'failed', storageErrorCode: errorCode, creditsReleased: Boolean(creation.reservation_id) },
      transaction: tx,
    });
    return updated;
  });
}

const MAX_PROMPT_CHARS = 4000;

// 面向用户的失败文案：必须说清真发生了什么，且不能把供应商内部错误原文/渠道名暴露出去。
const PROVIDER_FAILURE_TEXT = Object.freeze({
  INSUFFICIENT_PROVIDER_BALANCE: 'AI 供应商额度不足，任务已失败并解冻额度，请稍后重试或更换模型',
  AUTH_ERROR: 'AI 供应商凭据不可用，任务已失败并解冻额度，请联系管理员',
  RATE_LIMIT: 'AI 供应商当前请求过多，任务已失败并解冻额度，请稍后重试',
  TIMEOUT: 'AI 供应商处理超时，任务已失败并解冻额度，请稍后重试',
  MODEL_ROUTE_UNAVAILABLE: '该模型的服务端点当前不可用，任务已失败并解冻额度，请稍后重试或联系支持',
  MODEL_UNAVAILABLE: '该模型当前不可用，任务已失败并解冻额度，请稍后重试或更换模型',
  NETWORK_ERROR: 'AI 供应商连接异常，任务已失败并解冻额度，请稍后重试',
  PROVIDER_INTERNAL_ERROR: 'AI 供应商内部错误，任务已失败并解冻额度，请稍后重试',
  CANVAS_ASSET_URL_UNAVAILABLE: '参考图素材暂时无法读取，任务已失败并解冻额度；请确认参考图已上传成功后重试',
  CANVAS_ASSET_REFERENCE_INVALID: '参考图素材 ID 无效，任务已失败并解冻额度；请重新上传参考图后重试',
  CANVAS_ASSET_OWNER_REQUIRED: '参考图素材权限校验失败，任务已失败并解冻额度；请重新登录后重试',
});

const MEDIA_INPUT_KEYS = Object.freeze([
  'image_url', 'imageUrl', 'image', 'images', 'input_image', 'inputImage', 'init_image',
  'reference_image', 'referenceImage', 'reference_images', 'image_urls', 'first_frame_image', 'last_frame_image',
  'mask', 'mask_url', 'video_url', 'videoUrl', 'audio_url', 'audioUrl', 'asset_url', 'file_url',
]);

function parseJsonObject(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value) || {}; } catch { return {}; }
  }
  return value && typeof value === 'object' ? value : {};
}

async function resolveCanvasProviderParameters(creation, parameters, providerId = '') {
  if (creation?.studio_id !== 'canvas') return parameters;
  return resolveCanvasOwnedAssetReferences(parameters, {
    userId: creation.user_id,
    getUserAssetDownload,
    getAssetUrl,
    getAssetBytes: async (objectKey) => (await getStorageService()).download({ key: objectKey }),
    providerId,
  });
}

async function providerCreationWithCanvasReferences(creation) {
  if (creation?.studio_id !== 'canvas') return creation;
  const input = parseJsonObject(creation.input_summary_json);
  const parameters = await resolveCanvasProviderParameters(creation, input.parameters || {}, creation.provider);
  return { ...creation, input_summary_json: JSON.stringify({ ...input, parameters }) };
}

function hasMediaInput(parameters) {
  const src = parseJsonObject(parameters);
  return MEDIA_INPUT_KEYS.some((key) => {
    const value = src[key];
    if (typeof value === 'string') return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  });
}

function reportedActualCost(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function safeAttemptParameters(parameters = {}) {
  const source = parseJsonObject(parameters);
  const allowed = [
    'task_type', 'taskType', 'generation_mode', 'resolution', 'size', 'output_resolution',
    'aspect_ratio', 'duration', 'video_duration', 'output_duration', 'input_duration',
    'quality', 'quality_mode', 'mode', 'n', 'count', 'num_images', 'batch_size',
    'input_tokens', 'output_tokens', 'estimated_input_tokens', 'estimated_output_tokens',
    'max_tokens', 'region', 'seed',
  ];
  const safe = {};
  for (const key of allowed) {
    const value = source[key];
    if (['string', 'number', 'boolean'].includes(typeof value)) safe[key] = value;
  }
  safe.referenceImageCount = Array.isArray(source.reference_images) ? source.reference_images.length
    : Array.isArray(source.image_urls) ? source.image_urls.length : 0;
  safe.hasReferenceVideo = Boolean(source.input_video || source.video_url || source.source_video);
  return safe;
}

// 是否需要提示词按规范目录 capabilities 判定，不在代码里写死模型清单。
function requiresPrompt({ model, parameters }) {
  const caps = parseJsonObject(model?.metadata_json);
  if (typeof caps.promptRequired === 'boolean') return caps.promptRequired;
  const modes = (Array.isArray(caps.modes) ? caps.modes : []).map((m) => String(m).toLowerCase());
  if (modes.some((m) => m.startsWith('t2'))) return true;
  if (modes.length && modes.every((m) => /^(i2|layers|upscale|edit|inpaint|remove|control|reference)/.test(m))) return false;
  const category = String(model?.type || '').toLowerCase();
  if (category === 'text' || category === 'video_text') return true;
  // 无声明时：既没有提示词也没有任何媒体输入的任务必定失败，不能让它占用额度建单。
  return !hasMediaInput(parameters);
}

function safeInputSummary({ modelId, endpoint, prompt, parameters = {}, ...rest }) {
  return {
    modelId,
    endpoint,
    prompt: String(prompt || '').slice(0, 4000),
    parameters: parameters && typeof parameters === 'object' ? parameters : {},
    ...rest,
  };
}

async function addGenerationEvent(creation, eventType, details = {}) {
  return insertGenerationEvent({
    creationId: creation.id,
    userId: creation.user_id,
    eventType,
    fromStatus: details.fromStatus ?? null,
    toStatus: details.toStatus ?? creation.status,
    reservationId: details.reservationId || creation.reservation_id,
    provider: details.provider || creation.provider,
    providerRequestId: details.providerRequestId || creation.provider_request_id || creation.external_request_id,
    idempotencyKey: details.idempotencyKey || `${creation.id}:${eventType}`,
    metadata: details.metadata || {},
    transaction: details.transaction || null,
  });
}

export async function createGenerationTask({
  user,
  userId = user?.id,
  modelId,
  studioId = 'studio',
  prompt = '',
  parameters = {},
  quoteParameters = null,
  idempotencyKey,
  label,
  quoteId = null,
  routingMode = 'cost',
  chargeCredits = true,
  requirePublicAvailability = true,
  onTaskCreated = null,
}) {
  if (!userId) throw Object.assign(new Error('请先登录后再创建生成任务'), { code: 'UNAUTHENTICATED' });
  if (!idempotencyKey || String(idempotencyKey).trim().length < 8) {
    throw Object.assign(new Error('生成任务必须提供有效的幂等键'), { code: 'IDEMPOTENCY_REQUIRED' });
  }

  const normalizedKey = String(idempotencyKey).trim().slice(0, 200);
  const existing = await findUserCreationByIdempotency(userId, normalizedKey);
  if (existing) {
    if (typeof onTaskCreated === 'function') {
      await withTransaction(async (tx) => onTaskCreated({ creation: existing, transaction: tx, idempotent: true }));
    }
    return { creation: existing, idempotent: true };
  }

  const model = await findModelByEndpointOrId(modelId, {
    parameters,
    category: parameters?.category || parameters?.mediaType || parameters?.type,
  });
  if (!model) throw Object.assign(new Error('目标模型不存在'), { code: 'MODEL_NOT_FOUND' });
  if (!model.is_active) throw Object.assign(new Error('目标模型当前不可用'), { code: 'MODEL_DISABLED' });
  if (requirePublicAvailability) await assertPublicModelOrderable(model.id);

  // 专属会员权益校验与动态注入 (去水印、最新模型专属使用权)
  const { getEntitlements } = await import('./billing.js');
  let entitlements = null;
  try {
    entitlements = await getEntitlements(userId);
  } catch (err) {
    console.warn('[createGenerationTask] 获取会员权益失败:', err?.message || err);
  }

  const isModelExclusive = Boolean(
    model.tier === 'exclusive' ||
    model.is_exclusive === true ||
    model.metadata_json?.exclusive === true ||
    model.capabilities?.exclusive === true
  );

  if (isModelExclusive && !entitlements?.hasExclusiveLatestModels) {
    throw Object.assign(new Error('该模型为会员专属最新模型，请升级至开通“最新模型专属使用权”的套餐'), {
      code: 'EXCLUSIVE_MODEL_REQUIRED',
    });
  }

  // 水印权益注入：拥有去水印特权则免水印，否则强制加水印
  const effectiveParameters = { ...(parameters || {}) };
  if (effectiveParameters.watermark === undefined) {
    effectiveParameters.watermark = !Boolean(entitlements?.hasNoWatermark);
  } else if (!entitlements?.hasNoWatermark) {
    effectiveParameters.watermark = true;
  }
  const parametersForQuote = quoteParameters && typeof quoteParameters === 'object' && !Array.isArray(quoteParameters)
    ? quoteParameters
    : effectiveParameters;

  // 并发控制：检查用户当前任务数是否超过套餐上限
  const { checkConcurrency } = await import('./concurrencyControl.js');
  const concurrencyCheck = await checkConcurrency({ userId, modelId: model.id });
  if (!concurrencyCheck.allowed) {
    throw Object.assign(new Error(concurrencyCheck.message), {
      code: concurrencyCheck.reason,
      activeCount: concurrencyCheck.activeCount,
      limit: concurrencyCheck.limit,
    });
  }

  // 参数验证必须在报价与预扣积分之前完成，空提示词不能建单占额度。
  if (prompt !== undefined && prompt !== null && typeof prompt !== 'string') {
    throw Object.assign(new Error('提示词格式无效，必须是文本'), { code: 'INVALID_PROMPT' });
  }
  const textPrompt = String(
    [prompt, parseJsonObject(effectiveParameters).prompt].find((value) => typeof value === 'string' && value.trim()) || '',
  ).trim();
  if (textPrompt.length > MAX_PROMPT_CHARS) {
    throw Object.assign(new Error(`提示词长度不能超过 ${MAX_PROMPT_CHARS} 个字符`), { code: 'PROMPT_TOO_LONG' });
  }
  if (!textPrompt && requiresPrompt({ model, parameters: effectiveParameters })) {
    throw Object.assign(new Error('请先输入提示词后再提交生成任务'), { code: 'PROMPT_REQUIRED' });
  }

  // 任何需扣积分的任务都必须经过服务端预报价并提供有效的 quoteId，严禁无报价静默兜底。
  const effectiveQuoteId = quoteId ? String(quoteId).trim() : null;
  if (chargeCredits && !effectiveQuoteId) {
    throw Object.assign(new Error('创建生成任务前必须先获取有效的服务端报价'), { code: 'QUOTE_REQUIRED' });
  }

  let creditCost = chargeCredits ? Math.max(0, Number(model.credits_price || 0)) : 0;
  let estimatedCostUsd = null;
  let effectiveRoutingMode = routingMode;

  let inputSummary = safeInputSummary({
    modelId: model.id,
    modelType: model.type || 'image',
    endpoint: model.id,
    prompt: textPrompt,
    parameters: effectiveParameters,
    quoteId: effectiveQuoteId,
    routingMode: effectiveRoutingMode,
  });
  return withTransaction(async (tx) => {
    // Two retries can both miss the fast-path read above. Serialize the keyed
    // transaction, then re-check before consuming the quote or reserving credits.
    await acquireCreationIdempotencyLock(userId, normalizedKey, tx);
    const concurrentCreation = await findUserCreationByIdempotency(userId, normalizedKey, tx);
    if (concurrentCreation) {
      if (typeof onTaskCreated === 'function') {
        await onTaskCreated({ creation: concurrentCreation, transaction: tx, idempotent: true });
      }
      return { creation: concurrentCreation, idempotent: true };
    }

    if (chargeCredits && effectiveQuoteId) {
      const verifiedQuote = await verifyAndConsumeQuote({
        quoteId: effectiveQuoteId,
        userId,
        modelId: model.id,
        parameters: parametersForQuote,
        transaction: tx,
      });
      if (verifiedQuote) {
        const quoteRoutingMode = verifiedQuote.routeSnapshot?.routingMode;
        if (['cost', 'quality', 'stability', 'balanced'].includes(quoteRoutingMode)) {
          effectiveRoutingMode = quoteRoutingMode;
          inputSummary.routingMode = effectiveRoutingMode;
        }
        creditCost = verifiedQuote.credits;
        estimatedCostUsd = verifiedQuote.estimatedCostUsd;
      }
    }

    if (chargeCredits && (!Number.isInteger(creditCost) || creditCost <= 0)) {
      throw Object.assign(new Error('目标模型未配置有效额度价格'), { code: 'MODEL_PRICE_INVALID' });
    }

    const reservation = chargeCredits ? await reserveCredits({
      userId,
      amount: creditCost,
      modelId: model.id,
      studioId,
      idempotencyKey: normalizedKey,
      transaction: tx,
    }) : { reservationId: null, idempotent: false };
    if (reservation.reservationId && reservation.idempotent && reservation.status !== 'RESERVED') {
      throw Object.assign(new Error('该幂等键对应的额度预扣已结束，不能重新创建生成任务'), { code: 'GENERATION_RESERVATION_TERMINAL' });
    }

    let creation = await insertGenerationTask({
      userId,
      studioId,
      modelId: model.id,
      provider: model.provider,
      label: label || `${model.name} 生成任务`,
      creditCost,
      reservationId: reservation.reservationId,
      idempotencyKey: normalizedKey,
      inputSummary,
      quoteId: effectiveQuoteId,
      routingMode: effectiveRoutingMode,
      estimatedCostUsd,
      transaction: tx,
    });

    if (!creation) {
      creation = await findUserCreationByIdempotency(userId, normalizedKey, tx);
      if (!creation) throw new Error('生成任务写入后无法重新读取');
      if (reservation.reservationId && !reservation.idempotent) {
        throw Object.assign(new Error('生成任务幂等冲突，未创建新的额度预扣'), { code: 'GENERATION_IDEMPOTENCY_CONFLICT' });
      }
      if (typeof onTaskCreated === 'function') {
        await onTaskCreated({ creation, transaction: tx, idempotent: true });
      }
      return { creation, reservation, idempotent: true };
    }

    if (reservation.reservationId) await linkReservationToCreation(reservation.reservationId, creation.id, tx);
    await addGenerationEvent(creation, 'TASK_CREATED', {
      fromStatus: null,
      toStatus: 'queued',
      metadata: { modelId: model.id, creditCost, quoteId: effectiveQuoteId, routingMode: effectiveRoutingMode, idempotencyKey: normalizedKey },
      transaction: tx,
    });
    await logAudit({
      actor: { id: 'system:generation', email: 'system@supdance.local' },
      action: 'generation.task_created',
      targetType: 'creation',
      targetId: creation.id,
      riskLevel: 'low',
      after: { userId, modelId: model.id, provider: model.provider, creditCost, quoteId: effectiveQuoteId, reservationId: reservation.reservationId, idempotencyKey: normalizedKey },
      transaction: tx,
    });
    if (typeof onTaskCreated === 'function') {
      await onTaskCreated({ creation, transaction: tx, idempotent: Boolean(reservation.idempotent) });
    }
    return { creation, reservation, idempotent: Boolean(reservation.idempotent) };
  });
}

export async function processGenerationTask({ creationId, providerClient = null, testDependencies = null }) {
  const injectedTestAdapterFactory = process.env.NODE_ENV === 'test'
    && typeof testDependencies?.getProviderAdapter === 'function'
    ? testDependencies.getProviderAdapter : getProviderAdapter;
  const injectedTestArchive = process.env.NODE_ENV === 'test'
    && typeof testDependencies?.archiveGenerationResult === 'function'
    ? testDependencies.archiveGenerationResult : archiveGenerationResult;
  const before = await findCreationById(creationId);
  if (!before) return { error: 'TASK_NOT_FOUND' };
  if (!TASK_STATUSES.has(before.status)) throw new Error(`不支持的生成任务状态: ${before.status}`);
  if (before.status === 'succeeded' || before.status === 'failed' || before.status === 'cancelled') {
    return { creation: before, idempotent: true };
  }
  if (before.status === 'processing' && before.provider_request_id) {
    return pollGenerationTask({ creationId, testDependencies });
  }
  assertGenerationTransition(before.status, 'processing');

  const claimed = await withTransaction(async (tx) => {
    const next = await claimQueuedGeneration(creationId, tx);
    if (!next) return null;
    await addGenerationEvent(next, 'TASK_PROCESSING', {
      fromStatus: 'queued',
      toStatus: 'processing',
      metadata: { startedAt: new Date().toISOString() },
      transaction: tx,
    });
    await logAudit({
      actor: { id: 'system:generation', email: 'system@supdance.local' },
      action: 'generation.task_processing',
      targetType: 'creation',
      targetId: creationId,
      riskLevel: 'low',
      after: { userId: next.user_id, modelId: next.model, provider: next.provider, reservationId: next.reservation_id },
      transaction: tx,
    });
    return next;
  });
  if (!claimed) {
    const current = await findCreationById(creationId);
    return { creation: current, inProgress: current?.status === 'processing', idempotent: true };
  }

  const startedAt = Date.now();

  // 若外部显式注入了 providerClient（如单元测试中的 mockProvider），优先走兼容路径
  if (providerClient) {
    const rawProvider = providerClient;
    const provider = createResilientProvider({
      provider: rawProvider,
      providerName: claimed.provider,
      onCall: (call) => recordProviderCall({ provider: call.provider, action: call.action, requestId: claimed.provider_request_id || null, status: call.status, latencyMs: call.latencyMs, errorCode: call.errorCode, usage: { attempt: call.attempt || null, modelId: claimed.model, creationId: claimed.id } }).catch((error) => {
        console.error('[generation/provider-log]', { code: error.code || 'LOG_FAILED' });
      }),
    });
    try {
      const providerCreation = await providerCreationWithCanvasReferences(claimed);
      const result = await provider.generate({ creation: providerCreation });
      if (!result?.resultUrl) {
        const pending = await withTransaction(async (tx) => {
          const updated = await updateGenerationOutcome(creationId, {
            status: 'processing',
            providerRequestId: result?.providerRequestId || null,
            actualCostUsd: Number.isFinite(Number(result?.actualCostUsd)) && result?.actualCostUsd !== null
              ? Number(result.actualCostUsd) : null,
            durationMs: Date.now() - startedAt,
            expectedStatus: 'processing',
            transaction: tx,
          });
          if (!updated) return findCreationById(creationId, tx);
          await addGenerationEvent(updated, 'PROVIDER_ACCEPTED', {
            fromStatus: 'processing',
            toStatus: 'processing',
            providerRequestId: result?.providerRequestId,
            metadata: result?.metadata || {},
            transaction: tx,
          });
          return updated;
        });
        return { creation: pending, pending: true, providerRequestId: result?.providerRequestId || null };
      }

      const storedResult = await injectedTestArchive({
        resultUrl: result.resultUrl,
        creation: claimed,
        sourceProvider: claimed.provider,
        providerRequestId: result.providerRequestId || null,
      });

      const succeeded = await withTransaction(async (tx) => {
        const reportedCost = reportedActualCost(result.actualCostUsd);
        const updated = await updateGenerationOutcome(creationId, {
          status: 'succeeded',
          resultUrl: null,
          resultObjectKey: storedResult.objectKey,
          storageStatus: 'ready',
          storageAttempts: storedResult.attempts,
          storageBucket: storedResult.bucket,
          storageRegion: storedResult.region,
          storageMimeType: storedResult.mimeType,
          storageSizeBytes: storedResult.sizeBytes,
          storageChecksum: storedResult.checksum,
          storagePreviewObjectKey: storedResult.previewObjectKey,
          storageThumbnailObjectKey: storedResult.thumbnailObjectKey,
          providerRequestId: result.providerRequestId || null,
          actualCostUsd: reportedCost,
          durationMs: Date.now() - startedAt,
          expectedStatus: 'processing',
          transaction: tx,
        });
        if (!updated) {
          const current = await findCreationById(creationId, tx);
          if (current?.status === 'succeeded') return current;
          throw Object.assign(new Error('生成任务状态更新失败，结算事务已回滚'), { code: 'GENERATION_FINALIZE_FAILED' });
        }
        await persistPrivateGenerationAsset(updated, tx, testDependencies);
        if (claimed.reservation_id) {
          await commitCredits({
            reservationId: claimed.reservation_id,
            creationId,
            settledAmount: claimed.credit_cost,
            expectedUserId: claimed.user_id,
            transaction: tx,
          });
        }
        await insertProviderCostRecord({
          jobId: claimed.id, providerId: claimed.provider, modelId: claimed.model,
          creditsCharged: claimed.credit_cost,
          estimatedCostUsd: claimed.estimated_cost_usd === null || claimed.estimated_cost_usd === undefined
            ? null : Number(claimed.estimated_cost_usd),
          actualCostUsd: reportedCost, currency: 'USD',
          costSource: reportedCost === null ? 'estimate_only' : 'provider_reported',
          reconciliationStatus: reportedCost === null ? 'pending_reconciliation' : 'provider_reported',
          transaction: tx,
        });
        await addGenerationEvent(updated, 'TASK_SUCCEEDED', {
          fromStatus: 'processing',
          toStatus: 'succeeded',
          providerRequestId: result.providerRequestId,
          metadata: result.metadata || {},
          transaction: tx,
        });
        await logAudit({
          actor: { id: 'system:generation', email: 'system@supdance.local' },
          action: 'generation.task_succeeded',
          targetType: 'creation',
          targetId: creationId,
          riskLevel: 'low',
          after: { userId: updated.user_id, modelId: updated.model, provider: updated.provider, creditCost: updated.credit_cost, reservationId: updated.reservation_id, providerRequestId: updated.provider_request_id },
          transaction: tx,
        });
        return updated;
      });
      return { creation: succeeded, success: true };
    } catch (error) {
      if (String(error?.code || '').startsWith('STORAGE_')) {
        const pending = await finalizeStorageFailure({
          creation: claimed,
          startedAt,
          providerRequestId: error.providerRequestId || null,
          actualCostUsd: reportedActualCost(error.actualCostUsd),
          providerId: claimed.provider,
          estimatedCostUsd: claimed.estimated_cost_usd === null || claimed.estimated_cost_usd === undefined
            ? null : Number(claimed.estimated_cost_usd),
          error,
        });
        return { creation: pending, success: false, storageFailed: true, error: '生成结果保存失败，预扣积分已原路退回。请重新提交任务。' };
      }
      const safeFailureReason = publicErrorMessage(error, '模型供应商调用失败');
      const failed = await withTransaction(async (tx) => {
        if (claimed.reservation_id) {
          await voidCredits({
            reservationId: claimed.reservation_id,
            reason: safeFailureReason,
            expectedUserId: claimed.user_id,
            transaction: tx,
          });
        }
        const updated = await updateGenerationOutcome(creationId, {
          status: 'failed',
          errorCode: error.code || 'PROVIDER_ERROR',
          errorReason: safeFailureReason,
          durationMs: Date.now() - startedAt,
          expectedStatus: 'processing',
          transaction: tx,
        });
        if (!updated) {
          const current = await findCreationById(creationId, tx);
          if (['failed', 'cancelled'].includes(current?.status)) return current;
          throw Object.assign(new Error('生成任务失败状态写入失败，释放事务已回滚'), { code: 'GENERATION_FINALIZE_FAILED' });
        }
        await addGenerationEvent(updated, 'TASK_FAILED', {
          fromStatus: 'processing',
          toStatus: 'failed',
          metadata: { code: error.code || 'PROVIDER_ERROR', reason: safeFailureReason },
          transaction: tx,
        });
        return updated;
      });
      return { creation: failed, success: false, error: safeFailureReason };
    }
  }

  // 统一智能路由 + Multi-Attempt 故障转移执行流
  let input = claimed.input_summary_json;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { input = {}; }
  }
  input = input || {};
  const prompt = input.prompt || '';
  const parameters = input.parameters || {};

  let currentModelId = claimed.model;
  let triedBackupModel = false;
  const excludedProviderIds = [];
  const maxAttempts = 5;
  let attemptCount = 0;
  let lastError = null;
  let lastErrorCode = 'PROVIDER_ERROR';
  let lastErrorReason = '所有候选渠道及备用模型均生成失败';
  let firstAttemptFailure = null;
  let storageFailure = null;

  // Canvas 参考图素材解析不依赖供应商，在 attempt 循环外统一解析一次，
  // 避免反复在每个供应商 attempt 中失败然后被误判为渠道不可用。
  let resolvedParameters = parameters;
  try {
    resolvedParameters = await resolveCanvasProviderParameters(claimed, parameters, claimed.provider || '');
  } catch (canvasAssetErr) {
    const safeReason = PROVIDER_FAILURE_TEXT[canvasAssetErr.code]
      || publicErrorMessage(canvasAssetErr, '参考图素材解析失败，任务已失败并解冻额度');
    const failed = await withTransaction(async (tx) => {
      if (claimed.reservation_id) {
        await voidCredits({
          reservationId: claimed.reservation_id,
          reason: safeReason,
          expectedUserId: claimed.user_id,
          transaction: tx,
        });
      }
      const updated = await updateGenerationOutcome(creationId, {
        status: 'failed',
        errorCode: canvasAssetErr.code || 'CANVAS_ASSET_URL_UNAVAILABLE',
        errorReason: safeReason,
        durationMs: Date.now() - startedAt,
        expectedStatus: 'processing',
        transaction: tx,
      });
      if (!updated) {
        const current = await findCreationById(creationId, tx);
        if (['failed', 'cancelled'].includes(current?.status)) return current;
        throw Object.assign(new Error('生成任务失败状态写入失败，释放事务已回滚'), { code: 'GENERATION_FINALIZE_FAILED' });
      }
      await addGenerationEvent(updated, 'TASK_FAILED', {
        fromStatus: 'processing',
        toStatus: 'failed',
        metadata: { code: canvasAssetErr.code || 'CANVAS_ASSET_URL_UNAVAILABLE', reason: safeReason },
        transaction: tx,
      });
      return updated;
    });
    return { creation: failed, success: false, error: safeReason };
  }

  while (attemptCount < maxAttempts) {
    attemptCount++;
    let routeDecision = null;
    try {
      routeDecision = await routeGenerationTask({
        jobId: claimed.id,
        modelId: currentModelId,
        parameters,
        prompt,
        quoteId: claimed.quote_id || null,
        excludedProviderIds,
      });
    } catch (routeErr) {
      if (claimed.studio_id !== 'canvas' && !triedBackupModel) {
        const currentModel = await findModelByEndpointOrId(currentModelId);
        const backupModelId = currentModel?.backup_model_id;
        if (backupModelId && backupModelId !== currentModelId) {
          const backupModel = await findModelByEndpointOrId(backupModelId);
          if (backupModel && backupModel.is_active) {
            triedBackupModel = true;
            console.log(`[generationCore] 模型 ${currentModelId} 渠道不可用/耗尽，触发二级故障转移至备用模型 ${backupModelId}`);
            await addGenerationEvent(claimed, 'MODEL_FAILOVER', {
              fromStatus: 'processing',
              toStatus: 'processing',
              metadata: {
                primaryModelId: currentModelId,
                backupModelId,
                reason: routeErr.message,
                attemptNumber: attemptCount,
              },
            });
            currentModelId = backupModelId;
            excludedProviderIds.length = 0;
            attemptCount--;
            continue;
          }
        }
      }

      lastError = routeErr;
      // 真实调用过渠道之后才因故障转移耗尽而路由失败，必须保留第一个真实上游错误：
      // 否则用户与后台只会看到 ALREADY_ATTEMPTED_FAILED，掩盖余额/凭据等根因。
      if (firstAttemptFailure) {
        lastErrorCode = firstAttemptFailure.code;
        lastErrorReason = `${firstAttemptFailure.reason}（渠道与备用模型均不可用）`;
      } else {
        lastErrorCode = routeErr.code || 'ROUTING_FAILED';
        lastErrorReason = '该模型及其备用渠道当前没有可用供应商，任务已失败并解冻额度，请联系管理员';
      }
      break;
    }

    const selectedRoute = routeDecision.selectedRoute;
    const providerId = selectedRoute.provider_id;
    const providerModelId = selectedRoute.provider_model_id;
    claimed.provider = providerId;

    // 记录本轮 Attempt
    const attemptRecord = await createGenerationAttempt({
      creationId: claimed.id,
      attemptNumber: attemptCount,
      providerId,
      providerModelId,
      providerEndpoint: selectedRoute.provider_endpoint || null,
      providerModelVersion: selectedRoute.provider_model_version || null,
      mappingVersion: selectedRoute.mapping_version || null,
      requestPayload: safeAttemptParameters(parameters),
      estimatedCostUsd: routeDecision.winner.estimatedCostUsd,
      priceVersionId: routeDecision.winner.priceVersionId,
      costCurrency: routeDecision.winner.estimatedCostCurrency,
      costSource: 'quote_estimate',
    });

    const attemptStartedAt = Date.now();
    let adapter = null;
    let providerRequestId = null;
    let attemptActualCostUsd = null;
    let providerCallStarted = false;
    try {
      adapter = await injectedTestAdapterFactory(providerId);
      providerCallStarted = true;
      const providerParameters = await resolveCanvasProviderParameters(claimed, parameters, providerId);
      const taskResult = await adapter.createTask({
        providerModelId,
        providerEndpoint: selectedRoute.provider_endpoint || null,
        providerModelVersion: selectedRoute.provider_model_version || null,
        endpointConfig: selectedRoute.endpoint_config || {},
        parameterMapping: selectedRoute.parameter_mapping || {},
        prompt,
        parameters: providerParameters,
        idempotencyKey: `${claimed.id}_att_${attemptCount}`,
      });

      let finalResultUrl = taskResult.resultUrl;
      attemptActualCostUsd = reportedActualCost(taskResult.actualCostUsd);
      providerRequestId = taskResult.providerRequestId || null;

      // 若任务需要轮询等待（如视频生成或异步推理）
      if (!finalResultUrl && providerRequestId) {
        // 1. 任务已提交至上游，立即持久化入库 (status = 'processing', provider_request_id, next_poll_at = NOW() + 2s)
        await updateGenerationOutcome(claimed.id, {
          status: 'processing',
          providerRequestId,
          provider: providerId,
          model: currentModelId,
          nextPollAt: new Date(Date.now() + 2000),
          pollLockedUntil: null,
          actualCostUsd: attemptActualCostUsd,
          expectedStatus: 'processing',
        });
        await addGenerationEvent(claimed, 'PROVIDER_ACCEPTED', {
          fromStatus: 'processing',
          toStatus: 'processing',
          provider: providerId,
          providerRequestId,
          metadata: { attemptNumber: attemptCount, providerId, providerModelId, modelId: currentModelId },
        }).catch(() => {});

        // 2. 初始快速检测（短轮询，针对即时或快速响应的模型/单测）
        if (adapter.getTask) {
          const quickPollInterval = Math.max(500, Math.min(2000, Number(process.env.PROVIDER_POLL_INTERVAL_MS) || 1000));
          const maxQuickPollAttempts = process.env.NODE_ENV === 'test' ? 3 : 2;
          for (let p = 0; p < maxQuickPollAttempts; p++) {
            await new Promise((r) => setTimeout(r, quickPollInterval));
            const pollParameters = providerParameters;
            const pollData = await adapter.getTask(providerRequestId, {
              parameters: pollParameters,
              providerEndpoint: selectedRoute.provider_endpoint || null,
              providerModelVersion: selectedRoute.provider_model_version || null,
            });
            if (pollData.status === 'succeeded' && pollData.resultUrl) {
              finalResultUrl = pollData.resultUrl;
              if (pollData.actualCostUsd !== null && pollData.actualCostUsd !== undefined) {
                attemptActualCostUsd = reportedActualCost(pollData.actualCostUsd);
              }
              break;
            }
            if (pollData.status === 'failed' || pollData.status === 'cancelled') {
              throw Object.assign(new Error(pollData.error || '供应商任务执行失败'), {
                code: 'UPSTREAM_GENERATION_FAILED',
                actualCostUsd: reportedActualCost(pollData.actualCostUsd) ?? attemptActualCostUsd,
              });
            }
          }
        }
      }

      // 若未在短时间内就绪，将任务安全交给数据库 Worker 阶梯退避长轮询（支持 15-30 分钟）
      // 绝不抛出 EMPTY_RESULT_URL，绝不误判失败或错误退款！
      if (!finalResultUrl && providerRequestId) {
        await updateGenerationAttemptOutcome(attemptRecord.id, {
          status: 'processing',
          providerRequestId,
          durationMs: Date.now() - attemptStartedAt,
          actualCostUsd: attemptActualCostUsd,
          metadata: { provider: providerId, model: providerModelId, asyncPolling: true },
        }).catch(() => {});

        const pendingCreation = await findCreationById(claimed.id);
        return {
          creation: pendingCreation,
          pending: true,
          providerRequestId,
          status: 'processing',
          attempts: attemptCount,
        };
      }

      if (!finalResultUrl) {
        throw Object.assign(new Error('供应商未返回有效的生成结果 URL'), { code: 'EMPTY_RESULT_URL' });
      }

      // Provider URL 只作为本次归档输入，不写入数据库；归档后仅保存 object key 与元数据。
      const storedResult = await injectedTestArchive({
        resultUrl: finalResultUrl,
        creation: claimed,
        sourceProvider: providerId,
        providerRequestId,
      });

      // 成功：更新 Attempt 状态
      await updateGenerationAttemptOutcome(attemptRecord.id, {
        status: 'succeeded',
        providerRequestId,
        durationMs: Date.now() - attemptStartedAt,
        actualCostUsd: attemptActualCostUsd,
        costSource: attemptActualCostUsd === null ? null : 'provider_reported',
        reconciliationStatus: attemptActualCostUsd === null ? 'pending_reconciliation' : 'provider_reported',
        metadata: { provider: providerId, model: providerModelId },
      });
      recordProviderSuccess(providerId).catch((err) => console.error('[circuitBreaker/success]', err));

      // 成功：两阶段 Commit 额度、写入成本流水与更新 Job
      const succeeded = await withTransaction(async (tx) => {
        const updated = await updateGenerationOutcome(creationId, {
          status: 'succeeded',
          resultUrl: null,
          resultObjectKey: storedResult.objectKey,
          storageStatus: 'ready',
          storageAttempts: storedResult.attempts,
          storageBucket: storedResult.bucket,
          storageRegion: storedResult.region,
          storageMimeType: storedResult.mimeType,
          storageSizeBytes: storedResult.sizeBytes,
          storageChecksum: storedResult.checksum,
          storagePreviewObjectKey: storedResult.previewObjectKey,
          storageThumbnailObjectKey: storedResult.thumbnailObjectKey,
          provider: providerId,
          model: currentModelId,
          providerRequestId,
          actualCostUsd: attemptActualCostUsd,
          durationMs: Date.now() - startedAt,
          expectedStatus: 'processing',
          transaction: tx,
        });
        if (!updated) {
          const current = await findCreationById(creationId, tx);
          if (current?.status === 'succeeded') return current;
          throw Object.assign(new Error('生成任务状态更新失败，结算事务已回滚'), { code: 'GENERATION_FINALIZE_FAILED' });
        }
        await persistPrivateGenerationAsset(updated, tx, testDependencies);
        if (claimed.reservation_id) {
          await commitCredits({
            reservationId: claimed.reservation_id,
            creationId: claimed.id,
            settledAmount: claimed.credit_cost,
            expectedUserId: claimed.user_id,
            transaction: tx,
          });
        }
        await insertProviderCostRecord({
          jobId: claimed.id,
          attemptId: attemptRecord.id,
          providerId,
          modelId: currentModelId,
          creditsCharged: claimed.credit_cost,
          estimatedCostUsd: routeDecision.winner.estimatedCostUsd,
          actualCostUsd: attemptActualCostUsd,
          currency: 'USD',
          priceVersionId: routeDecision.winner.priceVersionId,
          fxSnapshot: routeDecision.winner.fxSnapshot,
          costSource: attemptActualCostUsd === null ? 'estimate_only' : 'provider_reported',
          reconciliationStatus: attemptActualCostUsd === null ? 'pending_reconciliation' : 'provider_reported',
          transaction: tx,
        });
        await addGenerationEvent(updated, 'TASK_SUCCEEDED', {
          fromStatus: 'processing',
          toStatus: 'succeeded',
          provider: providerId,
          providerRequestId,
          metadata: { attemptNumber: attemptCount, providerId, providerModelId, modelId: currentModelId, failover: triedBackupModel },
          transaction: tx,
        });
        await logAudit({
          actor: { id: 'system:generation', email: 'system@supdance.local' },
          action: 'generation.task_succeeded',
          targetType: 'creation',
          targetId: creationId,
          riskLevel: 'low',
          after: { userId: updated.user_id, modelId: updated.model, provider: providerId, creditCost: updated.credit_cost, attempts: attemptCount, failover: triedBackupModel },
          transaction: tx,
        });
        return updated;
      });

      return { creation: succeeded, success: true, attempts: attemptCount };

    } catch (attemptErr) {
      console.warn(`[generationCore] Attempt #${attemptCount} (${providerId}) 失败:`, attemptErr.message, attemptErr.cause || '', attemptErr.stack || '');
      const normErr = adapter ? adapter.normalizeError(attemptErr) : attemptErr;
      attemptActualCostUsd = reportedActualCost(normErr?.actualCostUsd ?? attemptErr?.actualCostUsd ?? attemptActualCostUsd);
      if (String(normErr?.code || '').startsWith('STORAGE_')) {
        storageFailure = {
          error: normErr,
          attemptId: attemptRecord.id,
          providerId,
          providerModelId,
          providerRequestId: normErr.providerRequestId || providerRequestId,
          actualCostUsd: attemptActualCostUsd,
          estimatedCostUsd: routeDecision.winner.estimatedCostUsd,
          priceVersionId: routeDecision.winner.priceVersionId,
          fxSnapshot: routeDecision.winner.fxSnapshot,
        };
        await updateGenerationAttemptOutcome(attemptRecord.id, {
          status: 'succeeded',
          providerRequestId: normErr.providerRequestId || providerRequestId,
          durationMs: Date.now() - attemptStartedAt,
          actualCostUsd: attemptActualCostUsd,
          costSource: attemptActualCostUsd === null ? null : 'provider_reported',
          reconciliationStatus: providerCallStarted
            ? (attemptActualCostUsd === null ? 'pending_reconciliation' : 'provider_reported')
            : 'not_billable',
          metadata: { storageStatus: 'failed', storageErrorCode: normErr.code || 'STORAGE_INGEST_FAILED' },
        });
        if (providerCallStarted) {
          await insertProviderCostRecord({
            jobId: claimed.id, attemptId: attemptRecord.id, providerId, modelId: currentModelId,
            creditsCharged: 0, estimatedCostUsd: routeDecision.winner.estimatedCostUsd,
            actualCostUsd: attemptActualCostUsd, currency: 'USD',
            priceVersionId: routeDecision.winner.priceVersionId, fxSnapshot: routeDecision.winner.fxSnapshot,
            costSource: attemptActualCostUsd === null ? 'estimate_only' : 'provider_reported',
            reconciliationStatus: attemptActualCostUsd === null ? 'pending_reconciliation' : 'provider_reported',
          });
        }
        break;
      }
      await updateGenerationAttemptOutcome(attemptRecord.id, {
        status: 'failed',
        providerRequestId: normErr.providerRequestId || providerRequestId,
        durationMs: Date.now() - attemptStartedAt,
        errorCode: normErr.code || 'PROVIDER_ERROR',
        errorReason: normErr.message,
        actualCostUsd: attemptActualCostUsd,
        costSource: attemptActualCostUsd === null ? null : 'provider_reported',
        reconciliationStatus: providerCallStarted
          ? (attemptActualCostUsd === null ? 'pending_reconciliation' : 'provider_reported')
          : 'not_billable',
      });
      if (providerCallStarted) {
        await insertProviderCostRecord({
          jobId: claimed.id, attemptId: attemptRecord.id, providerId, modelId: currentModelId,
          creditsCharged: 0, estimatedCostUsd: routeDecision.winner.estimatedCostUsd,
          actualCostUsd: attemptActualCostUsd, currency: 'USD',
          priceVersionId: routeDecision.winner.priceVersionId, fxSnapshot: routeDecision.winner.fxSnapshot,
          costSource: attemptActualCostUsd === null ? 'estimate_only' : 'provider_reported',
          reconciliationStatus: attemptActualCostUsd === null ? 'pending_reconciliation' : 'provider_reported',
        });
      }
      if (shouldTripProviderCircuitBreaker(normErr.code)) {
        recordProviderFailure(providerId).catch((err) => console.error('[circuitBreaker/failure]', err));
      }

      lastError = normErr;
      lastErrorCode = normErr.code || 'PROVIDER_ERROR';
      lastErrorReason = PROVIDER_FAILURE_TEXT[normErr.code]
        || publicErrorMessage(normErr, '模型渠道生成失败');
      if (!firstAttemptFailure) {
        firstAttemptFailure = {
          providerId,
          code: lastErrorCode,
          reason: lastErrorReason,
          upstream: `${providerId}: ${normErr.message}`.slice(0, 500),
        };
      }

      // 核心铁律：如果是不可重试的错误（内容审核未通过、输入参数非法），严禁换供应商重试！
      if (NON_RETRYABLE_ERROR_CODES.has(normErr.code)) {
        break;
      }

      // 可重试错误：若主通道 RunningHub 发生瞬态故障切流至备用通道，触发容灾告警
      if (providerId === 'runninghub') {
        import('../admin/alerting.js')
          .then(({ sendOpsAlert }) => {
            sendOpsAlert({
              title: '主通道切流至官方备用通道',
              level: 'warn',
              message: `生成任务 [${creationId}] 主通道 RunningHub 发生瞬态故障 [${lastErrorCode}]，已触发自动切流`,
              details: { creationId, modelId: currentModelId, errorCode: lastErrorCode, reason: lastErrorReason },
            }).catch(() => {});
          })
          .catch(() => {});
      }

      // 可重试错误：排除当前渠道，继续循环 Attempt 切换同模型下一个渠道
      excludedProviderIds.push(providerId);
    }
  }

  if (storageFailure) {
    const pending = await finalizeStorageFailure({
      creation: claimed,
      startedAt,
      ...storageFailure,
    });
    return { creation: pending, success: false, storageFailed: true, attempts: attemptCount, error: '生成结果保存失败，预扣积分已原路退回。请重新提交任务。' };
  }

  // 所有渠道均失败：原路释放冻结积分
  const failed = await withTransaction(async (tx) => {
    if (claimed.reservation_id) {
      await voidCredits({
        reservationId: claimed.reservation_id,
        reason: lastErrorReason,
        expectedUserId: claimed.user_id,
        transaction: tx,
      });
    }
    const updated = await updateGenerationOutcome(creationId, {
      status: 'failed',
      errorCode: lastErrorCode,
      errorReason: lastErrorReason,
      durationMs: Date.now() - startedAt,
      expectedStatus: 'processing',
      transaction: tx,
    });
    if (!updated) {
      const current = await findCreationById(creationId, tx);
      if (['failed', 'cancelled'].includes(current?.status)) return current;
      throw Object.assign(new Error('生成任务失败状态写入失败，释放事务已回滚'), { code: 'GENERATION_FINALIZE_FAILED' });
    }
    await addGenerationEvent(updated, 'TASK_FAILED', {
      fromStatus: 'processing',
      toStatus: 'failed',
      metadata: {
        code: lastErrorCode,
        reason: lastErrorReason,
        totalAttempts: attemptCount,
        upstreamError: firstAttemptFailure?.upstream || String(lastError?.message || '').slice(0, 500),
      },
      transaction: tx,
    });
    await logAudit({
      actor: { id: 'system:generation', email: 'system@supdance.local' },
      action: 'generation.task_failed',
      targetType: 'creation',
      targetId: creationId,
      riskLevel: 'medium',
      after: { userId: updated.user_id, modelId: updated.model, creditCost: updated.credit_cost, errorCode: updated.error_code, attempts: attemptCount },
      transaction: tx,
    });
    return updated;
  });

  return { creation: failed, success: false, error: lastErrorReason, attempts: attemptCount };
}

export async function handleGenerationCallback({
  creationId,
  status,
  resultUrl = null,
  providerRequestId = null,
  errorCode = 'PROVIDER_ERROR',
  errorReason = '模型供应商返回失败',
  actualCostUsd = null,
  durationMs = null,
  callbackIdempotencyKey,
}) {
  if (!callbackIdempotencyKey || String(callbackIdempotencyKey).trim().length < 8) {
    throw Object.assign(new Error('供应商回调必须提供有效的幂等键'), { code: 'IDEMPOTENCY_REQUIRED' });
  }
  if (!['succeeded', 'failed', 'cancelled'].includes(status)) {
    throw Object.assign(new Error('供应商回调状态无效'), { code: 'INVALID_CALLBACK_STATUS' });
  }

  const before = await findCreationById(creationId);
  if (!before) return { error: 'TASK_NOT_FOUND' };
  if (['succeeded', 'failed', 'cancelled'].includes(before.status)) return { creation: before, idempotent: true };
  if (before.status !== 'processing') {
    throw Object.assign(new Error(`任务当前状态不接受供应商回调: ${before.status}`), { code: 'INVALID_CALLBACK_STATE' });
  }

  const startedAt = Date.now();
  try {
    if (status === 'succeeded' && !resultUrl) throw Object.assign(new Error('成功回调缺少结果地址'), { code: 'CALLBACK_RESULT_REQUIRED' });
    const storedResult = status === 'succeeded'
      ? await archiveGenerationResult({
        resultUrl,
        creation: before,
        sourceProvider: before.provider,
        providerRequestId,
      })
      : null;

    return await withTransaction(async (tx) => {
      const updated = await updateGenerationOutcome(creationId, {
        status,
        resultUrl: null,
        resultObjectKey: status === 'succeeded' ? storedResult.objectKey : null,
        storageStatus: status === 'succeeded' ? 'ready' : undefined,
        storageAttempts: status === 'succeeded' ? storedResult.attempts : undefined,
        storageBucket: status === 'succeeded' ? storedResult.bucket : undefined,
        storageRegion: status === 'succeeded' ? storedResult.region : undefined,
        storageMimeType: status === 'succeeded' ? storedResult.mimeType : undefined,
        storageSizeBytes: status === 'succeeded' ? storedResult.sizeBytes : undefined,
        storageChecksum: status === 'succeeded' ? storedResult.checksum : undefined,
        storagePreviewObjectKey: status === 'succeeded' ? storedResult.previewObjectKey : undefined,
        storageThumbnailObjectKey: status === 'succeeded' ? storedResult.thumbnailObjectKey : undefined,
        providerRequestId,
        errorCode: status === 'succeeded' ? null : errorCode,
        errorReason: status === 'succeeded' ? null : errorReason,
        actualCostUsd,
        durationMs,
        expectedStatus: 'processing',
        transaction: tx,
      });
      if (!updated || updated.status !== status) {
        const current = await findCreationById(creationId, tx);
        return { creation: current, idempotent: ['succeeded', 'failed', 'cancelled'].includes(current?.status) };
      }
      if (status === 'succeeded') {
        await persistPrivateGenerationAsset(updated, tx);
        if (before.reservation_id) {
          await commitCredits({ reservationId: before.reservation_id, creationId, settledAmount: before.credit_cost, expectedUserId: before.user_id, transaction: tx });
        }
        await insertProviderCostRecord({
          jobId: creationId,
          providerId: before.provider,
          modelId: before.model,
          creditsCharged: before.credit_cost,
          estimatedCostUsd: before.estimated_cost_usd === null || before.estimated_cost_usd === undefined
            ? null : Number(before.estimated_cost_usd),
          actualCostUsd: reportedActualCost(actualCostUsd),
          currency: 'USD',
          costSource: actualCostUsd === null || actualCostUsd === undefined ? 'estimate_only' : 'provider_reported',
          reconciliationStatus: actualCostUsd === null || actualCostUsd === undefined ? 'pending_reconciliation' : 'provider_reported',
          transaction: tx,
        });
      } else if (before.reservation_id) {
        await voidCredits({ reservationId: before.reservation_id, reason: errorReason, expectedUserId: before.user_id, transaction: tx });
      }
      await addGenerationEvent(updated, `CALLBACK_${status.toUpperCase()}`, {
        fromStatus: 'processing',
        toStatus: status,
        providerRequestId,
        idempotencyKey: `callback:${callbackIdempotencyKey}`,
        metadata: { callbackIdempotencyKey },
        transaction: tx,
      });
      await logAudit({
        actor: { id: 'system:generation-callback', email: 'system@supdance.local' },
        action: `generation.callback_${status}`,
        targetType: 'creation',
        targetId: creationId,
        riskLevel: status === 'succeeded' ? 'low' : 'medium',
        after: { userId: updated.user_id, modelId: updated.model, provider: updated.provider, creditCost: updated.credit_cost, reservationId: updated.reservation_id, providerRequestId: updated.provider_request_id, callbackIdempotencyKey },
        transaction: tx,
      });
      return { creation: updated, success: status === 'succeeded', idempotent: false };
    });
  } catch (error) {
    const current = await findCreationById(creationId);
    if (['succeeded', 'failed', 'cancelled'].includes(current?.status)) return { creation: current, idempotent: true };
    if (String(error?.code || '').startsWith('STORAGE_')) {
      const storedPending = await finalizeStorageFailure({
        creation: current || before,
        startedAt,
        providerRequestId,
        actualCostUsd,
        providerId: before.provider,
        estimatedCostUsd: before.estimated_cost_usd === null || before.estimated_cost_usd === undefined
          ? null : Number(before.estimated_cost_usd),
        error,
      });
      return {
        creation: storedPending,
        success: false,
        storageFailed: true,
        error: '生成结果保存失败，预扣积分已原路退回。请重新提交任务。',
      };
    }
    throw error;
  }
}

export async function expireStaleGenerationTasks({ timeoutMs = 15 * 60 * 1000, limit = 50 } = {}) {
  const effectiveTimeoutMs = Math.max(60_000, Number(timeoutMs) || 15 * 60 * 1000);
  const cutoff = new Date(Date.now() - effectiveTimeoutMs).toISOString();
  const stale = await listStaleGenerationIds(cutoff, limit);
  const results = [];

  for (const row of stale) {
    try {
      const current = await findCreationById(row.id);
      if (!current || current.status !== 'processing') {
        results.push({ id: row.id, status: 'already_terminal' });
        continue;
      }
      // 如果任务是长视频生成，且启动未超过 30 分钟，不提前超时砍单
      const isVideo = inferGenerationAssetType(current) === 'video';
      const taskMaxTimeoutMs = isVideo ? 30 * 60 * 1000 : effectiveTimeoutMs;
      const startedAtMs = current.started_at ? new Date(current.started_at).getTime() : new Date(current.created_at).getTime();
      if (Date.now() - startedAtMs < taskMaxTimeoutMs) {
        continue;
      }
      const failed = await withTransaction(async (tx) => {
        if (current.reservation_id) {
          await voidCredits({ reservationId: current.reservation_id, reason: '供应商超时，系统自动释放额度', expectedUserId: current.user_id, transaction: tx });
        }
        const updated = await updateGenerationOutcome(row.id, {
          status: 'failed',
          errorCode: 'PROVIDER_TIMEOUT',
          errorReason: '模型供应商处理超时，额度已释放，请重试',
          durationMs: current.started_at ? Date.now() - new Date(current.started_at).getTime() : null,
          expectedStatus: 'processing',
          transaction: tx,
        });
        if (!updated) return findCreationById(row.id, tx);
        await addGenerationEvent(updated, 'TASK_TIMEOUT', {
          fromStatus: 'processing',
          toStatus: 'failed',
          metadata: { cutoff, timeoutMs: effectiveTimeoutMs },
          idempotencyKey: `timeout:${row.id}`,
          transaction: tx,
        });
        await logAudit({
          actor: { id: 'system:generation-watchdog', email: 'system@supdance.local' },
          action: 'generation.task_timeout',
          targetType: 'creation',
          targetId: row.id,
          riskLevel: 'medium',
          after: { userId: updated.user_id, modelId: updated.model, provider: updated.provider, reservationId: updated.reservation_id, errorCode: updated.error_code },
          transaction: tx,
        });
        return updated;
      });
      if (failed?.status === 'failed') {
        results.push({ id: row.id, status: 'failed' });
      } else {
        results.push({ id: row.id, status: 'race_lost' });
      }
    } catch (error) {
      const current = await findCreationById(row.id);
      if (['succeeded', 'failed', 'cancelled'].includes(current?.status)) {
        results.push({ id: row.id, status: 'already_terminal' });
      } else {
        results.push({ id: row.id, status: 'error', error: error.code || 'GENERATION_TIMEOUT_FAILED' });
      }
    }
  }

  return { checkedCount: stale.length, processed: results };
}

/**
 * 针对已提交上游、处于 processing 状态且带 provider_request_id 的任务执行单次阶梯退避轮询
 * 阶梯退避规则：2s -> 5s -> 10s -> 20s
 * 支持长达 15~30 分钟的视频生成，防止提前超时误关单与错误退款
 */
export async function pollGenerationTask({ creationId, testDependencies = null } = {}) {
  const fetchCreation = testDependencies?.findCreationById || findCreationById;
  const before = await fetchCreation(creationId);
  if (!before) return { error: 'TASK_NOT_FOUND' };
  if (['succeeded', 'failed', 'cancelled'].includes(before.status)) {
    return { creation: before, idempotent: true };
  }
  if (!before.provider_request_id) {
    return { error: 'TASK_NOT_SUBMITTED' };
  }

  // 1. 尝试原子认领轮询锁 (锁定 30 秒，防止多 Worker 实例并发冲撞)
  const claimDuePolling = testDependencies?.claimDuePollingCreation || claimDuePollingCreation;
  const claimed = await claimDuePolling(creationId, 30);
  if (!claimed) {
    return { skipped: true, reason: 'poll_locked_by_another_worker' };
  }

  const startedAtMs = claimed.started_at ? new Date(claimed.started_at).getTime() : new Date(claimed.created_at).getTime();
  const elapsedMs = Date.now() - startedAtMs;

  const isVideo = inferGenerationAssetType(claimed) === 'video';
  const maxTimeoutMs = isVideo ? 30 * 60 * 1000 : 15 * 60 * 1000;

  const executeWithTx = testDependencies?.withTransaction || withTransaction;
  const executeVoidCredits = testDependencies?.voidCredits || voidCredits;
  const executeCommitCredits = testDependencies?.commitCredits || commitCredits;
  const executeUpdateOutcome = testDependencies?.updateGenerationOutcome || updateGenerationOutcome;
  const executeAddEvent = testDependencies?.addGenerationEvent || addGenerationEvent;
  const executeSchedulePoll = testDependencies?.scheduleNextPoll || scheduleNextPoll;
  const executeCostRecord = testDependencies?.insertProviderCostRecord || insertProviderCostRecord;
  const executeLogAudit = testDependencies?.logAudit || logAudit;

  // 2. 超时判断：超过最大支持时长（视频 30 分钟，其他 15 分钟）
  if (elapsedMs > maxTimeoutMs) {
    const timeoutReason = `模型供应商生成超时（已超最大限制 ${Math.round(maxTimeoutMs / 60000)} 分钟），额度已原路退回`;
    const failed = await executeWithTx(async (tx) => {
      if (claimed.reservation_id) {
        await executeVoidCredits({
          reservationId: claimed.reservation_id,
          reason: timeoutReason,
          expectedUserId: claimed.user_id,
          transaction: tx,
        });
      }
      const updated = await executeUpdateOutcome(claimed.id, {
        status: 'failed',
        errorCode: 'PROVIDER_TIMEOUT',
        errorReason: timeoutReason,
        durationMs: elapsedMs,
        expectedStatus: 'processing',
        nextPollAt: null,
        pollLockedUntil: null,
        transaction: tx,
      });
      await executeAddEvent(updated, 'TASK_TIMEOUT', {
        fromStatus: 'processing',
        toStatus: 'failed',
        provider: claimed.provider,
        providerRequestId: claimed.provider_request_id,
        metadata: { elapsedMs, maxTimeoutMs },
        transaction: tx,
      });
      return updated;
    });
    return { creation: failed, success: false, timeout: true };
  }

  // 3. 计算阶梯退避间隔 (2s -> 5s -> 10s -> 20s)
  function getSteppedBackoffSeconds(elapsed) {
    if (elapsed < 10_000) return 2;
    if (elapsed < 30_000) return 5;
    if (elapsed < 90_000) return 10;
    return 20;
  }
  const nextBackoffSec = getSteppedBackoffSeconds(elapsedMs);

  // 4. 获取对应适配器并查询上游状态
  const injectedTestAdapterFactory = (process.env.NODE_ENV === 'test' && typeof testDependencies?.getProviderAdapter === 'function')
    ? testDependencies.getProviderAdapter : (typeof testDependencies?.getProviderAdapter === 'function' ? testDependencies.getProviderAdapter : getProviderAdapter);
  const injectedTestArchive = (process.env.NODE_ENV === 'test' && typeof testDependencies?.archiveGenerationResult === 'function')
    ? testDependencies.archiveGenerationResult : (typeof testDependencies?.archiveGenerationResult === 'function' ? testDependencies.archiveGenerationResult : archiveGenerationResult);

  let adapter = null;
  let pollData = null;
  try {
    adapter = await injectedTestAdapterFactory(claimed.provider);
    let pollParameters = {};
    try {
      const parsedInput = typeof claimed.input_summary_json === 'string'
        ? JSON.parse(claimed.input_summary_json)
        : (claimed.input_summary_json || {});
      pollParameters = parsedInput.parameters || {};
    } catch {
      pollParameters = {};
    }

    pollData = await adapter.getTask(claimed.provider_request_id, {
      parameters: pollParameters,
    });
  } catch (error) {
    const normErr = adapter?.normalizeError ? adapter.normalizeError(error) : error;
    const isTransient = [
      PROVIDER_ERROR_CODES.RATE_LIMIT,
      PROVIDER_ERROR_CODES.NETWORK_ERROR,
      PROVIDER_ERROR_CODES.PROVIDER_INTERNAL_ERROR,
      PROVIDER_ERROR_CODES.TIMEOUT,
      PROVIDER_ERROR_CODES.UNKNOWN_ERROR,
    ].includes(normErr?.code) || normErr?.isRetryable;

    if (isTransient) {
      await executeSchedulePoll(claimed.id, {
        nextPollAt: new Date(Date.now() + nextBackoffSec * 1000),
        pollLockedUntil: null,
      });
      return { status: 'processing', transientError: normErr.code, nextPollInSeconds: nextBackoffSec };
    }

    pollData = {
      status: 'failed',
      error: normErr.message || '上游任务轮询失败',
      actualCostUsd: normErr.actualCostUsd,
    };
  }

  // 5. 任务成功完成
  if (pollData?.status === 'succeeded' && pollData?.resultUrl) {
    const finalResultUrl = pollData.resultUrl;
    const attemptActualCostUsd = reportedActualCost(pollData.actualCostUsd);

    try {
      const storedResult = await injectedTestArchive({
        resultUrl: finalResultUrl,
        creation: claimed,
        sourceProvider: claimed.provider,
        providerRequestId: claimed.provider_request_id,
      });

      const succeeded = await executeWithTx(async (tx) => {
        const updated = await executeUpdateOutcome(claimed.id, {
          status: 'succeeded',
          resultUrl: null,
          resultObjectKey: storedResult.objectKey,
          storageStatus: 'ready',
          storageAttempts: storedResult.attempts,
          storageBucket: storedResult.bucket,
          storageRegion: storedResult.region,
          storageMimeType: storedResult.mimeType,
          storageSizeBytes: storedResult.sizeBytes,
          storageChecksum: storedResult.checksum,
          storagePreviewObjectKey: storedResult.previewObjectKey,
          storageThumbnailObjectKey: storedResult.thumbnailObjectKey,
          provider: claimed.provider,
          model: claimed.model,
          providerRequestId: claimed.provider_request_id,
          actualCostUsd: attemptActualCostUsd,
          durationMs: Date.now() - startedAtMs,
          expectedStatus: 'processing',
          nextPollAt: null,
          pollLockedUntil: null,
          transaction: tx,
        });
        if (!updated) {
          const current = await fetchCreation(claimed.id, tx);
          if (current?.status === 'succeeded') return current;
          throw Object.assign(new Error('生成任务状态更新失败，结算事务已回滚'), { code: 'GENERATION_FINALIZE_FAILED' });
        }
        await persistPrivateGenerationAsset(updated, tx, testDependencies);
        if (claimed.reservation_id) {
          await executeCommitCredits({
            reservationId: claimed.reservation_id,
            creationId: claimed.id,
            settledAmount: claimed.credit_cost,
            expectedUserId: claimed.user_id,
            transaction: tx,
          });
        }
        await executeCostRecord({
          jobId: claimed.id,
          providerId: claimed.provider,
          modelId: claimed.model,
          creditsCharged: claimed.credit_cost,
          estimatedCostUsd: claimed.estimated_cost_usd ? Number(claimed.estimated_cost_usd) : null,
          actualCostUsd: attemptActualCostUsd,
          currency: 'USD',
          costSource: attemptActualCostUsd === null ? 'estimate_only' : 'provider_reported',
          reconciliationStatus: attemptActualCostUsd === null ? 'pending_reconciliation' : 'provider_reported',
          transaction: tx,
        });
        await executeAddEvent(updated, 'TASK_SUCCEEDED', {
          fromStatus: 'processing',
          toStatus: 'succeeded',
          provider: claimed.provider,
          providerRequestId: claimed.provider_request_id,
          metadata: { durationMs: Date.now() - startedAtMs, polledAsync: true },
          transaction: tx,
        });
        await executeLogAudit({
          actor: { id: 'system:generation-worker', email: 'system@supdance.local' },
          action: 'generation.task_succeeded',
          targetType: 'creation',
          targetId: claimed.id,
          riskLevel: 'low',
          after: { userId: updated.user_id, modelId: updated.model, provider: updated.provider, creditCost: updated.credit_cost },
          transaction: tx,
        });
        return updated;
      });

      recordProviderSuccess(claimed.provider).catch((err) => console.error('[circuitBreaker/success]', err));
      return { creation: succeeded, success: true };
    } catch (error) {
      if (!String(error?.code || '').startsWith('STORAGE_')) throw error;
      const pending = await finalizeStorageFailure({
        creation: claimed,
        startedAt: new Date(startedAtMs),
        providerRequestId: claimed.provider_request_id,
        actualCostUsd: attemptActualCostUsd,
        providerId: claimed.provider,
        estimatedCostUsd: claimed.estimated_cost_usd === null || claimed.estimated_cost_usd === undefined
          ? null : Number(claimed.estimated_cost_usd),
        error,
        dependencies: testDependencies,
      });
      return { creation: pending, success: false, storageFailed: true, error: '生成结果保存失败，预扣积分已原路退回。请重新提交任务。' };
    }
  }

  // 6. 任务明确失败或取消
  if (pollData?.status === 'failed' || pollData?.status === 'cancelled') {
    const safeFailureReason = publicErrorMessage({ message: pollData?.error }, '供应商任务执行失败');
    const failed = await executeWithTx(async (tx) => {
      if (claimed.reservation_id) {
        await executeVoidCredits({
          reservationId: claimed.reservation_id,
          reason: safeFailureReason,
          expectedUserId: claimed.user_id,
          transaction: tx,
        });
      }
      const updated = await executeUpdateOutcome(claimed.id, {
        status: 'failed',
        errorCode: 'UPSTREAM_GENERATION_FAILED',
        errorReason: safeFailureReason,
        durationMs: Date.now() - startedAtMs,
        expectedStatus: 'processing',
        nextPollAt: null,
        pollLockedUntil: null,
        transaction: tx,
      });
      await executeAddEvent(updated, 'TASK_FAILED', {
        fromStatus: 'processing',
        toStatus: 'failed',
        provider: claimed.provider,
        providerRequestId: claimed.provider_request_id,
        metadata: { reason: safeFailureReason },
        transaction: tx,
      });
      return updated;
    });
    recordProviderFailure(claimed.provider, { code: 'UPSTREAM_GENERATION_FAILED', message: safeFailureReason }).catch(() => {});
    return { creation: failed, success: false, error: safeFailureReason };
  }

  // 7. 任务仍在处理中：排定下一次阶梯退避轮询
  await executeSchedulePoll(claimed.id, {
    nextPollAt: new Date(Date.now() + nextBackoffSec * 1000),
    pollLockedUntil: null,
  });

  return {
    id: claimed.id,
    status: 'processing',
    nextPollInSeconds: nextBackoffSec,
    elapsedMs,
  };
}
