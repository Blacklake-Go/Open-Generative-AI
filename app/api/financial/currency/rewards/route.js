import { getUserFromRequest, json } from '@/lib/services/auth';
import { equipCoinReward, listCoinRewards, redeemCoinReward } from '@/lib/services/coinRewards';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  const rewards = await listCoinRewards(user?.id || null);
  return json({ rewards });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录后再兑换头像框' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'currency_reward_user', subject: user.id, limit: 30, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const body = await request.json();
    const action = body?.action || 'redeem';
    const rewardSlug = body?.rewardSlug;
    if (action === 'equip') {
      return json(await equipCoinReward({ userId: user.id, rewardSlug }));
    }
    if (action !== 'redeem') return json({ error: '不支持的兑换操作' }, { status: 400 });

    const idempotencyKey = request.headers.get('x-idempotency-key') || body?.idempotencyKey;
    return json(await redeemCoinReward({ userId: user.id, rewardSlug, idempotencyKey }));
  } catch (error) {
    console.error('[api/financial/currency/rewards]', error);
    return json({ error: publicErrorMessage(error, '头像框兑换失败') }, { status: 400 });
  }
}
