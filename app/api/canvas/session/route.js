import crypto from 'node:crypto';
import { getUserFromRequest, json, clearSessionCookie, deleteSession } from '@/lib/services/auth';
import { getEntitlements } from '@/lib/services/billing';
import { consumeRateLimit, rateLimitResponse } from '@/lib/security/requestGuard';
import { canvasJson, canvasMutationGuard, canvasOriginGuard, canvasPreflight, canvasResponse } from '@/lib/canvas/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request) {
  return canvasPreflight(request, 'GET, POST, OPTIONS');
}

export async function GET(request) {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const entitlements = await getEntitlements(user.id);
    return canvasJson(request, {
      user: {
        id: user.id,
        userNumber: user.user_number || user.userNumber || String(user.id).slice(-6),
        displayName: user.display_name || user.displayName || user.nickname || `创作者#${user.id}`,
        avatar: user.avatar || user.avatar_url || user.avatarUrl || null,
        email: user.email || null,
        phone: user.phone || null,
        isAdmin: Boolean(user.role === 'admin' || user.is_admin),
        kcoins: Number(user.kcoins || 0),
      },
      credits: Number(entitlements?.creditBuckets?.totalAvailable ?? entitlements?.credits ?? 0),
      subscription: {
        planId: entitlements?.planId || 'free',
        planName: entitlements?.planName || 'Free',
        isPaid: Boolean(entitlements?.isPaidSubscription),
        exclusiveFeatures: Array.isArray(entitlements?.exclusiveFeatures) ? entitlements.exclusiveFeatures : [],
        hasCanvasPremiumTools: Boolean(entitlements?.hasCanvasPremiumTools),
      },
    });
  } catch (error) {
    console.error('[api/canvas/session]', { code: error?.code || 'SESSION_LOOKUP_FAILED' });
    return canvasJson(request, { error: '读取 账户状态失败', code: 'SESSION_LOOKUP_FAILED' }, { status: 503 });
  }
}

export async function POST(request) {
  const guarded = canvasMutationGuard(request, { maxBytes: 4 * 1024 });
  if (guarded) return guarded;
  const token = request.cookies.get('ko_session')?.value;
  const subject = token
    ? crypto.createHash('sha256').update(token).digest('hex')
    : 'missing-session';
  const limit = await consumeRateLimit({ scope: 'canvas_session_logout', subject, limit: 10, windowMs: 60 * 1000 });
  if (!limit.allowed) return canvasResponse(request, rateLimitResponse(limit));
  await deleteSession(token);
  const response = json({ ok: true });
  clearSessionCookie(response,request);
  response.headers.set('Access-Control-Allow-Origin', request.headers.get('origin'));
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Vary', 'Origin');
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
