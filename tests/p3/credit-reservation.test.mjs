import assert from 'node:assert/strict';
import test from 'node:test';

import { commitCredits, voidCredits } from '../../lib/financial/creditService.js';

const reservation = {
  id: 'res_test_1',
  user_id: 'user-test',
  status: 'RESERVED',
  model_id: 'test-image',
  reserved_amount: 10,
  bucket_split_json: { daily: 2, subscription: 3, perpetual: 5 },
  bucket_allocations_json: [
    {bucket:'daily',source:'wallet',amount:2,expiresAt:null},
    {bucket:'subscription',source:'wallet',amount:3,expiresAt:null},
    {bucket:'perpetual',source:'wallet',amount:5,expiresAt:null},
  ],
};

function mockTransaction({
  currentReservation = reservation,
  wallet = {
    user_id: 'user-test',
    daily_free_credits: 2,
    subscription_credits: 3,
    perpetual_credits: 5,
    frozen_credits: 15,
  },
} = {}) {
  const writes = [];
  const transaction = {
    async queryOne(sql) {
      if (sql.includes('FROM credit_reservations')) return currentReservation;
      if (sql.includes('FROM credit_wallets')) return wallet;
      return null;
    },
    async queryMany() { return []; },
    async execute(sql, params) {
      writes.push({ sql, params });
      return { rowCount: 1 };
    },
  };
  return { transaction, writes };
}

test('commit and release subtract the reservation from the aggregate frozen balance', async () => {
  const commitTx = mockTransaction();
  const committed = await commitCredits({
    reservationId: reservation.id,
    creationId: 'job_test_1',
    settledAmount: 10,
    expectedUserId: 'user-test',
    transaction: commitTx.transaction,
  });
  const commitWalletWrite = commitTx.writes.find(({ sql }) => sql.includes('SET frozen_credits = $1'));
  assert.equal(committed.status, 'COMMITTED');
  assert.equal(Number(commitWalletWrite.params[0]), 5);

  const releaseTx = mockTransaction();
  const released = await voidCredits({
    reservationId: reservation.id,
    expectedUserId: 'user-test',
    transaction: releaseTx.transaction,
  });
  const releaseWalletWrite = releaseTx.writes.find(({ sql }) => sql.includes('SET daily_free_credits = $1'));
  assert.equal(released.status, 'VOIDED');
  assert.deepEqual(releaseWalletWrite.params.slice(0, 4).map(Number), [2, 3, 10, 5]);
});

test('commit and release refuse to settle when frozen balance is below the reservation', async () => {
  for (const settle of [commitCredits, voidCredits]) {
    const mock = mockTransaction({
      wallet: {
        user_id: 'user-test',
        daily_free_credits: 2,
        subscription_credits: 3,
        perpetual_credits: 5,
        frozen_credits: 9,
      },
    });
    await assert.rejects(
      settle({ reservationId: reservation.id, expectedUserId: 'user-test', transaction: mock.transaction }),
      { code: 'CREDIT_RESERVATION_BALANCE_MISMATCH' },
    );
    assert.equal(mock.writes.length, 0);
  }
});

test('commit and release refuse malformed reservation amounts and bucket splits before writes', async () => {
  const invalidReservations = [
    { ...reservation, reserved_amount: 0 },
    { ...reservation, reserved_amount: -1 },
    { ...reservation, reserved_amount: Number.NaN },
    { ...reservation, bucket_split_json: { daily: 2, subscription: 3, perpetual: 4 } },
    { ...reservation, bucket_split_json: { daily: 2, subscription: -1, perpetual: 9 } },
    { ...reservation, bucket_split_json: { daily: 2, subscription: 3 } },
  ];

  for (const currentReservation of invalidReservations) {
    for (const settle of [commitCredits, voidCredits]) {
      const mock = mockTransaction({ currentReservation });
      await assert.rejects(
        settle({ reservationId: reservation.id, expectedUserId: 'user-test', transaction: mock.transaction }),
        { code: 'CREDIT_RESERVATION_BALANCE_MISMATCH' },
      );
      assert.equal(mock.writes.length, 0);
    }
  }
});

test('commit and release refuse missing or corrupt wallet buckets before writes', async () => {
  const invalidWallets = [
    null,
    { daily_free_credits: Number.NaN, subscription_credits: 3, perpetual_credits: 5, frozen_credits: 15 },
    { daily_free_credits: 2, subscription_credits: -1, perpetual_credits: 5, frozen_credits: 15 },
    { daily_free_credits: 2, subscription_credits: 3, perpetual_credits: undefined, frozen_credits: 15 },
    { daily_free_credits: 2, subscription_credits: 3, perpetual_credits: 5, frozen_credits: null },
  ];

  for (const wallet of invalidWallets) {
    for (const settle of [commitCredits, voidCredits]) {
      const mock = mockTransaction({ wallet });
      await assert.rejects(
        settle({ reservationId: reservation.id, expectedUserId: 'user-test', transaction: mock.transaction }),
        { code: 'CREDIT_RESERVATION_BALANCE_MISMATCH' },
      );
      assert.equal(mock.writes.length, 0);
    }
  }
});

 test('legacy expiring reservations require evidence and cannot credit a new cycle', async () => {
  const mock = mockTransaction({currentReservation: {...reservation, bucket_allocations_json: null}});
  await assert.rejects(voidCredits({reservationId: reservation.id, transaction:mock.transaction}), {code:'CREDIT_RELEASE_CONTEXT_REQUIRED'});
  assert.equal(mock.writes.length,0);
});
