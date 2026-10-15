import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkInviteCodeValid,
  generateSingleInviteCode,
  isInviteCodeRequired,
} from '../../lib/services/inviteCodes.js';

test('1. 邀请码格式与生成规则', async () => {
  const code = await generateSingleInviteCode('KOYO');
  assert.ok(code.startsWith('KOYO-'), '邀请码必须包含指定前缀');
  assert.equal(code.split('-').length, 3, '邀请码必须由三段组成');
});

test('2. 邀请码空值与格式校验', async () => {
  const emptyCheck = await checkInviteCodeValid('');
  assert.equal(emptyCheck.valid, false);
  assert.equal(emptyCheck.code, 'INVITE_CODE_REQUIRED');

  const nullCheck = await checkInviteCodeValid(null);
  assert.equal(nullCheck.valid, false);
  assert.equal(nullCheck.code, 'INVITE_CODE_REQUIRED');
});

test('3. 邀请码Mock校验状态机', async () => {
  // 模拟不存在的邀请码
  const fakeTx = {
    queryOne: async (sql, params) => {
      if (params[0] === 'EXHAUSTED-CODE') {
        return { id: 'inv_1', code: 'EXHAUSTED-CODE', max_uses: 1, used_count: 1, status: 'exhausted' };
      }
      if (params[0] === 'DISABLED-CODE') {
        return { id: 'inv_2', code: 'DISABLED-CODE', max_uses: 5, used_count: 0, status: 'disabled' };
      }
      if (params[0] === 'EXPIRED-CODE') {
        return { id: 'inv_3', code: 'EXPIRED-CODE', max_uses: 5, used_count: 0, status: 'active', expires_at: new Date(Date.now() - 10000).toISOString() };
      }
      if (params[0] === 'VALID-CODE') {
        return { id: 'inv_4', code: 'VALID-CODE', max_uses: 5, used_count: 2, status: 'active', expires_at: null };
      }
      return null;
    }
  };

  const notFound = await checkInviteCodeValid('NOT-EXIST-CODE', fakeTx);
  assert.equal(notFound.valid, false);
  assert.equal(notFound.code, 'INVALID_INVITE_CODE');

  const exhausted = await checkInviteCodeValid('EXHAUSTED-CODE', fakeTx);
  assert.equal(exhausted.valid, false);
  assert.equal(exhausted.code, 'INVITE_CODE_EXHAUSTED');

  const disabled = await checkInviteCodeValid('DISABLED-CODE', fakeTx);
  assert.equal(disabled.valid, false);
  assert.equal(disabled.code, 'INVITE_CODE_EXHAUSTED');

  const expired = await checkInviteCodeValid('EXPIRED-CODE', fakeTx);
  assert.equal(expired.valid, false);
  assert.equal(expired.code, 'INVITE_CODE_EXPIRED');

  const valid = await checkInviteCodeValid('VALID-CODE', fakeTx);
  assert.equal(valid.valid, true);
  assert.equal(valid.code, 'VALID-CODE');
  assert.equal(valid.maxUses, 5);
  assert.equal(valid.usedCount, 2);
});

test('4. 内测期默认强制要求邀请码', async () => {
  const required = await isInviteCodeRequired();
  assert.equal(typeof required, 'boolean');
  assert.equal(required, true, '内测期默认必须开启邀请码拦截');
});
