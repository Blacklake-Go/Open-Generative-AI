import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getAllModelsOverview } from '@/lib/services/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const models = await getAllModelsOverview();
  return okResponse({ models }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
