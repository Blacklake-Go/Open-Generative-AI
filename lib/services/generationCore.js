import 'server-only';
import crypto from 'node:crypto';

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
  linkAssetToCreation,
  linkReservationToCreation,
  listStaleGenerationIds,
  listDuePollingCreations,
  claimDuePollingCreation,
  scheduleNextPoll,
  updateGenerationOutcome,
  acquireCreationIdempotencyLock,
  acquireGenerationAdmissionLock,
} from '../repositories/creations.js';
import { recordProviderCall } from '../repositories/providers.js';
import { getGenerationProvider } from './generationProviders.js';
import { createResilientProvider } from './providerRuntime.js';
import { assertGenerationTransition } from './generationState.js';
import { getAssetStorageAdapter, getAssetUrl, ingestRemoteFile } from '../storage/storageService.js';
import { getUserAssetDownload, syncCreationToAsset } from './assets.js';
import { routeGenerationTask } from './smartRouter.js';
import {
  getProviderAdapter,
  NON_RETRYABLE_ERROR_CODES,
  PROVIDER_ERROR_CODES,
  shouldTripProviderCircuitBreaker,
} from '../adapters/index.js';
import { createGenerationAttempt, updateGenerationAttemptOutcome, getGenerationAttemptForReceipt } from '../repositories/attempts.js';
import { insertProviderCostRecord } from '../repositories/costRecords.js';
import { assertGenerationResultEncryptionReady, getGenerationResult, saveGenerationResult, markGenerationResultArchived } from '../repositories/generationResults.js';
import { createGenerationQuote, verifyAndConsumeQuote, stableSerialize } from './pricingEngine.js';
import { recordProviderSuccess, recordProviderFailure } from './circuitBreaker.js';
import { getServerProviderCredentialStatus } from './providerSecrets.js';
import { isSubmissionOutcomeUnconfirmed } from './providerOutcome.js';
import { resolveCanvasOwnedAssetReferences } from './canvasAssetReferences.js';
import { publicCanvasModel } from '../canvas/modelDescriptor.js';
import { normalizeRoutingMode } from '../modelCenter/routePricing.js';
import { evaluateCrossModelFailover, CROSS_MODEL_FAILOVER } from '../modelCenter/failoverPolicy.js';
import { getGenerationQuoteRouteSnapshot } from '../repositories/quotes.js';

const TASK_STATUSES = new Set(['queued', 'processing', 'succeeded', 'failed', 'cancelled']);

function generationFence(creation, includeLease = true) {
  return {
    expectedProvider: creation.provider,
    expectedProviderRequestId: creation.provider_request_id || null,
    ...(includeLease ? { expectedPollLockedUntil: creation.poll_locked_until || null } : {}),
  };
}

function attemptCostSnapshot(creation, attempt) {
  return {
    jobId: creation.id,
    attemptId: attempt?.id || null,
    providerId: creation.provider,
    modelId: creation.model,
    estimatedCostUsd: reportedActualCost(attempt?.estimated_cost_usd ?? creation.estimated_cost_usd),
    priceVersionId: attempt?.price_version_id || null,
    currency: 'USD',
  };
}

// Receipt, upstream success evidence and its cost liability are durable before
// downloading or settling. Recovery never needs another paid createTask call.
async function rememberProviderResponse({ creation, attempt, result, snapshot = {}, publishReceipt = false, dependencies = null }) {
  const runTx = dependencies?.withTransaction || withTransaction;
  return runTx(async (tx) => {
    let current = creation;
    const receipt = result.providerRequestId || creation.provider_request_id || null;
    const resultText = result.output || result.resultText || null;
    const hasResult = Boolean(result.resultUrl || resultText);
    const actualCostUsd = reportedActualCost(result.actualCostUsd);
    // Always lock the parent before the attempt/checkpoint; every finalizer uses
    // the same order. A stale reader cannot publish evidence for a newer receipt.
    if (publishReceipt) {
      current = await (dependencies?.updateGenerationOutcome || updateGenerationOutcome)(creation.id, {
        status: 'processing', provider: creation.provider, model: creation.model,
        providerRequestId: receipt, actualCostUsd,
        nextPollAt: receipt || hasResult ? new Date(Date.now() + 2000) : null,
        expectedStatus: 'processing', expectedProviderRequestId: null, transaction: tx,
      });
      if (!current) throw Object.assign(new Error('任务回执已变化，停止重复派发'), { code: 'GENERATION_RECEIPT_CONFLICT' });
    } else {
      const locked = await (dependencies?.scheduleNextPoll || scheduleNextPoll)(creation.id, {
        nextPollAt: new Date(), pollLockedUntil: creation.poll_locked_until || null,
        ...generationFence(creation), transaction: tx,
      });
      if (locked === 0) return null;
    }
    if (attempt) {
      await (dependencies?.updateGenerationAttemptOutcome || updateGenerationAttemptOutcome)(attempt.id, {
        status: hasResult ? 'succeeded' : 'processing', providerRequestId: receipt,
        actualCostUsd, costSource: actualCostUsd === null ? null : 'provider_reported',
        reconciliationStatus: actualCostUsd === null ? 'pending_reconciliation' : 'provider_reported',
        transaction: tx,
      });
    }
    let checkpoint = null;
    if (hasResult) {
      checkpoint = await (dependencies?.saveGenerationResult || saveGenerationResult)({
        creationId: creation.id, attemptId: attempt?.id || null,
        providerId: creation.provider, providerRequestId: receipt,
        resultUrl: result.resultUrl || null, resultText, actualCostUsd, transaction: tx,
      });
      if (!checkpoint) return null;
    }
    await (dependencies?.insertProviderCostRecord || insertProviderCostRecord)({
      ...attemptCostSnapshot(current, attempt), ...snapshot, creditsCharged: 0, actualCostUsd,
      costSource: actualCostUsd === null ? 'estimate_only' : 'provider_reported',
      reconciliationStatus: actualCostUsd === null ? 'pending_reconciliation' : 'provider_reported',
      transaction: tx,
    });
    await (dependencies?.addGenerationEvent || addGenerationEvent)(current, hasResult ? 'PROVIDER_SUCCEEDED' : 'PROVIDER_ACCEPTED', {
      fromStatus: 'processing', toStatus: 'processing', provider: creation.provider,
      providerRequestId: receipt, idempotencyKey: `${hasResult ? 'result' : 'receipt'}:${attempt?.id || creation.id}`,
      metadata: { attemptId: attempt?.id || null }, transaction: tx,
    });
    return checkpoint;
  });
}

