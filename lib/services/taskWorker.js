import { cleanupExpiredReservations } from '../financial/creditService.js';
import { listQueuedGenerationIds, listDuePollingCreations } from '../repositories/creations.js';
import { expireStaleGenerationTasks, processGenerationTask, pollGenerationTask } from './generationCore.js';

// Compatibility entry point for existing worker invocations. The lifecycle
// service owns provider calls, settlement, release, and terminal state changes.
export async function executePendingCreation(creationId) {
  return processGenerationTask({ creationId });
}

export async function runGenerationWorkerOnce({ batchSize = 10, testDependencies = null, shouldStop = () => false } = {}) {
  const size = Math.min(50, Math.max(1, Number(batchSize) || 10));
  const fetchQueued = testDependencies?.listQueuedGenerationIds || listQueuedGenerationIds;
  const queued = shouldStop() ? [] : await fetchQueued(size);

  const processTask = testDependencies?.processGenerationTask || processGenerationTask;
  const processed = [];
  for (const row of queued) {
    if (shouldStop()) break;
    try {
      processed.push({ id: row.id, result: await processTask({ creationId: row.id, testDependencies }) });
    } catch (error) {
      processed.push({ id: row.id, error: error.code || 'TASK_PROCESSING_FAILED' });
    }
  }

  // 阶梯退避异步轮询扫描 (2s -> 5s -> 10s -> 20s)，支撑 15~30 分钟长视频生成，防提前砍单误关单
  const fetchDuePolling = testDependencies?.listDuePollingCreations || listDuePollingCreations;
  const dueCreations = shouldStop() ? [] : await fetchDuePolling(size);
  const pollTask = testDependencies?.pollGenerationTask || pollGenerationTask;
  const polled = [];
  for (const row of dueCreations) {
    if (shouldStop()) break;
    try {
      polled.push({ id: row.id, result: await pollTask({ creationId: row.id, testDependencies }) });
    } catch (error) {
      polled.push({ id: row.id, error: error.code || 'TASK_POLLING_FAILED' });
    }
  }

  const cleanupReservations = testDependencies?.cleanupExpiredReservations || cleanupExpiredReservations;
  const expireStale = testDependencies?.expireStaleGenerationTasks || expireStaleGenerationTasks;

  const [expiredReservations, staleTasks] = shouldStop()
    ? [{ processed: [] }, { processed: [] }]
    : await Promise.all([cleanupReservations(), expireStale()]);

  return {
    queuedCount: queued.length,
    duePollingCount: dueCreations.length,
    processed,
    polled,
    expiredReservations,
    staleTasks,
  };
}

export { expireStaleGenerationTasks, pollGenerationTask };

