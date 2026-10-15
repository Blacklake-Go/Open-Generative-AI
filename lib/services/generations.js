import 'server-only';

import { logAudit } from '../admin/audit.js';
import * as creationRepo from '../repositories/creations.js';
import { createModerationCase } from '../repositories/moderation.js';
import { createGenerationTask, processGenerationTask } from './generationCore.js';
import { getAssetUrl } from '../storage/storageService.js';

export async function exposeCreationResult(creation) {
  if (!creation) return creation;
  if (!creation.result_object_key) return creation;
  const url = await getAssetUrl({ objectKey: creation.result_object_key, visibility: 'private' });
  if (typeof url !== 'string' || !url.trim()) {
    throw Object.assign(new Error('私有生成资产暂时无法读取'), {
      code: 'PRIVATE_ASSET_URL_UNAVAILABLE',
    });
  }
  return { ...creation, result_url: url, result_object_key: undefined, storageUrl: url };
}

export async function getGenerationTrace(creationId, { expectedUserId = null, includeResultUrl = true } = {}) {
  const trace = await creationRepo.getGenerationTrace(creationId);
  if (!trace?.creation || (expectedUserId && trace.creation.user_id !== expectedUserId)) return null;
  return {
    ...trace,
    creation: includeResultUrl ? await exposeCreationResult(trace.creation) : trace.creation,
  };
}

export async function findCreationById(creationId) {
  return creationRepo.findCreationById(creationId);
}

export async function listAdminGenerations(searchParams) {
  return creationRepo.listCreations(searchParams);
}

export async function listFailedAdminGenerations(searchParams) {
  return creationRepo.listFailedCreations(searchParams);
}

export async function getAdminGenerationFailureClusters() {
  return creationRepo.getFailureClusters();
}

export async function listUserGenerations(userId, limit = 50, studioId = '') {
  const rows = await creationRepo.listUserCreations(userId, limit, studioId);
  return Promise.all(rows.map(exposeCreationResult));
}

export async function getUserCreation(userId, creationId) {
  return exposeCreationResult(await creationRepo.getUserCreationById(userId, creationId));
}

export async function deleteUserCreation(userId, creationId) {
  return creationRepo.deleteUserCreation(userId, creationId);
}

export async function retryGenerationTask({ actor, creationId, chargeCredits = false, requestId, idempotencyKey }) {
  const original = await creationRepo.findCreationById(creationId);
  if (!original) return { error: '原生成任务不存在' };

  let input = {};
  try { input = typeof original.input_summary_json === 'string' ? JSON.parse(original.input_summary_json) : (original.input_summary_json || {}); } catch {}
  const retryKey = `admin-retry:${original.id}:${idempotencyKey || requestId || Date.now()}`;
  const retryParams = input.parameters || input;
  let retryQuoteId = null;
  if (chargeCredits) {
    const { createGenerationQuote } = await import('./pricingEngine.js');
    const quote = await createGenerationQuote({
      userId: original.user_id,
      modelId: original.model,
      parameters: retryParams,
      idempotencyKey: `${retryKey}:quote`,
    });
    retryQuoteId = quote.quoteId;
  }
  const task = await createGenerationTask({
    userId: original.user_id,
    modelId: original.model,
    studioId: original.studio_id,
    prompt: input.prompt || original.label || '',
    parameters: retryParams,
    idempotencyKey: retryKey,
    label: `重试：${original.label || original.model}`,
    quoteId: retryQuoteId,
    chargeCredits,
  });
  const processed = await processGenerationTask({ creationId: task.creation.id });

  await logAudit({
    actor,
    action: 'generations.retry',
    targetType: 'creation',
    targetId: original.id,
    riskLevel: 'medium',
    after: { retryCreationId: task.creation.id, chargeCredits, creditCost: task.creation.credit_cost },
    requestId,
  });

  return { creation: processed.creation || task.creation, processing: processed };
}

export async function flagCreationForModeration({ actor, creationId, reasonCode = 'manual_flag', requestId }) {
  const original = await creationRepo.findCreationById(creationId);
  if (!original) return { error: '目标生成记录不存在' };

  const modCase = await createModerationCase({
    creationId,
    reasonCode,
  });

  await logAudit({
    actor,
    action: 'moderation.flag',
    targetType: 'creation',
    targetId: creationId,
    riskLevel: 'low',
    after: { moderationCaseId: modCase.id, reasonCode },
    requestId,
  });

  return { moderationCase: modCase };
}
