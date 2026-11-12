import test from 'node:test';
import assert from 'node:assert/strict';
import { runGenerationWorkerOnce } from '../lib/services/taskWorker.js';

test('worker finishes its current generation and leaves remaining work untouched when stopping', async () => {
  let stop = false;
  const calls = [];
  const summary = await runGenerationWorkerOnce({
    shouldStop: () => stop,
    testDependencies: {
      listQueuedGenerationIds: async () => [{ id: 'one' }, { id: 'two' }],
      processGenerationTask: async ({ creationId }) => { calls.push(creationId); stop = true; return { status: 'processing' }; },
      listDuePollingCreations: async () => { throw new Error('should not fetch poll queue after stop'); },
      cleanupExpiredReservations: async () => { throw new Error('should not start cleanup after stop'); },
      expireStaleGenerationTasks: async () => { throw new Error('should not start expiry after stop'); },
    },
  });
  assert.deepEqual(calls, ['one']);
  assert.equal(summary.processed.length, 1);
  assert.deepEqual(summary.polled, []);
});

test('worker finishes current poll and does not start another after stopping', async () => {
  let stop = false;
  const calls = [];
  const summary = await runGenerationWorkerOnce({
    shouldStop: () => stop,
    testDependencies: {
      listQueuedGenerationIds: async () => [],
      listDuePollingCreations: async () => [{ id: 'one' }, { id: 'two' }],
      pollGenerationTask: async ({ creationId }) => { calls.push(creationId); stop = true; return { status: 'processing' }; },
      cleanupExpiredReservations: async () => { throw new Error('should not start cleanup after stop'); },
      expireStaleGenerationTasks: async () => { throw new Error('should not start expiry after stop'); },
    },
  });
  assert.deepEqual(calls, ['one']);
  assert.equal(summary.polled.length, 1);
});
