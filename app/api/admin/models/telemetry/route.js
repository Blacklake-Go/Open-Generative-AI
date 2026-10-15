import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getModelTelemetryOverview } from '@/lib/services/modelTelemetry.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const timeRange = url.searchParams.get('timeRange') || url.searchParams.get('range') || '24h';
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 100);

  const data = await getModelTelemetryOverview({ timeRange, limit });
  return okResponse(data, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
