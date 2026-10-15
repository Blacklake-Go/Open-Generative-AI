import { getUserFromRequest } from '@/lib/services/auth';
import { consumeRateLimit, rateLimitResponse } from '@/lib/security/requestGuard';
import { canvasJson, canvasMutationGuard, canvasOriginGuard, canvasPreflight, readCanvasJson, validateCanvasSnapshot, canvasResponse } from '@/lib/canvas/http';
import { getCanvasSessionOwnerConflict } from '@/lib/canvas/sessionOwner';
import { createCanvasProject, listCanvasProjects } from '@/lib/repositories/canvasProjects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function projectPayload(project) {
  if (!project) return null;
  const snapshot = typeof project.snapshot_json === 'string' ? JSON.parse(project.snapshot_json) : (project.snapshot_json || project.snapshot || {});
  return {
    id: project.id,
    ownerUserId: project.owner_user_id || project.ownerUserId,
    name: project.name,
    thumbnailAssetId: project.thumbnail_asset_id || project.thumbnailAssetId || null,
    snapshot,
    version: Number(project.version),
    createdAt: project.created_at || project.createdAt,
    updatedAt: project.updated_at || project.updatedAt,
  };
}

export function OPTIONS(request) {
  return canvasPreflight(request, 'GET, POST, OPTIONS');
}

export async function GET(request) {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  const projects = await listCanvasProjects(user.id);
  return canvasJson(request, { projects: projects.map((project) => ({
    id: project.id,
    name: project.name,
    version: Number(project.version),
    nodeCount: Number(project.node_count || 0),
    connectionCount: Number(project.connection_count || 0),
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  })) });
}

export async function POST(request) {
  const guarded = canvasMutationGuard(request, { maxBytes: 2 * 1024 * 1024 });
  if (guarded) return guarded;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const limit = await consumeRateLimit({ scope: 'canvas_project_create', subject: user.id, limit: 30, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return canvasResponse(request, rateLimitResponse(limit));
    const body = await readCanvasJson(request, 2 * 1024 * 1024);
    const ownerConflict = getCanvasSessionOwnerConflict(user.id, body.expectedOwnerUserId);
    if (ownerConflict) return canvasJson(request, ownerConflict, { status: 409 });
    const name = String(body.name || '').trim().slice(0, 160) || '未命名画布';
    const snapshot = validateCanvasSnapshot(body.snapshot || {});
    const migrationId = body.migrationId === undefined ? null : String(body.migrationId || '').trim();
    if (migrationId !== null && !/^[A-Za-z0-9_-]{8,120}$/.test(migrationId)) {
      return canvasJson(request, { error: '迁移标识无效', code: 'INVALID_MIGRATION_ID' }, { status: 422 });
    }
    const result = await createCanvasProject(user.id, { name, snapshot, migrationId });
    return canvasJson(request, { project: projectPayload(result.project), idempotent: result.idempotent }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    const status = error.code === 'BODY_TOO_LARGE' || error.code === 'PROJECT_SNAPSHOT_TOO_LARGE' ? 413
      : error.code === 'INLINE_MEDIA_UPLOAD_REQUIRED' ? 422
        : error.code === 'PROJECT_CREATE_IDEMPOTENCY_CONFLICT' ? 409
        : error.code === 'INVALID_JSON' ? 400 : 422;
    return canvasJson(request, { error: error.message || '创建画布失败', code: error.code || 'PROJECT_CREATE_FAILED' }, { status });
  }
}
