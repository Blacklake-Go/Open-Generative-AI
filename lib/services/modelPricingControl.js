import 'server-only';

import crypto from 'node:crypto';
import { execute, queryMany, queryOne, withTransaction } from '../db/index.js';
import { getCanonicalModelById, getModelPricing, getProviderModelById, getRoutingPolicy,
  upsertProviderModel, upsertRoutingPolicy } from '../repositories/aiCatalog.js';
import { calculateModelPrice } from './pricingEngine.js';
import { routeGenerationTask } from './smartRouter.js';
import { getPricingControlSnapshot, syncProviderBalance, syncProviderModelCatalog, syncProviderPrices } from './channelSync.js';
import { isPlatformDefaultRoutingWeights, isRoutableBillingUnit, normalizeRoutingMode,
  ROUTING_MODE_WEIGHT_PRESETS } from '../modelCenter/routePricing.js';

const toObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
};
const toArray = (value) => Array.isArray(value) ? value : typeof value === 'string'
  ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
const id = (prefix) => `${prefix}_${crypto.randomBytes(14).toString('hex')}`;
const isElevated = (actor) => ['super_admin', 'admin'].includes(actor?.role);

const parseWeights = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
};

export { getPricingControlSnapshot, syncProviderBalance, syncProviderModelCatalog, syncProviderPrices };

export async function setModelRoutingPolicy({ modelId, routingMode, failoverEnabled } = {}) {
  const model = await getCanonicalModelById(modelId);
  if (!model) throw Object.assign(new Error('规范模型不存在'), { code: 'MODEL_NOT_FOUND' });
  const prior = await getRoutingPolicy(modelId);
  const modeProvided = !(routingMode === undefined || routingMode === null || routingMode === '');
  const requested = modeProvided ? routingMode : (prior?.routing_mode || 'cost');
  // 存量未知策略：只切换容灾等其它字段时，按运行时明确回退的均衡策略归一写回，
  // 不用一个非法值卡住管理员操作，也不静默保留一个没人执行的配置。
  const targetMode = normalizeRoutingMode(requested, modeProvided ? null : 'balanced');
  if (!targetMode) {
    throw Object.assign(new Error('路由策略只能是最低成本、管理员优先级、质量优先、稳定优先或均衡'), {
      code: 'ROUTING_MODE_INVALID', requestedRoutingMode: String(requested),
    });
  }
  const priorWeights = parseWeights(prior?.weights);
  // 平台默认权重不代表管理员意图：切换到质量/稳定等策略时必须使用该策略预设，
  // 除非管理员确实保存过自定义权重。
  const weights = priorWeights && !isPlatformDefaultRoutingWeights(priorWeights)
    ? priorWeights
    : { ...(ROUTING_MODE_WEIGHT_PRESETS[targetMode] || ROUTING_MODE_WEIGHT_PRESETS.balanced) };
  return upsertRoutingPolicy({
    model_id: modelId,
    routing_mode: targetMode,
    weights,
    circuit_breaker_config: prior?.circuit_breaker_config || { failure_threshold: 3, cooling_period_sec: 60, half_open_requests: 2 },
    failover_enabled: failoverEnabled !== undefined ? Boolean(failoverEnabled) : (prior?.failover_enabled !== false),
  });
}

