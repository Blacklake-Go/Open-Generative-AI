import { json } from '@/lib/services/auth';
import { recordRemixCount } from '@/lib/services/community';
import { getUserFromRequest } from '@/lib/services/auth';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录后再使用做同款' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const { id } = await params;
    const limit = await consumeRateLimit({ scope: 'community_remix_user', subject: user.id, limit: 60, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    await recordRemixCount(id);
    return json({ ok: true });
  } catch (error) {
    return json({ error: '记录做同款失败' }, { status: 500 });
  }
}
