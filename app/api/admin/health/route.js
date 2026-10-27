import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getSystemHealth } from '@/lib/services/systemHealth';
import { collectSystemPerformance } from '@/lib/services/systemPerformance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.healthRead);
  if (!guard.ok) return guard.response;
  try {
    const { database, migrations, providers, worker, storage, email, modelProviders, checkedAt } = await getSystemHealth();
    const performance = await collectSystemPerformance({ database, migrations }).catch(() => null);
    return okResponse({
      status: database.ok && migrations.ok && [worker, storage, email, modelProviders].every((dependency) => dependency.status === 'healthy') ? 'healthy' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      runtime: { node: process.version, platform: process.platform, memory: { rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024), heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) } },
      database: { engine: 'PostgreSQL 16', ...database, migrations },
      worker,
      storage,
      email,
      modelProviders,
      providers,
      performance,
      checkedAt,
    }, guard.requestId);
  } catch (error) {
    return okResponse({ status: 'unhealthy', database: { engine: 'PostgreSQL 16', ok: false, error: error.code || 'DATABASE_UNAVAILABLE' } }, guard.requestId);
  }
}

export const GET = withAdminErrorBoundary(handleGET);
