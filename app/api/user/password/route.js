import crypto from 'node:crypto';
import { getUserFromRequest, json, passwordHash } from '@/lib/services/auth';
import { withTransaction } from '@/lib/application/dataAccess.js';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import * as authRepo from '@/lib/repositories/auth.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'user_password_change', subject: user.id, limit: 10, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const body = await request.json();
    const oldPassword = String(body.oldPassword || '');
    const newPassword = String(body.newPassword || '');

    if (!newPassword || newPassword.length < 8) {
      return json({ error: '新密码长度至少需要 8 位' }, { status: 400 });
    }
    if (newPassword.length > 200) {
      return json({ error: '新密码长度不能超过 200 位' }, { status: 400 });
    }

    // 1. 查询用户现有凭证（兼容 users 与 auth_accounts）
    const credential = await authRepo.findUserPasswordCredential(user.id);
    const userHasPassword = Boolean(credential?.password_hash && credential?.password_salt);
    
    // 若用户已设置过密码，则必须校对旧密码
    if (userHasPassword) {
      if (!oldPassword) {
        return json({ error: '请输入当前密码以验证身份', code: 'PASSWORD_REQUIRED', hasPassword: true }, { status: 400 });
      }
      const { hash } = passwordHash(oldPassword, credential.password_salt);
      const actual = Buffer.from(hash, 'hex');
      const expected = Buffer.from(credential.password_hash, 'hex');
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        return json({ error: '当前密码输入错误', hasPassword: true }, { status: 400 });
      }
      if (oldPassword === newPassword) {
        return json({ error: '新密码不能与当前密码相同', hasPassword: true }, { status: 400 });
      }
    }

    // 2. 生成新密码哈希与盐
    const { salt: newSalt, hash: newHash } = passwordHash(newPassword);

    // 3. 事务更新数据库凭证（同步更新 users 与 auth_accounts）
    await withTransaction(async (tx) => {
      await authRepo.setUserPassword({ userId: user.id, passwordHash: newHash, passwordSalt: newSalt }, tx);
    });

    return json({
      success: true,
      message: userHasPassword ? '密码已成功修改' : '密码已成功设置',
      hasPassword: true,
    });
  } catch (error) {
    console.error('[password change error]', error);
    return json({ error: '修改密码处理失败，请稍后重试' }, { status: 500 });
  }
}
