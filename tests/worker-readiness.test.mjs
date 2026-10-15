import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGenerationWorkerHealth, getGenerationWorkerHealth } from '../lib/services/workerHealth.js';

test('generation readiness fails when no fresh worker heartbeat exists', () => {
  const result = classifyGenerationWorkerHealth({
    live_workers: 0,
    queued_count: 0,
    stale_processing_count: 0,
    failed_last_15m: 0,
  });
  assert.equal(result.status, 'unhealthy');
});

test('generation readiness reports healthy worker and queue metrics', () => {
  const result = classifyGenerationWorkerHealth({
    live_workers: '1',
    queued_count: '3',
    stale_processing_count: '0',
    failed_last_15m: '2',
    latest_heartbeat_at: '2026-09-24T00:00:00Z',
  });
  assert.equal(result.status, 'healthy');
  assert.equal(result.liveWorkers, 1);
  assert.equal(result.queuedCount, 3);
  assert.equal(result.failedLast15m, 2);
});

test('generation readiness degrades for old backlog or stale processing tasks', () => {
  const now = Date.parse('2026-09-24T00:20:00Z');
  const oldQueue = classifyGenerationWorkerHealth({
    live_workers: 1,
    queued_count: 1,
    oldest_queued_at: '2026-09-24T00:00:00Z',
    stale_processing_count: 0,
    failed_last_15m: 0,
  }, { now });
  const staleTask = classifyGenerationWorkerHealth({
    live_workers: 1,
    queued_count: 0,
    stale_processing_count: 1,
    failed_last_15m: 0,
  }, { now });
  assert.equal(oldQueue.status, 'degraded');
  assert.equal(staleTask.status, 'degraded');
});

test('generation readiness reports unknown when the bounded probe fails', async () => {
  const result = await getGenerationWorkerHealth({
    timeoutMs: 10,
    probe: () => new Promise(() => {}),
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.error, 'WORKER_HEALTH_TIMEOUT');
});
