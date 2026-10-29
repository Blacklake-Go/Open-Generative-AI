import 'server-only';

import { query, queryOne, queryMany, execute, nowIso, randomId } from '../db/index.js';

// ============================================================================
// 1. AI 供应商 (AI Providers)
// ============================================================================

export async function listProviders() {
  return queryMany(`
    SELECT id, slug, name, provider_type, enabled, priority, base_url, api_mode,
           health_status, last_health_check_at, balance, currency, circuit_state,
           circuit_opened_at, consecutive_failures, metadata, created_at, updated_at
    FROM ai_studio.ai_providers
    ORDER BY priority DESC, id ASC
  `);
}

export async function getProviderById(id, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    SELECT id, slug, name, provider_type, enabled, priority, base_url, api_mode,
           health_status, last_health_check_at, balance, currency, circuit_state,
           circuit_opened_at, consecutive_failures, metadata, created_at, updated_at
    FROM ai_studio.ai_providers
    WHERE id = $1 OR slug = $1
  `, [id]);
}

export function normalizeApiMode(val) {
  if (!val) return 'async';
  const v = String(val).trim().toLowerCase();
  if (v === 'sync' || v === 'sync_direct') return 'sync';
  if (v === 'stream') return 'stream';
  return 'async';
}

export function normalizeProviderType(val) {
  if (!val) return 'aggregator';
  const v = String(val).trim().toLowerCase();
  if (v === 'official') return 'official';
  if (v === 'direct' || v === 'custom') return 'direct';
  return 'aggregator';
}

export async function createProvider(providerData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const id = String(providerData.id || `prv_${randomId()}`).trim().toLowerCase();
  const slug = String(providerData.slug || id).trim().toLowerCase();
  const provider_type = normalizeProviderType(providerData.provider_type);
  const api_mode = normalizeApiMode(providerData.api_mode);
  const model_catalog_api_url = providerData.model_catalog_api_url || providerData.modelCatalogApiUrl || '';

  const metadata = {
    ...(providerData.metadata || {}),
    ...(model_catalog_api_url ? { model_catalog_api_url } : {}),
  };

  await run(`
    INSERT INTO ai_studio.ai_providers
      (id, slug, name, provider_type, enabled, priority, base_url, api_mode,
       balance, currency, health_status, circuit_state, metadata, model_catalog_api_url, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'healthy', 'closed', $11::jsonb, $12, $13, $13)
  `, [
    id, slug, providerData.name || id, provider_type,
    providerData.enabled !== false, Number(providerData.priority || 100),
    providerData.base_url || '', api_mode,
    // 未提供余额时写入 NULL（未知）；0 只代表真实观测到的零余额。
    providerData.balance === null || providerData.balance === undefined || providerData.balance === ''
      ? null
      : Number(providerData.balance),
    providerData.currency || 'USD',
    JSON.stringify(metadata), model_catalog_api_url, now,
  ]);

  return getProviderById(id, transaction);
}

export async function deleteProvider(id, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return run('DELETE FROM ai_studio.ai_providers WHERE id = $1', [id]);
}

export async function updateProvider(id, updates, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const existing = await getProviderById(id, transaction);
  if (!existing) return null;

  const name = updates.name !== undefined ? updates.name : existing.name;
  const provider_type = updates.provider_type !== undefined ? normalizeProviderType(updates.provider_type) : existing.provider_type;
  const enabled = updates.enabled !== undefined ? Boolean(updates.enabled) : existing.enabled;
  const priority = updates.priority !== undefined ? Number(updates.priority) : existing.priority;
  const base_url = updates.base_url !== undefined ? updates.base_url : existing.base_url;
  const api_mode = updates.api_mode !== undefined ? normalizeApiMode(updates.api_mode) : existing.api_mode;
  const balance = updates.balance === undefined
    ? existing.balance
    : updates.balance === null || updates.balance === ''
      ? null
      : Number.isFinite(Number(updates.balance))
        ? Number(updates.balance)
        : existing.balance;
  const currency = updates.currency !== undefined ? updates.currency : existing.currency;
  const model_catalog_api_url = updates.model_catalog_api_url !== undefined
    ? updates.model_catalog_api_url
    : updates.modelCatalogApiUrl !== undefined
    ? updates.modelCatalogApiUrl
    : existing.model_catalog_api_url || '';

  let metadata = existing.metadata || {};
  if (updates.metadata !== undefined) {
    metadata = typeof updates.metadata === 'object' ? { ...metadata, ...updates.metadata } : metadata;
  }
  if (model_catalog_api_url !== undefined) {
    metadata.model_catalog_api_url = model_catalog_api_url;
  }

  const now = nowIso();
  await run(`
    UPDATE ai_studio.ai_providers
    SET name = $1, provider_type = $2, enabled = $3, priority = $4, base_url = $5,
        api_mode = $6, balance = $7, currency = $8, metadata = $9::jsonb,
        model_catalog_api_url = $10, updated_at = $11
    WHERE id = $12
  `, [name, provider_type, enabled, priority, base_url, api_mode, balance, currency, JSON.stringify(metadata), model_catalog_api_url, now, existing.id]);

  return getProviderById(existing.id, transaction);
}

export async function updateProviderHealth(id, { healthStatus, latencyMs = null, balance = null }, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const setClauses = ['health_status = $1', 'last_health_check_at = $2', 'updated_at = $2'];
  const params = [healthStatus, now];
  let paramIdx = 2;

  if (balance !== null && Number.isFinite(Number(balance))) {
    // 观察到余额的同时记录观测时间，后台据此区分「实测值」与「历史未知」。
    setClauses.push(`balance = $${++paramIdx}`, 'balance_checked_at = $2');
    params.push(Number(balance));
  }
  params.push(id);

  await run(`
    UPDATE ai_studio.ai_providers
    SET ${setClauses.join(', ')}
    WHERE id = $${++paramIdx} OR slug = $${paramIdx}
  `, params);
}

export async function updateProviderCircuitState(id, { circuitState, circuitOpenedAt = null, consecutiveFailures = 0 }, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  await run(`
    UPDATE ai_studio.ai_providers
    SET circuit_state = $1, circuit_opened_at = $2, consecutive_failures = $3, updated_at = $4
    WHERE id = $5 OR slug = $5
  `, [circuitState, circuitOpenedAt, consecutiveFailures, now, id]);
}

// ============================================================================
// 2. 标准模型目录 (Canonical AI Models)
// ============================================================================

export async function listCanonicalModels({ category = null, activeOnly = false } = {}) {
  const clauses = ['1=1'];
  const params = [];
  let paramIdx = 0;

  if (category) {
    clauses.push(`category = $${++paramIdx}`);
    params.push(category);
  }
  if (activeOnly) {
    clauses.push(`status = 'active'`);
  }

  return queryMany(`
    SELECT id, slug, name, display_name, category, description, cover, status,
           sort, is_featured, capabilities, default_parameters, supported_resolutions,
           supported_durations, supported_ratios, supported_input_types, supported_output_types,
           created_at, updated_at
    FROM ai_studio.ai_models
    WHERE ${clauses.join(' AND ')}
    ORDER BY sort ASC, created_at ASC
  `, params);
}

export async function getCanonicalModelById(id, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    SELECT id, slug, name, display_name, category, description, cover, status,
           sort, is_featured, capabilities, default_parameters, supported_resolutions,
           supported_durations, supported_ratios, supported_input_types, supported_output_types,
           created_at, updated_at
    FROM ai_studio.ai_models
    WHERE id = $1 OR slug = $1
  `, [id]);
}

