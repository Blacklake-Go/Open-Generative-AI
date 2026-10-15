import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateUserId, randomNumericUserId, userIdCapacity, MIN_USER_ID_DIGITS } from '../../lib/auth/user-id.js';

test('Canonical User ID: 6位起步，纯数字无前导零，范围 100000-999999', () => {
  assert.equal(MIN_USER_ID_DIGITS, 6);
  assert.equal(userIdCapacity(6), 900_000n);

  for (let i = 0; i < 50; i++) {
    const id = randomNumericUserId(6);
    assert.match(id, /^[1-9][0-9]{5}$/, `ID 必须是 6 位纯数字且首位非零: ${id}`);
    const num = Number(id);
    assert.ok(num >= 100000 && num <= 999999, `ID 必须落在 100000-999999 范围内: ${num}`);
  }
});

test('Canonical User ID: 只有 6 位池彻底耗尽时，才允许自动升级到 7 位', async () => {
  let checkedExhaustionFor6 = false;
  const attempts = [];

  const id = await allocateUserId({
    reserve: async (candidate, digits) => {
      attempts.push({ candidate, digits });
      // 6 位全部模拟已占用，7 位时才成功
      if (digits === 7) return true;
      return false;
    },
    findFirstAvailable: async (digits) => {
      if (digits === 6) {
        checkedExhaustionFor6 = true;
        // 6 位号码池真正用尽，返回 null
        return null;
      }
      return '1000000';
    },
    isExhausted: async (digits) => digits === 6,
    randomAttempts: 5,
    minDigits: 6,
    maxDigits: 7,
  });

  assert.equal(checkedExhaustionFor6, true, '必须先对 6 位池执行完备性耗尽检查');
  assert.match(id, /^[1-9][0-9]{6}$/, '升级后为 7 位纯数字');
  assert.equal(attempts.some((a) => a.digits === 6), true, '升级前必须先在 6 位池中尝试');
});

test('Canonical User ID: 并发分配测试，确保无两个用户获得相同 ID', async () => {
  const globalLedger = new Set();
  const concurrency = 50;

  async function mockAllocate() {
    return allocateUserId({
      reserve: async (candidate) => {
        // 原子操作：若存在则失败
        if (globalLedger.has(candidate)) return false;
        globalLedger.add(candidate);
        return true;
      },
      findFirstAvailable: async () => null,
      isExhausted: async () => false,
      randomAttempts: 20,
      minDigits: 6,
      maxDigits: 6,
    });
  }

  const results = await Promise.all(Array.from({ length: concurrency }, () => mockAllocate()));
  assert.equal(results.length, concurrency);
  const uniqueSet = new Set(results);
  assert.equal(uniqueSet.size, concurrency, '所有并发分配的 ID 必须全局唯一，无碰撞重复');
});

test('Canonical User ID: 永久不可回收，删除账号后该 ID 绝不重新分配给新用户', async () => {
  // 模拟永久记录表 user_id_allocations（即使 users 表删除了该用户，allocations 依然保留）
  const permanentAllocations = new Set(['123456', '888888']);

  // 新用户尝试分配
  const newId = await allocateUserId({
    reserve: async (candidate) => {
      // 如果已被历史分配过（即使已删除），也不得再用
      if (permanentAllocations.has(candidate)) return false;
      permanentAllocations.add(candidate);
      return true;
    },
    findFirstAvailable: async () => '123457',
    isExhausted: async () => false,
    randomAttempts: 1,
    minDigits: 6,
    maxDigits: 6,
  });

  assert.notEqual(newId, '123456');
  assert.notEqual(newId, '888888');
  assert.ok(permanentAllocations.has('123456'));
  assert.ok(permanentAllocations.has(newId));
});

test('Canonical User ID: 禁止因随机碰撞提前升级，必须通过可靠空隙扫描分配当前位剩余号码', async () => {
  let escalatedTo7 = false;
  let gapScanCalled = false;

  const id = await allocateUserId({
    reserve: async (candidate, digits) => {
      if (digits >= 7) {
        escalatedTo7 = true;
        return true;
      }
      // 模拟所有随机采样都碰撞，只有 gap scan 给出的特定 candidate 能成功
      if (candidate === '100042') return true;
      return false;
    },
    findFirstAvailable: async (digits) => {
      if (digits === 6) {
        gapScanCalled = true;
        return '100042'; // 6 位池中找到了未分配的空隙号码
      }
      return '1000000';
    },
    isExhausted: async () => false,
    randomAttempts: 5,
    minDigits: 6,
    maxDigits: 7,
  });

  assert.equal(gapScanCalled, true, '随机碰撞后必须调用 gap scan 寻找剩余可用号码');
  assert.equal(escalatedTo7, false, '6 位池未真正耗尽时绝不进入 7 位');
  assert.equal(id, '100042', '成功分配 6 位空隙号码');
});

test('Canonical User ID: 格式与防呆校验，禁止不足6位、前导零与非法字符', () => {
  const invalidUids = ['000001', '012345', '99999', '12345a', 'user_123456', '', ' 100000 ', '100000-999999'];
  const validPattern = /^[1-9][0-9]{5,63}$/;

  for (const uid of invalidUids) {
    assert.equal(validPattern.test(uid), false, `非法 UID 应被拒绝: ${uid}`);
  }

  const validUids = ['100000', '184527', '999999', '1000000', '999999999'];
  for (const uid of validUids) {
    assert.equal(validPattern.test(uid), true, `合法 UID 应被接受: ${uid}`);
  }
});

