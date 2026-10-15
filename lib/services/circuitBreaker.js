import 'server-only';

import { readMany, readOne, write, now, dataClient } from '../repositories/runtimeDb.js';
import { getProviderById, updateProviderCircuitState, updateProviderHealth } from '../repositories/aiCatalog.js';
import { getProviderAdapter } from '../adapters/index.js';
import { getProviderBrandStats } from './modelBrands.js';

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLING_PERIOD_SEC = 60;

/**
 * 记录渠道调用成功
 * 如果处于半开状态，恢复为闭合 (closed)，并清空连续失败计数
 */
export async function recordProviderSuccess(providerId, transaction = null) {
  const run = dataClient(transaction).write;
  const timestamp = now();
  await run(`
    UPDATE ai_studio.ai_providers
    SET circuit_state = 'closed',
        consecutive_failures = 0,
        circuit_opened_at = NULL,
        health_status = CASE WHEN health_status = 'unhealthy' THEN 'degraded' ELSE health_status END,
        updated_at = $1
    WHERE id = $2 OR slug = $2
  `, [timestamp, providerId]);
}

/**
 * 记录渠道调用失败
 * 累加失败次数，若达到阈值则触发熔断 (open)
 */
export async function recordProviderFailure(providerId, { failureThreshold = DEFAULT_FAILURE_THRESHOLD } = {}, transaction = null) {
  const client = dataClient(transaction);
  const run = client.write;
  const qOne = client.readOne;
  const timestamp = now();

  const provider = await qOne(`
    SELECT id, consecutive_failures, circuit_state
    FROM ai_studio.ai_providers
    WHERE id = $1 OR slug = $1
  `, [providerId]);

  if (!provider) return;

  const newFailures = (provider.consecutive_failures || 0) + 1;
  const shouldTrip = newFailures >= failureThreshold;

  await run(`
    UPDATE ai_studio.ai_providers
    SET consecutive_failures = $1,
        circuit_state = CASE WHEN $2 THEN 'circuit_open' ELSE circuit_state END,
        circuit_opened_at = CASE WHEN $2 AND circuit_state NOT IN ('open', 'circuit_open') THEN $3 ELSE circuit_opened_at END,
        health_status = CASE WHEN $2 THEN 'unhealthy' ELSE health_status END,
        updated_at = $3
    WHERE id = $4
  `, [newFailures, shouldTrip, timestamp, provider.id]);

  if (shouldTrip) {
    import('../admin/alerting.js')
      .then(({ sendOpsAlert }) => {
        sendOpsAlert({
          title: '供应商熔断触发告警',
          level: 'danger',
          message: `供应商 [${provider.id}] 连续失败已达 ${newFailures} 次，熔断器进入 OPEN 状态，已自动隔离切流`,
          details: { providerId: provider.id, consecutiveFailures: newFailures },
        }).catch(() => {});
      })
      .catch(() => {});
  }

  return { tripped: shouldTrip, consecutiveFailures: newFailures };
}

/**
 * 重置熔断器状态
 */
export async function resetProviderCircuit(providerId, transaction = null) {
  const run = dataClient(transaction).write;
  const timestamp = now();
  await run(`
    UPDATE ai_studio.ai_providers
    SET circuit_state = 'closed',
        consecutive_failures = 0,
        circuit_opened_at = NULL,
        health_status = 'healthy',
        updated_at = $1
    WHERE id = $2 OR slug = $2
  `, [timestamp, providerId]);

  return { success: true, providerId, circuit_state: 'closed' };
}

/**
 * 检查并尝试进入半开试验状态
 */
export async function checkAndHalfOpenProvider(providerId, coolingPeriodSec = DEFAULT_COOLING_PERIOD_SEC, transaction = null) {
  const client = dataClient(transaction);
  const qOne = client.readOne;
  const run = client.write;
  const timestamp = now();

  const provider = await qOne(`
    SELECT id, circuit_state, circuit_opened_at
    FROM ai_studio.ai_providers
    WHERE id = $1 OR slug = $1
  `, [providerId]);

  if (!provider || !['open', 'circuit_open'].includes(provider.circuit_state) || !provider.circuit_opened_at) return false;

  const openedTime = new Date(provider.circuit_opened_at).getTime();
  const elapsedSec = (Date.now() - openedTime) / 1000;

  if (elapsedSec >= coolingPeriodSec) {
      await run(`
      UPDATE ai_studio.ai_providers
      SET circuit_state = 'half_open', updated_at = $1
      WHERE id = $2
      `, [timestamp, provider.id]);
    return true;
  }
  return false;
}

