import { getUserFromRequest } from '@/lib/services/auth';
import { createGenerationTask } from '@/lib/services/generationCore';
import { listActiveModels } from '@/lib/services/models';
import { getCanvasAllowedModelIds } from '@/lib/services/canvasModelConfig';
import { isCanvasServerCapabilityEnabled } from '@/lib/canvas/capabilityPolicy';
import { consumeRateLimit, rateLimitResponse } from '@/lib/security/requestGuard';
import { validatePromptSafety } from '@/lib/security/contentModeration';
import { getCanvasProject, linkCanvasProjectJob, listCanvasProjectJobs } from '@/lib/repositories/canvasProjects';
import { canvasSnapshotContainsNode } from '@/lib/canvas/projectSnapshot';
import { getUserAssetDownload, syncCreationToAsset } from '@/lib/services/assets';
import { findCreationById } from '@/lib/repositories/creations';
import { getCanvasJobFailure, getCanvasJobResultStatus } from '@/lib/canvas/jobResultState';
import { publicErrorMessage } from '@/lib/security/publicError';
import { canvasJson, canvasMutationGuard, canvasOriginGuard, canvasPreflight, readCanvasJson, canvasResponse } from '@/lib/canvas/http';
import { getCanvasSessionOwnerConflict } from '@/lib/canvas/sessionOwner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validateParameters(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > 96 * 1024) {
    throw Object.assign(new Error('生成参数过大'), { code: 'PARAMETERS_TOO_LARGE' });
  }
  const pending = [{ value, key: '' }];
  let visited = 0;
  while (pending.length) {
    const { value: current, key } = pending.pop();
    if (/api.?key|base.?url|credential|provider|endpoint|channel|secret|script|token/i.test(key)) {
      throw Object.assign(new Error('Canvas 不能提交 Provider 或凭据配置'), { code: 'PROVIDER_CONFIG_FORBIDDEN' });
    }
    if (typeof current === 'string') {
      if (/^(?:data:|blob:)/i.test(current)) throw Object.assign(new Error('请先将参考媒体上传到 SupDance 素材库'), { code: 'MEDIA_UPLOAD_REQUIRED' });
      if (/^https?:\/\//i.test(current) && /image|video|audio|reference|frame|url/i.test(key)) {
        throw Object.assign(new Error('参考媒体必须使用 SupDance 素材 ID'), { code: 'EXTERNAL_MEDIA_URL_FORBIDDEN' });
      }
      continue;
    }
    if (!current || typeof current !== 'object') continue;
    if (++visited > 20_000) throw Object.assign(new Error('生成参数结构过于复杂'), { code: 'PARAMETERS_TOO_COMPLEX' });
    if (Array.isArray(current)) {
      for (const childValue of current) pending.push({ value: childValue, key });
      continue;
    }
    for (const [childKey, childValue] of Object.entries(current)) pending.push({ value: childValue, key: childKey });
  }
  return value;
}

export function OPTIONS(request) {
  return canvasPreflight(request, 'GET, POST, OPTIONS');
}

