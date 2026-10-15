import { NextResponse } from 'next/server';
import { getSystemHealth } from '@/lib/services/systemHealth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await getSystemHealth();
  const dependenciesHealthy = [result.worker, result.storage, result.email, result.modelProviders].every((dependency) => dependency.status === 'healthy');
  const healthy = Boolean(result.database.ok && result.migrations.ok && dependenciesHealthy);
  return NextResponse.json({
    status: healthy ? 'healthy' : 'degraded',
    database: { ok: Boolean(result.database.ok) },
    migrations: { ok: Boolean(result.migrations.ok) },
    worker: { status: result.worker.status },
    storage: { status: result.storage.status },
    email: { status: result.email.status },
    providers: { status: result.modelProviders.status },
    checkedAt: result.checkedAt,
  }, { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
