import 'server-only';

import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { getUserAssetDownload } from '@/lib/services/assets';
import { getStorageConfigAndAdapter } from '@/lib/storage/storageService';

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3' };

export async function serveUserAsset(request, assetId, disposition = 'inline') {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const asset = await getUserAssetDownload(user.id, assetId);
  if (!asset || asset.deletedAt) return NextResponse.json({ error: '资产不存在或已删除' }, { status: 404 });

  if (asset.objectKey) {
    try {
      const { adapter } = await getStorageConfigAndAdapter();
      const stream = await adapter.downloadStream({ key: asset.objectKey });
      const mimeType = asset.mimeType || 'application/octet-stream';
      const extension = EXTENSIONS[mimeType] || 'bin';
      return new Response(Readable.toWeb(stream), {
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `${disposition}; filename="supdance-asset-${assetId}.${extension}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'",
        },
      });
    } catch (error) {
      if (error?.code === 'STORAGE_FILE_NOT_FOUND') return NextResponse.json({ error: '资产文件不存在' }, { status: 404 });
      console.error('[asset delivery] storage read failed', { code: error?.code || 'STORAGE_READ_FAILED' });
      return NextResponse.json({ error: '资产读取失败' }, { status: 503 });
    }
  }

  if (asset.visibility === 'private') return NextResponse.json({ error: '资产尚未完成存储归档' }, { status: 409 });
  if (asset.mediaUrl) {
    const redirectUrl = /^https?:\/\//i.test(asset.mediaUrl) ? asset.mediaUrl : new URL(asset.mediaUrl, request.url);
    return NextResponse.redirect(redirectUrl);
  }
  return NextResponse.json({ error: '资产尚未完成存储归档' }, { status: 409 });
}
