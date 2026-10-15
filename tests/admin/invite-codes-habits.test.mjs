import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isInviteCodeRequired,
  checkInviteCodeValid,
  generateSingleInviteCode,
  batchGenerateInviteCodes,
  setInviteCodeStatus,
  getInviteStatsOverview,
  listAdminInviteCodesWithHabits,
  updateGlobalInviteSwitch,
} from '../../lib/services/inviteCodes.js';

test('邀请码生成格式规范：符合 KOYO-XXXX-XXXX 前缀与特征', async () => {
  const code = await generateSingleInviteCode('KOYO');
  assert.match(code, /^KOYO-[0-9A-F]{4}-[0-9A-F]{4}$/);
});

test('邀请码全局开关读写契约：可在 DB 中持久化切换', async () => {
  const originalState = await isInviteCodeRequired();

  // 1. 切换为开启
  const setTrue = await updateGlobalInviteSwitch(true, { email: 'test_admin@supdance.com' });
  assert.ok(!setTrue.error, '保存开关失败');
  const stateAfterTrue = await isInviteCodeRequired();
  assert.equal(stateAfterTrue, true);

  // 2. 切换为关闭
  const setFalse = await updateGlobalInviteSwitch(false, { email: 'test_admin@supdance.com' });
  assert.ok(!setFalse.error, '保存开关失败');
  const stateAfterFalse = await isInviteCodeRequired();
  assert.equal(stateAfterFalse, false);

  // 恢复原始状态
  await updateGlobalInviteSwitch(originalState, { email: 'test_admin@supdance.com' });
});

test('邀请码批量生成与有效性校验流程', async () => {
  const created = await batchGenerateInviteCodes({
    count: 2,
    maxUses: 5,
    notes: '自动化测试批次-渠道A',
    createdBy: 'test_admin',
    expiresDays: 7,
  });

  assert.equal(created.length, 2);
  const first = created[0];
  assert.ok(first.id.startsWith('inv_'));
  assert.equal(first.max_uses, 5);
  assert.equal(first.notes, '自动化测试批次-渠道A');
  assert.equal(first.status, 'active');

  // 检查有效性
  const check = await checkInviteCodeValid(first.code);
  assert.equal(check.valid, true);
  assert.equal(check.maxUses, 5);
  assert.equal(check.usedCount, 0);

  // 停用邀请码
  await setInviteCodeStatus(first.id, 'disabled');
  const checkDisabled = await checkInviteCodeValid(first.code);
  assert.equal(checkDisabled.valid, false);
  assert.equal(checkDisabled.code, 'INVITE_CODE_EXHAUSTED');

  // 重新恢复为 active
  await setInviteCodeStatus(first.id, 'active');
  const checkRestored = await checkInviteCodeValid(first.code);
  assert.equal(checkRestored.valid, true);
});

test('邀请码大盘宏观统计与用户习惯列表查询正常响应', async () => {
  const overview = await getInviteStatsOverview();
  assert.ok(typeof overview.total_codes === 'number');
  assert.ok(typeof overview.total_redemptions === 'number');
  assert.ok(typeof overview.total_creations === 'number');
  assert.ok(typeof overview.is_invite_code_required === 'boolean');

  const list = await listAdminInviteCodesWithHabits({ page: 1, pageSize: 10 });
  assert.ok(Array.isArray(list.codes));
  assert.ok(typeof list.total === 'number');
});
