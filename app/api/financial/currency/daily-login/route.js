import { getUserFromRequest, json } from '@/lib/services/auth';
import { getDailyLoginStatus, claimDailyLoginCoin } from '@/lib/financial/currencyService';
import { NextResponse } from 'next/server';
import { consumeRateLimit, guardMutation } from '@/lib/security/requestGuard';


/** 限流主体：登录态按用户，其余按客户端 IP；XFF 由 nginx 单向写入。 */
function ipOf(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export const runtime = 'nodejs';

// GET: 获取今日登录领币状态与当前余额
export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return json({ claimed: false, canClaim: false, balance: 0 });
  }
  const status = await getDailyLoginStatus(user.id);
  return json(status);
}

// POST: 领取今日登录奖励 1 K币 (参考 B 站硬币机制)
export async function POST(request) {
  const deniedByOrigin = guardMutation(request);
  if (deniedByOrigin) return deniedByOrigin;
  const user = await getUserFromRequest(request);
  const rl = await consumeRateLimit({
    scope: 'currency.daily-login',
    subject: user?.id || ipOf(request),
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: '请求过于频繁，请稍后再试' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } });
  }
  if (!user) {
    return json({ error: '请先登录后再领取登录奖励' }, { status: 401 });
  }
  try {
    const result = await claimDailyLoginCoin(user.id);
    return json(result);
  } catch (err) {
    return json({ error: err.message || '领取失败' }, { status: 500 });
  }
}
