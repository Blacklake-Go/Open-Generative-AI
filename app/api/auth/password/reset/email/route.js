import { NextResponse } from 'next/server';
import { getClientIp, guardMutation } from '@/lib/security/requestGuard';
import { resetPasswordByEmail } from '@/lib/services/passwordReset';

export const runtime = 'nodejs';

const STATUS_BY_ERROR = {
  EMAIL_INVALID: 400,
  EMAIL_CODE_INVALID: 400,
  EMAIL_CODE_EXPIRED: 400,
  EMAIL_CODE_ATTEMPTS_EXCEEDED: 429,
  PASSWORD_INVALID: 400,
};

export async function POST(request) {
  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }
    const result = await resetPasswordByEmail({
      email: body.email, code: body.code, newPassword: body.newPassword, ip: getClientIp(request),
    });
    if (result.error) {
      return NextResponse.json(
        { error: result.message, code: result.error },
        { status: STATUS_BY_ERROR[result.error] || 400 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/password-reset/email]', { code: error?.code || 'PASSWORD_RESET_FAILED' });
    return NextResponse.json({ error: '密码重置失败，请稍后重试' }, { status: 500 });
  }
}
