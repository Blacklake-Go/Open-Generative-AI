import { NextResponse } from 'next/server';
import { getClientIp, guardMutation } from '@/lib/security/requestGuard';
import { getSmsDeviceToken } from '@/lib/smsDevice';
import { resetPasswordByPhone } from '@/lib/services/passwordReset';

export const runtime = 'nodejs';

export async function POST(request) {
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }
    const result = await resetPasswordByPhone({
      phone: body.phone,
      countryCode: body.countryCode || '+86',
      code: body.code,
      challengeId: body.challengeId,
      newPassword: body.newPassword,
      sessionToken: request.cookies.get('ko_session')?.value || null,
      ip: getClientIp(request),
      deviceToken: getSmsDeviceToken(request),
    });
    if (!result.success) {
      return NextResponse.json(
        { error: result.message || '验证码无效或已过期', code: result.error || 'PASSWORD_RESET_FAILED' },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/password-reset/phone]', { code: error?.code || 'PASSWORD_RESET_FAILED' });
    return NextResponse.json({ error: '密码重置失败，请稍后重试' }, { status: 500 });
  }
}
