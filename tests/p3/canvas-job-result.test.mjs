import assert from 'node:assert/strict';
import test from 'node:test';

import { getCanvasJobCostMetadata, getCanvasJobFailure, getCanvasJobResultStatus } from '../../lib/canvas/jobResultState.js';
import { ensureCanvasResultAsset } from '../../lib/canvas/resolveJobAsset.js';

const updatedAt = new Date('2026-10-09T00:00:00.000Z');

test('Canvas returns a terminal success only after an image asset exists', () => {
  assert.equal(getCanvasJobResultStatus({
    taskStatus: 'succeeded',
    resultObjectKey: 'private/result.webp',
    hasAsset: true,
    taskUpdatedAt: updatedAt,
    now: updatedAt.getTime() + 5_000,
  }), 'succeeded');
});

test('Canvas keeps a recently completed task pending while asset sync is retried', () => {
  assert.equal(getCanvasJobResultStatus({
    taskStatus: 'succeeded',
    resultObjectKey: 'private/result.webp',
    hasAsset: false,
    taskUpdatedAt: updatedAt,
    now: updatedAt.getTime() + 59_999,
  }), 'processing');
});

test('Canvas reports a missing or stale image asset as unavailable instead of polling forever', () => {
  assert.equal(getCanvasJobResultStatus({
    taskStatus: 'succeeded',
    resultObjectKey: 'private/result.webp',
    hasAsset: false,
    taskUpdatedAt: updatedAt,
    now: updatedAt.getTime() + 60_000,
  }), 'result_unavailable');
  assert.equal(getCanvasJobResultStatus({
    taskStatus: 'succeeded',
    resultObjectKey: null,
    hasAsset: false,
    taskUpdatedAt: updatedAt,
    now: updatedAt.getTime() + 1_000,
  }), 'result_unavailable');
});

test('Canvas preserves provider failure states and text-only success', () => {
  assert.equal(getCanvasJobResultStatus({ taskStatus: 'failed', hasAsset: false }), 'failed');
  assert.equal(getCanvasJobResultStatus({ taskStatus: 'succeeded', resultText: 'Generated text', hasAsset: false }), 'succeeded');
});

test('Canvas explains the historical Seedream Model ID access failure without exposing upstream details', () => {
  const historical = getCanvasJobFailure({
    errorCode: 'INVALID_INPUT',
    failureMetadata: {
      upstreamError: 'volcengine: The model or endpoint doubao-seedream-5-0-260128 does not exist or you do not have access to it. Request id: secret-id',
    },
  });
  assert.equal(historical.code, 'MODEL_ROUTE_UNAVAILABLE');
  assert.match(historical.message, /服务端点当前不可用/);
  assert.match(historical.message, /释放预留积分/);
  assert.doesNotMatch(JSON.stringify(historical), /volcengine|doubao|secret-id/);

  const future = getCanvasJobFailure({ errorCode: 'MODEL_ROUTE_UNAVAILABLE' });
  assert.deepEqual(future, historical);
  assert.equal(getCanvasJobFailure({ errorCode: 'INVALID_INPUT' }).code, 'INVALID_INPUT');
});

test('Canvas explains a terminal unavailable model and confirms reservation release without substitution', () => {
  const failure = getCanvasJobFailure({ errorCode: 'MODEL_UNAVAILABLE' });
  assert.equal(failure.code, 'MODEL_UNAVAILABLE');
  assert.match(failure.message, /释放预留积分/);
  assert.match(failure.message, /不会自动切换模型/);
});

test('Canvas distinguishes reported provider cost from pending reconciliation', () => {
  assert.deepEqual(getCanvasJobCostMetadata(null), { actualCostUsd: null, costStatus: 'pending_reconciliation' });
  assert.deepEqual(getCanvasJobCostMetadata(''), { actualCostUsd: null, costStatus: 'pending_reconciliation' });
  assert.deepEqual(getCanvasJobCostMetadata('0.125'), { actualCostUsd: 0.125, costStatus: 'provider_reported' });
  assert.deepEqual(getCanvasJobCostMetadata('unknown'), { actualCostUsd: null, costStatus: 'pending_reconciliation' });
});

test('Canvas retries owner-scoped asset synchronization with the raw stored object key', async () => {
  const requested = [];
  const rawCreation = {
    id: 'job_1',
    user_id: 'user-a',
    status: 'succeeded',
    result_object_key: 'private/user-a/result.webp',
  };
  const resolved = await ensureCanvasResultAsset({
    userId: 'user-a',
    creationId: 'job_1',
    async getAssetByCreationId(userId, creationId) {
      requested.push(['asset', userId, creationId]);
      return requested.filter(([type]) => type === 'asset').length === 1 ? null : { id: 'asset_1' };
    },
    async getAssetDownload(userId, assetId) {
      requested.push(['download', userId, assetId]);
      return { objectKey: 'private/user-a/result.webp' };
    },
    async findCreationById(creationId) {
      requested.push(['creation', creationId]);
      return rawCreation;
    },
    async syncCreationToAsset(creation) {
      requested.push(['sync', creation.result_object_key]);
    },
  });

  assert.equal(resolved.asset.id, 'asset_1');
  assert.deepEqual(requested, [
    ['asset', 'user-a', 'job_1'],
    ['creation', 'job_1'],
    ['sync', 'private/user-a/result.webp'],
    ['asset', 'user-a', 'job_1'],
    ['download', 'user-a', 'asset_1'],
  ]);
});

test('Canvas does not synchronize an asset when the raw generation belongs to another user', async () => {
  let syncCount = 0;
  const resolved = await ensureCanvasResultAsset({
    userId: 'user-b',
    creationId: 'job_1',
    async getAssetByCreationId() { return null; },
    async getAssetDownload() { return null; },
    async findCreationById() { return { id: 'job_1', user_id: 'user-a', status: 'succeeded' }; },
    async syncCreationToAsset() { syncCount += 1; },
  });

  assert.equal(resolved.asset, null);
  assert.equal(syncCount, 0);
});

test('Canvas does not return an Asset without an owner-scoped storage object key', async () => {
  let syncCount = 0;
  const resolved = await ensureCanvasResultAsset({
    userId: 'user-a',
    creationId: 'job_1',
    async getAssetByCreationId() { return { id: 'asset_1' }; },
    async getAssetDownload() { return { mediaUrl: 'https://external.example/result.webp' }; },
    async findCreationById() {
      return { id: 'job_1', user_id: 'user-a', status: 'succeeded', result_object_key: 'private/result.webp' };
    },
    async syncCreationToAsset() { syncCount += 1; },
  });

  assert.equal(resolved.asset, null);
  assert.equal(syncCount, 1);
});
