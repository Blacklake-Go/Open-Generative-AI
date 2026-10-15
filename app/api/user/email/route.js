import { getUserFromRequest, json, unbindUserEmail } from '@/lib/services/auth';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { confirmEmailBinding, requestEmailBinding } from '@/lib/services/emailVerification';

export const runtime = 'nodejs';

const ERROR_STATUS = {
  USER_NOT_FOUND: 404,
  EMAIL_ALREADY_BOUND: 409,
  EMAIL_CODE_COOLDOWN: 429,
  SMTP_NOT_CONFIGURED: 503,
  EMAIL_DELIVERY_FAILED: 503,
  SMTP_AUTH_FAILED: 503,
  SMTP_UNAVAILABLE: 503,
  SMTP_TIMEOUT: 503,
};

function failure(result) {
  return json(
    { error: result.message || '邮箱验证失败', code: result.error },
    { status: ERROR_STATUS[result.error] || 400 },
  );
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'user_email_binding', subject: user.id, limit: 10, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const body = await request.json();
    const email = String(body?.email || '').trim();
    const code = String(body?.code || '').trim();
    const requestIp = getClientIp(request);

    if (!code) {
      const result = await requestEmailBinding({ userId: user.id, email, requestIp });
      if (result.error) return failure(result);
      return json({
        success: true,
        email: result.email,
        alreadyBound: result.alreadyBound === true,
        verificationRequired: result.verificationRequired === true,
        expiresInSeconds: result.expiresInSeconds,
        message: result.alreadyBound
          ? '该邮箱已绑定并通过验证'
          : '验证码已发送至邮箱，请在 10 分钟内填写',
      });
    }

    const result = await confirmEmailBinding({ userId: user.id, email, code, requestIp });
    if (result.error) return failure(result);
    return json({ success: true, email: result.email, message: '安全邮箱已成功绑定' });
  } catch (error) {
    console.error('[bind email error]', { code: error?.code || 'UNKNOWN' });
    return json({ error: '绑定安全邮箱失败，请稍后重试' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'user_email_unbind', subject: user.id, limit: 5, windowMs: 24 * 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const result = await unbindUserEmail(user.id);
    if (result.error) {
      return json({ error: result.message }, { status: 400 });
    }
    return json({ success: true, message: result.message });
  } catch (error) {
    console.error('[unbind email error]', { code: error?.code || 'UNKNOWN' });
    return json({ error: '解绑安全邮箱失败，请稍后重试' }, { status: 500 });
  }
}
