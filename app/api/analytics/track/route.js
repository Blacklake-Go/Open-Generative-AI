import { getUserFromRequest, json } from '@/lib/services/auth';
import { recordUserActivity } from '@/lib/services/activity';
import { consumeRateLimit, getClientIp, guardMutation } from '@/lib/security/requestGuard';


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
    scope: 'analytics.track',
    subject: user?.id || ipOf(request),
    limit: 180,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return json({ error: '请求过于频繁，请稍后再试' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSeconds) },
    });
  }
  const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const action = String(body.action || '').trim();
    if (!action) {
      return json({ error: '缺少 action 参数' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent');

    await recordUserActivity({
      userId: user?.id || null,
      sessionId: body.sessionId || null,
      category: String(body.category || 'client'),
      action,
      targetType: body.targetType || null,
      targetId: body.targetId || null,
      modelName: body.modelName || null,
      metadata: body.metadata || {},
      ip,
      userAgent,
    });

    return json({ ok: true });
  } catch (error) {
    console.error('[analytics/track error]', error);
    return json({ ok: false }, { status: 500 });
  }
}
