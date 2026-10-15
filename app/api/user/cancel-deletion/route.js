import { getUserFromRequest, json } from '@/lib/services/auth';
import { cancelUserDeletion } from '@/lib/services/userDeletion.js';
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
    const limit = await consumeRateLimit({
      scope: 'user_cancel_deletion',
      subject: user.id,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);

    const result = await cancelUserDeletion({
      userId: user.id,
      ip: ipOf(request),
    });

    return json({
      success: true,
      message: '账户注销申请已撤销，欢迎回来！所有资产与记录已完整恢复。',
      data: result,
    });
  } catch (error) {
    console.error('[cancel-deletion error]', error);
    return json({ error: error.message || '撤销注销失败，请稍后重试' }, { status: 400 });
  }
}
