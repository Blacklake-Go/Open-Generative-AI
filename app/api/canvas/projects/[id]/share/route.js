import { getUserFromRequest } from '@/lib/services/auth';
import { consumeRateLimit, rateLimitResponse } from '@/lib/security/requestGuard';
import { canvasJson, canvasMutationGuard, canvasOriginGuard, canvasPreflight, canvasResponse } from '@/lib/canvas/http';
import { createCanvasShareToken, hashCanvasShareToken } from '@/lib/canvas/projectShare';
import { getCanvasProjectShareStatus, issueCanvasProjectShare, revokeCanvasProjectShare } from '@/lib/repositories/canvasProjectShares';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request) {
  return canvasPreflight(request, 'GET, POST, DELETE, OPTIONS');
}

export async function GET(request, { params }) {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  const { id } = await params;
  const share = await getCanvasProjectShareStatus(user.id, id);
  return canvasJson(request, { share: share ? { active: true, createdAt: share.created_at } : { active: false } });
}

export async function POST(request, { params }) {
  const guarded = canvasMutationGuard(request, { maxBytes: 1024 });
  if (guarded) return guarded;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  const limit = await consumeRateLimit({ scope: 'canvas_project_share_create', subject: user.id, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return canvasResponse(request, rateLimitResponse(limit));
  const { id } = await params;
  const token = createCanvasShareToken();
  const share = await issueCanvasProjectShare(user.id, id, hashCanvasShareToken(token));
  if (!share) return canvasJson(request, { error: '画布不存在', code: 'PROJECT_NOT_FOUND' }, { status: 404 });
  return canvasJson(request, { share: { active: true, createdAt: share.created_at, path: `/canvas/share/${token}` } }, { status: 201 });
}

export async function DELETE(request, { params }) {
  const guarded = canvasMutationGuard(request, { maxBytes: 1024 });
  if (guarded) return guarded;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  const limit = await consumeRateLimit({ scope: 'canvas_project_share_revoke', subject: user.id, limit: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return canvasResponse(request, rateLimitResponse(limit));
  const { id } = await params;
  const share = await revokeCanvasProjectShare(user.id, id);
  if (!share) return canvasJson(request, { error: '没有有效的画布分享', code: 'SHARE_NOT_FOUND' }, { status: 404 });
  return canvasJson(request, { ok: true, revokedAt: share.revoked_at });
}
