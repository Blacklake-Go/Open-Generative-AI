import { getUserFromRequest, json } from '@/lib/services/auth';
import { getGenerationTrace } from '@/lib/services/generations';
import { getAssetStorageAdapter } from '@/lib/storage/storageService';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const { id } = await context.params;
  if (!id) return json({ error: '缺少任务 ID' }, { status: 400 });

  try {
    const trace = await getGenerationTrace(id, { expectedUserId: user.id, includeResultUrl: false });
    const creation = trace?.creation;
    if (!creation) return json({ error: '生成任务不存在或无权查看' }, { status: 404 });

    const objectKey = String(creation.result_object_key || '').trim();
    if (!objectKey) {
      const fallback = String(creation.result_url || '').trim();
      if (/^https?:\/\//i.test(fallback) && !/\/uploads\/generated\//i.test(fallback)) {
        return Response.redirect(fallback, 302);
      }
      return json({ error: '生成结果暂不可用' }, { status: 404 });
    }

    const adapter = await getAssetStorageAdapter({
      provider: creation.storage_provider || null,
      locationId: creation.storage_location_id || null,
      bucket: creation.storage_bucket || null,
      region: creation.storage_region || null,
    });
    if (!adapter) return json({ error: '生成结果所属存储位置不可用' }, { status: 503 });
    const downloaded = await adapter.download({ key: objectKey });
    const body = Buffer.isBuffer(downloaded?.body) ? downloaded.body : Buffer.from(downloaded?.body || '');
    if (!body.length) return json({ error: '生成结果暂不可用' }, { status: 404 });

    const ext = (objectKey.split('.').pop() || 'webp').toLowerCase().replace(/[^a-z0-9]/g, '') || 'webp';
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': downloaded?.metadata?.mimeType || 'application/octet-stream',
        'Content-Length': String(body.length),
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': `inline; filename="supdance-canvas-${id}.${ext}"`,
      },
    });
  } catch (error) {
    if (error?.code === 'STORAGE_FILE_NOT_FOUND' || error?.statusCode === 404) {
      return json({ error: '生成结果暂不可用' }, { status: 404 });
    }
    console.error('[api/canvas-tools/result]', error);
    return json({ error: publicErrorMessage(error, '读取生成结果失败') }, { status: 500 });
  }
}
