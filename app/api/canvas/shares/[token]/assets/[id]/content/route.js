import { getUserFromRequest } from '@/lib/services/auth';
import { getUserAssetDownload, getUserAsset } from '@/lib/services/assets';
import { getAssetUrl } from '@/lib/storage/storageService';
import { canvasJson, canvasOriginGuard, canvasPreflight, canvasResponse } from '@/lib/canvas/http';
import { collectCanvasShareAssetIds, hashCanvasShareToken, isCanvasShareToken } from '@/lib/canvas/projectShare';
import { getCanvasProjectShareByHash } from '@/lib/repositories/canvasProjectShares';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request) {
  return canvasPreflight(request, 'GET, HEAD, OPTIONS');
}

async function serveAsset(request, { params }, headOnly = false) {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  const { token, id } = await params;
  if (!isCanvasShareToken(token)) return canvasJson(request, { error: '分享链接无效或已撤销', code: 'SHARE_NOT_FOUND' }, { status: 404 });
  const share = await getCanvasProjectShareByHash(hashCanvasShareToken(token));
  if (!share) return canvasJson(request, { error: '分享链接无效或已撤销', code: 'SHARE_NOT_FOUND' }, { status: 404 });
  const snapshot = typeof share.snapshot_json === 'string' ? JSON.parse(share.snapshot_json) : share.snapshot_json;
  if (!collectCanvasShareAssetIds(snapshot).has(id)) return canvasJson(request, { error: '分享画布中没有该素材', code: 'SHARED_ASSET_NOT_FOUND' }, { status: 404 });
  const [asset, download] = await Promise.all([
    getUserAsset(share.owner_user_id, id),
    getUserAssetDownload(share.owner_user_id, id),
  ]);
  if (!asset || !download?.objectKey || download.deletedAt) return canvasJson(request, { error: '素材不存在或尚未归档到对象存储', code: 'ASSET_NOT_FOUND' }, { status: 404 });
  if (!/^(image|video|audio)\//i.test(String(asset.mimeType || ''))) return canvasJson(request, { error: '该素材类型不支持预览', code: 'ASSET_PREVIEW_UNSUPPORTED' }, { status: 415 });
  try {
    const objectKey = new URL(request.url).searchParams.get('preview') === '1'
      ? download.previewObjectKey || download.thumbnailObjectKey || download.objectKey
      : download.objectKey;
    const previewing = objectKey !== download.objectKey;
    const signedUrl = await getAssetUrl({
      provider: download.provider,
      locationId: download.locationId,
      bucket: download.bucket,
      region: download.region,
      objectKey,
      visibility: download.visibility || 'private',
    });
    const upstreamUrl = /^https?:\/\//i.test(signedUrl) ? signedUrl : new URL(signedUrl, 'http://127.0.0.1:3100').toString();
    const headers = new Headers();
    const range = request.headers.get('range');
    if (range && /^bytes=\d*-\d*(,\d*-\d*)*$/.test(range)) headers.set('Range', range);
    const upstream = await fetch(upstreamUrl, {
      method: headOnly ? 'HEAD' : 'GET',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok && upstream.status !== 206) return canvasJson(request, { error: '读取素材失败', code: 'ASSET_READ_FAILED' }, { status: 502 });
    const responseHeaders = new Headers({
      'Content-Type': previewing ? 'image/webp' : asset.mimeType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    });
    for (const name of ['content-length', 'content-range', 'last-modified']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return canvasResponse(request, new Response(headOnly ? null : upstream.body, { status: upstream.status, headers: responseHeaders }));
  } catch (error) {
    console.error('[api/canvas/shares/asset-content]', { code: error?.code || 'SHARED_ASSET_READ_FAILED' });
    return canvasJson(request, { error: '读取分享素材失败', code: 'SHARED_ASSET_READ_FAILED' }, { status: 502 });
  }
}

export function GET(request, context) {
  return serveAsset(request, context, false);
}

export function HEAD(request, context) {
  return serveAsset(request, context, true);
}