export async function createExchangeRateSnapshot({ baseCurrency = 'USD', quoteCurrency = 'CNY', rate,
  sourceUrl = '', observedAt, expiresAt, reason = '', actor } = {}) {
  if (!isElevated(actor)) {
    throw Object.assign(new Error('汇率快照配置仅限管理员或超级管理员'), { code: 'EXCHANGE_RATE_PERMISSION_REQUIRED' });
  }
  const base = String(baseCurrency).trim().toUpperCase();
  const quote = String(quoteCurrency).trim().toUpperCase();
  const numericRate = Number(rate);
  const observed = new Date(observedAt).getTime();
  const expiry = new Date(expiresAt).getTime();
  if (!/^[A-Z]{3,16}$/.test(base) || !/^[A-Z]{3,16}$/.test(quote) || base === quote
    || !Number.isFinite(numericRate) || numericRate <= 0 || numericRate > 1000000
    || !Number.isFinite(observed) || observed > Date.now()
    || !Number.isFinite(expiry) || expiry <= Date.now() || expiry <= observed
    || expiry > Date.now() + 90 * 86400000 || (!String(sourceUrl).trim() && !String(reason).trim())) {
    throw Object.assign(new Error('汇率需填写有效币种、正数、来源或原因，以及 90 天内的有效期'), { code: 'EXCHANGE_RATE_INVALID' });
  }
  const snapshotId = id('fxs');
  const source = String(sourceUrl).trim();
  const note = String(reason).trim().slice(0, 500);
  await execute(`INSERT INTO ai_studio.exchange_rate_snapshots
      (id,base_currency,quote_currency,rate,source_type,source_url,observed_at,expires_at,
       evidence_digest,created_by,created_at)
    VALUES ($1,$2,$3,$4,'manual',$5,$6,$7,$8,$9,now())`, [
    snapshotId, base, quote, numericRate, source || null,
    new Date(observed).toISOString(), new Date(expiry).toISOString(),
    crypto.createHash('sha256').update(JSON.stringify({ base, quote, numericRate, source,
      observedAt: new Date(observed).toISOString(), expiresAt: new Date(expiry).toISOString(), note })).digest('hex'),
    actor?.id || null,
  ]);
  return { id: snapshotId, baseCurrency: base, quoteCurrency: quote, rate: numericRate,
    sourceType: 'manual', sourceUrl: source || null, observedAt: new Date(observed).toISOString(),
    expiresAt: new Date(expiry).toISOString(), reason: note };
}

export async function simulateModelRoute({ modelId, parameters = {} } = {}) {
  let route;
  try {
    route = await routeGenerationTask({ modelId, parameters, persistDecision: false });
  } catch (error) {
    // A blocked model is the diagnostic answer itself, not a failure: the admin
    // needs the first-failing rung per channel to know what to configure next.
    if (error?.code !== 'NO_COST_VERIFIED_ROUTE') throw error;
    const rejected = Array.isArray(error.details) ? error.details : [];
    const blockingCounts = rejected.reduce((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1;
      return acc;
    }, {});
    return {
      blocked: true,
      selectedProviderId: null,
      selectedProviderModelId: null,
      selectedPriceVersionId: null,
      selectionReason: error.message,
      routingMode: null,
      candidates: [],
      blockedReasons: Object.entries(blockingCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => ({ reason, count })),
      rejectedCandidates: rejected,
      routeQuote: null,
      credits: null,
      sitePriceCny: null,
      marginCheck: null,
      pricingError: null,
    };
  }
  let pricePreview = null;
  let pricingError = null;
  try { pricePreview = await calculateModelPrice({ modelId, parameters, routeResult: route }); }
  catch (error) { pricingError = { code: error.code || 'PRICE_UNAVAILABLE', message: error.message }; }
  const scoreByModelId = new Map((route.selectionMetadata?.candidates || [])
    .map((score) => [score.providerModelId, score]));
  return {
    selectedProviderId: route.selectedProviderId,
    selectedProviderModelId: route.selectedProviderModelId,
    selectedPriceVersionId: route.selectedPriceVersionId,
    selectionReason: route.selectionReason,
    routingMode: route.routingMode,
    requestedRoutingMode: route.requestedRoutingMode ?? null,
    policyVersion: route.policyVersion ?? null,
    strategy: route.selectionMetadata?.strategy ?? null,
    modeFallback: route.modeFallback ?? null,
    weights: route.weights ?? null,
    budget: route.selectionMetadata?.budget ?? null,
    candidates: route.allCandidates.map((candidate) => {
      const score = scoreByModelId.get(candidate.providerModelId) || null;
      return {
        providerId: candidate.providerId,
        providerModelId: candidate.providerModelId,
        providerEndpoint: candidate.providerModel.provider_endpoint || null,
        priceVersionId: candidate.priceVersionId,
        priceType: candidate.priceType,
        priority: score?.priority ?? (Number(candidate.priority) || 0),
        estimatedCostCny: candidate.estimatedCostCny,
        estimatedCostUsd: candidate.estimatedCostUsd,
        components: candidate.estimate?.components || {},
        healthStatus: candidate.healthStatus,
        successRate: candidate.successRate,
        latencyMs: candidate.latencyMs,
        totalScore: score?.totalScore ?? null,
        costScore: score?.costScore ?? null,
        successScore: score?.successScore ?? null,
        speedScore: score?.speedScore ?? null,
        capacityScore: score?.capacityScore ?? null,
      };
    }),
    rejectedCandidates: route.rejectedCandidates,
    routeQuote: route.routeQuote,
    selectionMetadata: route.selectionMetadata ?? null,
    credits: pricePreview?.credits ?? null,
    sitePriceCny: pricePreview?.sitePriceCny ?? null,
    marginCheck: pricePreview?.marginCheck ?? null,
    pricingError,
  };
}

