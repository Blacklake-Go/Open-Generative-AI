import { healthCheck, nowIso } from '../db/index.js';
import { getMigrationStatus } from '../db/migrations.js';
import { getProvidersOverview } from './providers.js';
import { getGenerationWorkerHealth } from './workerHealth.js';
import { getEmailHealth, getProviderHealth, getStorageHealth } from './dependencyHealth.js';

const unknownDependency = { status: 'unknown', errorCode: 'DEPENDENCY_HEALTH_UNAVAILABLE' };

function coreDependenciesHealthy({ worker, storage, email, providers }) {
  return worker.status === 'healthy' && storage.status === 'healthy' && email.status === 'healthy' && providers.status === 'healthy';
}

export async function getSystemHealth() {
  const [database, migrations, providerOverview, worker, storage, email, modelProviders] = await Promise.all([
    healthCheck().catch((error) => ({ ok: false, latencyMs: null, pool: { total: 0, idle: 0, waiting: 0, max: 0 }, database: null, user: null, error: error.code || 'DATABASE_UNAVAILABLE' })),
    getMigrationStatus().catch((error) => ({ ok: false, applied: [], pending: [], drifted: [], latest: null, error: error.code || 'MIGRATION_STATUS_UNAVAILABLE' })),
    getProvidersOverview().catch((error) => [{ id: 'system', name: '外部依赖', description: '健康检查暂时不可用', configured: false, status: 'unknown', error: error.code || 'PROVIDER_STATUS_UNAVAILABLE' }]),
    getGenerationWorkerHealth(),
    getStorageHealth().catch(() => unknownDependency),
    getEmailHealth().catch(() => unknownDependency),
    getProviderHealth().catch(() => unknownDependency),
  ]);
  return { database, migrations, providers: providerOverview, worker, storage, email, modelProviders, checkedAt: nowIso() };
}

export async function getReadiness({
  workerProbe = getGenerationWorkerHealth,
  storageProbe = getStorageHealth,
  emailProbe = getEmailHealth,
  providerProbe = getProviderHealth,
} = {}) {
  try {
    const [database, migrations, worker, storage, email, providers] = await Promise.all([
      healthCheck(), getMigrationStatus(), workerProbe(), storageProbe(), emailProbe(), providerProbe(),
    ]);
    return {
      ready: Boolean(database.ok && migrations.ok && coreDependenciesHealthy({ worker, storage, email, providers })),
      database: { ok: Boolean(database.ok) },
      migrations: { ok: Boolean(migrations.ok) },
      worker: { status: worker.status },
      storage: { status: storage.status },
      email: { status: email.status },
      providers: { status: providers.status },
    };
  } catch {
    return {
      ready: false,
      database: { ok: false },
      migrations: { ok: false },
      worker: { status: 'unknown' },
      storage: { status: 'unknown' },
      email: { status: 'unknown' },
      providers: { status: 'unknown' },
    };
  }
}
