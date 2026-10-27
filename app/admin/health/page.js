import { getSystemHealth } from '@/lib/services/systemHealth';
import { collectSystemPerformance } from '@/lib/services/systemPerformance';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import SystemHealthDashboard from './SystemHealthDashboard';

export const dynamic = 'force-dynamic';

export default async function SystemHealthPage() {
  await requireAdminPagePermission(PERMISSIONS.healthRead);
  const health = await getSystemHealth();
  const performance = await collectSystemPerformance({ database: health.database, migrations: health.migrations }).catch(() => null);
  const { database, migrations, worker, storage, email, modelProviders } = health;
  const status = database.ok && migrations.ok && [worker, storage, email, modelProviders].every((dependency) => dependency.status === 'healthy')
    ? 'healthy'
    : 'degraded';
  return (
    <SystemHealthDashboard
      initial={{ ...health, performance, status, uptimeSeconds: Math.floor(process.uptime()) }}
    />
  );
}
