import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getUserDashboardData } from '@/lib/services/userDashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  const period = request.nextUrl.searchParams.get('period') || 'day';
  const data = await getUserDashboardData(period);
  return okResponse(data, guard.requestId, data.meta);
}

export const GET = withAdminErrorBoundary(handleGET);