export async function createCatalogMapping({ catalogEntryId, modelId, specification = {}, actor } = {}) {
  const entry = await queryOne('SELECT * FROM ai_studio.provider_catalog_entries WHERE id=$1', [catalogEntryId]);
  if (!entry || !modelId) throw Object.assign(new Error('目录记录或规范模型不存在'), { code: 'CATALOG_MAPPING_INPUT_INVALID' });
  const model = await getCanonicalModelById(modelId);
  if (!model) throw Object.assign(new Error('请先建立规范模型，再提交渠道映射审核'), { code: 'MODEL_NOT_FOUND' });
  if (entry.review_status === 'retired' || entry.review_status === 'rejected') {
    throw Object.assign(new Error('该目录记录已下架或被拒绝，不能映射'), { code: 'CATALOG_ENTRY_NOT_MAPPABLE' });
  }
  const endpoint = String(specification.provider_endpoint || entry.provider_endpoint || '').trim();
  const taskTypes = toArray(specification.supported_task_types);
  const inputTypes = toArray(specification.input_types);
  const outputTypes = toArray(specification.output_types);
  if (!endpoint || taskTypes.length === 0 || !inputTypes.length || !outputTypes.length) {
    throw Object.assign(new Error('渠道端点、任务类型、输入能力和输出能力均为必填项；映射需补齐规格后才能审核'), { code: 'MAPPING_SPECIFICATION_REQUIRED' });
  }
  const mapping = await upsertProviderModel({
    model_id: model.id,
    provider_id: entry.provider_id,
    provider_model_id: entry.provider_model_id,
    provider_model_version: specification.provider_model_version || entry.provider_model_version || null,
    provider_endpoint: endpoint,
    enabled: false,
    review_status: 'pending_review',
    mapping_version: 1,
    priority: Number(specification.priority || 100),
    supported_task_types: taskTypes,
    supported_resolutions: toArray(specification.supported_resolutions),
    supported_durations: toArray(specification.supported_durations),
    supported_qualities: toArray(specification.supported_qualities),
    supported_regions: toArray(specification.supported_regions),
    license_requirements: toArray(specification.license_requirements),
    capabilities: {
      ...toObject(entry.capabilities_json),
      input_types: inputTypes,
      output_types: outputTypes,
      aspect_ratios: toArray(specification.aspect_ratios ?? specification.supported_aspect_ratios),
      parameters: toArray(specification.supported_parameters),
      verified_license_conditions: toArray(specification.verified_license_conditions),
      source_catalog_entry_id: catalogEntryId,
      submitted_by: actor?.id || null,
    },
    endpoint_config: toObject(specification.endpoint_config),
    cost_config: {},
  });
  await execute(`UPDATE ai_studio.provider_catalog_entries SET review_status='mapped_pending_review',
      mapped_provider_model_id=$2,updated_at=now() WHERE id=$1`, [catalogEntryId, mapping.id]);
  return mapping;
}

