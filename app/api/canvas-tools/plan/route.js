import { json } from '@/lib/services/auth';
import { getUserAssetDownload } from '@/lib/services/assets';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';
import { resolveRequestUser } from '@/lib/security/requestUser';
import { readJsonObjectRequestBody } from '@/lib/security/requestJson';
import { validatePromptSafety } from '@/lib/security/contentModeration';
import { getCanvasToolCatalog } from '@/lib/canvasTools/catalog';
import { buildCanvasToolPlan } from '@/lib/canvasTools/spec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_MIME = /^image\/(?:jpeg|png|webp|gif)$/;
const CLIENT_ERROR_CODES = new Set([
  'INVALID_TOOL',
  'INVALID_SOURCE',
  'ASPECT_RATIO_UNSUPPORTED',
  'RESOLUTION_UNSUPPORTED',
  'PRESET_UNSUPPORTED',
  'PROMPT_TOO_LONG',
]);

export async function POST(request) {
  const auth = await resolveRequestUser(request);
  if (!auth.user) return json({ error: auth.error, code: auth.code }, { status: auth.status });
  const { user } = auth;

  try {
    const guarded = guardMutation(request, { maxBytes: 64 * 1024 });
    if (guarded) return guarded;

    const limit = await consumeRateLimit({ scope: 'canvas_tools_plan_user', subject: user.id, limit: 120, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const parsedBody = await readJsonObjectRequestBody(request);
    if (!parsedBody.ok) {
      return json({
        error: parsedBody.code === 'INVALID_JSON' ? '请求内容不是有效 JSON' : '请求 JSON 顶层必须是对象',
        code: parsedBody.code,
      }, { status: 400 });
    }
    const body = parsedBody.value;
    const tool = String(body.tool || '').trim();
    if (!tool) return json({ error: '必须指定画布工具', code: 'INVALID_TOOL' }, { status: 422 });

    const sourceAssetId = String(body.sourceAssetId || body.source_asset_id || '').trim();
    if (!/^[A-Za-z0-9_-]{8,160}$/.test(sourceAssetId)) {
      return json({ error: '请先上传一张源图片', code: 'INVALID_SOURCE' }, { status: 422 });
    }

    const catalog = await getCanvasToolCatalog();
    if (!catalog.available) {
      return json({ error: catalog.message, code: catalog.reason }, { status: 503 });
    }

    let asset = null;
    try {
      asset = await getUserAssetDownload(user.id, sourceAssetId);
    } catch {
      asset = null;
    }
    if (!asset || asset.deletedAt) {
      return json({ error: '源图片不存在或已删除，请重新上传', code: 'SOURCE_NOT_FOUND' }, { status: 404 });
    }
    const mime = String(asset.mimeType || '').toLowerCase();
    if (mime && !IMAGE_MIME.test(mime)) {
      return json({ error: '源素材不是受支持的图片格式', code: 'SOURCE_NOT_IMAGE' }, { status: 422 });
    }
    if (Number(asset.sizeBytes) > 30 * 1024 * 1024) {
      return json({ error: '源图片超过 30MB，请压缩后再试', code: 'SOURCE_TOO_LARGE' }, { status: 413 });
    }

    const plan = buildCanvasToolPlan({
      tool,
      params: body.params && typeof body.params === 'object' ? body.params : {},
      sourceAssetId,
    });

    const moderation = validatePromptSafety(plan.prompt);
    if (!moderation.passed) {
      return json({ error: moderation.reason, code: moderation.code }, { status: 422 });
    }

    return json({
      success: true,
      plan: {
        ...plan,
        modelId: catalog.model.id,
        studioId: 'canvas',
        sourceAssetId,
      },
    });
  } catch (error) {
    const code = error?.code || 'PLAN_FAILED';
    const status = CLIENT_ERROR_CODES.has(code) ? 422 : 503;
    return json({ error: publicErrorMessage(error, '生成方案创建失败，请稍后再试'), code }, { status });
  }
}
