import test from 'node:test';
import assert from 'node:assert/strict';
import { linkAssetToCreation, updateCreationStatus } from '../lib/repositories/creations.js';

test('a lost terminal-state race does not report a successful update', async () => {
  let reads = 0;
  const transaction = {
    execute: async () => 0,
    queryOne: async () => { reads += 1; return null; },
  };
  const result = await updateCreationStatus('creation-1', {
    status: 'succeeded',
    expectedStatus: 'processing',
    transaction,
  });
  assert.equal(result, null);
  assert.equal(reads, 0);
});

test('asset linkage requires a ready private asset owned by the creation user', async () => {
  let statement;
  let argumentsSeen;
  const transaction = {
    queryOne: async (sql, args) => {
      statement = sql;
      argumentsSeen = args;
      return { id: 'creation-1', asset_id: 'asset-1' };
    },
  };
  const result = await linkAssetToCreation('creation-1', 'asset-1', transaction);
  assert.deepEqual(argumentsSeen, ['creation-1', 'asset-1']);
  assert.match(statement, /a\.creation_id = c\.id AND a\.user_id = c\.user_id/);
  assert.match(statement, /a\.visibility = 'private' AND a\.storage_status = 'ready'/);
  assert.equal(result.asset_id, 'asset-1');
});