export async function reviewProviderMapping({ mappingId, approved, actor, reason = '' } = {}) {
  const mapping = await getProviderModelById(mappingId);
  if (!mapping) throw Object.assign(new Error('渠道映射不存在'), { code: 'PROVIDER_MAPPING_NOT_FOUND' });
  if (approved) {
    const tasks = toArray(mapping.supported_task_types);
    const capabilities = toObject(mapping.capabilities);
    if (!mapping.provider_endpoint || !tasks.length || !toArray(capabilities.input_types).length || !toArray(capabilities.output_types).length) {
      throw Object.assign(new Error('映射缺少端点、任务类型或输入/输出能力，不能批准'), { code: 'MAPPING_SPECIFICATION_REQUIRED' });
    }
    const requiredLicenses = toArray(mapping.license_requirements);
    const verifiedLicenses = toArray(capabilities.verified_license_conditions);
    if (requiredLicenses.some((condition) => !verifiedLicenses.includes(condition))) {
      throw Object.assign(new Error('映射许可条件尚未由管理员核实'), { code: 'MAPPING_LICENSE_CONDITION_UNVERIFIED' });
    }
  }
  const nextStatus = approved ? 'approved' : 'rejected';
  const result = await queryOne(`UPDATE ai_studio.provider_models SET review_status=$2,
      specification_reviewed_at=now(),specification_reviewed_by=$3,
      enabled=$4,mapping_version=mapping_version+1,updated_at=now(),
      metadata=COALESCE(metadata,'{}'::jsonb) || $5::jsonb
    WHERE id=$1 RETURNING *`, [mappingId, nextStatus, actor?.id || null, approved,
    JSON.stringify({ last_review_reason: String(reason).slice(0, 500) })]);
  const sourceCatalogEntryId = toObject(mapping.metadata).source_catalog_entry_id;
  if (sourceCatalogEntryId) {
    await execute(`UPDATE ai_studio.provider_catalog_entries SET review_status=$2,updated_at=now()
      WHERE id=$1`, [sourceCatalogEntryId, approved ? 'approved' : 'rejected']);
  }
  return result;
}

export async function updateProviderMappingSpecification({ mappingId, specification = {}, approve = false, actor, reason = '' } = {}) {
  const mapping = await getProviderModelById(mappingId);
  if (!mapping) throw Object.assign(new Error('渠道映射不存在'), { code: 'PROVIDER_MAPPING_NOT_FOUND' });
  const priorCapabilities = toObject(mapping.capabilities);
  const endpoint = String(specification.provider_endpoint || '').trim();
  const tasks = toArray(specification.supported_task_types);
  const inputTypes = toArray(specification.input_types);
  const outputTypes = toArray(specification.output_types);
  const aspectRatios = specification.aspect_ratios !== undefined || specification.supported_aspect_ratios !== undefined
    ? toArray(specification.aspect_ratios ?? specification.supported_aspect_ratios)
    : toArray(priorCapabilities.aspect_ratios);
  const supportedParameters = specification.supported_parameters !== undefined
    ? toArray(specification.supported_parameters)
    : toArray(priorCapabilities.parameters);
  if (!endpoint || !tasks.length || !inputTypes.length || !outputTypes.length) {
    throw Object.assign(new Error('端点、任务类型、输入能力和输出能力必须明确填写'), { code: 'MAPPING_SPECIFICATION_REQUIRED' });
  }
  const approved = Boolean(approve);
  const updated = await queryOne(`UPDATE ai_studio.provider_models SET
      provider_endpoint=$2,provider_model_version=$3,supported_task_types=$4::jsonb,
      supported_resolutions=$5::jsonb,supported_durations=$6::jsonb,supported_qualities=$7::jsonb,
      supported_regions=$8::jsonb,license_requirements=$9::jsonb,capabilities=$10::jsonb,
      review_status=$11,enabled=$12,mapping_version=mapping_version+1,
      specification_reviewed_at=CASE WHEN $12 THEN now() ELSE NULL END,
      specification_reviewed_by=CASE WHEN $12 THEN $13 ELSE NULL END,updated_at=now(),
      metadata=COALESCE(metadata,'{}'::jsonb) || $14::jsonb
    WHERE id=$1 RETURNING *`, [mappingId, endpoint,
    specification.provider_model_version || mapping.provider_model_version || null,
    JSON.stringify(tasks), JSON.stringify(toArray(specification.supported_resolutions)),
    JSON.stringify(toArray(specification.supported_durations)), JSON.stringify(toArray(specification.supported_qualities)),
    JSON.stringify(toArray(specification.supported_regions)), JSON.stringify(toArray(specification.license_requirements)),
    JSON.stringify({ ...priorCapabilities, input_types: inputTypes, output_types: outputTypes,
      aspect_ratios: aspectRatios,
      parameters: supportedParameters,
      verified_license_conditions: toArray(specification.verified_license_conditions) }),
    approved ? 'approved' : 'pending_review', approved, actor?.id || null,
    JSON.stringify({ last_review_reason: String(reason).slice(0, 500) })]);
  const sourceCatalogEntryId = priorCapabilities.source_catalog_entry_id;
  if (sourceCatalogEntryId) {
    await execute(`UPDATE ai_studio.provider_catalog_entries SET review_status=$2,updated_at=now()
      WHERE id=$1`, [sourceCatalogEntryId, approved ? 'approved' : 'mapped_pending_review']);
  }
  return updated;
}

