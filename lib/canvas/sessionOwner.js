export function getCanvasSessionOwnerConflict(authenticatedUserId, expectedOwnerUserId) {
  const authenticated = String(authenticatedUserId || '').trim();
  const expected = String(expectedOwnerUserId || '').trim();

  if (!expected) {
    return {
      code: 'CANVAS_OWNER_CONTEXT_REQUIRED',
      error: '无法确认发起操作时的登录账户，请刷新画布后重试',
    };
  }

  if (!authenticated || expected !== authenticated) {
    return {
      code: 'CANVAS_SESSION_OWNER_CHANGED',
      error: '登录账户已变化，请刷新画布后重试',
    };
  }

  return null;
}
