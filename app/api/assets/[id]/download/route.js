import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { getAssetUrl } from '@/lib/storage/storageService';
import { getUserAssetDownload } from '@/lib/services/assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const { id } = await params;
  const asset = await getUserAssetDownload(user.id, id);
  if (!asset || asset.deletedAt) return NextResponse.json({ error: '资产不存在或已删除' }, { status: 404 });
  if (asset.objectKey) {
    const url = await getAssetUrl({
      objectKey: asset.objectKey,
      visibility: asset.visibility || 'private',
      disposition: request.nextUrl.searchParams.get('inline') === '1' ? 'inline' : 'attachment',
      provider: asset.provider,
      locationId: asset.locationId,
      bucket: asset.bucket,
      region: asset.region,
    });
    if (url) {
      const redirectUrl = /^https?:\/\//i.test(url) ? url : new URL(url, request.url);
      return NextResponse.redirect(redirectUrl);
    }
  }
  if (asset.mediaUrl) {
    const redirectUrl = /^https?:\/\//i.test(asset.mediaUrl) ? asset.mediaUrl : new URL(asset.mediaUrl, request.url);
    return NextResponse.redirect(redirectUrl);
  }
  return NextResponse.json({ error: '资产尚未完成存储归档' }, { status: 409 });
}
