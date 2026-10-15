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
export function getCanvasJobFailure({ errorCode, upstreamError, failureMetadata } = {}) {
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
