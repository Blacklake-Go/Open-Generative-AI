import { json } from '@/lib/services/auth';
import { getSettingByKey } from '@/lib/services/settings';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { requestEmailRegisterCode } from '@/lib/services/emailVerification';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
    if (guarded) return guarded;

    const ip = getClientIp(request);
    const ipLimit = await consumeRateLimit({
      scope: 'auth_register_code_ip',
      subject: ip,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit);

    const maintSetting = await getSettingByKey('maintenance_mode');
    if (maintSetting?.value?.enabled) {
      return json({ error: maintSetting.value.message || '系统维护中，暂停用户注册' }, { status: 503 });
    }

    const regSetting = await getSettingByKey('registration_enabled');
    if (regSetting?.value && regSetting.value.enabled === false) {
      return json({ error: '新用户注册通道当前已暂停开放' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: '请输入有效的邮箱地址' }, { status: 400 });
    }

    const emailLimit = await consumeRateLimit({
      scope: 'auth_register_code_email',
      subject: email,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!emailLimit.allowed) return rateLimitResponse(emailLimit);

    const result = await requestEmailRegisterCode({
      email,
      requestIp: ip,
      locale: body.locale || 'zh-CN',
    });

    if (result.error) {
      return json({ error: result.message || '验证码发送失败' }, { status: 400 });
    }

    return json({
      ok: true,
      message: '验证码已发送至您的邮箱，10分钟内有效',
      expiresInSeconds: result.expiresInSeconds,
    });
  } catch (error) {
    console.error('[auth/register/send-code]', error);
    return json({ error: '发送验证码失败，请稍后重试' }, { status: 500 });
  }
}
