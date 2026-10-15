import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getSearchPushConfig, saveSearchPushConfig } from '@/lib/services/seoPush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  const config = await getSearchPushConfig();
  return okResponse(config, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return errorResponse('INVALID_JSON', '请求体必须为合法 JSON 数据', 400, guard.requestId);
  }

  const saved = await saveSearchPushConfig(body, guard.user);
  return okResponse(saved, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
