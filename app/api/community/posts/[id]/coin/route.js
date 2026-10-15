import { getUserFromRequest, json } from '@/lib/services/auth';
import { queryOne } from '@/lib/application/dataAccess.js';
import { tipPostCoins } from '@/lib/financial/currencyService';
import { consumeRateLimit, guardMutation } from '@/lib/security/requestGuard';


/** 限流主体：登录态按用户，其余按客户端 IP；XFF 由 nginx 单向写入。 */
function ipOf(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export const runtime = 'nodejs';

// GET: 获取当前用户对该作品的投币数与作品累计投币总数
export async function GET(request, { params }) {
  const { id: postId } = await params;
  const user = await getUserFromRequest(request);

  const post = await queryOne('SELECT id, coins_count, user_id FROM ai_studio.community_posts WHERE id = $1', [postId]);
  if (!post) {
    return json({ error: '作品不存在' }, { status: 404 });
  }

  let userTipped = 0;
  if (user) {
    const historyRow = await queryOne(`
      SELECT COALESCE(SUM(amount), 0) as total_tipped
      FROM ops_bill.currency_journal_entries
      WHERE user_id = $1 AND biz_type = 'POST_COIN_TIP' AND biz_id = $2
    `, [user.id, String(postId)]);
    userTipped = Number(historyRow?.total_tipped || 0);
  }

  return json({
    postId,
    totalCoins: Number(post.coins_count || 0),
    userTipped,
    isAuthor: user ? user.id === post.user_id : false,
    maxTipPerPost: 2,
  });
}

// POST: 给作品投币 (1 或 2 币)
export async function POST(request, { params }) {
  const deniedByOrigin = guardMutation(request);
  if (deniedByOrigin) return deniedByOrigin;
  const { id: postId } = await params;
  const user = await getUserFromRequest(request);
  const rl = await consumeRateLimit({
    scope: 'community.coin',
    subject: user?.id || ipOf(request),
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return json({ error: '请求过于频繁，请稍后再试' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } });
  }
  if (!user) {
    return json({ error: '请先登录后再投币' }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const amount = parseInt(body.amount || 1, 10);
  if (amount !== 1 && amount !== 2) {
    return json({ error: '单次投币仅支持 1 或 2 枚 K 币' }, { status: 400 });
  }

  try {
    const result = await tipPostCoins({
      userId: user.id,
      postId,
      amount,
    });
    return json(result);
  } catch (err) {
    return json({ error: err.message || '投币失败' }, { status: 400 });
  }
}