export async function GET(request) {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const projectId = String(url.searchParams.get('projectId') || '').trim() || null;
    const idempotencyKeys = url.searchParams.getAll('idempotencyKey');
    const page = Number(url.searchParams.get('page') || 1);
    const offset = (page - 1) * 50;
    if (idempotencyKeys.length > 50 || idempotencyKeys.some((key) => key.length < 8 || key.length > 200)) {
      return canvasJson(request, { error: '幂等键查询无效', code: 'INVALID_IDEMPOTENCY_FILTER' }, { status: 422 });
    }
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(offset)) {
      return canvasJson(request, { error: '分页参数无效', code: 'INVALID_PAGINATION' }, { status: 422 });
    }
    let rows = await listCanvasProjectJobs(user.id, { projectId, idempotencyKeys, limit: 51, offset });
    const missingAssets = rows.slice(0, 50).filter((row) => (
      row.task_status === 'succeeded' && !row.result_text && row.result_object_key && !row.asset_object_key
    ));
    for (let index = 0; index < missingAssets.length; index += 5) {
      await Promise.all(missingAssets.slice(index, index + 5).map(async (row) => {
        const creation = await findCreationById(row.job_id);
        if (creation?.user_id === user.id && creation.status === 'succeeded') {
          await syncCreationToAsset(creation);
        }
      }));
    }
    if (missingAssets.length) {
      rows = await listCanvasProjectJobs(user.id, { projectId, idempotencyKeys, limit: 51, offset });
    }
    const jobs = rows.slice(0, 50).map((row) => {
      const status = getCanvasJobResultStatus({
        taskStatus: row.task_status,
        resultText: row.result_text,
        resultObjectKey: row.result_object_key,
        hasAsset: Boolean(row.asset_id && row.asset_object_key),
        taskUpdatedAt: row.task_updated_at,
      });
      return {
        id: row.job_id,
        projectId: row.project_id,
        projectName: row.project_name || null,
        nodeId: row.node_id,
        modelId: row.model_id,
        idempotencyKey: row.idempotency_key,
        quoteId: row.quote_id || null,
        providerRequestId: row.provider_request_id || null,
        status,
        createdAt: row.created_at,
        estimatedCredits: Number(row.credit_cost || 0),
        creditsUsed: row.task_status === 'succeeded' ? Number(row.credit_cost || 0) : 0,
        actualCostUsd: row.actual_cost_usd === null ? null : Number(row.actual_cost_usd),
        costStatus: row.actual_cost_usd === null ? 'pending_reconciliation' : 'provider_reported',
        result: {
          text: row.result_text || null,
          assetId: row.asset_object_key ? row.asset_id || null : null,
          mimeType: row.asset_mime_type || row.storage_mime_type || null,
          contentUrl: row.asset_object_key && row.asset_id ? `/api/canvas/assets/${encodeURIComponent(row.asset_id)}/content` : null,
        },
        error: row.task_status === 'failed'
          ? getCanvasJobFailure({ errorCode: row.error_code, failureMetadata: row.error_metadata_json })
          : status === 'result_unavailable'
            ? { code: 'RESULT_ASSET_MISSING', message: '任务已结束，但归档结果不可用，请联系支持人员核对任务与积分。' }
            : null,
      };
    });
    return canvasJson(request, { jobs, pagination: { page, pageSize: 50, hasMore: rows.length > 50 } });
  } catch (error) {
    return canvasJson(request, { error: publicErrorMessage(error, '读取生成历史失败'), code: error.code || 'CANVAS_JOBS_LIST_FAILED' }, { status: 503 });
  }
}

