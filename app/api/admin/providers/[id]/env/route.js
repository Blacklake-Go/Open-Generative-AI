import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getActiveProviderKeyEnv, setActiveProviderKeyEnv } from '@/lib/services/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const activeKeyEnv = await getActiveProviderKeyEnv(id);
  return okResponse({ provider: id, activeKeyEnv }, guard.requestId);
}

async function handlePUT(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const env = body?.env === 'sandbox' ? 'sandbox' : 'production';
  const result = await setActiveProviderKeyEnv({
    actor: guard.user,
    provider: id,
    env,
    requestId: guard.requestId,
  });

  return okResponse(result, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const PUT = withAdminErrorBoundary(handlePUT);
