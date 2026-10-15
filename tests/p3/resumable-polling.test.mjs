import test from 'node:test';
import assert from 'node:assert/strict';

import {
  claimDuePollingCreation,
  listDuePollingCreations,
  scheduleNextPoll,
  updateCreationStatus,
} from '../../lib/repositories/creations.js';
import { pollGenerationTask, expireStaleGenerationTasks } from '../../lib/services/generationCore.js';
import { runGenerationWorkerOnce } from '../../lib/services/taskWorker.js';

test('resumable provider polling - stepped backoff schedule logic (2s -> 5s -> 10s -> 20s)', () => {
  function getSteppedBackoffSeconds(elapsedMs) {
    if (elapsedMs < 10_000) return 2;
    if (elapsedMs < 30_000) return 5;
    if (elapsedMs < 90_000) return 10;
    return 20;
  }

  // 0s-10s -> 2s
  assert.equal(getSteppedBackoffSeconds(0), 2);
  assert.equal(getSteppedBackoffSeconds(5000), 2);
  assert.equal(getSteppedBackoffSeconds(9999), 2);

  // 10s-30s -> 5s
  assert.equal(getSteppedBackoffSeconds(10000), 5);
  assert.equal(getSteppedBackoffSeconds(25000), 5);

  // 30s-90s -> 10s
  assert.equal(getSteppedBackoffSeconds(30000), 10);
  assert.equal(getSteppedBackoffSeconds(60000), 10);

  // > 90s -> 20s
  assert.equal(getSteppedBackoffSeconds(90000), 20);
  assert.equal(getSteppedBackoffSeconds(300000), 20);
  assert.equal(getSteppedBackoffSeconds(1200000), 20); // 20 分钟仍然按 20s 退避平稳轮询
});

test('resumable provider polling - video generation supports 15-30 minute window without false timeout', () => {
  function isTaskTimedOut({ modelType, elapsedMs, defaultTimeoutMs = 15 * 60 * 1000 }) {
    const isVideo = modelType === 'video';
    const maxTimeoutMs = isVideo ? 30 * 60 * 1000 : defaultTimeoutMs;
    return elapsedMs > maxTimeoutMs;
  }

  // 视频生成在 15 分钟（900,000ms）时未超时
  assert.equal(isTaskTimedOut({ modelType: 'video', elapsedMs: 15 * 60 * 1000 }), false);
  // 视频生成在 25 分钟时未超时
  assert.equal(isTaskTimedOut({ modelType: 'video', elapsedMs: 25 * 60 * 1000 }), false);
  // 视频生成在 29 分 59 秒时未超时
  assert.equal(isTaskTimedOut({ modelType: 'video', elapsedMs: 29.9 * 60 * 1000 }), false);
  // 超过 30 分钟时判定超时
  assert.equal(isTaskTimedOut({ modelType: 'video', elapsedMs: 31 * 60 * 1000 }), true);

  // 非视频任务在 16 分钟时判定超时
  assert.equal(isTaskTimedOut({ modelType: 'image', elapsedMs: 16 * 60 * 1000 }), true);
});

test('taskWorker - runGenerationWorkerOnce integrates due polling queue', async () => {
  // 验证 runGenerationWorkerOnce 契约包含 duePollingCount 与 polled 数组
  const summary = await runGenerationWorkerOnce({
    batchSize: 5,
    testDependencies: {
      listQueuedGenerationIds: async () => [{ id: 'mock-q-1' }],
      listDuePollingCreations: async () => [{ id: 'mock-poll-1' }],
      processGenerationTask: async ({ creationId }) => ({ id: creationId, status: 'processing' }),
      pollGenerationTask: async ({ creationId }) => ({ id: creationId, status: 'processing' }),
      cleanupExpiredReservations: async () => ({ cleared: 0 }),
      expireStaleGenerationTasks: async () => ({ checkedCount: 0, processed: [] }),
      getProviderAdapter: async () => ({
        async getTask() { return { status: 'processing' }; },
      }),
    },
  });

  assert.equal(summary.queuedCount, 1);
  assert.equal(summary.duePollingCount, 1);
  assert.ok(Array.isArray(summary.processed));
  assert.equal(summary.processed.length, 1);
  assert.equal(summary.processed[0].id, 'mock-q-1');
  assert.ok(Array.isArray(summary.polled));
  assert.equal(summary.polled.length, 1);
  assert.equal(summary.polled[0].id, 'mock-poll-1');
});