async function retainUnconfirmedSubmission({ creation, attempt, providerRequestId = null, actualCostUsd = null, reason, snapshot = {}, dependencies = null }) {
  return (dependencies?.withTransaction || withTransaction)(async (tx) => {
    const updated = await (dependencies?.updateGenerationOutcome || updateGenerationOutcome)(creation.id, {
      status: 'processing', provider: creation.provider, model: creation.model,
      providerRequestId, nextPollAt: providerRequestId ? new Date(Date.now() + 2000) : null,
      expectedStatus: 'processing', expectedProviderRequestId: null, transaction: tx,
    });
    if (!updated) return { creation: await (dependencies?.findCreationById || findCreationById)(creation.id, tx), pending: true };
    if (attempt) await (dependencies?.updateGenerationAttemptOutcome || updateGenerationAttemptOutcome)(attempt.id, {
      status: 'processing', providerRequestId, errorCode: 'PROVIDER_OUTCOME_UNCONFIRMED',
      errorReason: '供应商执行结果尚未确认，保留冻结积分等待核对', actualCostUsd,
      reconciliationStatus: 'pending_reconciliation', transaction: tx,
    });
    await (dependencies?.insertProviderCostRecord || insertProviderCostRecord)({
      ...attemptCostSnapshot(creation, attempt), ...snapshot, actualCostUsd, creditsCharged: 0,
      costSource: actualCostUsd === null ? 'estimate_only' : 'provider_reported',
      reconciliationStatus: 'pending_reconciliation', transaction: tx,
    });
    await (dependencies?.addGenerationEvent || addGenerationEvent)(updated, 'TASK_RECONCILIATION_REQUIRED', {
      fromStatus: 'processing', toStatus: 'processing', provider: creation.provider, providerRequestId,
      idempotencyKey: `uncertain:${attempt?.id || creation.id}`, metadata: { reason }, transaction: tx,
    });
    return { creation: updated, status: 'processing', pending: true, reconciliationRequired: true };
  });
}

// Only a confirmed upstream terminal result can release a reservation. Lock the
// creation first and recheck durable success evidence before touching the wallet.
async function finalizeProviderFailure({ creation, attempt, status = 'failed', errorCode = 'UPSTREAM_GENERATION_FAILED', errorReason, actualCostUsd = null, durationMs = null, includeLease = true, callbackKey = null, dependencies = null }) {
  const update = dependencies?.updateGenerationOutcome || updateGenerationOutcome;
  const fence = generationFence(creation, includeLease);
  return (dependencies?.withTransaction || withTransaction)(async (tx) => {
    const locked = await update(creation.id, { status: 'processing', expectedStatus: 'processing', ...fence, transaction: tx });
    if (!locked) return { skipped: true, reason: 'poll_lease_changed' };
    const checkpoint = await (dependencies?.getGenerationResult || getGenerationResult)(creation.id, tx);
    if (checkpoint) {
      if (includeLease) await (dependencies?.scheduleNextPoll || scheduleNextPoll)(creation.id, {
        nextPollAt: new Date(), pollLockedUntil: null, ...fence, transaction: tx,
      });
      return { creation: locked, pending: true, localRecovery: true };
    }
    const updated = await update(creation.id, {
      status, errorCode, errorReason, actualCostUsd, durationMs,
      expectedStatus: 'processing', ...fence, nextPollAt: null, pollLockedUntil: null, transaction: tx,
    });
    if (!updated) throw Object.assign(new Error('任务终态竞争，事务已回滚'), { code: 'GENERATION_FINALIZE_FAILED' });
    if (attempt) await (dependencies?.updateGenerationAttemptOutcome || updateGenerationAttemptOutcome)(attempt.id, {
      status, providerRequestId: creation.provider_request_id, errorCode, errorReason, durationMs,
      actualCostUsd, costSource: actualCostUsd === null ? null : 'provider_reported', transaction: tx,
    });
    if (creation.reservation_id) await (dependencies?.voidCredits || voidCredits)({
      reservationId: creation.reservation_id, reason: errorReason,
      expectedUserId: creation.user_id, transaction: tx,
    });
    if (attempt) await (dependencies?.insertProviderCostRecord || insertProviderCostRecord)({
      ...attemptCostSnapshot(creation, attempt), actualCostUsd, creditsCharged: 0,
      costSource: actualCostUsd === null ? 'estimate_only' : 'provider_reported', transaction: tx,
    });
    await (dependencies?.addGenerationEvent || addGenerationEvent)(updated, callbackKey ? `CALLBACK_${status.toUpperCase()}` : `TASK_${status.toUpperCase()}`, {
      fromStatus: 'processing', toStatus: status, provider: creation.provider,
      providerRequestId: creation.provider_request_id,
      idempotencyKey: callbackKey ? `callback:${callbackKey}` : null,
      metadata: { reason: errorReason, code: errorCode }, transaction: tx,
    });
    return { creation: updated, success: false, error: errorReason };
  });
}

