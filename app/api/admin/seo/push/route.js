import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listPushLogs } from '@/lib/repositories/seo';
import { executeSearchPush } from '@/lib/services/seoPush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)), 200);
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
  const engine = url.searchParams.get('engine') || null;

  const logs = await listPushLogs({ limit, offset, engine });
  return okResponse(logs, guard.requestId, { limit, offset, count: logs.length });
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.settingsWrite);
  if (!guard.ok) return guard.response;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return errorResponse('INVALID_JSON', '请求体必须为合法 JSON 数据', 400, guard.requestId);
  }

  const { engine = 'all', urls = [] } = body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return errorResponse('VALIDATION_ERROR', '推送 URL 列表不能为空且必须为数组', 422, guard.requestId);
  }

  const result = await executeSearchPush({
    engine,
    urls,
    user: guard.user,
    actorEmail: guard.user.email,
  });

  if (!result.success && result.count === 0 && result.errors?.length > 0) {
    return errorResponse('VALIDATION_ERROR', result.errors.join('；'), 422, guard.requestId);
  }

  return okResponse(result, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
