export const CANVAS_ASSET_SYNC_GRACE_MS = 60_000;

const CANVAS_ROUTE_UNAVAILABLE_MESSAGE = '该模型的服务端点当前不可用，任务已失败并释放预留积分，请稍后重试或联系支持。';
const CANVAS_MODEL_UNAVAILABLE_MESSAGE = '所选模型当前不可用，任务已失败并释放预留积分；系统不会自动切换模型，请稍后重试或手动选择其他模型。';
const CANVAS_GENERATION_FAILED_MESSAGE = '生成失败，预留积分已按任务规则处理。';

function isSeedreamModelIdAccessFailure(value) {
  const message = String(value || '');
  return /doubao-seedream-5-0-260128/i.test(message)
    && /(?:does not exist|do not have access|does not have access|not found)/i.test(message);
}

/** Convert internal failure evidence into a stable, secret-safe Canvas error. */
export function getCanvasJobFailure({ errorCode, upstreamError, failureMetadata, reservation } = {}) {
  const funding = getCanvasJobFunding(reservation);
  if (funding?.state === 'reserved') return { code: errorCode || 'GENERATION_FAILED', message: '任务结果或资金状态待核对，预留积分仍保留，请稍后查看任务记录。' };
  if (funding?.expiredCredits > 0) return { code: errorCode || 'GENERATION_FAILED', message: `任务未完成，${funding.releasedCredits} 积分按原有效期返还，${funding.expiredCredits} 积分已到期；到期部分不会加入新周期。` };
  const code = String(errorCode || '').trim() || 'GENERATION_FAILED';
  let metadata = failureMetadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = null; }
  }
  const upstream = upstreamError || metadata?.upstreamError || '';
  if (code === 'MODEL_ROUTE_UNAVAILABLE'
    || (code === 'INVALID_INPUT' && isSeedreamModelIdAccessFailure(upstream))) {
    return { code: 'MODEL_ROUTE_UNAVAILABLE', message: CANVAS_ROUTE_UNAVAILABLE_MESSAGE };
  }
  if (code === 'MODEL_UNAVAILABLE') {
    return { code, message: CANVAS_MODEL_UNAVAILABLE_MESSAGE };
  }
  return { code, message: CANVAS_GENERATION_FAILED_MESSAGE };
}

export function getCanvasJobCostMetadata(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) {
    return { actualCostUsd: null, costStatus: 'pending_reconciliation' };
  }
  const actualCostUsd = Number(value);
  if (!Number.isFinite(actualCostUsd)) {
    return { actualCostUsd: null, costStatus: 'pending_reconciliation' };
  }
  return { actualCostUsd, costStatus: 'provider_reported' };
}

export function getCanvasJobResultStatus({
  taskStatus,
  resultText,
  resultObjectKey,
  hasAsset,
  taskUpdatedAt,
  now = Date.now(),
  graceMs = CANVAS_ASSET_SYNC_GRACE_MS,
}) {
  if (taskStatus !== 'succeeded' || resultText || hasAsset) return taskStatus;
  if (!resultObjectKey) return 'result_unavailable';

  const updatedAt = new Date(taskUpdatedAt || '').getTime();
  if (!Number.isFinite(updatedAt) || now - updatedAt >= graceMs) return 'result_unavailable';
  return 'processing';
}

export function getCanvasJobFunding(reservation) {
  if (!reservation) return null;
  const states = { RESERVED: 'reserved', COMMITTED: 'settled', VOIDED: 'released' };
  return {
    state: states[reservation.status] || 'unknown',
    reservedCredits: Number(reservation.reserved_amount),
    releasedCredits: reservation.released_amount == null ? null : Number(reservation.released_amount),
    expiredCredits: reservation.expired_amount == null ? null : Number(reservation.expired_amount),
  };
}

export function getCanvasJobReconciliation(status, events = []) {
  if (status !== 'processing' || !events.some(event => event.event_type === 'TASK_RECONCILIATION_REQUIRED')) return null;
  return { state: 'pending', code: 'UPSTREAM_OUTCOME_UNCONFIRMED', message: '上游结果待核对，预留积分暂时保留。可以稍后查看任务记录，请勿重复创建同一任务。' };
}
