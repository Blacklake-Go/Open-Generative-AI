import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { verifyCoupon } from '@/lib/services/coupons';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: '请先登录后再核验卡密' }, { status: 401 });
  }

  try {
    const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
    if (guarded) return guarded;
    const limit = await consumeRateLimit({ scope: 'coupon_verify_user', subject: user.id, limit: 60, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const body = await request.json().catch(() => ({}));
    const code = body.code;
    const result = await verifyCoupon({ code, user });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[coupons/verify]', error);
    return NextResponse.json({ error: '卡密核验异常' }, { status: 500 });
  }
}
