import { getUserFromRequest, json } from '@/lib/services/auth';
import { consumeRateLimit, guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';
import { inspectStoredObject, prepareDirectUpload, generateStorageVariants, getStorageConfigAndAdapter, ingestBuffer, storedLocationFields } from '@/lib/storage/storageService';
import { recordUserAsset, toClientAsset } from '@/lib/services/assets';
import { assertStorageQuota } from '@/lib/services/assetLibrary';

/** 限流主体：登录态按用户，其余按客户端 IP；XFF 由 nginx 单向写入。 */
function ipOf(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function userKeyBelongsToUser(objectKey, userId) {
  const needle = `/${String(userId).replace(/[^a-zA-Z0-9_-]/g, '_')}/`;
  return String(objectKey || '').includes(needle);
}

export async function POST(request) {
  const contentType = request.headers.get('content-type') || '';
  const isMultipart = contentType.includes('multipart/form-data');

  const maxBytes = isMultipart ? 500 * 1024 * 1024 : 128 * 1024;
  const guarded = guardMutation(request, { maxBytes });
  if (guarded) return guarded;

  const user = await getUserFromRequest(request);
  const rl = await consumeRateLimit({
    scope: 'assets.upload',
    subject: user?.id || ipOf(request),
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return json({ error: '请求过于频繁，请稍后再试' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSeconds) },
    });
  }
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    if (isMultipart) {
      const formData = await request.formData();
      const file = formData.get('file') || formData.get('asset');
      if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') {
        return json({ error: '请提供有效的待上传文件' }, { status: 400 });
      }

      const rawType = String(formData.get('type') || file.type || '').toLowerCase();
      const requestedKind = String(formData.get('kind') || '').trim().toLowerCase();
      const isModel = requestedKind === 'model'
        || /\.(glb|gltf)$/i.test(file.name || '')
        || String(file.type || '').toLowerCase().startsWith('model/');
      const type = isModel ? 'other' : rawType.startsWith('video') ? 'video' : rawType.startsWith('audio') ? 'audio' : 'image';
      const kind = isModel ? 'model' : (requestedKind || null);
      const folderId = formData.get('folderId') || formData.get('folder_id') || null;
      const studioId = formData.get('studioId') || 'upload';
      const title = formData.get('title') || file.name || '上传素材';

      await assertStorageQuota(user.id, file.size);

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const stored = await ingestBuffer({
        body: buffer,
        userId: user.id,
        type,
        filename: file.name || 'asset',
        contentType: file.type || '',
        sourceType: 'user_upload',
        sourceProvider: 'direct_upload',
      });

      const asset = await recordUserAsset(user.id, {
        folderId,
        assetType: isModel ? 'other' : type,
        studioId,
        title,
        objectKey: stored.objectKey,
        previewObjectKey: stored.previewObjectKey || null,
        thumbnailObjectKey: stored.thumbnailObjectKey || null,
        ...storedLocationFields(stored),
        mediaUrl: stored.url,
        thumbnailUrl: stored.url,
        previewUrl: stored.url,
        originalFilename: file.name || null,
        filename: file.name || null,
        extension: stored.extension || null,
        mimeType: stored.mimeType,
        fileSizeBytes: stored.sizeBytes,
        width: stored.width || Number(formData.get('width')) || null,
        height: stored.height || Number(formData.get('height')) || null,
        durationSeconds: Number(formData.get('durationSeconds')) || null,
        checksum: stored.checksum,
        visibility: 'private',
        sourceType: 'user_upload',
        storageStatus: 'ready',
        kind,
        category: formData.get('category') || 'other',
        source: formData.get('source') || null,
        note: formData.get('note') || null,
        tags: String(formData.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 40),
      });

      const clientAsset = await toClientAsset(asset);
      return json({
        success: true,
        asset: clientAsset,
        url: clientAsset?.url || stored.url,
      }, { status: 201 });
    }

    const body = await request.json();
    const action = body.action || 'prepare';
    if (action === 'prepare') {
      await assertStorageQuota(user.id, body.sizeBytes || body.size_bytes || 0);
      const ticket = await prepareDirectUpload({
        userId: user.id,
        type: body.type || 'image',
        filename: body.filename,
        mimeType: body.mimeType || body.mime_type,
        sizeBytes: body.sizeBytes || body.size_bytes,
      });
      return json({ upload: ticket });
    }

    if (action !== 'complete') return json({ error: '上传操作类型无效' }, { status: 400 });
    if (!body.objectKey || !userKeyBelongsToUser(body.objectKey, user.id)) {
      return json({ error: '对象 Key 无效' }, { status: 400 });
    }
    const metadata = await inspectStoredObject({ objectKey: body.objectKey, type: body.type || 'image', filename: body.filename || '' });
    await assertStorageQuota(user.id, metadata.size);
    const { config: currentStorage, storage } = await getStorageConfigAndAdapter();
    const variants = await generateStorageVariants({ storage, objectKey: body.objectKey, type: body.type || 'image', mimeType: metadata.mimeType });
    const asset = await recordUserAsset(user.id, {
      folderId: body.folderId || body.folder_id || null,
      assetType: body.type || 'image',
      studioId: body.studioId || 'upload',
      title: body.title || body.filename || '上传素材',
      objectKey: body.objectKey,
      previewObjectKey: variants.previewObjectKey,
      thumbnailObjectKey: variants.thumbnailObjectKey,
      bucket: currentStorage.bucket || null,
      region: currentStorage.region || null,
      storageProvider: currentStorage.storageProvider || null,
      storageLocationId: currentStorage.storageLocationId || null,
      originalFilename: body.filename || null,
      filename: body.filename || null,
      extension: String(body.filename || '').split('.').pop()?.toLowerCase() || null,
      mimeType: metadata.mimeType,
      fileSizeBytes: metadata.size,
      checksum: body.checksum || null,
      visibility: 'private',
      sourceType: 'user_upload',
      storageStatus: 'ready',
      kind: body.kind || null,
      category: body.category || 'other',
      source: body.source || null,
      note: body.note || null,
      coverUrl: body.coverUrl || null,
      assetData: body.assetData && typeof body.assetData === 'object' ? body.assetData : {},
    });
    return json({ asset: await toClientAsset(asset) }, { status: 201 });
  } catch (error) {
    if (error?.code === 'STORAGE_QUOTA_EXCEEDED') {
      return json({
        error: publicErrorMessage(error, '存储空间不足'),
        code: 'STORAGE_QUOTA_EXCEEDED',
        quota: error.quota || null,
      }, { status: 413 });
    }
    const status = String(error?.code || '').startsWith('STORAGE_') ? 503 : 422;
    return json({ error: publicErrorMessage(error, '上传文件处理失败'), code: error?.code || 'UPLOAD_FAILED' }, { status });
  }
}
