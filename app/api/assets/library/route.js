import { getUserFromRequest, json } from '@/lib/services/auth';
import { getLibraryAssets, createLibraryAsset } from '@/lib/services/assetLibrary';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const params = request.nextUrl.searchParams;
  try {
    const result = await getLibraryAssets(user.id, {
      status: params.get('status') || 'ready',
      kind: params.get('kind') || 'all',
      category: params.get('category') || 'all',
      folderId: params.get('folderId') || params.get('folder_id') || 'all',
      uncategorized: params.get('uncategorized') === 'true' || params.get('uncategorized') === '1',
      search: params.get('q') || params.get('search') || '',
      page: Number(params.get('page')) || 1,
      pageSize: Number(params.get('pageSize') || params.get('page_size')) || 40,
    });
    return json(result);
  } catch (error) {
    console.error('[GET /api/assets/library]', error);
    return json({ error: publicErrorMessage(error, '获取资产库失败') }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 1024 * 1024 });
  if (guarded) return guarded;
  const limit = await consumeRateLimit({ scope: 'asset_library_create_user', subject: user.id, limit: 300, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const body = await request.json();
    const asset = await createLibraryAsset(user.id, body);
    return json({ asset }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/assets/library]', error);
    const status = error.code === 'INVALID_ASSET_DATA' ? 400 : 422;
    return json({ error: publicErrorMessage(error, '创建素材失败') }, { status });
  }
}
