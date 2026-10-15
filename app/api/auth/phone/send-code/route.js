import { NextResponse } from 'next/server';
import { sendSmsVerificationCode } from '@/lib/sms';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
    if (guarded) return guarded;
    const body = await request.json();
    const phone = String(body.phone || '').trim();
    const countryCode = String(body.countryCode || '+86').trim();
    const ip = getClientIp(request);
    const limit = await consumeRateLimit({ scope: 'auth_sms_ip', subject: ip, limit: 10, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    if (!phone) {
      return NextResponse.json({ error: '请输入手机号码' }, { status: 400 });
    }

    const result = await sendSmsVerificationCode({ phone, countryCode, type: 'login', ip });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      notice: result.notice,
      expiresInSeconds: result.expiresInSeconds,
      devCode: result.devCode
    });
  } catch (error) {
    console.error('[auth/phone/send-code]', error);
    return NextResponse.json({ error: '验证码发送失败，请稍后重试' }, { status: 500 });
  }
}
