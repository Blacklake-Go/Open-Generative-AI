import { getUserFromRequest, json, unbindUserPhone } from '@/lib/services/auth';
import { execute, queryOne } from '@/lib/application/dataAccess.js';
import { verifySmsCode } from '@/lib/sms';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'user_phone_binding', subject: user.id, limit: 10, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const body = await request.json();
    const phone = String(body.phone || '').trim();
    const countryCode = String(body.countryCode || '+86').trim();
    const code = String(body.code || '').trim();

    if (!phone) return json({ error: '请输入有效的手机号' }, { status: 400 });
    if (!code) return json({ error: '请输入验证码' }, { status: 400 });

    // 验证短信验证码
    const verifyResult = await verifySmsCode({ phone, countryCode, code, type: 'login' });
    if (verifyResult.error) {
      return json({ error: verifyResult.error }, { status: 400 });
    }

    // 检查该手机号是否已被其他账号占用
    const existing = await queryOne('SELECT id FROM users WHERE phone = $1 AND id != $2', [phone, user.id]);
    if (existing) {
      return json({ error: '该手机号码已被其他账户绑定' }, { status: 400 });
    }

    // 绑定更新
    await execute('UPDATE users SET phone = $1, phone_country_code = $2, phone_verified_at = NOW(), updated_at = NOW() WHERE id = $3', [phone, countryCode, user.id]);
    
    return json({ success: true, phone, countryCode, message: '手机号已成功绑定' });
  } catch (error) {
    console.error('[bind phone error]', error);
    return json({ error: '绑定手机号失败' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'user_phone_unbind', subject: user.id, limit: 5, windowMs: 24 * 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const result = await unbindUserPhone(user.id);
    if (result.error) {
      return json({ error: result.message }, { status: 400 });
    }
    return json({ success: true, message: result.message });
  } catch (error) {
    console.error('[unbind phone error]', error);
    return json({ error: '解绑手机号失败，请稍后重试' }, { status: 500 });
  }
}
