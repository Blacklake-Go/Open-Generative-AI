import { createSession, createUser, json, setSessionCookie, validateCredentials } from '@/lib/services/auth';
import { getSettingByKey } from '@/lib/services/settings';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { verifyEmailRegisterCode } from '@/lib/services/emailVerification';
import { isInviteCodeRequired, checkInviteCodeValid } from '@/lib/services/inviteCodes';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
    if (guarded) return guarded;
    const ip = getClientIp(request);
    const limit = await consumeRateLimit({ scope: 'auth_register_ip', subject: ip, limit: 10, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    const maintSetting = await getSettingByKey('maintenance_mode');
    if (maintSetting?.value?.enabled) {
      return json({ error: maintSetting.value.message || '系统维护中，暂停用户注册' }, { status: 503 });
    }

    const regSetting = await getSettingByKey('registration_enabled');
    if (regSetting?.value && regSetting.value.enabled === false) {
      return json({ error: '新用户注册通道当前已暂停开放' }, { status: 403 });
    }

    const body = await request.json();
    const validationError = validateCredentials(body.email, body.password);
    if (validationError) return json({ error: validationError }, { status: 400 });

    const inviteRequired = await isInviteCodeRequired();
    const inviteCode = String(body.inviteCode || body.invite_code || '').trim();
    if (inviteRequired) {
      if (!inviteCode) {
        return json({ error: '内测期间需凭邀请码注册，请输入有效的邀请码', code: 'INVITE_CODE_REQUIRED' }, { status: 400 });
      }
      const check = await checkInviteCodeValid(inviteCode);
      if (!check.valid) {
        return json({ error: check.reason, code: check.code }, { status: 400 });
      }
    }

    const code = String(body.code || '').trim();
    if (!code || !/^\d{6}$/.test(code)) {
      return json({ error: '请输入6位有效邮箱验证码' }, { status: 400 });
    }

    const verifyResult = await verifyEmailRegisterCode({ email: body.email, code });
    if (verifyResult.error) {
      return json({ error: verifyResult.message || '验证码无效或已过期' }, { status: 400 });
    }

    const result = await createUser(body.email, body.password, {
      registrationSource: 'web_email',
      ip,
      emailVerified: true,
      inviteCode: inviteCode || null,
    });
    if (result.error) return json({ error: result.error }, { status: 409 });

    const session = await createSession(result.user.id);
    const response = json({ user: result.user });
    setSessionCookie(response, session.token, session.expires, request);
    return response;
  } catch (error) {
    console.error('[auth/register]', error);
    return json({ error: '注册暂时不可用，请稍后重试' }, { status: 500 });
  }
}
