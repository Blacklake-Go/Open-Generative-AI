import { closePgPool } from '../lib/db/index.js';
import { probeProviderChannel } from '../lib/services/healthProbe.js';

const providerIds = ['runninghub', 'muapi'];
const results = [];
let failureCode = null;

try {
  for (const providerId of providerIds) {
    const result = await probeProviderChannel(providerId);
    results.push({
      providerId,
      healthStatus: result.healthStatus || 'unknown',
      latencyMs: Number.isFinite(result.latencyMs) ? result.latencyMs : null,
      probeKind: result.probeKind || null,
      ...(result.errorCode ? { errorCode: String(result.errorCode).slice(0, 64) } : {}),
    });
  }
} catch (error) {
  failureCode = String(error?.code || 'HEALTH_REFRESH_FAILED').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 64);
} finally {
  try {
    await closePgPool();
  } catch (error) {
    failureCode ||= String(error?.code || 'DATABASE_CLOSE_FAILED').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 64);
  }
}

const output = { event: 'provider_health_refresh', results, ...(failureCode ? { errorCode: failureCode } : {}) };
console.log(JSON.stringify(output));
if (failureCode) process.exitCode = 1;
