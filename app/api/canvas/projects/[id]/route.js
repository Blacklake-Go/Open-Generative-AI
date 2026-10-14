import { getUserFromRequest } from '@/lib/services/auth';
import { consumeRateLimit, rateLimitResponse } from '@/lib/security/requestGuard';
import { canvasJson, canvasMutationGuard, canvasOriginGuard, canvasPreflight, readCanvasJson, validateCanvasSnapshot, canvasResponse } from '@/lib/canvas/http';
import { getCanvasSessionOwnerConflict } from '@/lib/canvas/sessionOwner';
import { deleteCanvasProject, getCanvasProject, saveCanvasProject } from '@/lib/repositories/canvasProjects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request) {
  return canvasPreflight(request, 'GET, PUT, DELETE, OPTIONS');
}

function projectPayload(project) {
  if (!project) return null;
  const snapshot = typeof project.snapshot_json === 'string' ? JSON.parse(project.snapshot_json) : project.snapshot_json;
  return {
    id: project.id,
    ownerUserId: project.owner_user_id,
    name: project.name,
    thumbnailAssetId: project.thumbnail_asset_id,
    snapshot,
    version: Number(project.version),
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

export async function GET(request, { params }) {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  const { id } = await params;
  const project = await getCanvasProject(user.id, id);
  if (!project) return canvasJson(request, { error: '画布不存在', code: 'PROJECT_NOT_FOUND' }, { status: 404 });
  return canvasJson(request, { project: projectPayload(project) });
}

export async function PUT(request, { params }) {
  const guarded = canvasMutationGuard(request, { maxBytes: 2 * 1024 * 1024 });
  if (guarded) return guarded;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const limit = await consumeRateLimit({ scope: 'canvas_project_save', subject: user.id, limit: 600, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return canvasResponse(request, rateLimitResponse(limit));
    const { id } = await params;
    const body = await readCanvasJson(request, 2 * 1024 * 1024);
    const ownerConflict = getCanvasSessionOwnerConflict(user.id, body.expectedOwnerUserId);
    if (ownerConflict) return canvasJson(request, ownerConflict, { status: 409 });
    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return canvasJson(request, { error: '保存项目必须提供有效的 expectedVersion', code: 'EXPECTED_VERSION_REQUIRED' }, { status: 422 });
    }
    const snapshot = validateCanvasSnapshot(body.snapshot);
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 160) : undefined;
    const project = await saveCanvasProject(user.id, id, { name, snapshot, expectedVersion });
    if (!project) return canvasJson(request, { error: '画布不存在', code: 'PROJECT_NOT_FOUND' }, { status: 404 });
    return canvasJson(request, { project: projectPayload(project) });
  } catch (error) {
    const status = error.code === 'PROJECT_VERSION_CONFLICT' ? 409
      : error.code === 'BODY_TOO_LARGE' || error.code === 'PROJECT_SNAPSHOT_TOO_LARGE' ? 413
        : error.code === 'INVALID_JSON' ? 400 : 422;
    return canvasJson(request, {
      error: error.message || '保存画布失败',
      code: error.code || 'PROJECT_SAVE_FAILED',
      ...(error.currentVersion ? { currentVersion: error.currentVersion } : {}),
    }, { status });
  }
}

export async function DELETE(request, { params }) {
  const guarded = canvasMutationGuard(request, { maxBytes: 4 * 1024 });
  if (guarded) return guarded;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  let body;
  try {
    body = await readCanvasJson(request, 4 * 1024);
  } catch (error) {
    return canvasJson(request, { error: error.message || '请求 JSON 格式无效', code: error.code || 'INVALID_JSON' }, { status: error.code === 'BODY_TOO_LARGE' ? 413 : 400 });
  }
  const ownerConflict = getCanvasSessionOwnerConflict(user.id, body.expectedOwnerUserId);
  if (ownerConflict) return canvasJson(request, ownerConflict, { status: 409 });
  const limit = await consumeRateLimit({ scope: 'canvas_project_delete', subject: user.id, limit: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return canvasResponse(request, rateLimitResponse(limit));
  const { id } = await params;
  const deleted = await deleteCanvasProject(user.id, id);
  return deleted
    ? canvasJson(request, { ok: true, id })
    : canvasJson(request, { error: '画布不存在', code: 'PROJECT_NOT_FOUND' }, { status: 404 });
}