async function persistPrivateGenerationAsset(creation, transaction, testDependencies = null) {
  if (process.env.NODE_ENV === 'test' && testDependencies?.syncAsset === false) return null;
  if (!creation?.result_object_key && creation?.result_text) return null;
  const syncAsset = typeof testDependencies?.syncAsset === 'function'
    ? testDependencies.syncAsset
    : syncCreationToAsset;
  try {
    const asset = await syncAsset(creation, { transaction, required: true });
    if (!asset?.id || !await linkAssetToCreation(creation.id, asset.id, transaction)) {
      throw Object.assign(new Error('生成结果与私有素材关联失败'), { code: 'STORAGE_ASSET_SYNC_FAILED' });
    }
    // The creation object was read before linkAssetToCreation updated the row.
    // Return the stable reference even when a synchronous job completes in
    // the original POST instead of being read back by the polling endpoint.
    creation.asset_id = asset.id;
    return asset;
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

// Archive retries exhausted: the provider did produce a result, but it cannot be
// delivered. Keep the encrypted success checkpoint as evidence of what upstream
// actually created, record the provider-side cost independently, and refund the
// user according to the existing delivery policy. A lease/fence mismatch means a
// newer attempt owns the task, so this transaction must not refund or write.
async function finalizeStorageFailure({ creation, startedAt, providerRequestId = null, actualCostUsd = null, error, attemptId = null, providerId = null, estimatedCostUsd = null, priceVersionId = null, fxSnapshot = {}, includeLease = true, dependencies = null }) {
  const errorCode = error.code || 'STORAGE_INGEST_FAILED';
  const errorReason = '生成结果无法保存，预扣积分已原路退回。请重新提交任务。';
  const executeWithTransaction = dependencies?.withTransaction || withTransaction;
  const executeVoidCredits = dependencies?.voidCredits || voidCredits;
  const executeUpdateOutcome = dependencies?.updateGenerationOutcome || updateGenerationOutcome;
  const executeCostRecord = dependencies?.insertProviderCostRecord || insertProviderCostRecord;
  const executeAddEvent = dependencies?.addGenerationEvent || addGenerationEvent;
  const executeLogAudit = dependencies?.logAudit || logAudit;
  const executeFindCreation = dependencies?.findCreationById || findCreationById;
  const fence = generationFence(creation, includeLease);
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
      ...fence,
      nextPollAt: null,
      pollLockedUntil: null,
      transaction: tx,
    });
    if (!updated) return executeFindCreation(creation.id, tx);
    if (creation.reservation_id) {
      await executeVoidCredits({
        reservationId: creation.reservation_id,
        reason: '生成结果无法保存，释放预扣积分',
        expectedUserId: creation.user_id,
        transaction: tx,
      });
    }
    if (providerId) {
      await executeCostRecord({
        jobId: creation.id, attemptId, providerId, modelId: creation.model,
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
  if (!['canvas', 'image', 'video', 'home-image', 'home-video'].includes(creation?.studio_id)) return parameters;
  return resolveCanvasOwnedAssetReferences(parameters, {
    userId: creation.user_id,
    getUserAssetDownload,
    getAssetUrl,
    getAssetBytes: async (objectKey, location = {}) => {
      const adapter = await getAssetStorageAdapter(location);
      if (!adapter) {
        throw Object.assign(new Error('资源所属存储位置不可用'), { code: 'STORAGE_LOCATION_UNAVAILABLE' });
      }
      return adapter.download({ key: objectKey });
    },
    providerId,
  });
}

async function providerCreationWithCanvasReferences(creation) {
  if (!['canvas', 'image', 'video', 'home-image', 'home-video'].includes(creation?.studio_id)) return creation;
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
  expectedCapabilityVersion = null,
  routingMode = 'cost',
  chargeCredits = true,
  requirePublicAvailability = true,
  site = 'main',
  onTaskCreated = null,
}) {
  if (!userId) throw Object.assign(new Error('请先登录后再创建生成任务'), { code: 'UNAUTHENTICATED' });
  if (!idempotencyKey || String(idempotencyKey).trim().length < 8) {
    throw Object.assign(new Error('生成任务必须提供有效的幂等键'), { code: 'IDEMPOTENCY_REQUIRED' });
  }

  const normalizedKey = String(idempotencyKey).trim().slice(0, 200);
  const requestHash = crypto.createHash('sha256').update(stableSerialize({
    modelId, studioId, site,
    prompt:String(prompt || parameters?.prompt || '').trim(),
    parameters, capabilityVersion:expectedCapabilityVersion,
  })).digest('hex');
  const verifyRetry = creation => {
    const previousHash = parseJsonObject(creation.input_summary_json).requestHash;
    if (previousHash && previousHash !== requestHash) throw Object.assign(new Error('该请求标识已用于其他生成参数，请为新任务使用新的请求标识'), {code:'GENERATION_IDEMPOTENCY_CONFLICT'});
  };
  const existing = await findUserCreationByIdempotency(userId, normalizedKey);
  if (existing) {
    verifyRetry(existing);
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
  const canonicalPublicModel = requirePublicAvailability
    ? await assertPublicModelOrderable(model.id, { userId, site })
    : null;
  // Bind the quote to the capability contract currently published by the catalogue.
  // A quote priced against an older contract must be re-quoted before credits are held.
  const currentCapabilityVersion = canonicalPublicModel
    ? publicCanvasModel(canonicalPublicModel, { schemaVersion: 2 }).capabilityVersion
    : null;

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
  if (['image','video'].includes(model.type || model.category) && effectiveParameters.watermark === undefined) {
    effectiveParameters.watermark = !Boolean(entitlements?.hasNoWatermark);
  } else if (['image','video'].includes(model.type || model.category) && !entitlements?.hasNoWatermark) {
    effectiveParameters.watermark = true;
  }
  const parametersForQuote = quoteParameters && typeof quoteParameters === 'object' && !Array.isArray(quoteParameters)
    ? quoteParameters
    : effectiveParameters;

  // 并发控制：检查用户当前任务数是否超过套餐上限
  const { checkConcurrency } = await import('./concurrencyControl.js');

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
    requestHash,
    modelId: model.id,
    modelType: model.type || 'image',
    endpoint: model.id,
    prompt: textPrompt,
    parameters: effectiveParameters,
    quoteId: effectiveQuoteId,
    routingMode: effectiveRoutingMode,
  });
  return withTransaction(async (tx) => {
    // Different request keys still compete for the same user's task allowance.
    await acquireGenerationAdmissionLock(userId, tx);
    // Two retries can both miss the fast-path read above. Serialize the keyed
    // transaction, then re-check before consuming the quote or reserving credits.
    await acquireCreationIdempotencyLock(userId, normalizedKey, tx);
    const concurrentCreation = await findUserCreationByIdempotency(userId, normalizedKey, tx);
    if (concurrentCreation) {
      verifyRetry(concurrentCreation);
      if (typeof onTaskCreated === 'function') {
        await onTaskCreated({ creation: concurrentCreation, transaction: tx, idempotent: true });
      }
      return { creation: concurrentCreation, idempotent: true };
    }

    const concurrencyCheck = await checkConcurrency({ userId, modelId: model.id, transaction: tx });
    if (!concurrencyCheck.allowed) {
      throw Object.assign(new Error(concurrencyCheck.message), {
        code: concurrencyCheck.reason,
        activeCount: concurrencyCheck.activeCount,
        limit: concurrencyCheck.limit,
      });
    }

    if (chargeCredits && effectiveQuoteId) {
      const verifiedQuote = await verifyAndConsumeQuote({
        quoteId: effectiveQuoteId,
        userId,
        modelId: model.id,
        parameters: parametersForQuote,
        expectedCapabilityVersion,
        currentCapabilityVersion,
        transaction: tx,
      });
      if (verifiedQuote) {
        // 报价记录的策略必须原样用于执行：未知值不应静默替换成其他策略。
        const quotedRoutingMode = normalizeRoutingMode(verifiedQuote.routeSnapshot?.routingMode, null);
        if (quotedRoutingMode) {
          effectiveRoutingMode = quotedRoutingMode;
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
      verifyRetry(creation);
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
  if (before.status === 'processing') {
    if (before.provider_request_id) return pollGenerationTask({ creationId, testDependencies });
    return {creation:before,status:'processing',pending:true,idempotent:true};
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

  // A receipt proves an upstream task may already exist. Poll it instead of
  // submitting a second paid createTask, even if the parent row lost its state.
  if (claimed.provider_request_id) {
    return pollGenerationTask({ creationId, testDependencies });
  }

  const startedAt = Date.now();

  // The encrypted success checkpoint is the only durable proof that upstream
  // produced a result. Without it a paid dispatch could succeed and then be
  // impossible to recover, so refuse to dispatch and release the reservation.
  try {
    assertGenerationResultEncryptionReady();
  } catch (encryptionError) {
    const reason = '生成结果加密存储不可用，任务未派发并已解冻额度，请联系管理员';
    const failed = await finalizeProviderFailure({
      creation: claimed,
      attempt: null,
      errorCode: encryptionError.code || 'GENERATION_RESULT_ENCRYPTION_UNAVAILABLE',
      errorReason: reason,
      durationMs: Date.now() - startedAt,
      dependencies: testDependencies,
    });
    return { creation: failed.creation, success: false, error: reason };
  }

  // Legacy server-side clients share the same durable result/settlement path.
  // A paid submission is never retried by the generic network retry wrapper.
  if (providerClient) {
    const attempt = await createGenerationAttempt({
      creationId, attemptNumber: 1, providerId: claimed.provider, providerModelId: claimed.model,
      estimatedCostUsd: reportedActualCost(claimed.estimated_cost_usd), costCurrency: 'USD',
    });
    const provider = createResilientProvider({
      provider: providerClient, providerName: claimed.provider, maxAttempts: 1,
      onCall: (call) => recordProviderCall({ provider: call.provider, action: call.action,
        requestId: null, status: call.status, latencyMs: call.latencyMs, errorCode: call.errorCode,
        usage: { attempt: call.attempt || null, modelId: claimed.model, creationId: claimed.id },
      }).catch(() => {}),
    });
    let callStarted = false;
    let responseReceived = false;
    let result = null;
    try {
      const providerCreation = await providerCreationWithCanvasReferences(claimed);
      callStarted = true;
      result = await provider.generate({ creation: providerCreation });
      responseReceived = Boolean(result?.resultUrl || result?.output || result?.resultText || result?.providerRequestId);
      if (!responseReceived) throw Object.assign(new Error('供应商执行结果尚未确认'), { code: 'EMPTY_RESULT_URL' });
      await rememberProviderResponse({ creation: claimed, attempt, result, publishReceipt: true, dependencies: testDependencies });
      return pollGenerationTask({ creationId, testDependencies });
    } catch (error) {
      if (responseReceived || isSubmissionOutcomeUnconfirmed(error, {
        callStarted,
        providerRequestId: error?.providerRequestId,
        terminalFailure: error?.terminalFailure === true,
      })) {
        return retainUnconfirmedSubmission({ creation: claimed, attempt,
          providerRequestId: result?.providerRequestId || error?.providerRequestId || null,
          actualCostUsd: reportedActualCost(result?.actualCostUsd ?? error?.actualCostUsd),
          reason: responseReceived ? 'local_receipt_persistence_failed' : 'submission_outcome_unconfirmed',
          dependencies: testDependencies,
        });
      }
      return finalizeProviderFailure({ creation: claimed, attempt,
        errorCode: error.code || 'PROVIDER_ERROR', errorReason: publicErrorMessage(error, '模型供应商调用失败'),
        durationMs: Date.now() - startedAt, dependencies: testDependencies,
      });
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
  // 切换到备用逻辑模型后，原报价的候选白名单已不适用；改为绑定原报价的
  // 故障转移成本上限与汇率快照执行，由 failoverPolicy 提供。
  let failoverRouteOptions = null;
  // 切换发生后，下一条 attempt 需要带上「为什么换模型」，与 receipt/终态同一行可查。
  let pendingFailoverMetadata = null;
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
        quoteId: failoverRouteOptions ? null : (claimed.quote_id || null),
        costCeiling: failoverRouteOptions?.costCeiling || null,
        fxSnapshot: failoverRouteOptions?.fxSnapshot || null,
        routingMode: failoverRouteOptions?.routingMode || null,
        excludedProviderIds,
      });
    } catch (routeErr) {
      // 同一逻辑模型的所有已报价渠道都不可用时，才评估跨逻辑模型备用。
      // 是否允许切由 failoverPolicy 判定：能力等价、原报价成本上限、Canvas 固定选择、
      // 明确拒绝/非重试错误、已受理或受理未知都不得切换。
      if (!triedBackupModel) {
        const currentModel = await findModelByEndpointOrId(currentModelId);
        const backupModelId = currentModel?.backup_model_id || null;
        const backupModel = backupModelId && String(backupModelId) !== String(currentModelId)
          ? await findModelByEndpointOrId(backupModelId)
          : null;
        const quoteSnapshot = await getGenerationQuoteRouteSnapshot(claimed.quote_id || null);
        const failoverDecision = evaluateCrossModelFailover({
          studioId: claimed.studio_id,
          requestedModel: currentModel,
          backupModel,
          parameters,
          routeErrorCode: routeErr.code || null,
          triggeringErrorCode: routeErr.code || lastErrorCode || 'ROUTING_FAILED',
          nonRetryableErrorCodes: NON_RETRYABLE_ERROR_CODES,
          quoteSnapshot,
          attemptedProviderIds: excludedProviderIds,
          alreadyTriedBackup: false,
          hasProviderReceipt: Boolean(claimed.provider_request_id),
        });
        if (failoverDecision.allowed) {
          triedBackupModel = true;
          failoverRouteOptions = failoverDecision.routeOptions;
          pendingFailoverMetadata = {
            fromModelId: currentModelId,
            toModelId: backupModelId,
            code: failoverDecision.code,
            reason: failoverDecision.reason,
            routeErrorCode: routeErr.code || null,
            attemptNumberBeforeSwitch: attemptCount,
            evidence: failoverDecision.evidence,
          };
          console.log(`[generationCore] 模型 ${currentModelId} 无可用渠道，按能力等价与报价成本上限切换至备用模型 ${backupModelId}`);
          await addGenerationEvent(claimed, 'MODEL_FAILOVER', {
            fromStatus: 'processing',
            toStatus: 'processing',
            metadata: {
              primaryModelId: currentModelId,
              backupModelId,
              reason: failoverDecision.reason,
              routeErrorCode: routeErr.code || null,
              attemptNumber: attemptCount,
              failover: failoverDecision.evidence,
            },
          });
          currentModelId = backupModelId;
          excludedProviderIds.length = 0;
          attemptCount--;
          continue;
        }
        if (backupModelId && failoverDecision.code !== CROSS_MODEL_FAILOVER.NOT_CONFIGURED) {
          // 管理员配置了备用模型但本次不满足切换条件时留下可追溯原因，
          // 避免后台只看到“没有可用渠道”而不知道备用为何未生效。
          await addGenerationEvent(claimed, 'MODEL_FAILOVER_SKIPPED', {
            fromStatus: 'processing',
            toStatus: 'processing',
            metadata: {
              primaryModelId: currentModelId,
              backupModelId,
              code: failoverDecision.code,
              reason: failoverDecision.reason,
              routeErrorCode: routeErr.code || null,
              attemptNumber: attemptCount,
              failover: failoverDecision.evidence,
            },
          });
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

    // 执行留痕：只记来源与密钥名，不记密钥值。后台靠它回答
    // 「最近一次真实执行是否已经用上当前配置」，缺证据时保持未记录。
    const attemptCredential = await getServerProviderCredentialStatus({ provider: providerId }).catch(() => null);
    const credentialMetadata = attemptCredential?.configured
      ? {
          credentialSource: attemptCredential.source,
          credentialSecretName: attemptCredential.secretName || null,
        }
      : {};

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
      // 选择依据、切换原因与这条 attempt 的回执/终态用同一个决策 id 串起来。
      routeDecisionId: routeDecision.decisionId || null,
      metadata: {
        ...(pendingFailoverMetadata ? { failover: pendingFailoverMetadata } : {}),
        ...credentialMetadata,
      },
    });
    pendingFailoverMetadata = null;

    const attemptStartedAt = Date.now();
    let adapter = null;
    let providerRequestId = null;
    let attemptActualCostUsd = null;
    let providerCallStarted = false;
    let providerResponseReceived = false;
    let providerTerminalFailure = false;
    try {
      adapter = await injectedTestAdapterFactory(providerId);
      const providerParameters = await resolveCanvasProviderParameters(claimed, parameters, providerId);
      providerCallStarted = true;
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

      attemptActualCostUsd = reportedActualCost(taskResult.actualCostUsd);
      providerRequestId = taskResult.providerRequestId || null;
      const hasResult = Boolean(taskResult.resultUrl || taskResult.output || taskResult.resultText);
      providerResponseReceived = hasResult || Boolean(providerRequestId);
      if (!providerResponseReceived) {
        throw Object.assign(new Error('供应商未返回有效的生成结果或回执'), { code: 'EMPTY_RESULT_URL' });
      }
      await rememberProviderResponse({
        creation: { ...claimed, model: currentModelId }, attempt: attemptRecord,
        result: taskResult, publishReceipt: true,
        snapshot: {
          estimatedCostUsd: routeDecision.winner.estimatedCostUsd,
          priceVersionId: routeDecision.winner.priceVersionId,
          fxSnapshot: routeDecision.winner.fxSnapshot,
        },
        dependencies: testDependencies,
      });
      // One claimed recovery path handles both synchronous results and quick polls.
      // Return (do not await) so local completion failures never enter failover.
      return pollGenerationTask({ creationId, testDependencies });

    } catch (attemptErr) {
      console.warn('[generationCore/attemptFailed]', { attempt: attemptCount, providerId, code: attemptErr?.code || 'UNKNOWN_ERROR' });
      const normErr = adapter ? adapter.normalizeError(attemptErr) : attemptErr;
      attemptActualCostUsd = reportedActualCost(normErr?.actualCostUsd ?? attemptErr?.actualCostUsd ?? attemptActualCostUsd);
      // Adapters prove a terminal refusal/failure by setting terminalFailure
      // (e.g. a polled provider "failed" status). Normalization must not lose
      // that proof, otherwise settlement would park the task in reconciliation.
      providerTerminalFailure = normErr?.terminalFailure === true || attemptErr?.terminalFailure === true;
      if (providerResponseReceived) {
        // A paid task already exists upstream. Persisting its receipt locally is a
        // recovery step, never a reason to refund or submit a second task.
        return retainUnconfirmedSubmission({
          creation: { ...claimed, model: currentModelId }, attempt: attemptRecord,
          providerRequestId: normErr?.providerRequestId || providerRequestId,
          actualCostUsd: attemptActualCostUsd,
          reason: 'local_receipt_persistence_failed',
          dependencies: testDependencies,
        });
      }
      if (providerCallStarted && String(normErr?.code || '').startsWith('STORAGE_')) {
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
      if (isSubmissionOutcomeUnconfirmed(normErr, {
        callStarted: providerCallStarted,
        providerRequestId: normErr?.providerRequestId || providerRequestId,
        terminalFailure: providerTerminalFailure,
      })) {
        const receipt = normErr?.providerRequestId || providerRequestId;
        await updateGenerationAttemptOutcome(attemptRecord.id, {
          status: 'processing', providerRequestId: receipt,
          durationMs: Date.now() - attemptStartedAt,
          errorCode: 'PROVIDER_OUTCOME_UNCONFIRMED',
          errorReason: '供应商执行结果尚未确认，保留冻结积分等待核对',
          actualCostUsd: attemptActualCostUsd,
          reconciliationStatus: 'pending_reconciliation',
        });
        const pending = await updateGenerationOutcome(claimed.id, {
          status: 'processing', provider: providerId, model: currentModelId,
          providerRequestId: receipt,
          nextPollAt: receipt ? new Date(Date.now() + 2000) : null,
          pollLockedUntil: null, expectedStatus: 'processing',
        });
        await addGenerationEvent(pending || claimed, 'TASK_RECONCILIATION_REQUIRED', {
          fromStatus: 'processing', toStatus: 'processing', provider: providerId,
          providerRequestId: receipt,
          metadata: { reason: 'submission_outcome_unconfirmed', attemptNumber: attemptCount },
        });
        await insertProviderCostRecord({
          jobId: claimed.id, attemptId: attemptRecord.id, providerId, modelId: currentModelId,
          creditsCharged: 0, estimatedCostUsd: routeDecision.winner.estimatedCostUsd,
          actualCostUsd: attemptActualCostUsd, currency: 'USD',
          priceVersionId: routeDecision.winner.priceVersionId, fxSnapshot: routeDecision.winner.fxSnapshot,
          costSource: attemptActualCostUsd === null ? 'estimate_only' : 'provider_reported',
          reconciliationStatus: 'pending_reconciliation',
        });
        return { creation: pending, pending: true, reconciliationRequired: true, status: 'processing', attempts: attemptCount };
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

      // 可重试错误且仍有后续 attempt：记录按实际渠道的自动切流告警。
      // 不再假定固定主通道（历史文档中的 runninghub 专属策略不作为运行时规则）。
      if (attemptCount < maxAttempts) {
        const switchProviderId = providerId;
        import('../admin/alerting.js')
          .then(({ sendOpsAlert }) => {
            sendOpsAlert({
              title: '生成渠道自动切流',
              level: 'warn',
              message: `生成任务 [${creationId}] 渠道 ${switchProviderId} 发生可重试故障 [${lastErrorCode}]，已自动切换同一模型的其他合格渠道`,
              details: { creationId, modelId: currentModelId, providerId: switchProviderId, errorCode: lastErrorCode, reason: lastErrorReason },
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
      dependencies: testDependencies,
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
  resultText = null,
  providerRequestId = null,
  errorCode = 'PROVIDER_ERROR',
  errorReason = '模型供应商返回失败',
  actualCostUsd = null,
  durationMs = null,
  callbackIdempotencyKey,
  testDependencies = null,
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

  // A callback for a different upstream task is never evidence about this one.
  const callbackReceipt = typeof providerRequestId === 'string' && providerRequestId.trim()
    ? providerRequestId.trim() : null;
  if (callbackReceipt && before.provider_request_id && callbackReceipt !== before.provider_request_id) {
    throw Object.assign(new Error('供应商回调回执与当前任务不一致'), { code: 'GENERATION_RECEIPT_CONFLICT' });
  }
  const effectiveReceipt = callbackReceipt || before.provider_request_id || null;
  const creation = { ...before, provider_request_id: effectiveReceipt };
  const readAttempt = testDependencies?.getGenerationAttemptForReceipt || getGenerationAttemptForReceipt;
  const attempt = await readAttempt(creationId, before.provider, effectiveReceipt);

  if (status !== 'succeeded') {
    // Explicit failure follows the same fenced finalizer as polling: success
    // evidence wins over a late failure and the reservation is released once.
    return finalizeProviderFailure({
      creation, attempt, status,
      errorCode, errorReason,
      actualCostUsd: reportedActualCost(actualCostUsd),
      durationMs,
      includeLease: false,
      callbackKey: callbackIdempotencyKey,
      dependencies: testDependencies,
    });
  }

  if (!resultUrl && !resultText) {
    throw Object.assign(new Error('成功回调缺少结果'), { code: 'CALLBACK_RESULT_REQUIRED' });
  }
  const saveResult = testDependencies?.saveGenerationResult || saveGenerationResult;
  let checkpoint;
  try {
    checkpoint = await saveResult({
      creationId,
      attemptId: attempt?.id || null,
      providerId: before.provider,
      providerRequestId: effectiveReceipt,
      resultUrl,
      resultText,
      actualCostUsd: reportedActualCost(actualCostUsd),
    });
  } catch (error) {
    const current = await findCreationById(creationId);
    if (['succeeded', 'failed', 'cancelled'].includes(current?.status)) return { creation: current, idempotent: true };
    throw error;
  }
  if (!checkpoint) {
    const current = await findCreationById(creationId);
    return { creation: current, idempotent: ['succeeded', 'failed', 'cancelled'].includes(current?.status) };
  }

  // Archive, private asset, settlement, cost and terminal event stay in the one
  // recovery path; the callback only makes the success evidence durable first.
  return pollGenerationTask({ creationId, testDependencies });
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
      // A missing request ID is not proof of rejection: a worker can lose the
      // acknowledgement after submission. Age alone never authorizes a refund.
      const result = await withTransaction(async (tx) => {
        const locked = await tx.queryOne('SELECT * FROM ai_studio.creations WHERE id=$1 FOR UPDATE', [row.id]);
        if (!locked || locked.status !== 'processing') return { id: row.id, status: 'already_terminal' };
        await addGenerationEvent(locked, 'TASK_RECONCILIATION_REQUIRED', {
          fromStatus: 'processing',
          toStatus: 'processing',
          idempotencyKey: `timeout-reconciliation:${locked.id}`,
          metadata: { reason: 'UPSTREAM_OUTCOME_UNCONFIRMED', timeoutMs: taskMaxTimeoutMs },
          transaction: tx,
        });
        return { id: row.id, status: 'pending_reconciliation' };
      });
      results.push(result);
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
export async function pollGenerationTask({ creationId, force = false, testDependencies = null } = {}) {
  const fetchCreation = testDependencies?.findCreationById || findCreationById;
  const before = await fetchCreation(creationId);
  if (!before) return { error: 'TASK_NOT_FOUND' };
  if (['succeeded', 'failed', 'cancelled'].includes(before.status)) {
    return { creation: before, idempotent: true };
  }
  if (before.status !== 'processing') return { creation: before, pending: true };

  // A durable synchronous checkpoint is recoverable even without a receipt.
  // 1. 尝试原子认领轮询锁 (锁定 30 秒，防止多 Worker 实例并发冲撞)
  const claimDuePolling = testDependencies?.claimDuePollingCreation || claimDuePollingCreation;
  const claimed = await claimDuePolling(creationId, 30, { force });
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

  const readResult = testDependencies?.getGenerationResult || getGenerationResult;
  const readAttempt = testDependencies?.getGenerationAttemptForReceipt || getGenerationAttemptForReceipt;
  const updateAttempt = testDependencies?.updateGenerationAttemptOutcome || updateGenerationAttemptOutcome;
  const fence = generationFence(claimed);
  const stale = () => ({ skipped: true, reason: 'poll_lease_changed' });

  // A polling deadline is an operational limit, never proof that upstream failed.
  async function pauseForReconciliation(reason, local = false) {
    const paused = await executeWithTx(async (tx) => {
      const changed = await executeSchedulePoll(claimed.id, {
        nextPollAt: null, pollLockedUntil: null, ...fence, transaction: tx,
      });
      if (changed === 0) return false;
      for (const eventType of ['TASK_RECONCILIATION_REQUIRED', local ? 'GENERATION_LOCAL_RECOVERY_PAUSED' : 'PROVIDER_POLL_PAUSED']) {
        await executeAddEvent(claimed, eventType, {
          fromStatus: 'processing', toStatus: 'processing', provider: claimed.provider,
          providerRequestId: claimed.provider_request_id,
          metadata: { reason, elapsedMs, maxTimeoutMs }, transaction: tx,
        });
      }
      return true;
    });
    return paused ? { creation: claimed, status: 'processing', pending: true, reconciliationRequired: true } : stale();
  }

  async function retryLocalCompletion(error) {
    // Encryption/identity errors require operator repair. Ordinary local database
    // failures retry the saved result using the existing read-only poll backoff.
    if (String(error?.code || '').startsWith('GENERATION_RESULT_')) {
      return pauseForReconciliation(error.code, true);
    }
    const changed = await executeSchedulePoll(claimed.id, {
      nextPollAt: new Date(Date.now() + nextBackoffSec * 1000), pollLockedUntil: null, ...fence,
    });
    if (changed === 0) return stale();
    return { creation: claimed, status: 'processing', pending: true, localRecovery: true, nextPollInSeconds: nextBackoffSec };
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

  let checkpoint;
  let attempt;
  let recoveryReceipt = claimed.provider_request_id || null;
  try {
    checkpoint = await readResult(claimed.id);
    // A synchronous or callback success may carry a provider receipt the parent
    // row has not published yet. The encrypted checkpoint is the authority for
    // that receipt; a conflicting parent receipt is still rejected.
    recoveryReceipt = claimed.provider_request_id || checkpoint?.providerRequestId || null;
    attempt = await readAttempt(claimed.id, claimed.provider, recoveryReceipt);
    if (checkpoint && (checkpoint.providerId !== claimed.provider
        || (claimed.provider_request_id && checkpoint.providerRequestId !== claimed.provider_request_id)
        || (checkpoint.attemptId && checkpoint.attemptId !== attempt?.id))) {
      throw Object.assign(new Error('结果与原调用不一致'), { code: 'GENERATION_RESULT_IDENTITY_CONFLICT' });
    }
  } catch (error) {
    return retryLocalCompletion(error);
  }

  let adapter = null;
  let pollData = null;
  if (!checkpoint) {
    if (!claimed.provider_request_id) return pauseForReconciliation('submission_outcome_unconfirmed');
    try {
      adapter = await injectedTestAdapterFactory(claimed.provider);
      pollData = await adapter.getTask(claimed.provider_request_id, {
        parameters: parseJsonObject(claimed.input_summary_json).parameters || {},
        providerModelId: attempt?.provider_model_id || null,
        providerEndpoint: attempt?.provider_endpoint || null,
        providerModelVersion: attempt?.provider_model_version || null,
      });
      if (pollData?.providerRequestId && pollData.providerRequestId !== claimed.provider_request_id) {
        return pauseForReconciliation('provider_receipt_mismatch');
      }
    } catch (error) {
      const normErr = adapter?.normalizeError ? adapter.normalizeError(error) : error;
      const isTransient = [
        PROVIDER_ERROR_CODES.RATE_LIMIT, PROVIDER_ERROR_CODES.NETWORK_ERROR,
        PROVIDER_ERROR_CODES.PROVIDER_INTERNAL_ERROR, PROVIDER_ERROR_CODES.TIMEOUT,
        PROVIDER_ERROR_CODES.UNKNOWN_ERROR,
      ].includes(normErr?.code) || normErr?.isRetryable;
      if (isTransient && elapsedMs <= maxTimeoutMs) {
        const changed = await executeSchedulePoll(claimed.id, {
          nextPollAt: new Date(Date.now() + nextBackoffSec * 1000), pollLockedUntil: null, ...fence,
        });
        return changed === 0 ? stale() : { creation: claimed, status: 'processing', transientError: normErr.code, nextPollInSeconds: nextBackoffSec };
      }
      return pauseForReconciliation('provider_status_query_unconfirmed');
    }
    if (pollData?.status === 'succeeded' && (pollData.resultUrl || pollData.output || pollData.resultText)) {
      try {
        checkpoint = await rememberProviderResponse({
          creation: claimed, attempt, result: { ...pollData, providerRequestId: claimed.provider_request_id },
          dependencies: testDependencies,
        });
        if (!checkpoint) return stale();
      } catch (error) {
        // Never reinterpret a successful query as a rejected generation.
        return retryLocalCompletion(error);
      }
    }
  }

  // 5. Complete locally from durable success evidence, never from a second submission.
  if (checkpoint) {
    const polledText = checkpoint.resultText;
    const attemptActualCostUsd = reportedActualCost(checkpoint.actualCostUsd);
    // The checkpoint owns the attempt identity. Without one, a matching receipt
    // alone must not attribute this success (or its cost) to another attempt.
    const evidenceAttempt = checkpoint.attemptId ? attempt : null;
    // Older synchronous responses exposed the attempt count to callers; keep the
    // polled completion shape stable by reporting the attempt that owns the result.
    const completedAttemptNumber = () => evidenceAttempt?.attempt_number || attempt?.attempt_number || 1;
    let storedResult = checkpoint.storedResult || {};
    try {
      if (checkpoint.stage !== 'archived' && checkpoint.resultUrl) {
        // Only an actual ingest failure enters the existing storage compensation
        // policy. Asset/ledger/transaction failures after this point must recover.
        try {
          storedResult = await injectedTestArchive({
            resultUrl: checkpoint.resultUrl, creation: claimed,
            sourceProvider: claimed.provider, providerRequestId: recoveryReceipt,
          });
        } catch (error) {
          if (!String(error?.code || '').startsWith('STORAGE_')) throw error;
          const failed = await finalizeStorageFailure({
            creation: claimed, startedAt: startedAtMs, providerRequestId: recoveryReceipt,
            actualCostUsd: attemptActualCostUsd, providerId: claimed.provider,
            attemptId: evidenceAttempt?.id || null,
            estimatedCostUsd: attemptCostSnapshot(claimed, evidenceAttempt).estimatedCostUsd,
            priceVersionId: evidenceAttempt?.price_version_id || null, error, dependencies: testDependencies,
          });
          if (failed?.status !== 'failed') return retryLocalCompletion({ code: 'GENERATION_ARCHIVE_RACE' });
          return {
            creation: failed, success: false, storageFailed: true,
            attempts: completedAttemptNumber(), error: failed.error_reason,
          };
        }
        checkpoint = await (testDependencies?.markGenerationResultArchived || markGenerationResultArchived)({
          creationId: claimed.id, attemptId: checkpoint.attemptId, providerId: checkpoint.providerId,
          providerRequestId: checkpoint.providerRequestId, storedResult,
        });
        if (!checkpoint) return stale();
        storedResult = checkpoint.storedResult;
      }

      const completeLocallyOnce = () => executeWithTx(async (tx) => {
        const updated = await executeUpdateOutcome(claimed.id, {
          status: 'succeeded',
          resultUrl: null,
          resultText: polledText,
          resultObjectKey: storedResult.objectKey,
          // storage_status is NOT NULL: text-only results leave it untouched.
          storageStatus: storedResult.objectKey ? 'ready' : undefined,
          storageAttempts: storedResult.attempts,
          storageBucket: storedResult.bucket,
          storageRegion: storedResult.region,
          storageProvider: storedResult.provider,
          storageLocationId: storedResult.storageLocationId,
          storageMimeType: storedResult.mimeType,
          storageSizeBytes: storedResult.sizeBytes,
          storageChecksum: storedResult.checksum,
          storagePreviewObjectKey: storedResult.previewObjectKey,
          storageThumbnailObjectKey: storedResult.thumbnailObjectKey,
          provider: claimed.provider,
          model: claimed.model,
          providerRequestId: recoveryReceipt,
          actualCostUsd: attemptActualCostUsd,
          durationMs: Date.now() - startedAtMs,
          expectedStatus: 'processing', ...fence,
          nextPollAt: null,
          pollLockedUntil: null,
          transaction: tx,
        });
        if (!updated) return null;
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
          ...attemptCostSnapshot(claimed, evidenceAttempt), creditsCharged: claimed.credit_cost,
          actualCostUsd: attemptActualCostUsd,
          costSource: attemptActualCostUsd === null ? 'estimate_only' : 'provider_reported',
          reconciliationStatus: attemptActualCostUsd === null ? 'pending_reconciliation' : 'provider_reported',
          transaction: tx,
        });
        if (evidenceAttempt) await updateAttempt(evidenceAttempt.id, {
          status: 'succeeded', providerRequestId: recoveryReceipt,
          durationMs: Date.now() - startedAtMs, actualCostUsd: attemptActualCostUsd,
          costSource: attemptActualCostUsd === null ? null : 'provider_reported', transaction: tx,
        });
        await executeAddEvent(updated, 'TASK_SUCCEEDED', {
          fromStatus: 'processing',
          toStatus: 'succeeded',
          provider: claimed.provider,
          providerRequestId: recoveryReceipt,
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

      // The archived object is the only copy of the paid result. An asset-link
      // failure rolls the whole completion transaction back, so retry it a
      // bounded number of times before applying the storage compensation
      // policy. This never resubmits the provider task: the checkpoint stays
      // authoritative and the next poll reuses it.
      let succeeded = null;
      let completionError = null;
      for (let localAttempt = 1; localAttempt <= 3; localAttempt++) {
        try {
          succeeded = await completeLocallyOnce();
          completionError = null;
          break;
        } catch (error) {
          completionError = error;
          if (!String(error?.code || '').startsWith('STORAGE_ASSET_') || localAttempt === 3) break;
          await new Promise((resolve) => setTimeout(resolve, 250 * localAttempt));
        }
      }
      if (completionError) {
        if (!String(completionError.code || '').startsWith('STORAGE_ASSET_')) throw completionError;
        // Provider success and storage evidence exist, but the private asset
        // can never be linked. Refund under the existing storage policy, record
        // the provider cost, keep the checkpoint as evidence, and reach a
        // terminal state instead of retrying a deterministic local failure.
        let failed = null;
        try {
          failed = await finalizeStorageFailure({
            creation: claimed, startedAt: startedAtMs, providerRequestId: recoveryReceipt,
            actualCostUsd: attemptActualCostUsd, providerId: claimed.provider,
            attemptId: evidenceAttempt?.id || null,
            estimatedCostUsd: attemptCostSnapshot(claimed, evidenceAttempt).estimatedCostUsd,
            priceVersionId: evidenceAttempt?.price_version_id || null, error: completionError,
            dependencies: testDependencies,
          });
        } catch (finalizeError) {
          return retryLocalCompletion(finalizeError);
        }
        if (failed?.status !== 'failed') return retryLocalCompletion({ code: 'GENERATION_STORAGE_FINALIZE_RACE' });
        return {
          creation: failed, success: false, storageFailed: true,
          attempts: completedAttemptNumber(), error: failed.error_reason,
        };
      }

      if (!succeeded) return stale();
      await (testDependencies?.recordProviderSuccess || recordProviderSuccess)(claimed.provider).catch(() => {});
      return { creation: succeeded, success: true, attempts: completedAttemptNumber() };
    } catch (error) {
      return retryLocalCompletion(error);
    }
  }

  // 6. 明确失败/取消仍须锁内排除已经到达的成功回调。
  if (pollData?.status === 'failed' || pollData?.status === 'cancelled') {
    try {
      const outcome = await finalizeProviderFailure({
        creation: claimed, attempt, status: pollData.status,
        errorCode: pollData.errorCode || 'UPSTREAM_GENERATION_FAILED',
        errorReason: publicErrorMessage({ message: pollData.error }, '供应商任务执行失败'),
        actualCostUsd: reportedActualCost(pollData.actualCostUsd),
        durationMs: Date.now() - startedAtMs, dependencies: testDependencies,
      });
      if (outcome.creation?.status === 'failed') {
        await (testDependencies?.recordProviderFailure || recordProviderFailure)(claimed.provider, { code: 'UPSTREAM_GENERATION_FAILED' }).catch(() => {});
      }
      return outcome;
    } catch (error) {
      return retryLocalCompletion(error);
    }
  }

  if (elapsedMs > maxTimeoutMs || pollData?.reconciliationRequired) {
    return pauseForReconciliation(pollData?.reconciliationRequired ? 'provider_result_not_recoverable' : 'polling_deadline_reached');
  }

  // 7. 任务仍在处理中：只能释放本 Worker 持有的原 lease。
  const changed = await executeSchedulePoll(claimed.id, {
    nextPollAt: new Date(Date.now() + nextBackoffSec * 1000),
    pollLockedUntil: null, ...fence,
  });
  if (changed === 0) return stale();

  return {
    id: claimed.id,
    status: 'processing',
    nextPollInSeconds: nextBackoffSec,
    elapsedMs,
  };
}