/**
 * 获取所有渠道的实时健康状态与熔断监控指标
 */
export async function getChannelsHealthOverview() {
  const [providers, brandStatsMap] = await Promise.all([
    readMany(`
      SELECT p.id, p.slug, p.name, p.provider_type, p.enabled, p.priority,
             p.health_status, p.circuit_state, p.circuit_opened_at, p.consecutive_failures,
             p.last_health_check_at, p.base_url, p.api_mode, p.balance, p.currency,
             p.model_catalog_api_url, p.metadata,
             COUNT(pm.id) AS bound_models_count,
             COALESCE(SUM(CASE WHEN att.status = 'succeeded' THEN 1 ELSE 0 END), 0) AS success_attempts_24h,
             COALESCE(COUNT(att.id), 0) AS total_attempts_24h,
             COALESCE(ROUND(AVG(att.duration_ms)), 0) AS avg_latency_ms_24h
      FROM ai_studio.ai_providers p
      LEFT JOIN ai_studio.provider_models pm ON pm.provider_id = p.id
      LEFT JOIN ai_studio.generation_attempts att ON att.provider_id = p.id AND att.created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY p.id
      ORDER BY p.priority DESC, p.id ASC
    `),
    getProviderBrandStats().catch(() => ({})),
  ]);

  return providers.map((row) => {
    const total = Number(row.total_attempts_24h || 0);
    const success = Number(row.success_attempts_24h || 0);
    const successRate = total > 0 ? Number(((success / total) * 100).toFixed(1)) : 100;
    const brandInfo = brandStatsMap[row.id] || {
      totalModels: Number(row.bound_models_count || 0),
      totalBrands: 0,
      topBrands: [],
    };

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      providerType: row.provider_type,
      enabled: Boolean(row.enabled),
      priority: Number(row.priority),
      healthStatus: row.health_status || 'healthy',
      circuitState: row.circuit_state || 'closed',
      circuitOpenedAt: row.circuit_opened_at,
      consecutiveFailures: Number(row.consecutive_failures || 0),
      lastHealthCheckAt: row.last_health_check_at,
      baseUrl: row.base_url,
      modelCatalogApiUrl: row.model_catalog_api_url || row.metadata?.model_catalog_api_url || '',
      apiMode: row.api_mode || 'async',
      balance: Number(row.balance || 0),
      currency: row.currency || 'USD',
      boundModelsCount: Number(row.bound_models_count || 0),
      totalAttempts24h: total,
      successAttempts24h: success,
      successRate24h: successRate,
      avgLatencyMs24h: Number(row.avg_latency_ms_24h || 0),
      brandStats: brandInfo,
    };
  });
}

/**
 * 对指定供应商执行主动探测
 */
export async function probeProviderChannel(providerId) {
  const start = Date.now();
  try {
    const adapter = await getProviderAdapter(providerId);
    const probeResult = await adapter.healthCheck();
    const latencyMs = probeResult.latencyMs || (Date.now() - start);
    const healthStatus = Boolean(probeResult?.healthy || probeResult?.status === 'healthy') ? 'healthy' : 'degraded';

    await updateProviderHealth(providerId, {
      healthStatus,
      latencyMs,
      balance: probeResult.balance ?? null,
    });

    return {
      success: true,
      providerId,
      healthStatus,
      latencyMs,
      message: probeResult.message || '健康探针响应正常',
      details: probeResult,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    await updateProviderHealth(providerId, {
      healthStatus: 'unhealthy',
      latencyMs,
    });

    return {
      success: false,
      providerId,
      healthStatus: 'unhealthy',
      latencyMs,
      message: error.message || '健康探针连接失败',
      errorCode: error.code || 'PROBE_FAILED',
    };
  }
}