export async function stageProviderPrice({ providerModelId, priceType, billingUnit, currency, priceConfig,
  applicability = {}, sourceUrl = null, sourceApi = null, sourceObservedAt, expiresAt = null,
  evidenceDigest = null, actor, manuallyLocked = false, conservativeUpperBoundConfig = null,
  conservativeUpperBoundCurrency = null, conservativeUpperBoundExpiresAt = null,
  conservativeUpperBoundReason = '' } = {}) {
  if (!['account_actual', 'aggregator', 'manual', 'official_public'].includes(priceType)) {
    throw Object.assign(new Error('不支持的价格类型'), { code: 'PRICE_TYPE_INVALID' });
  }
  const normalizedBillingUnit = String(billingUnit || '').trim().toLowerCase();
  if (!isRoutableBillingUnit(normalizedBillingUnit)) {
    throw Object.assign(new Error('计费单位未核验，不能导入价格版本'), { code: 'PRICE_BILLING_UNIT_UNVERIFIED' });
  }
  if (!currency || !sourceObservedAt || (!sourceUrl && !sourceApi)) {
    throw Object.assign(new Error('计费单位、币种、来源与来源核验时间均必填'), { code: 'PRICE_SOURCE_REQUIRED' });
  }
  const config = toObject(priceConfig);
  const upperBound = conservativeUpperBoundConfig === null || conservativeUpperBoundConfig === undefined
    ? {} : toObject(conservativeUpperBoundConfig);
  if (!Object.keys(config).length && !Object.keys(upperBound).length) {
    throw Object.assign(new Error('渠道价格配置或经高权限批准的保守成本上界至少填写一项'), { code: 'PRICE_CONFIG_REQUIRED' });
  }
  let upperBoundExpiresAt = null;
  if (Object.keys(upperBound).length) {
    if (!isElevated(actor)) throw Object.assign(new Error('保守成本上界仅限超级管理员或系统管理员配置'), { code: 'CONSERVATIVE_BOUND_FORBIDDEN' });
    const expiry = new Date(conservativeUpperBoundExpiresAt).getTime();
    if (!conservativeUpperBoundCurrency || !/^(USD|CNY|RMB)$/.test(String(conservativeUpperBoundCurrency).toUpperCase())
      || !conservativeUpperBoundReason.trim() || !Number.isFinite(expiry) || expiry <= Date.now()
      || expiry > Date.now() + 7 * 86400000) {
      throw Object.assign(new Error('保守上界需填写 USD/CNY 币种、原因，并设置 7 天内的到期时间'), { code: 'CONSERVATIVE_BOUND_INVALID' });
    }
    upperBoundExpiresAt = new Date(expiry).toISOString();
  }
  const mapping = await getProviderModelById(providerModelId);
  if (!mapping) throw Object.assign(new Error('渠道映射不存在'), { code: 'PROVIDER_MAPPING_NOT_FOUND' });
  return withTransaction(async (tx) => {
    const history = await tx.queryOne(`SELECT COALESCE(MAX(version_no),0)::int max_version,
        (SELECT id FROM ai_studio.provider_model_price_versions WHERE provider_model_id=$1 AND status='active' AND price_type=$2 LIMIT 1) active_id
      FROM ai_studio.provider_model_price_versions WHERE provider_model_id=$1`, [providerModelId, priceType]);
    const versionId = id('pver');
    const digest = evidenceDigest || crypto.createHash('sha256').update(JSON.stringify({
      config, applicability, billingUnit: normalizedBillingUnit, currency, sourceUrl, sourceApi, sourceObservedAt,
      upperBound, conservativeUpperBoundCurrency, upperBoundExpiresAt, conservativeUpperBoundReason,
    })).digest('hex');
    await tx.execute(`INSERT INTO ai_studio.provider_model_price_versions
        (id,provider_model_id,version_no,price_type,billing_unit,currency,price_config,applicability,
         source_url,source_api,source_observed_at,fetched_at,effective_at,expires_at,evidence_digest,
         status,manually_locked,change_summary,previous_version_id,modified_by,
         conservative_upper_bound_config,conservative_upper_bound_currency,
         conservative_upper_bound_expires_at,conservative_upper_bound_reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,now(),NULL,$12,$13,
        'pending_review',$14,$15::jsonb,$16,$17,$18::jsonb,$19,$20,$21)`, [
      versionId, providerModelId, Number(history?.max_version || 0) + 1, priceType, normalizedBillingUnit, currency,
      JSON.stringify(config), JSON.stringify(applicability), sourceUrl, sourceApi,
      new Date(sourceObservedAt).toISOString(), expiresAt ? new Date(expiresAt).toISOString() : null,
      digest, Boolean(manuallyLocked), JSON.stringify({ stagedBy: actor?.id || null }), history?.active_id || null,
      actor?.id || null, Object.keys(upperBound).length ? JSON.stringify(upperBound) : null,
      Object.keys(upperBound).length ? String(conservativeUpperBoundCurrency).toUpperCase() : null,
      upperBoundExpiresAt, Object.keys(upperBound).length ? String(conservativeUpperBoundReason).trim().slice(0, 500) : null,
    ]);
    return { id: versionId, versionNo: Number(history?.max_version || 0) + 1, status: 'pending_review' };
  });
}

