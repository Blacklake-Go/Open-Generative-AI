import { getUserFromRequest } from '@/lib/services/auth';
import { canvasJson, canvasOriginGuard, canvasPreflight } from '@/lib/canvas/http';
import { isCanvasShareToken, hashCanvasShareToken, rewriteCanvasShareAssetUrls } from '@/lib/canvas/projectShare';
import { getCanvasProjectShareByHash } from '@/lib/repositories/canvasProjectShares';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request) {
  return canvasPreflight(request, 'GET, OPTIONS');
}

export async function GET(request, { params }) {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  const { token } = await params;
  if (!isCanvasShareToken(token)) return canvasJson(request, { error: '分享链接无效或已撤销', code: 'SHARE_NOT_FOUND' }, { status: 404 });
  const share = await getCanvasProjectShareByHash(hashCanvasShareToken(token));
  if (!share) return canvasJson(request, { error: '分享链接无效或已撤销', code: 'SHARE_NOT_FOUND' }, { status: 404 });
  const snapshot = typeof share.snapshot_json === 'string' ? JSON.parse(share.snapshot_json) : share.snapshot_json;
  return canvasJson(request, { project: {
    id: share.project_id,
    name: share.name,
    version: Number(share.version),
    snapshot: rewriteCanvasShareAssetUrls(snapshot, token),
  } });
}