export async function upsertCanonicalModel(modelData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const id = String(modelData.id).trim();
  const slug = String(modelData.slug || id).trim();

  await run(`
    INSERT INTO ai_studio.ai_models
      (id, slug, name, display_name, category, description, cover, status, sort, is_featured,
       capabilities, default_parameters, supported_resolutions, supported_durations,
       supported_ratios, supported_input_types, supported_output_types, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18, $18)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      display_name = EXCLUDED.display_name,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      cover = EXCLUDED.cover,
      status = EXCLUDED.status,
      sort = EXCLUDED.sort,
      is_featured = EXCLUDED.is_featured,
      capabilities = EXCLUDED.capabilities,
      default_parameters = EXCLUDED.default_parameters,
      supported_resolutions = EXCLUDED.supported_resolutions,
      supported_durations = EXCLUDED.supported_durations,
      supported_ratios = EXCLUDED.supported_ratios,
      supported_input_types = EXCLUDED.supported_input_types,
      supported_output_types = EXCLUDED.supported_output_types,
      updated_at = EXCLUDED.updated_at
  `, [
    id, slug, modelData.name, modelData.display_name || modelData.name,
    modelData.category || 'image', modelData.description || '', modelData.cover || '',
    modelData.status || 'active', Number(modelData.sort || 0), Boolean(modelData.is_featured),
    JSON.stringify(modelData.capabilities || {}),
    JSON.stringify(modelData.default_parameters || {}),
    JSON.stringify(modelData.supported_resolutions || []),
    JSON.stringify(modelData.supported_durations || []),
    JSON.stringify(modelData.supported_ratios || []),
    JSON.stringify(modelData.supported_input_types || []),
    JSON.stringify(modelData.supported_output_types || []),
    now,
  ]);

  return getCanonicalModelById(id, transaction);
}

