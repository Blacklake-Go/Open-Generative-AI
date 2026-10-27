import { Readable } from 'node:stream';
import { getUserFromRequest } from '@/lib/services/auth';
import { getUserAssetDownload, getUserAsset } from '@/lib/services/assets';
import { getAssetStorageAdapter, getAssetUrl } from '@/lib/storage/storageService';
import { canvasJson, canvasOriginGuard, canvasPreflight, canvasResponse } from '@/lib/canvas/http';

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
  const { id } = await params;
  const [asset, download] = await Promise.all([
    getUserAsset(user.id, id),
    getUserAssetDownload(user.id, id),
  ]);
  if (!asset || !download?.objectKey || download.deletedAt) {
    return canvasJson(request, { error: '素材不存在或尚未归档到 对象存储', code: 'ASSET_NOT_FOUND' }, { status: 404 });
  }
  if (!/^(image|video|audio)\//i.test(String(asset.mimeType || ''))) {
    return canvasJson(request, { error: '该素材类型不支持预览', code: 'ASSET_PREVIEW_UNSUPPORTED' }, { status: 415 });
  }
  const wantsPreview = new URL(request.url).searchParams.get('preview') === '1';
  const previewObjectKey = download.previewObjectKey || download.thumbnailObjectKey || null;
  let objectKey = wantsPreview && previewObjectKey ? previewObjectKey : download.objectKey;
  let contentType = objectKey !== download.objectKey ? 'image/webp' : asset.mimeType;
  try {
    const range = request.headers.get('range');
    const location = {
      provider: download.provider,
      locationId: download.locationId,
      bucket: download.bucket,
      region: download.region,
    };
    const adapter = await getAssetStorageAdapter(location);
    if (!adapter) {
      return canvasJson(request, { error: '素材所属存储位置不可用', code: 'STORAGE_LOCATION_UNAVAILABLE' }, { status: 503 });
    }
    if (objectKey !== download.objectKey && typeof adapter.getMetadata === 'function') {
      try {
        const previewMetadata = await adapter.getMetadata({ key: objectKey });
        if (!previewMetadata || !(Number(previewMetadata.size) > 0)) {
          objectKey = download.objectKey;
          contentType = asset.mimeType;
        }
      } catch {
        objectKey = download.objectKey;
        contentType = asset.mimeType;
      }
    }
    if (adapter.provider === 'amh'
      && typeof adapter.downloadStream === 'function'
      && !/^https?:\/\//i.test(objectKey)
      && !String(objectKey).startsWith('data:')) {
      const metadata = await adapter.getMetadata({ key: objectKey });
      const size = Number(metadata.size) || 0;
      const rangeMatch = range?.match(/^bytes=(\d*)-(\d*)$/);
      let status = 200;
      let rangeHeader = null;
      let start = 0;
      let end = Math.max(0, size - 1);

      if (rangeMatch) {
        if (!size) {
          return canvasResponse(request, new Response(null, {
            status: 416,
            headers: { 'Content-Range': 'bytes */0', 'Content-Length': '0' },
          }));
        }
        const [, startValue, endValue] = rangeMatch;
        if (!startValue) {
          const suffixLength = Number(endValue);
          if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
            return canvasResponse(request, new Response(null, {
              status: 416,
              headers: { 'Content-Range': `bytes */${size}`, 'Content-Length': '0' },
            }));
          }
          start = Math.max(0, size - suffixLength);
          end = size - 1;
        } else {
          start = Number(startValue);
          end = endValue ? Number(endValue) : size - 1;
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
            return canvasResponse(request, new Response(null, {
              status: 416,
              headers: { 'Content-Range': `bytes */${size}`, 'Content-Length': '0' },
            }));
          }
          end = Math.min(end, size - 1);
        }
        status = 206;
        rangeHeader = `bytes=${start}-${end}`;
      }

      const headers = new Headers({
        'Content-Type': contentType,
        'Content-Length': String(status === 206 ? end - start + 1 : size),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
      });
      if (status === 206) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
      if (metadata.lastModified) headers.set('Last-Modified', new Date(metadata.lastModified).toUTCString());
      const body = headOnly
        ? null
        : Readable.toWeb(await adapter.downloadStream({ key: objectKey, range: rangeHeader }));
      return canvasResponse(request, new Response(body, { status, headers }));
    }

    const signedUrl = await getAssetUrl({ ...location, objectKey, visibility: download.visibility || 'private' });
    const requestHeaders = new Headers();
    if (range && /^bytes=\d*-\d*(,\d*-\d*)*$/.test(range)) requestHeaders.set('Range', range);
    let upstream;
    if (/^https?:\/\//i.test(signedUrl)) {
      upstream = await fetch(signedUrl, {
        method: headOnly ? 'HEAD' : 'GET',
        headers: requestHeaders,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } else {
      const localUrl = new URL(signedUrl, 'http://127.0.0.1:3100');
      upstream = await fetch(localUrl, {
        method: headOnly ? 'HEAD' : 'GET',
        headers: requestHeaders,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    }
    if (!upstream.ok && upstream.status !== 206) {
      return canvasJson(request, { error: '读取素材失败', code: 'ASSET_READ_FAILED' }, { status: 502 });
    }
    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    });
    for (const name of ['content-length', 'content-range', 'last-modified']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return canvasResponse(request, new Response(headOnly ? null : upstream.body, { status: upstream.status, headers }));
  } catch (error) {
    console.error('[api/canvas/assets/content]', { code: error?.code || 'ASSET_READ_FAILED' });
    return canvasJson(request, { error: '读取素材失败', code: 'ASSET_READ_FAILED' }, { status: 502 });
  }
}

export function GET(request, context) {
  return serveAsset(request, context, false);
}

export function HEAD(request, context) {
  return serveAsset(request, context, true);
}
