import { readGenerationQueueHealth } from '../repositories/workerHealth.js';

const DEFAULT_MAX_QUEUED = 100;
const DEFAULT_MAX_QUEUE_AGE_MS = 15 * 60 * 1000;

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function classifyGenerationWorkerHealth(snapshot, {
  now = Date.now(),
  maxQueued = positiveInt(process.env.READINESS_MAX_QUEUED_GENERATIONS, DEFAULT_MAX_QUEUED),
  maxQueueAgeMs = positiveInt(process.env.READINESS_MAX_QUEUE_AGE_MS, DEFAULT_MAX_QUEUE_AGE_MS),
} = {}) {
  if (!snapshot || !Number.isFinite(Number(snapshot.live_workers))) {
    return { status: 'unknown', liveWorkers: null, queuedCount: null, oldestQueuedAgeMs: null, staleProcessingCount: null, failedLast15m: null, latestHeartbeatAt: null };
  }

  const liveWorkers = Number(snapshot.live_workers);
  const queuedCount = Number(snapshot.queued_count || 0);
  const staleProcessingCount = Number(snapshot.stale_processing_count || 0);
  const failedLast15m = Number(snapshot.failed_last_15m || 0);
  const oldestQueuedAt = snapshot.oldest_queued_at ? new Date(snapshot.oldest_queued_at) : null;
  const oldestQueuedAgeMs = oldestQueuedAt && Number.isFinite(oldestQueuedAt.getTime())
    ? Math.max(0, now - oldestQueuedAt.getTime())
    : 0;
  const overloaded = queuedCount > maxQueued || oldestQueuedAgeMs > maxQueueAgeMs || staleProcessingCount > 0;

  return {
    status: liveWorkers < 1 ? 'unhealthy' : overloaded ? 'degraded' : 'healthy',
    liveWorkers,
    queuedCount,
    oldestQueuedAt: oldestQueuedAt?.toISOString() || null,
    oldestQueuedAgeMs,
    staleProcessingCount,
    failedLast15m,
    latestHeartbeatAt: snapshot.latest_heartbeat_at ? new Date(snapshot.latest_heartbeat_at).toISOString() : null,
  };
}

export async function getGenerationWorkerHealth({ probe = readGenerationQueueHealth, timeoutMs = 2500 } = {}) {
  let timer;
  try {
    const snapshot = await Promise.race([
      probe(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('Worker health probe timed out.'), { code: 'WORKER_HEALTH_TIMEOUT' })), timeoutMs);
      }),
    ]);
    return classifyGenerationWorkerHealth(snapshot);
  } catch (error) {
    return {
      status: 'unknown',
      liveWorkers: null,
      queuedCount: null,
      oldestQueuedAt: null,
      oldestQueuedAgeMs: null,
      staleProcessingCount: null,
      failedLast15m: null,
      latestHeartbeatAt: null,
      error: error?.code === 'WORKER_HEALTH_TIMEOUT' ? 'WORKER_HEALTH_TIMEOUT' : 'WORKER_HEALTH_UNAVAILABLE',
    };
  } finally {
    clearTimeout(timer);
  }
}