export async function approveProviderPrice({ versionId, actor } = {}) {
  return withTransaction(async (tx) => {
    const version = await tx.queryOne(`SELECT * FROM ai_studio.provider_model_price_versions WHERE id=$1 FOR UPDATE`, [versionId]);
    if (!version || !['pending_review', 'staged'].includes(version.status)) {
      throw Object.assign(new Error('价格版本不存在或已处理'), { code: 'PRICE_VERSION_NOT_REVIEWABLE' });
    }
    if (!isRoutableBillingUnit(version.billing_unit)) {
      throw Object.assign(new Error('计费单位未核验，不能启用价格版本'), { code: 'PRICE_BILLING_UNIT_UNVERIFIED' });
    }
    if (version.expires_at && new Date(version.expires_at).getTime() <= Date.now()) {
      throw Object.assign(new Error('价格版本已过期，请重新核验后导入'), { code: 'PRICE_VERSION_EXPIRED' });
    }
    const lockedManual = await tx.queryOne(`SELECT id FROM ai_studio.provider_model_price_versions
      WHERE provider_model_id=$1 AND status='active' AND price_type='manual' AND manually_locked=TRUE FOR UPDATE`, [version.provider_model_id]);
    if (lockedManual && !(version.price_type === 'manual' && isElevated(actor))) {
      throw Object.assign(new Error('当前人工锁价仍有效；请先由高权限管理员解除锁定或设置到期时间'), { code: 'MANUAL_PRICE_LOCKED' });
    }
    const current = await tx.queryOne(`SELECT id,manually_locked,price_type FROM ai_studio.provider_model_price_versions
      WHERE provider_model_id=$1 AND status='active' AND price_type=$2 FOR UPDATE`, [version.provider_model_id, version.price_type]);
    if (current) await tx.execute(`UPDATE ai_studio.provider_model_price_versions SET status='superseded' WHERE id=$1`, [current.id]);
    await tx.execute(`UPDATE ai_studio.provider_model_price_versions SET status='active',effective_at=now(),
        approved_by=$2,approved_at=now() WHERE id=$1`, [versionId, actor?.id || null]);
    return { versionId, status: 'active', previousVersionId: current?.id || null };
  });
}

