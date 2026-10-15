import { getUserFromRequest, json } from '@/lib/services/auth';
import { getUserCreditLedger } from '@/lib/services/credits';
import { getCreditWallet } from '@/lib/financial/creditService.js';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const limit = Math.min(100, Number(request.nextUrl.searchParams.get('limit') || 50));
  try {
    const [wallet, ledger] = await Promise.all([
      getCreditWallet(user.id),
      getUserCreditLedger(user.id, limit),
    ]);
    const legacyCredits = user.credits == null || !Number.isFinite(Number(user.credits)) ? null : Number(user.credits);
    return json({
      usage: {
        credits: wallet?.totalAvailable ?? legacyCredits,
        subscriptionCredits: wallet?.subscriptionCredits ?? null,
        perpetualCredits: wallet?.perpetualCredits ?? null,
        dailyFree: wallet?.dailyFree ?? null,
      },
      ledger: Array.isArray(ledger) ? ledger : [],
    });
  } catch (error) {
    console.error('[api/billing/usage]', error);
    return json({ error: '暂时无法获取额度和流水数据，请稍后重试' }, { status: 503 });
  }
}
