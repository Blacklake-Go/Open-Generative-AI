import { getUserFromRequest, json } from '@/lib/services/auth';
import { getLibraryAsset, updateLibraryAsset, purgeLibraryAssets } from '@/lib/services/assetLibrary';
import { deleteUserAsset } from '@/lib/services/assets';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const { id } = await params;
  if (!id) return json({ error: '缺少资产标识' }, { status: 400 });

  const asset = await getLibraryAsset(user.id, id);
  if (!asset) return json({ error: '资产不存在或已被删除' }, { status: 404 });
  return json({ asset });
}

export async function PATCH(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 1024 * 1024 });
  if (guarded) return guarded;
  const limit = await consumeRateLimit({ scope: 'asset_library_update_user', subject: user.id, limit: 600, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  const { id } = await params;
  if (!id) return json({ error: '缺少资产标识' }, { status: 400 });

  try {
    const body = await request.json();
    const asset = await updateLibraryAsset(user.id, id, body);
    return json({ asset });
  } catch (error) {
    console.error('[PATCH /api/assets/library/[id]]', error);
    const status = error.code === 'ASSET_NOT_FOUND' ? 404
      : error.code === 'FOLDER_NOT_FOUND' ? 400
        : error.code === 'INVALID_ASSET_DATA' ? 400
          : 422;
    return json({ error: publicErrorMessage(error, '更新素材失败') }, { status });
  }
}

export async function DELETE(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;
  const limit = await consumeRateLimit({ scope: 'asset_library_delete_user', subject: user.id, limit: 600, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  const { id } = await params;
  if (!id) return json({ error: '缺少资产标识' }, { status: 400 });

  const purge = request.nextUrl.searchParams.get('purge') === 'true';

  try {
    const result = purge
      ? await purgeLibraryAssets(user.id, [id])
      : await deleteUserAsset(user.id, id);
    return json({ success: true, ...result });
  } catch (error) {
    console.error('[DELETE /api/assets/library/[id]]', error);
    const status = error.code === 'ASSET_NOT_FOUND' ? 404 : 422;
    return json({ error: publicErrorMessage(error, purge ? '彻底删除素材失败' : '移入回收站失败') }, { status });
  }
}