// ============================================================================
// 3. 供应商模型渠道 (Provider Models)
// ============================================================================

export async function listProviderModelsByModelId(modelId, { enabledOnly = false, transaction = null } = {}) {
  const clauses = ['pm.model_id = $1'];
  if (enabledOnly) clauses.push('pm.enabled = TRUE', 'p.enabled = TRUE', "pm.review_status = 'approved'");

  const runMany = transaction?.queryMany ? transaction.queryMany.bind(transaction) : queryMany;
  return runMany(`
    SELECT pm.id, pm.model_id, pm.provider_id, pm.provider_model_id, pm.enabled,
           pm.priority, pm.cost_config, pm.parameter_mapping, pm.capabilities,
           pm.endpoint_config, pm.timeout, pm.max_retries, pm.supports_webhook,
           pm.supports_polling, pm.concurrency_limit, pm.rate_limit, pm.metadata,
           pm.review_status, pm.provider_model_version, pm.provider_endpoint,
           pm.supported_task_types, pm.supported_resolutions, pm.supported_durations,
           pm.supported_qualities, pm.supported_regions, pm.license_requirements,
           pm.mapping_version,
           pm.created_at, pm.updated_at,
           p.name AS provider_name, p.provider_type, p.base_url, p.enabled AS provider_enabled,
           p.health_status, p.last_health_check_at, p.circuit_state,
           p.balance AS provider_balance, p.currency AS provider_currency,
           p.available_quota, p.quota_checked_at,
           COALESCE(active_attempts.active_count, 0)::int AS active_attempt_count,
           COALESCE(recent_stats.success_rate, 0)::numeric AS success_rate,
           COALESCE(recent_stats.average_latency_ms, 900000000)::numeric AS average_latency_ms,
           CASE WHEN price.id IS NULL THEN NULL ELSE jsonb_build_object(
             'id', price.id, 'version_no', price.version_no, 'price_type', price.price_type,
             'billing_unit', price.billing_unit, 'currency', price.currency,
             'price_config', price.price_config, 'applicability', price.applicability,
             'source_url', price.source_url, 'source_api', price.source_api,
             'source_observed_at', price.source_observed_at, 'fetched_at', price.fetched_at,
             'effective_at', price.effective_at, 'expires_at', price.expires_at,
             'status', price.status, 'manually_locked', price.manually_locked,
             'evidence_digest', price.evidence_digest,
             'conservative_upper_bound_config', price.conservative_upper_bound_config,
             'conservative_upper_bound_currency', price.conservative_upper_bound_currency,
             'conservative_upper_bound_expires_at', price.conservative_upper_bound_expires_at,
             'conservative_upper_bound_reason', price.conservative_upper_bound_reason
           ) END AS active_price_version
    FROM ai_studio.provider_models pm
    JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
    LEFT JOIN LATERAL (
      SELECT pv.* FROM ai_studio.provider_model_price_versions pv
      WHERE pv.provider_model_id = pm.id AND pv.status = 'active'
        AND pv.price_type IN ('account_actual','aggregator','manual')
      ORDER BY CASE pv.price_type WHEN 'account_actual' THEN 0 WHEN 'manual' THEN 1 ELSE 2 END,
        pv.version_no DESC LIMIT 1
    ) price ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS active_count
      FROM ai_studio.generation_attempts att
      JOIN ai_studio.creations c ON c.id = att.creation_id AND c.model = pm.model_id
      WHERE att.provider_id = pm.provider_id AND att.provider_model_id = pm.provider_model_id
        AND att.status IN ('submitted','processing')
    ) active_attempts ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        CASE WHEN count(*) = 0 THEN 0
          ELSE count(*) FILTER (WHERE att.status = 'succeeded')::numeric / count(*) END AS success_rate,
        avg(att.duration_ms) FILTER (WHERE att.duration_ms IS NOT NULL) AS average_latency_ms
      FROM (
        SELECT status,duration_ms FROM ai_studio.generation_attempts
        WHERE provider_id = pm.provider_id
        ORDER BY created_at DESC LIMIT 100
      ) att
    ) recent_stats ON TRUE
    WHERE ${clauses.join(' AND ')}
    ORDER BY pm.priority DESC, pm.id ASC
  `, [modelId]);
}