export async function POST(request) {
  const guarded = canvasMutationGuard(request, { maxBytes: 128 * 1024 });
  if (guarded) return guarded;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });

  try {
    const limit = await consumeRateLimit({ scope: 'canvas_generation_user', subject: user.id, limit: 40, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return canvasResponse(request, rateLimitResponse(limit));
    const body = await readCanvasJson(request, 128 * 1024);
    const ownerConflict = getCanvasSessionOwnerConflict(user.id, body.expectedOwnerUserId);
    if (ownerConflict) return canvasJson(request, ownerConflict, { status: 409 });
    const modelId = String(body.modelId || '').trim();
    const projectId = String(body.projectId || '').trim();
    const nodeId = String(body.nodeId || '').trim();
    const quoteId = String(body.quoteId || body.quote_id || '').trim();
    const idempotencyKey = String(request.headers.get('idempotency-key') || '').trim();
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!modelId || !projectId || !/^[A-Za-z0-9_-]{1,120}$/.test(nodeId)) {
      return canvasJson(request, { error: '必须提供模型、云端项目和节点标识', code: 'CANVAS_CONTEXT_REQUIRED' }, { status: 422 });
    }
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return canvasJson(request, { error: '生成任务必须提供有效的幂等键', code: 'IDEMPOTENCY_REQUIRED' }, { status: 422 });
    }
    if (!quoteId) return canvasJson(request, { error: '生成任务必须先取得服务器报价', code: 'QUOTE_REQUIRED' }, { status: 422 });
    const project = await getCanvasProject(user.id, projectId);
    if (!project) return canvasJson(request, { error: '画布不存在或不属于当前账户', code: 'PROJECT_NOT_FOUND' }, { status: 404 });
    if (!canvasSnapshotContainsNode(project.snapshot_json, nodeId)) {
      return canvasJson(request, { error: '目标节点尚未保存到云端，请等画布同步完成后重试', code: 'CANVAS_NODE_NOT_SAVED' }, { status: 409 });
    }
    const catalog = await listActiveModels();
    const model = catalog.find((item) => item.id === modelId);
    if (!model) return canvasJson(request, { error: '模型当前不可用', code: 'MODEL_NOT_AVAILABLE' }, { status: 404 });
    const allowed = await getCanvasAllowedModelIds({ userId: user.id });
    if (!allowed.has(modelId)) return canvasJson(request, { error: '该模型未挂载到无限画布', code: 'CANVAS_MODEL_UNMOUNTED' }, { status: 404 });
    if (!isCanvasServerCapabilityEnabled(model.type)) {
      return canvasJson(request, { error: 'Canvas 当前仅开放已验证的图片生成能力', code: 'CANVAS_CAPABILITY_DISABLED' }, { status: 422 });
    }
    const moderation = validatePromptSafety(prompt);
    if (!moderation.passed) return canvasJson(request, { error: moderation.reason, code: moderation.code }, { status: 422 });
    const parameters = validateParameters(body.parameters);
    const pendingAssets = [parameters];
    const assetIds = new Set();
    while (pendingAssets.length) {
      const value = pendingAssets.pop();
      if (typeof value === 'string') {
        const match = value.match(/^koyo-asset:([A-Za-z0-9_-]{8,160})$/);
        if (match) assetIds.add(match[1]);
      } else if (Array.isArray(value)) pendingAssets.push(...value);
      else if (value && typeof value === 'object') pendingAssets.push(...Object.values(value));
    }
    const ownedAssets = await Promise.all([...assetIds].map((assetId) => getUserAssetDownload(user.id, assetId)));
    if (ownedAssets.some((asset) => !asset?.objectKey || asset.deletedAt)) {
      return canvasJson(request, { error: '参考素材不存在或不属于当前账户', code: 'ASSET_NOT_FOUND' }, { status: 422 });
    }
    const task = await createGenerationTask({
      user,
      modelId,
      studioId: 'canvas',
      prompt,
      parameters,
      quoteParameters: body.parameters && typeof body.parameters === 'object' ? body.parameters : {},
      idempotencyKey,
      label: `${model.name || model.id} · Canvas`,
      quoteId,
      routingMode: 'cost',
      onTaskCreated: async ({ creation, transaction }) => {
        const linked = await linkCanvasProjectJob(user.id, {
          projectId,
          nodeId,
          jobId: creation.id,
          modelId,
          idempotencyKey,
        }, { transaction });
        if (!linked) {
          throw Object.assign(new Error('任务幂等键已关联到其他节点'), { code: 'CANVAS_JOB_LINK_CONFLICT' });
        }
      },
    });
    return canvasJson(request, {
      job: {
        id: task.creation.id,
        status: task.creation.status,
        providerRequestId: task.creation.provider_request_id || null,
        projectId,
        nodeId,
        modelId,
        estimatedCredits: Number(task.creation.credit_cost || 0),
        idempotent: Boolean(task.idempotent),
      },
    }, { status: task.idempotent ? 200 : 202 });
  } catch (error) {
    const status = error.code === 'UNAUTHENTICATED' ? 401
      : error.code === 'INSUFFICIENT_CREDITS' ? 402
        : error.code === 'MODEL_NOT_FOUND' ? 404
          : error.code === 'IDEMPOTENCY_CONFLICT' || error.code === 'QUOTE_MISMATCH' || error.code === 'CANVAS_JOB_LINK_CONFLICT' ? 409
            : error.code === 'BODY_TOO_LARGE' || error.code === 'PARAMETERS_TOO_LARGE' ? 413
              : error.code === 'INVALID_JSON' ? 400 : 422;
    return canvasJson(request, { error: publicErrorMessage(error, '创建生成任务失败'), code: error.code || 'GENERATION_CREATE_FAILED' }, { status });
  }
}
