import { Zip, ZipPassThrough } from 'fflate';
import { getUserFromRequest, json } from '@/lib/services/auth';
import { getLibraryExportAssets } from '@/lib/services/assetLibrary';
import { getAssetStorageAdapter } from '@/lib/storage/storageService';
import { consumeRateLimit, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
};

function assetExtension(row, mimeType) {
  const fromName = String(row.original_filename || row.filename || '').split('.').pop() || '';
  if (fromName && fromName.length <= 8 && /^[a-z0-9]+$/i.test(fromName)) return fromName.toLowerCase();
  return MIME_EXTENSIONS[String(mimeType || '').toLowerCase()] || row.extension || 'bin';
}

function manifestAsset({ row, asset }) {
  const shared = {
    id: asset.id,
    kind: asset.kind,
    category: asset.category || 'other',
    title: asset.title,
    tags: Array.isArray(asset.tags) ? asset.tags : [],
    source: asset.source || '',
    note: asset.note || '',
    folderName: asset.folderName || null,
    coverUrl: asset.coverUrl || null,
  };
  if (asset.kind === 'text') return { ...shared, data: { content: asset.data?.content || '' } };
  if (asset.kind === 'entity') return { ...shared, data: { definition: asset.data?.definition || {} } };
  return {
    ...shared,
    data: {
      fileName: asset.data?.fileName || row.original_filename || row.filename || '',
      mimeType: asset.data?.mimeType || row.mime_type || '',
      bytes: asset.data?.bytes || Number(row.file_size_bytes || 0),
    },
  };
}

function createZipStream() {
  let controller;
  let cancelled = false;
  const stream = new ReadableStream({
    start(next) { controller = next; },
    cancel() { cancelled = true; },
  });
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      try { controller.error(error); } catch { /* stream already closed */ }
      return;
    }
    try {
      controller.enqueue(chunk);
      if (final) controller.close();
    } catch {
      cancelled = true;
    }
  });
  return { stream, zip, isCancelled: () => cancelled };
}

function writeTextEntry(zip, name, content) {
  const entry = new ZipPassThrough(name);
  zip.add(entry);
  entry.push(new TextEncoder().encode(content), true);
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const url = new URL(request.url);
  const ids = String(url.searchParams.get('ids') || '').split(',').map((id) => id.trim()).filter(Boolean);
  const preflight = request.headers.get('x-asset-export') === 'preflight';

  try {
    const limit = await consumeRateLimit({
      scope: preflight ? 'asset_library_export_preflight_user' : 'asset_library_export_user',
      subject: user.id,
      limit: preflight ? 120 : 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);

    const items = await getLibraryExportAssets(user.id, { assetIds: ids });
    if (!items.length) return json({ error: '暂无素材可导出' }, { status: 400 });
    if (preflight) return json({ count: items.length });

    const { stream, zip, isCancelled } = createZipStream();

    void (async () => {
      const manifest = { app: 'supdance', version: 1, exportedAt: new Date().toISOString(), assets: [], files: [], skipped: [] };
      try {
        for (let index = 0; index < items.length; index += 1) {
          if (isCancelled()) return;
          const { row, asset } = items[index];
          if (!row.object_key) {
            if (asset.kind !== 'text' && asset.kind !== 'entity') {
              manifest.skipped.push({ id: asset.id, title: asset.title, reason: 'missing_file' });
              continue;
            }
            manifest.assets.push(manifestAsset({ row, asset }));
            continue;
          }
          const mimeType = asset.data?.mimeType || row.mime_type || 'application/octet-stream';
          const path = `files/${asset.kind}/${asset.id}.${assetExtension(row, mimeType)}`;
          const entry = new ZipPassThrough(path);
          zip.add(entry);
          try {
            const adapter = await getAssetStorageAdapter({
              provider: row.storage_provider,
              locationId: row.storage_location_id,
              bucket: row.bucket,
              region: row.region,
            });
            const source = await adapter.downloadStream({ key: row.object_key });
            for await (const chunk of source) {
              if (isCancelled()) return;
              entry.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk), false);
            }
            entry.push(new Uint8Array(0), true);
          } catch (error) {
            console.error('[GET /api/assets/library/export] file failed', {
              assetId: asset.id,
              code: error?.code || error?.message,
            });
            entry.push(new TextEncoder().encode(''), true);
            manifest.skipped.push({ id: asset.id, title: asset.title, reason: 'file_unavailable' });
            continue;
          }
          manifest.assets.push(manifestAsset({ row, asset }));
          manifest.files.push({
            assetId: asset.id,
            path,
            mimeType,
            bytes: Number(row.file_size_bytes || asset.data?.bytes || 0),
          });
        }
        writeTextEntry(zip, 'assets.json', JSON.stringify(manifest, null, 2));
        zip.end();
      } catch (error) {
        console.error('[GET /api/assets/library/export]', error);
        try { zip.end(); } catch { /* already closed */ }
      }
    })();

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return new Response(stream, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="supdance-assets-${stamp}.zip"`,
        'cache-control': 'no-store',
        'x-asset-count': String(items.length),
      },
    });
  } catch (error) {
    console.error('[GET /api/assets/library/export]', error);
    return json({ error: publicErrorMessage(error, '导出素材失败') }, { status: 500 });
  }
}
