import { getUserFromRequest } from '@/lib/services/auth';
import { getUserAssets } from '@/lib/services/assets';
import { canvasJson, canvasOriginGuard, canvasPreflight } from '@/lib/canvas/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request) {
  return canvasPreflight(request, 'GET, OPTIONS');
}

export async function GET(request) {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.get('page') || '1', 10) || 1));
  const limit = Math.max(1, Math.min(50, Number.parseInt(params.get('limit') || '30', 10) || 30));
  const type = ['all', 'image', 'video', 'audio'].includes(params.get('type')) ? params.get('type') : 'all';
  try {
    const result = await getUserAssets(user.id, { assetType: type, search: String(params.get('search') || '').slice(0, 160), page, limit, sort: 'newest' });
    return canvasJson(request, {
      assets: result.assets.map((asset) => ({
        id: asset.id,
        type: asset.type,
        title: asset.title,
        url: `/api/canvas/assets/${encodeURIComponent(asset.id)}/content`,
        thumbnailUrl: null,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        size: asset.size,
        createdAt: asset.createdAt,
      })),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error('[api/canvas/assets]', { code: error?.code || 'ASSET_LIST_FAILED' });
    return canvasJson(request, { error: '读取 SupDance 素材库失败', code: 'ASSET_LIST_FAILED' }, { status: 503 });
  }
}
