import { NextResponse } from 'next/server';
import { getClientIp, guardMutation } from '@/lib/security/requestGuard';
import { requestUsernameRecovery } from '@/lib/services/passwordReset';

export const runtime = 'nodejs';

export async function POST(request) {
  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    const result = await requestUsernameRecovery({ email: body.email, locale: body.locale, ip: getClientIp(request) });
    if (result.error) return NextResponse.json({ error: result.message, code: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/username-recovery/email-request]', { code: error?.code || 'USERNAME_RECOVERY_REQUEST_FAILED' });
    return NextResponse.json({ error: '暂时无法发送验证码，请稍后重试' }, { status: 503 });
  }
}