export async function getProviderModelById(id, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    SELECT pm.*, p.name AS provider_name, p.provider_type, p.base_url, p.health_status, p.circuit_state
    FROM ai_studio.provider_models pm
    JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
    WHERE pm.id = $1
  `, [id]);
}

export async function upsertProviderModel(pmData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const id = pmData.id || `pm_${randomId()}`;

  await run(`
    INSERT INTO ai_studio.provider_models
      (id, model_id, provider_id, provider_model_id, enabled, priority, cost_config,
       parameter_mapping, capabilities, endpoint_config, timeout, max_retries,
       supports_webhook, supports_polling, concurrency_limit, rate_limit, metadata, created_at, updated_at,
       review_status, provider_model_version, provider_endpoint, supported_task_types,
       supported_resolutions, supported_durations, supported_qualities, supported_regions,
       license_requirements, mapping_version)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $18,
       $19, $20, $21, $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb, $26::jsonb, $27::jsonb, $28)
    ON CONFLICT (id) DO UPDATE SET
      model_id = EXCLUDED.model_id,
      provider_id = EXCLUDED.provider_id,
      provider_model_id = EXCLUDED.provider_model_id,
      enabled = EXCLUDED.enabled,
      priority = EXCLUDED.priority,
      cost_config = EXCLUDED.cost_config,
      parameter_mapping = EXCLUDED.parameter_mapping,
      capabilities = EXCLUDED.capabilities,
      endpoint_config = EXCLUDED.endpoint_config,
      timeout = EXCLUDED.timeout,
      max_retries = EXCLUDED.max_retries,
      supports_webhook = EXCLUDED.supports_webhook,
      supports_polling = EXCLUDED.supports_polling,
      concurrency_limit = EXCLUDED.concurrency_limit,
      rate_limit = EXCLUDED.rate_limit,
      metadata = EXCLUDED.metadata,
      review_status = EXCLUDED.review_status,
      provider_model_version = EXCLUDED.provider_model_version,
      provider_endpoint = EXCLUDED.provider_endpoint,
      supported_task_types = EXCLUDED.supported_task_types,
      supported_resolutions = EXCLUDED.supported_resolutions,
      supported_durations = EXCLUDED.supported_durations,
      supported_qualities = EXCLUDED.supported_qualities,
      supported_regions = EXCLUDED.supported_regions,
      license_requirements = EXCLUDED.license_requirements,
      mapping_version = EXCLUDED.mapping_version,
      updated_at = EXCLUDED.updated_at
  `, [
    id, pmData.model_id, pmData.provider_id, pmData.provider_model_id,
    pmData.enabled !== false, Number(pmData.priority || 100),
    JSON.stringify(pmData.cost_config || {}),
    JSON.stringify(pmData.parameter_mapping || {}),
    JSON.stringify(pmData.capabilities || {}),
    JSON.stringify(pmData.endpoint_config || {}),
    Number(pmData.timeout || 120000),
    Number(pmData.max_retries || 2),
    Boolean(pmData.supports_webhook),
    pmData.supports_polling !== false,
    Number(pmData.concurrency_limit || 10),
    Number(pmData.rate_limit || 60),
    JSON.stringify(pmData.metadata || {}),
    now,
    pmData.review_status || 'pending_review',
    pmData.provider_model_version || null,
    pmData.provider_endpoint || null,
    JSON.stringify(pmData.supported_task_types || []),
    JSON.stringify(pmData.supported_resolutions || []),
    JSON.stringify(pmData.supported_durations || []),
    JSON.stringify(pmData.supported_qualities || []),
    JSON.stringify(pmData.supported_regions || []),
    JSON.stringify(pmData.license_requirements || []),
    Number(pmData.mapping_version || 1),
  ]);

  return getProviderModelById(id, transaction);
}

export async function deleteProviderModel(id, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return run('DELETE FROM ai_studio.provider_models WHERE id = $1', [id]);
}

// ============================================================================
// 4. 定价与路由策略 (Pricing & Routing Policies)
// ============================================================================

export async function getModelPricing(modelId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run('SELECT * FROM ai_studio.model_pricing WHERE model_id = $1', [modelId]);
}

export async function upsertModelPricing(pricingData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const id = pricingData.id || `prc_${randomId()}`;
  const pricingMode = pricingData.pricing_mode || 'auto';
  const priceLocked = pricingData.price_locked !== undefined ? Boolean(pricingData.price_locked) : (pricingMode === 'locked');
  const minGrossMarginRate = pricingData.min_gross_margin_rate !== undefined ? Number(pricingData.min_gross_margin_rate) : 0.30;
  const manualOverridePriceCny = pricingData.manual_override_price_cny !== undefined && pricingData.manual_override_price_cny !== null
    ? Number(pricingData.manual_override_price_cny)
    : (pricingMode === 'manual' || pricingMode === 'locked') && pricingData.base_credits
      ? Number((Number(pricingData.base_credits) * 0.1).toFixed(4))
      : null;

  await run(`
    INSERT INTO ai_studio.model_pricing
      (id, model_id, pricing_type, pricing_mode, base_credits, manual_override_price_cny,
       price_locked, formula_config, subscription_discounts,
       min_credits, min_gross_margin_rate, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $13)
    ON CONFLICT (model_id) DO UPDATE SET
      pricing_type = EXCLUDED.pricing_type,
      pricing_mode = COALESCE(EXCLUDED.pricing_mode, ai_studio.model_pricing.pricing_mode),
      base_credits = EXCLUDED.base_credits,
      manual_override_price_cny = EXCLUDED.manual_override_price_cny,
      price_locked = EXCLUDED.price_locked,
      formula_config = EXCLUDED.formula_config,
      subscription_discounts = EXCLUDED.subscription_discounts,
      min_credits = EXCLUDED.min_credits,
      min_gross_margin_rate = EXCLUDED.min_gross_margin_rate,
      is_active = EXCLUDED.is_active,
      updated_at = EXCLUDED.updated_at
  `, [
    id,
    pricingData.model_id,
    pricingData.pricing_type || 'fixed',
    pricingMode,
    Number(pricingData.base_credits || 100),
    manualOverridePriceCny,
    priceLocked,
    JSON.stringify(pricingData.formula_config || {}),
    // 会员等级不影响单次生成价；赠送/折扣由订阅履约处理，不能进入模型报价。
    JSON.stringify({}),
    Number(pricingData.min_credits || 10),
    minGrossMarginRate,
    pricingData.is_active !== false,
    now,
  ]);

  try {
    await run(`
      UPDATE ai_studio.models_config
      SET credits_price = $1, updated_at = $2
      WHERE LOWER(id) = LOWER($3)
    `, [Number(pricingData.base_credits || 100), now, pricingData.model_id]);
  } catch {}

  return getModelPricing(pricingData.model_id, transaction);
}

export async function getRoutingPolicy(modelId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run('SELECT * FROM ai_studio.routing_policies WHERE model_id = $1', [modelId]);
}

export async function upsertRoutingPolicy(policyData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const id = policyData.id || `rp_${randomId()}`;

  await run(`
    INSERT INTO ai_studio.routing_policies
      (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $7)
    ON CONFLICT (model_id) DO UPDATE SET
      routing_mode = EXCLUDED.routing_mode,
      weights = EXCLUDED.weights,
      circuit_breaker_config = EXCLUDED.circuit_breaker_config,
      failover_enabled = EXCLUDED.failover_enabled,
      updated_at = EXCLUDED.updated_at
  `, [
    id, policyData.model_id, policyData.routing_mode || 'balanced',
    JSON.stringify(policyData.weights || { cost: 0.4, success_rate: 0.3, speed: 0.2, capacity: 0.1 }),
    JSON.stringify(policyData.circuit_breaker_config || { failure_threshold: 3, cooling_period_sec: 60, half_open_requests: 2 }),
    policyData.failover_enabled !== false,
    now,
  ]);

  return getRoutingPolicy(policyData.model_id, transaction);
}

/**
 * 把某条渠道钉为该模型的默认供应商。
 *
 * 一个模型同时只允许一条钉选：metadata.primary 先全量摘掉再写目标，避免两次
 * 点击留下两个 primary 让路由器与后台显示互相矛盾。归属校验放在这里而不是只靠
 * service，因为这一行写入本身就是跨模型的越权面。
 */
export async function setChannelPrimary(modelId, channelId, transaction = null) {
  const runQueryOne = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const runQueryMany = transaction?.queryMany ? transaction.queryMany.bind(transaction) : queryMany;

  const target = await runQueryOne(
    'SELECT id, model_id, provider_id FROM ai_studio.provider_models WHERE id = $1 FOR UPDATE', [channelId]
  );
  if (!target || String(target.model_id) !== String(modelId)) {
    throw Object.assign(new Error('目标渠道不属于该模型'), { code: 'INVALID_PRIMARY_CHANNEL' });
  }

  const now = nowIso();
  await run(`
    UPDATE ai_studio.provider_models
    SET metadata = COALESCE(metadata, '{}'::jsonb) - 'primary', updated_at = $1
    WHERE model_id = $2 AND id <> $3 AND metadata ? 'primary'
  `, [now, modelId, channelId]);
  await run(`
    UPDATE ai_studio.provider_models
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{primary}', 'true'::jsonb, true),
        updated_at = $1
    WHERE id = $2
  `, [now, channelId]);

  // 级联处理：如果当前模型是规范聚合核心模型，将其旗下变体子模型的主选渠道同步至相同的供应商
  const childChannels = await runQueryMany(`
    SELECT id, model_id, provider_id
    FROM ai_studio.provider_models
    WHERE metadata->>'canonical_parent' = $1
  `, [modelId]);

  if (childChannels.length > 0) {
    const providerId = target.provider_id;
    const childModelIds = [...new Set(childChannels.map(c => c.model_id))];
    for (const childModelId of childModelIds) {
      const match = childChannels.find(c => c.model_id === childModelId && c.provider_id === providerId);
      if (match) {
        await run(`
          UPDATE ai_studio.provider_models
          SET metadata = COALESCE(metadata, '{}'::jsonb) - 'primary', updated_at = $1
          WHERE model_id = $2 AND id <> $3 AND metadata ? 'primary'
        `, [now, childModelId, match.id]);
        await run(`
          UPDATE ai_studio.provider_models
          SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{primary}', 'true'::jsonb, true),
              updated_at = $1
          WHERE id = $2
        `, [now, match.id]);
      }
    }
  }

  return getProviderModelById(channelId, transaction);
}

/**
 * 报价总览：每个规范模型的平台定价、最低启用渠道成本与启用渠道数，一条 SQL。
 *
 * 逐模型取 pricing + 逐模型取渠道会让后台报价页在几十行时就开始 N+1；
 * 两个 LATERAL 把「最便宜成本」和「渠道数」在同一次往返里算完。
 */
export async function listCanonicalPricingRows() {
  return queryMany(`
    SELECT
      m.id,
      m.name,
      m.display_name,
      m.category,
      m.status,
      m.sort,
      pr.base_credits,
      pr.pricing_type,
      cheapest.provider_id AS cheapest_provider_id,
      cheapest.cost_usd AS min_cost_usd,
      cheapest.currency AS min_cost_currency,
      COALESCE(enabled_channels.count, 0) AS enabled_channels
    FROM ai_studio.ai_models m
    LEFT JOIN ai_studio.model_pricing pr ON pr.model_id = m.id AND pr.is_active = TRUE
    LEFT JOIN LATERAL (
      SELECT pm.provider_id,
             COALESCE((pm.cost_config->>'base_cost')::numeric,
                      (pm.cost_config->>'cost_per_output_second')::numeric,
                      (pm.cost_config->>'cost_per_second')::numeric) AS cost_usd,
             COALESCE(pm.cost_config->>'currency', 'USD') AS currency
      FROM ai_studio.provider_models pm
      JOIN ai_studio.ai_providers p ON p.id = pm.provider_id AND p.enabled = TRUE
      WHERE pm.model_id = m.id
        AND pm.enabled = TRUE
        AND COALESCE((pm.cost_config->>'base_cost')::numeric,
                     (pm.cost_config->>'cost_per_output_second')::numeric,
                     (pm.cost_config->>'cost_per_second')::numeric, 0) > 0
      ORDER BY 2 ASC
      LIMIT 1
    ) cheapest ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS count
      FROM ai_studio.provider_models pm2
      WHERE pm2.model_id = m.id AND pm2.enabled = TRUE
    ) enabled_channels ON TRUE
    ORDER BY m.sort ASC, m.created_at ASC
  `);
}
