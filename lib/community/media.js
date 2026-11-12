import 'server-only';
import { Readable } from 'node:stream';
import { queryOne } from '../db/index.js';
import { getUserAssetDownload } from '../services/assets.js';
import { getAssetStorageAdapter } from '../storage/storageService.js';
import { hasPermission, PERMISSIONS } from '../admin/permissions.js';
import { mappedMainIdentity, streamMainAsset } from '../federation/mainAssets.js';

const SAFE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac']);
export async function serveCommunityMedia(postId, viewer = null, range = '') {
  const post = await queryOne(`SELECT p.user_id,p.status,p.source_asset_id,p.source_main_user_id,p.source_main_asset_id FROM ai_studio.community_posts p
    LEFT JOIN ai_studio.user_assets a ON a.id=p.source_asset_id AND a.user_id=p.user_id AND a.status='ready' AND a.deleted_at IS NULL
    WHERE p.id=$1 AND (a.id IS NOT NULL OR p.source_main_asset_id IS NOT NULL)`, [postId]);
  if (!post || (post.status !== 'published' && post.user_id !== viewer?.id && !hasPermission(viewer, PERMISSIONS.contentRead))) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  if (post.source_main_asset_id) {
    if (await mappedMainIdentity(post.user_id) !== post.source_main_user_id) return new Response(null, { status: 404 });
    const upstream = await streamMainAsset(post.user_id, post.source_main_asset_id, range);
    const type = upstream.headers.get('content-type')?.split(';')[0];
    if (!SAFE_TYPES.has(type)) { await upstream.body?.cancel(); return new Response(null,{status:404}); }
    const headers = new Headers({ 'Content-Type': type, 'Content-Disposition': 'inline', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    for (const key of ['content-length','content-range','accept-ranges']) if (upstream.headers.has(key)) headers.set(key,upstream.headers.get(key));
    return new Response(upstream.body,{ status:upstream.status,headers });
  }
  const asset = await getUserAssetDownload(post.user_id, post.source_asset_id);
  if (!asset?.objectKey || asset.deletedAt || !SAFE_TYPES.has(asset.mimeType)) return new Response(null, { status: 404 });
  const adapter = await getAssetStorageAdapter(asset);
  if (!adapter) return new Response(null, { status: 503 });
  const stream = await adapter.downloadStream({ key: asset.objectKey });
  return new Response(Readable.toWeb(stream), { headers: { 'Content-Type': asset.mimeType,
    'Content-Disposition': 'inline', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox", 'Accept-Ranges': 'none' } });
}
