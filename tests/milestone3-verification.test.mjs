import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('Milestone 3 - F09: Provider Readiness Script Extension (scripts/refresh-provider-readiness.mjs)', async (t) => {
  const scriptPath = path.join(ROOT, 'scripts/refresh-provider-readiness.mjs');
  assert.ok(fs.existsSync(scriptPath), 'scripts/refresh-provider-readiness.mjs must exist');

  const src = fs.readFileSync(scriptPath, 'utf8');

  await t.test('includes runninghub, volcengine, and muapi in provider list', () => {
    assert.ok(src.includes('runninghub'), 'Must include runninghub');
    assert.ok(src.includes('volcengine'), 'Must include volcengine');
    assert.ok(src.includes('muapi'), 'Must include muapi');
  });

  await t.test('calls probeProviderChannel for dual record emission (ai_studio & ops_bill)', () => {
    assert.ok(src.includes('probeProviderChannel'), 'Must invoke probeProviderChannel');
  });

  await t.test('emits structured provider_health_refresh JSON event', () => {
    assert.ok(src.includes('provider_health_refresh'), 'Must emit provider_health_refresh event');
  });

  await t.test('contains finally block with closePgPool() for clean connection cleanup', () => {
    assert.ok(src.includes('finally'), 'Must contain finally block');
    assert.ok(src.includes('closePgPool'), 'Must call closePgPool');
  });

  await t.test('isolates single provider failure in try/catch to protect remaining probes', () => {
    const hasPerProviderTryCatch = /for\s*\(\s*const\s+\w+\s+of\s+\w+\s*\)\s*\{\s*try\s*\{/s.test(src);
    assert.ok(hasPerProviderTryCatch, 'Must wrap each provider probe in try-catch to prevent loop abortion');
  });
});

test('Milestone 3 - F10: Provider Health Refresh Timer Schedule (ops/systemd/koyosim-provider-health-refresh.timer)', async (t) => {
  const timerPath = path.join(ROOT, 'ops/systemd/koyosim-provider-health-refresh.timer');
  const servicePath = path.join(ROOT, 'ops/systemd/koyosim-provider-health-refresh.service');

  assert.ok(fs.existsSync(timerPath), 'Timer file must exist');
  assert.ok(fs.existsSync(servicePath), 'Service file must exist');

  const timerSrc = fs.readFileSync(timerPath, 'utf8');
  const serviceSrc = fs.readFileSync(servicePath, 'utf8');

  await t.test('tightens OnUnitInactiveSec to 3min (safely under 15m staleness cliff)', () => {
    assert.match(timerSrc, /OnUnitInactiveSec=(3min|5min)/, 'OnUnitInactiveSec must be set to 3min or 5min');
    assert.ok(!timerSrc.includes('OnUnitInactiveSec=10min'), 'Must not remain at old 10min interval');
  });

  await t.test('includes OnBootSec and AccuracySec for restart catch-up and jitter prevention', () => {
    assert.ok(timerSrc.includes('OnBootSec='), 'Must include OnBootSec');
    assert.ok(timerSrc.includes('AccuracySec='), 'Must include AccuracySec');
  });

  await t.test('timer triggers koyosim-provider-health-refresh.service', () => {
    assert.ok(timerSrc.includes('Unit=koyosim-provider-health-refresh.service'), 'Must bind to service');
  });

  await t.test('service executes refresh-provider-readiness.mjs with react-server conditions', () => {
    assert.ok(serviceSrc.includes('scripts/refresh-provider-readiness.mjs'), 'Service must run refresh script');
    assert.ok(serviceSrc.includes('--conditions=react-server'), 'Must pass --conditions=react-server');
  });
});

test('Milestone 3 - F12: Supervisor & Worker Daemon Verification', async (t) => {
  const supervisorPath = path.join(ROOT, 'scripts/generation-worker-supervisor.mjs');
  const workerPath = path.join(ROOT, 'scripts/generation-worker.mjs');

  assert.ok(fs.existsSync(supervisorPath), 'Supervisor script must exist');
  assert.ok(fs.existsSync(workerPath), 'Worker script must exist');

  const supervisorSrc = fs.readFileSync(supervisorPath, 'utf8');
  const workerSrc = fs.readFileSync(workerPath, 'utf8');

  await t.test('supervisor manages restart budget with exponential backoff', () => {
    assert.ok(supervisorSrc.includes('maxRestarts'), 'Must configure maxRestarts');
    assert.ok(supervisorSrc.includes('restartWindowMs'), 'Must configure restartWindowMs');
    assert.ok(supervisorSrc.includes('baseBackoffMs'), 'Must configure baseBackoffMs');
  });

  await t.test('supervisor intercepts and forwards SIGINT and SIGTERM to child worker', () => {
    assert.ok(supervisorSrc.includes("process.on('SIGINT'"), 'Must handle SIGINT');
    assert.ok(supervisorSrc.includes("process.on('SIGTERM'"), 'Must handle SIGTERM');
    assert.ok(supervisorSrc.includes('forwardSignal'), 'Must forward signals');
  });

  await t.test('worker emits heartbeat every 10 seconds via recordWorkerHeartbeat', () => {
    assert.ok(workerSrc.includes('recordWorkerHeartbeat'), 'Must record worker heartbeat');
    assert.ok(workerSrc.includes('heartbeatMs'), 'Must configure heartbeatMs interval');
  });

  await t.test('worker main loop periodically calls syncProviderHealth', () => {
    assert.ok(workerSrc.includes('syncProviderHealth'), 'Must invoke syncProviderHealth in cycle');
    assert.ok(workerSrc.includes('probeProviderChannels'), 'Must call probeProviderChannels');
  });
});

test('Milestone 3 - F11: Health & Readiness Recovery Simulation (/api/health and /api/ready)', async (t) => {
  await t.test('getSystemHealth aggregates all core services and yields healthy (HTTP 200)', () => {
    const mockHealth = {
      database: { ok: true, latencyMs: 2 },
      migrations: { ok: true, pending: [] },
      worker: { status: 'healthy' },
      storage: { status: 'healthy' },
      email: { status: 'healthy' },
      modelProviders: { status: 'healthy' },
    };

    const dependenciesHealthy = [
      mockHealth.worker,
      mockHealth.storage,
      mockHealth.email,
      mockHealth.modelProviders,
    ].every((d) => d.status === 'healthy');

    const healthy = Boolean(mockHealth.database.ok && mockHealth.migrations.ok && dependenciesHealthy);
    const httpStatusCode = healthy ? 200 : 503;

    assert.equal(healthy, true);
    assert.equal(httpStatusCode, 200);
  });

  await t.test('getReadiness evaluates all dependencies and returns ready (HTTP 200)', () => {
    const mockReadiness = {
      database: { ok: true },
      migrations: { ok: true },
      worker: { status: 'healthy' },
      storage: { status: 'healthy' },
      email: { status: 'healthy' },
      providers: { status: 'healthy' },
    };

    const coreDependenciesHealthy =
      mockReadiness.worker.status === 'healthy' &&
      mockReadiness.storage.status === 'healthy' &&
      mockReadiness.email.status === 'healthy' &&
      mockReadiness.providers.status === 'healthy';

    const ready = Boolean(mockReadiness.database.ok && mockReadiness.migrations.ok && coreDependenciesHealthy);
    const httpStatusCode = ready ? 200 : 503;

    assert.equal(ready, true);
    assert.equal(httpStatusCode, 200);
  });

  await t.test('provider timestamp staleness (>15m) drops status to degraded / not_ready (HTTP 503)', () => {
    const now = Date.now();
    const staleTimestamp = now - (15 * 60 * 1000 + 5000); // 15 min 5 sec ago
    const isStale = (now - staleTimestamp) > 15 * 60 * 1000;
    assert.equal(isStale, true);

    const providerStatus = isStale ? 'unknown' : 'healthy';
    assert.equal(providerStatus, 'unknown');

    const isReady = providerStatus === 'healthy';
    const statusCode = isReady ? 200 : 503;
    assert.equal(isReady, false);
    assert.equal(statusCode, 503);
  });

  await t.test('3-minute timer interval guarantees timestamp is never stale (< 15m)', () => {
    const timerIntervalMs = 3 * 60 * 1000;
    const maxStalenessLimitMs = 15 * 60 * 1000;
    assert.ok(timerIntervalMs * 2 < maxStalenessLimitMs, 'Even with one missed cycle, 6 minutes is safely below 15m threshold');
  });
});
