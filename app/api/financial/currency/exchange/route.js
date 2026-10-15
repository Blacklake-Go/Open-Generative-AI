import { getUserFromRequest, json } from '../../../../../lib/services/auth.js';
import { exchangeCoinToCredits, buyVipWithCoin } from '../../../../../lib/financial/index.js';
import { consumeRateLimit, guardMutation } from '../../../../../lib/security/requestGuard.js';
import { publicErrorMessage } from '../../../../../lib/security/publicError.js';


/** 限流主体：登录态按用户，其余按客户端 IP；XFF 由 nginx 单向写入。 */
function ipOf(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  const rl = await consumeRateLimit({
    scope: 'currency.exchange',
    subject: user?.id || ipOf(request),
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return json({ error: '请求过于频繁，请稍后再试' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSeconds) },
    });
  }
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const { type = 'credits', coinAmount, planId } = body;
    const idempotencyKey = request.headers.get('x-idempotency-key') || null;
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      return json({ error: '缺少有效的 x-idempotency-key，重复请求可能造成重复扣款' }, { status: 422 });
    }

    if (type === 'credits') {
      if (!coinAmount || Number(coinAmount) <= 0) {
        return json({ error: '请输入有效的兑换 K 币数量' }, { status: 400 });
      }
      const result = await exchangeCoinToCredits({
        userId: user.id,
        coinAmount: Number(coinAmount),
        idempotencyKey,
      });
      return json(result);
    } else if (type === 'vip') {
      if (!planId) {
        return json({ error: '请选择要购买的会员方案' }, { status: 400 });
      }
      const result = await buyVipWithCoin({
        userId: user.id,
        planId,
        idempotencyKey,
      });
      return json(result);
    } else {
      return json({ error: '不支持的兑换类型' }, { status: 400 });
    }
  } catch (error) {
    console.error('[api/financial/currency/exchange]', error);
    return json({ error: publicErrorMessage(error, '兑换操作失败') }, { status: 400 });
  }
}
