import { getUserFromRequest, json } from '@/lib/services/auth';
import {
  trashLibraryAssets,
  restoreLibraryAssets,
  purgeLibraryAssets,
  emptyLibraryTrash,
} from '@/lib/services/assetLibrary';
import { batchMoveUserAssets, batchSetFavoriteUserAssets } from '@/lib/services/assets';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 64 * 1024 });
  if (guarded) return guarded;
  const limit = await consumeRateLimit({ scope: 'asset_library_batch_user', subject: user.id, limit: 300, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const body = await request.json();
    const { action, assetIds, targetFolderId, value } = body || {};

    if (action === 'empty') {
      return json(await emptyLibraryTrash(user.id));
    }

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return json({ error: '请选择要操作的素材' }, { status: 400 });
    }

    if (action === 'trash') return json(await trashLibraryAssets(user.id, assetIds));
    if (action === 'restore') return json(await restoreLibraryAssets(user.id, assetIds));
    if (action === 'purge') return json(await purgeLibraryAssets(user.id, assetIds));
    if (action === 'move') return json(await batchMoveUserAssets(user.id, assetIds, targetFolderId || null));
    if (action === 'favorite') return json(await batchSetFavoriteUserAssets(user.id, assetIds, Boolean(value)));

    return json({ error: '不支持的操作类型' }, { status: 400 });
  } catch (error) {
    console.error('[POST /api/assets/library/batch]', error);
    const status = error.code === 'FOLDER_NOT_FOUND' ? 404
      : error.code === 'INVALID_ASSET_IDS' ? 400
        : 500;
    return json({ error: publicErrorMessage(error, '批量操作失败') }, { status });
  }
}
