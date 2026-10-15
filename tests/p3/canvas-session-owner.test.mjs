import assert from 'node:assert/strict';
import test from 'node:test';

import { getCanvasSessionOwnerConflict } from '../../lib/canvas/sessionOwner.js';

test('Canvas mutations accept only the owner captured when the request started', () => {
  assert.equal(getCanvasSessionOwnerConflict('user-a', 'user-a'), null);
  assert.equal(getCanvasSessionOwnerConflict(' user-a ', ' user-a '), null);

  assert.deepEqual(getCanvasSessionOwnerConflict('user-b', 'user-a'), {
    code: 'CANVAS_SESSION_OWNER_CHANGED',
    error: '登录账户已变化，请刷新画布后重试',
  });
});

test('Canvas mutations fail closed when the captured owner is absent', () => {
  assert.deepEqual(getCanvasSessionOwnerConflict('user-a', ''), {
    code: 'CANVAS_OWNER_CONTEXT_REQUIRED',
    error: '无法确认发起操作时的登录账户，请刷新画布后重试',
  });
  assert.deepEqual(getCanvasSessionOwnerConflict('', 'user-a'), {
    code: 'CANVAS_SESSION_OWNER_CHANGED',
    error: '登录账户已变化，请刷新画布后重试',
  });
});
