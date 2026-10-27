import crypto from 'node:crypto';
import { getUserFromRequest } from '@/lib/services/auth';
import { getCanvasUploadAssetByIdempotencyHash, recordUserAsset, toClientAsset } from '@/lib/services/assets';
import { consumeRateLimit, rateLimitResponse } from '@/lib/security/requestGuard';
import { ingestBuffer, storedLocationFields } from '@/lib/storage/storageService';
import { publicErrorMessage } from '@/lib/security/publicError';
import { canvasJson, canvasMutationGuard, canvasPreflight, canvasResponse } from '@/lib/canvas/http';
import { getCanvasSessionOwnerConflict } from '@/lib/canvas/sessionOwner';
import { assertStorageQuota } from '@/lib/services/assetLibrary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request) {
  return canvasPreflight(request, 'POST, OPTIONS');
}

export async function POST(request) {
  const guarded = canvasMutationGuard(request, { maxBytes: 104 * 1024 * 1024, multipart: true });
  if (guarded) return guarded;
  const requestId = crypto.randomUUID();
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  let stage = 'rate_limit';
  try {
    const limit = await consumeRateLimit({ scope: 'canvas_asset_upload', subject: user.id, limit: 120, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return canvasResponse(request, rateLimitResponse(limit));
    stage = 'form_data';
    const form = await request.formData();
    stage = 'owner_check';
    const ownerConflict = getCanvasSessionOwnerConflict(user.id, form.get('expectedOwnerUserId'));
    if (ownerConflict) return canvasJson(request, ownerConflict, { status: 409 });
    stage = 'file_validation';
    const file = form.get('file');
    const idempotencyKey = String(request.headers.get('idempotency-key') || '').trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return canvasJson(request, { error: '素材上传必须提供有效的幂等键', code: 'IDEMPOTENCY_REQUIRED' }, { status: 422 });
    }
    const mimeType = String(file?.type || '').toLowerCase();
    const assetType = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : '';
    if (!file || typeof file.arrayBuffer !== 'function' || !assetType) {
      return canvasJson(request, { error: '请提供有效的图片、视频或音频文件', code: 'INVALID_UPLOAD' }, { status: 400 });
    }
    const maxBytes = assetType === 'image' ? 20 * 1024 * 1024 : 100 * 1024 * 1024;
    if (file.size > maxBytes) return canvasJson(request, { error: '素材超过 允许的上传大小', code: 'UPLOAD_TOO_LARGE' }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const idempotencyHash = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
    stage = 'idempotency_lookup';
    const existing = await getCanvasUploadAssetByIdempotencyHash(user.id, idempotencyHash);
    if (existing) {
      if (existing.checksum !== checksum) {
        return canvasJson(request, { error: '相同幂等键不能用于不同素材内容', code: 'UPLOAD_IDEMPOTENCY_CONFLICT' }, { status: 409 });
      }
      stage = 'client_asset';
      return canvasJson(request, {
        asset: await toClientAsset(existing),
        contentUrl: `/api/canvas/assets/${encodeURIComponent(existing.id)}/content`,
        idempotent: true,
      }, { status: 200 });
    }
    await assertStorageQuota(user.id, file.size || buffer.length);
    const safeUserId = String(user.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const objectKey = 'uploads/' + safeUserId + '/canvas/' + idempotencyHash + '-' + checksum + '.bin';
    stage = 'storage_ingest';
    const stored = await ingestBuffer({
      body: buffer,
      userId: user.id,
      type: assetType,
      filename: file.name || 'canvas-reference',
      contentType: file.type,
      sourceType: 'canvas_upload',
      sourceProvider: 'canvas',
      objectKey,
    });
    stage = 'asset_record';
    const asset = await recordUserAsset(user.id, {
      assetType,
      studioId: 'canvas',
      title: String(form.get('title') || file.name || 'Canvas 素材').slice(0, 160),
      objectKey: stored.objectKey,
      previewObjectKey: stored.previewObjectKey || null,
      thumbnailObjectKey: stored.thumbnailObjectKey || null,
      ...storedLocationFields(stored),
      mimeType: stored.mimeType,
      fileSizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      visibility: 'private',
      sourceType: 'user_upload',
      sourceProvider: 'canvas',
      source: '画布上传',
      storageStatus: 'ready',
      generationParams: { canvas_upload_idempotency_hash: idempotencyHash },
      originalFilename: file.name || null,
      filename: file.name || null,
      extension: stored.extension || null,
    });
    if (asset.checksum !== checksum) {
      return canvasJson(request, { error: '相同幂等键不能用于不同素材内容', code: 'UPLOAD_IDEMPOTENCY_CONFLICT' }, { status: 409 });
    }
    stage = 'client_asset';
    return canvasJson(request, {
      asset: await toClientAsset(asset),
      contentUrl: `/api/canvas/assets/${encodeURIComponent(asset.id)}/content`,
      idempotent: false,
    }, { status: 201 });
  } catch (error) {
    const rawCode = String(error?.code || 'UPLOAD_FAILED');
    const errorCode = /^[A-Za-z0-9_-]{1,64}$/.test(rawCode) ? rawCode : 'UPLOAD_FAILED';
    const rawName = String(error?.name || 'Error');
    const errorName = /^[A-Za-z0-9_-]{1,64}$/.test(rawName) ? rawName : 'Error';
    console.error('[canvas-assets-upload-failed]', JSON.stringify({ requestId, stage, errorName, errorCode }));
    const status = error.code === 'UPLOAD_IDEMPOTENCY_CONFLICT' ? 409
      : error.code === 'STORAGE_QUOTA_EXCEEDED' ? 413
      : error.code === 'STORAGE_FILE_TOO_LARGE' ? 413
      : String(error.code || '').startsWith('STORAGE_') ? 422 : 503;
    const response = canvasJson(request, { error: publicErrorMessage(error, '上传参考图片失败'), code: error.code || 'UPLOAD_FAILED', requestId }, { status });
    response.headers.set('X-SupDance-Request-ID', requestId);
    return response;
  }
}