export async function previewSitePrice({ modelId, sitePriceCny, credits, validFrom = null, validUntil,
  overrideReason = '', actor } = {}) {
  const model = await getCanonicalModelById(modelId);
  if (!model) throw Object.assign(new Error('规范模型不存在'), { code: 'MODEL_NOT_FOUND' });
  const price = Number(sitePriceCny);
  if (!Number.isFinite(price) || price <= 0) throw Object.assign(new Error('站点售价必须大于零'), { code: 'SITE_PRICE_INVALID' });
  if (!validUntil || new Date(validUntil).getTime() <= Date.now()) {
    throw Object.assign(new Error('站点售价必须设置未来到期时间'), { code: 'SITE_PRICE_EXPIRY_REQUIRED' });
  }
  if (overrideReason && !isElevated(actor)) {
    throw Object.assign(new Error('低于常规毛利底线的覆盖仅限超级管理员或系统管理员'), { code: 'MARGIN_OVERRIDE_FORBIDDEN' });
  }
  const existing = await getModelPricing(modelId);
  const creditCount = credits === undefined || credits === null || credits === ''
    ? Number(existing?.base_credits || 50) : Number(credits);
  if (!Number.isInteger(creditCount) || creditCount < 1) throw Object.assign(new Error('积分必须是正整数'), { code: 'CREDITS_INVALID' });
  const pricingConfig = {
    ...(existing || {}),
    pricing_type: existing?.pricing_type || 'fixed',
    base_credits: creditCount,
    site_price_cny: price,
    price_locked: true,
    price_valid_until: new Date(validUntil).toISOString(),
    override_reason: overrideReason || null,
    override_expires_at: overrideReason ? new Date(validUntil).toISOString() : null,
    price_valid_from: validFrom ? new Date(validFrom).toISOString() : new Date().toISOString(),
  };
  try {
    const calculation = await calculateModelPrice({ modelId, pricingConfig });
    return {
      canPublish: true,
      modelId,
      preview: calculation.marginCheck,
      routeQuote: calculation.routeQuote,
      candidates: calculation.evaluatedChannels,
      eligibleChannels: calculation.eligibleChannels,
      selectedProviderId: calculation.selectedProviderId,
      credits: calculation.credits,
      sitePriceCny: calculation.sitePriceCny,
    };
  } catch (error) {
    if (error.code !== 'PRICING_MARGIN_BELOW_FLOOR') throw error;
    return {
      canPublish: false,
      modelId,
      pricingError: { code: error.code, message: error.message },
      preview: error.details || null,
      candidates: error.details?.evaluatedChannels || [],
      eligibleChannels: error.details?.eligibleChannels || [],
      selectedProviderId: null,
      credits: creditCount,
      sitePriceCny: price,
    };
  }
}

