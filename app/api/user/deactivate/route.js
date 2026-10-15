import { getUserFromRequest, json } from '@/lib/services/auth';
import { requestUserDeletion } from '@/lib/services/userDeletion.js';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

function ipOf(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'user_deactivate', subject: user.id, limit: 3, windowMs: 24 * 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : 'user_requested';

    const result = await requestUserDeletion({
      userId: user.id,
      reason,
      ip: ipOf(request),
    });

    const response = json({
      success: true,
      message: '注销申请已提交，系统已为您开启 3 天后悔保护期。在 3 天内您可以随时重新登录撤销申请；到期未撤销将自动永久清除所有数据。',
      data: result,
    });
    response.cookies.delete('ko_session');
    return response;
  } catch (error) {
    console.error('[deactivate error]', error);
    return json({ error: error.message || '账户注销失败，请联系客服' }, { status: 500 });
  }
}
