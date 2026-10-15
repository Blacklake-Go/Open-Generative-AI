import { resolveRequestUser } from '@/lib/security/requestUser';
import { publicErrorMessage } from '@/lib/security/publicError';
import { getGenerationTrace } from '@/lib/services/generations';
import { getUserAssetByCreationId, getUserAssetDownload, syncCreationToAsset } from '@/lib/services/assets';
import { getCanvasProjectJob, updateCanvasProjectJob } from '@/lib/repositories/canvasProjects';
import { findCreationById } from '@/lib/repositories/creations';
import { getCanvasJobCostMetadata, getCanvasJobFailure, getCanvasJobResultStatus } from '@/lib/canvas/jobResultState';
import { ensureCanvasResultAsset } from '@/lib/canvas/resolveJobAsset';
import { canvasJson, canvasOriginGuard, canvasPreflight } from '@/lib/canvas/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request) {
  return canvasPreflight(request, 'GET, OPTIONS');
}

export async function GET(request, { params }) {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const auth = await resolveRequestUser(request);
  if (!auth.user) {
    return canvasJson(request, { error: auth.error, code: auth.code }, { status: auth.status });
  }
  const { user } = auth;

  try {
    const { id } = await params;
    const linkedJob = await getCanvasProjectJob(user.id, id);
    if (!linkedJob) return canvasJson(request, { error: '任务不存在', code: 'JOB_NOT_FOUND' }, { status: 404 });
    const trace = await getGenerationTrace(id, { expectedUserId: user.id, includeResultUrl: false });
    if (!trace?.creation) return canvasJson(request, { error: '任务不存在', code: 'JOB_NOT_FOUND' }, { status: 404 });
    const creation = trace.creation;
    const failureEvent = [...(trace.events || [])].reverse().find((event) => event.event_type === 'TASK_FAILED');
    let asset = null;
    let rawCreation = null;
    if (creation.status === 'succeeded' && !creation.result_text) {
      ({ asset, creation: rawCreation } = await ensureCanvasResultAsset({
        userId: user.id,
        creationId: creation.id,
        getAssetByCreationId: getUserAssetByCreationId,
        getAssetDownload: getUserAssetDownload,
        findCreationById,
        syncCreationToAsset,
      }));
    }
    const jobStatus = getCanvasJobResultStatus({
      taskStatus: creation.status,
      resultText: creation.result_text,
      resultObjectKey: rawCreation?.result_object_key,
      hasAsset: Boolean(asset),
      taskUpdatedAt: rawCreation?.updated_at || creation.updated_at,
    });
    await updateCanvasProjectJob(user.id, id, {
      status: jobStatus,
      assetId: asset?.id || null,
      creditsUsed: creation.status === 'succeeded' ? Number(creation.credit_cost || 0) : null,
    });
    return canvasJson(request, {
      job: {
        id: creation.id,
        projectId: linkedJob.project_id,
        nodeId: linkedJob.node_id,
        modelId: creation.model,
        quoteId: linkedJob.quote_id || null,
        providerRequestId: linkedJob.provider_request_id || null,
        status: jobStatus,
        createdAt: creation.created_at,
        updatedAt: creation.updated_at,
        estimatedCredits: Number(creation.credit_cost || 0),
        creditsUsed: creation.status === 'succeeded' ? Number(creation.credit_cost || 0) : 0,
        ...getCanvasJobCostMetadata(creation.actual_cost_usd),
        result: {
          text: creation.result_text || null,
          assetId: asset?.id || null,
          mimeType: asset?.mimeType || creation.storage_mime_type || null,
          contentUrl: asset?.id ? `/api/canvas/assets/${encodeURIComponent(asset.id)}/content` : null,
        },
        error: creation.status === 'failed'
          ? getCanvasJobFailure({ errorCode: creation.error_code, failureMetadata: failureEvent?.metadata })
          : jobStatus === 'result_unavailable'
            ? { code: 'RESULT_ASSET_MISSING', message: '任务已完成并结算，但归档素材不可用，请联系支持人员核对任务与积分。' }
            : null,
      },
    });
  } catch (error) {
    console.error('[api/canvas/jobs/:id]', error);
    return canvasJson(request, {
      error: publicErrorMessage(error, '任务结果暂时无法读取，请稍后重试'),
      code: error.code || 'CANVAS_JOB_READ_FAILED',
    }, { status: 503 });
  }
}
