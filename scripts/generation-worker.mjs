import crypto from 'node:crypto';
import os from 'node:os';
import { closePgPool } from '../lib/db/index.js';
import { removeWorkerHeartbeat, recordWorkerHeartbeat } from '../lib/repositories/workerHealth.js';
import { runGenerationWorkerOnce } from '../lib/services/taskWorker.js';
import { reconcilePendingPaymentOrders, cycleDue, RECONCILE_INTERVALS } from '../lib/services/paymentReconciliation.js';
import { probeProviderChannels } from '../lib/services/healthProbe.js';

const pollMs = Math.max(250, Number(process.env.GENERATION_WORKER_POLL_MS) || 1000);
const batchSize = Math.max(1, Number(process.env.GENERATION_WORKER_BATCH_SIZE) || 10);
const paymentSyncBatch = Math.max(1, Number(process.env.PAYMENT_RECONCILE_BATCH) || 5);
const workerName = 'generation';
const instanceId = `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`;
const workerStartedAt = new Date();
const heartbeatMs = Math.max(5000, Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS) || 10000);
let stopping = false;
let timer;
let timerResolver;
let heartbeatTimer;
let heartbeatInFlight = false;

function requestStop(signal) {
  console.log(`[generation-worker] received ${signal}; stopping after current cycle`);
  stopping = true;
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
    if (timerResolver) {
      timerResolver();
      timerResolver = undefined;
    }
  }
}

process.on('SIGINT', () => requestStop('SIGINT'));
process.on('SIGTERM', () => requestStop('SIGTERM'));

let lastPaymentSyncAt = 0;

async function writeHeartbeat() {
  if (heartbeatInFlight) return;
  heartbeatInFlight = true;
  try {
    await recordWorkerHeartbeat({
      workerName,
      instanceId,
      processId: process.pid,
      startedAt: workerStartedAt,
    });
  } catch (error) {
    console.error('[generation-worker] heartbeat failed', { code: error.code || 'WORKER_HEARTBEAT_FAILED' });
  } finally {
    heartbeatInFlight = false;
  }
}

/**
 * 厂商异步回调并不保证送达（用户关页面、网络抖动、回调地址变更都会丢），
 * 没收到回调的已付款订单会一直停在 pending：钱收了、积分不到账，只能主动查单兜底。
 */
async function syncPendingPayments() {
  if (!cycleDue({ lastRunAt: lastPaymentSyncAt, intervalMs: RECONCILE_INTERVALS.paymentSyncMs, now: Date.now() })) return;
  // 先推进时间戳：查单失败同样要等满一个周期再试，避免对厂商接口形成重试风暴。
  lastPaymentSyncAt = Date.now();
  try {
    const synced = await reconcilePendingPaymentOrders({ limit: paymentSyncBatch });
    if (synced.scanned) {
      console.log('[generation-worker] payment sync', JSON.stringify({ scanned: synced.scanned, results: synced.results }));
    }
    if (synced.outstandingCreditRefunds?.pending) {
      console.warn('[generation-worker] credit refund shortfall', JSON.stringify(synced.outstandingCreditRefunds));
    }
  } catch (error) {
    console.error('[generation-worker] payment sync failed', { code: error.code || 'PAYMENT_SYNC_FAILED' });
  }
}

const healthProbeIntervalMs = Math.max(60_000, Number(process.env.PROVIDER_HEALTH_PROBE_INTERVAL_MS) || 5 * 60_000);
let lastHealthProbeAt = 0;

async function syncProviderHealth() {
  if (!cycleDue({ lastRunAt: lastHealthProbeAt, intervalMs: healthProbeIntervalMs, now: Date.now() })) return;
  lastHealthProbeAt = Date.now();
  try {
    const res = await probeProviderChannels({ all: true });
    if (res?.ok && res.summary) {
      console.log('[generation-worker] provider health probe', JSON.stringify(res.summary));
    }
  } catch (error) {
    console.error('[generation-worker] provider health probe failed', { code: error.code || 'HEALTH_PROBE_FAILED' });
  }
}

const deletionCheckIntervalMs = Math.max(60_000, Number(process.env.DELETION_CHECK_INTERVAL_MS) || 10 * 60_000);
let lastDeletionCheckAt = 0;

async function syncExpiredDeletions() {
  if (!cycleDue({ lastRunAt: lastDeletionCheckAt, intervalMs: deletionCheckIntervalMs, now: Date.now() })) return;
  lastDeletionCheckAt = Date.now();
  try {
    const { processExpiredDeletions } = await import('../lib/services/userDeletion.js');
    const res = await processExpiredDeletions();
    if (res.purged > 0) {
      console.log('[generation-worker] expired user deletions purged', JSON.stringify({ scanned: res.scanned, purged: res.purged, userIds: res.purgedIds }));
    }
  } catch (error) {
    console.error('[generation-worker] expired user deletion sync failed', { code: error.code || 'DELETION_SYNC_FAILED' });
  }
}

async function sleep(milliseconds) {
  await new Promise((resolve) => {
    timerResolver = resolve;
    timer = setTimeout(() => {
      timerResolver = undefined;
      resolve();
    }, milliseconds);
  });
  timer = undefined;
}

try {
  await writeHeartbeat();
  heartbeatTimer = setInterval(() => { void writeHeartbeat(); }, heartbeatMs);
  heartbeatTimer.unref?.();
  console.log(`[generation-worker] started; poll=${pollMs}ms batch=${batchSize}`);
  while (!stopping) {
    try {
      const summary = await runGenerationWorkerOnce({ batchSize });
      if (summary.queuedCount || summary.duePollingCount || summary.expiredReservations?.processed?.length || summary.staleTasks?.processed?.length) {
        console.log('[generation-worker] cycle', JSON.stringify({
          queuedCount: summary.queuedCount,
          duePollingCount: summary.duePollingCount || 0,
          processedCount: summary.processed.length,
          polledCount: summary.polled?.length || 0,
          expiredReservations: summary.expiredReservations.processed.length,
          staleTasks: summary.staleTasks.processed.length,
        }));
      }
    } catch (error) {
      console.error('[generation-worker] cycle failed', { code: error.code || 'WORKER_ERROR' });
    }
    await syncPendingPayments();
    await syncProviderHealth();
    await syncExpiredDeletions();
    if (!stopping) await sleep(pollMs);
  }
} finally {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await removeWorkerHeartbeat({ workerName, instanceId }).catch((error) => {
    console.error('[generation-worker] heartbeat cleanup failed', { code: error.code || 'WORKER_HEARTBEAT_CLEANUP_FAILED' });
  });
  await closePgPool().catch((error) => console.error('[generation-worker] pool close failed', { code: error.code || 'POOL_CLOSE_FAILED' }));
  console.log('[generation-worker] stopped');
}