export async function publishSitePrice({ modelId, sitePriceCny, credits, validFrom = null, validUntil,
  overrideReason = '', actor } = {}) {
  const model = await getCanonicalModelById(modelId);
  if (!model) throw Object.assign(new Error('规范模型不存在'), { code: 'MODEL_NOT_FOUND' });
  const price = Number(sitePriceCny);
  if (!Number.isFinite(price) || price <= 0) throw Object.assign(new Error('站点售价必须大于零'), { code: 'SITE_PRICE_INVALID' });
  if (!validUntil || new Date(validUntil).getTime() <= Date.now()) {
    throw Object.assign(new Error('站点售价必须设置未来到期时间'), { code: 'SITE_PRICE_EXPIRY_REQUIRED' });
  }
  const existing = await getModelPricing(modelId);
  const creditCount = credits === undefined || credits === null || credits === ''
    ? Number(existing?.base_credits || 50) : Number(credits);
  if (!Number.isInteger(creditCount) || creditCount < 1) throw Object.assign(new Error('积分必须是正整数'), { code: 'CREDITS_INVALID' });
  const overrideExpiresAt = overrideReason ? new Date(validUntil).toISOString() : null;
  if (overrideReason && !isElevated(actor)) {
    throw Object.assign(new Error('低于常规毛利底线的覆盖仅限超级管理员或系统管理员'), { code: 'MARGIN_OVERRIDE_FORBIDDEN' });
  }
  const pricingConfig = {
    ...(existing || {}),
    pricing_type: existing?.pricing_type || 'fixed',
    base_credits: creditCount,
    site_price_cny: price,
    price_locked: true,
    price_valid_until: new Date(validUntil).toISOString(),
    override_reason: overrideReason || null,
    override_expires_at: overrideExpiresAt,
    price_valid_from: validFrom ? new Date(validFrom).toISOString() : new Date().toISOString(),
  };
  let calculation;
  try {
    calculation = await calculateModelPrice({ modelId, pricingConfig });
  } catch (error) {
    if (error.code === 'PRICING_MARGIN_BELOW_FLOOR' && !overrideReason) {
      throw Object.assign(new Error('售价低于毛利底线；需提高售价，或由高权限管理员填写限期覆盖原因'), { code: error.code, details: error.details });
    }
    throw error;
  }
  const saved = await withTransaction(async (tx) => {
    const before = await tx.queryOne('SELECT * FROM ai_studio.model_pricing WHERE model_id=$1 FOR UPDATE', [modelId]);
    const history = await tx.queryOne(`SELECT COALESCE(MAX(version_no),0)::int max_version,
        (SELECT id FROM ai_studio.model_site_price_versions WHERE model_id=$1 AND status='active' LIMIT 1) active_id
      FROM ai_studio.model_site_price_versions WHERE model_id=$1`, [modelId]);
    if (history?.active_id) await tx.execute(`UPDATE ai_studio.model_site_price_versions SET status='superseded' WHERE id=$1`, [history.active_id]);
    const versionId = id('spv');
    await tx.execute(`INSERT INTO ai_studio.model_site_price_versions
        (id,model_id,version_no,site_price,currency,credits,status,price_locked,effective_at,expires_at,
         min_gross_margin_rate,override_reason,override_expires_at,previous_version_id,modified_by)
      VALUES ($1,$2,$3,$4,'CNY',$5,'active',TRUE,$6,$7,$8,$9,$10,$11,$12)`, [
      versionId, modelId, Number(history?.max_version || 0) + 1, price, creditCount,
      pricingConfig.price_valid_from, new Date(validUntil).toISOString(),
      calculation.marginCheck.minimumGrossMarginRate, overrideReason || null, overrideExpiresAt,
      history?.active_id || null, actor?.id || null,
    ]);
    if (before) {
      return tx.queryOne(`UPDATE ai_studio.model_pricing SET base_credits=$2,site_price_cny=$3,
          site_price_currency='CNY',price_locked=TRUE,price_valid_from=$4,price_valid_until=$5,
          published_by=$6,override_reason=$7,override_expires_at=$8,active_site_price_version_id=$9,updated_at=now()
        WHERE model_id=$1 RETURNING *`, [modelId, creditCount, price, pricingConfig.price_valid_from,
        new Date(validUntil).toISOString(), actor?.id || null, overrideReason || null, overrideExpiresAt, versionId]);
    }
    const createdId = id('prc');
    const created = await tx.queryOne(`INSERT INTO ai_studio.model_pricing
        (id,model_id,pricing_type,base_credits,formula_config,subscription_discounts,min_credits,
         min_gross_margin_rate,is_active,site_price_cny,site_price_currency,price_locked,price_valid_from,
         price_valid_until,published_by,override_reason,override_expires_at,active_site_price_version_id,created_at,updated_at)
      VALUES ($1,$2,'fixed',$3,'{}'::jsonb,'{}'::jsonb,10,0.75,TRUE,$4,'CNY',TRUE,$5,$6,$7,$8,$9,$10,now(),now())
      RETURNING *`, [createdId, modelId, creditCount, price, pricingConfig.price_valid_from,
      new Date(validUntil).toISOString(), actor?.id || null, overrideReason || null, overrideExpiresAt, versionId]);
    return created;
  });
  return { pricing: saved, preview: calculation.marginCheck, routeQuote: calculation.routeQuote };
}

export async function setProviderEnabled({ providerId, enabled, actor } = {}) {
  const result = await queryOne(`UPDATE ai_studio.ai_providers SET enabled=$2,updated_at=now()
      WHERE id=$1 OR slug=$1 RETURNING id,slug,name,enabled,health_status,circuit_state`, [providerId, Boolean(enabled)]);
  if (!result) throw Object.assign(new Error('渠道不存在'), { code: 'PROVIDER_NOT_FOUND' });
  return result;
}
