import 'server-only';

import crypto from 'node:crypto';
import { execute, queryMany, queryOne, withTransaction } from '../db/index.js';
import { CREDIT_PRICING_POLICY } from '../pricing/creditPolicy.js';
import { estimateRequestCost, isRoutableBillingUnit } from '../modelCenter/routePricing.js';
import { getPricingControlSnapshot } from './channelSync.js';
import { buildCsv, buildXlsx, parseCsv, parseXlsx, PRICE_IMPORT_COLUMNS } from '../modelCenter/priceWorkbook.js';

const ROUTABLE_PRICE_TYPES = new Set(['account_actual', 'aggregator', 'manual']);
const elevatedRole = (actor) => ['super_admin', 'admin'].includes(actor?.role);
const makeId = (prefix) => `${prefix}_${crypto.randomBytes(14).toString('hex')}`;

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return null; }
}

function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value.trim()) return [];
  try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed.map(String); } catch {}
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function normalizeRows(rows) {
  return rows.map((raw, index) => {
    const priceType = String(raw.price_type || '').trim().toLowerCase();
    const dedicatedPriceJson = priceType === 'official_public' ? raw.official_price_json : raw.channel_price_json;
    const selectedPriceJson = dedicatedPriceJson || raw.price_config_json;
    return ({
    ...raw,
    __row_number: Number(raw.__row_number || index + 2),
    canonical_model_id: String(raw.canonical_model_id || '').trim(),
    provider_id: String(raw.provider_id || '').trim().toLowerCase(),
    provider_model_id: String(raw.provider_model_id || '').trim(),
    provider_model_version: String(raw.provider_model_version || '').trim(),
    provider_endpoint: String(raw.provider_endpoint || '').trim(),
    task_types: asList(raw.task_types),
    input_types: asList(raw.input_types),
    output_types: asList(raw.output_types),
    resolutions: asList(raw.resolutions),
    durations: asList(raw.durations),
    qualities: asList(raw.qualities),
    regions: asList(raw.regions),
    license_requirements: asList(raw.license_requirements),
    verified_license_conditions: asList(raw.verified_license_conditions),
    price_type: priceType,
    billing_unit: String((priceType === 'official_public' ? (raw.official_billing_unit || raw.billing_unit)
      : (raw.channel_billing_unit || raw.billing_unit)) || '').trim(),
    currency: String((priceType === 'official_public' ? (raw.official_currency || raw.currency)
      : (raw.channel_currency || raw.currency)) || '').trim().toUpperCase(),
    price_config: asObject(selectedPriceJson),
    applicability: asObject(raw.applicability_json),
    conservative_upper_bound_config: asObject(raw.conservative_upper_bound_json),
    conservative_upper_bound_currency: String(raw.conservative_upper_bound_currency || '').trim().toUpperCase(),
    conservative_upper_bound_expires_at: String(raw.conservative_upper_bound_expires_at || '').trim(),
    conservative_upper_bound_reason: String(raw.conservative_upper_bound_reason || '').trim(),
    source_url: String((priceType === 'official_public' ? raw.official_source_url : raw.channel_source_url) || raw.source_url || '').trim(),
    source_api: String((priceType === 'official_public' ? raw.official_source_api : raw.channel_source_api) || raw.source_api || '').trim(),
    source_observed_at: String((priceType === 'official_public' ? raw.official_source_observed_at : raw.channel_source_observed_at) || raw.source_observed_at || '').trim(),
    expires_at: String(raw.expires_at || '').trim(),
    site_price_cny: String(raw.site_price_cny || '').trim(),
    credits: String(raw.credits || '').trim(),
    override_reason: String(raw.override_reason || '').trim(),
    override_expires_at: String(raw.override_expires_at || '').trim(),
    });
  });
}

async function loadMappings(transaction = null) {
  const run = transaction?.queryMany ? transaction.queryMany.bind(transaction) : queryMany;
  return run(`SELECT pm.id,pm.model_id,pm.provider_id,pm.provider_model_id,pm.provider_model_version,
      pm.provider_endpoint,pm.supported_task_types,pm.supported_resolutions,pm.supported_durations,
      pm.supported_qualities,pm.supported_regions,pm.license_requirements,pm.capabilities,pm.enabled,pm.review_status,
      pv.id active_price_id,pv.version_no active_price_version_no,pv.price_type active_price_type,
      pv.billing_unit active_billing_unit,pv.currency active_currency,pv.price_config active_price_config,
      pv.applicability active_applicability,pv.source_url active_source_url,pv.source_api active_source_api,
      pv.source_observed_at active_source_observed_at,pv.expires_at active_expires_at,pv.manually_locked,
      pv.conservative_upper_bound_config active_upper_bound_config,
      pv.conservative_upper_bound_currency active_upper_bound_currency,
      pv.conservative_upper_bound_expires_at active_upper_bound_expires_at,
      pv.conservative_upper_bound_reason active_upper_bound_reason,
      COALESCE((SELECT jsonb_object_agg(v.price_type,jsonb_build_object(
        'id',v.id,'billing_unit',v.billing_unit,'currency',v.currency,'price_config',v.price_config,
        'applicability',v.applicability,'source_observed_at',v.source_observed_at,'expires_at',v.expires_at,
        'manually_locked',v.manually_locked,'conservative_upper_bound_config',v.conservative_upper_bound_config,
        'conservative_upper_bound_currency',v.conservative_upper_bound_currency,
        'conservative_upper_bound_expires_at',v.conservative_upper_bound_expires_at,
        'conservative_upper_bound_reason',v.conservative_upper_bound_reason)) FROM ai_studio.provider_model_price_versions v
        WHERE v.provider_model_id=pm.id AND v.status='active'),'{}'::jsonb) active_prices,
      EXISTS(SELECT 1 FROM ai_studio.provider_model_price_versions v
        WHERE v.provider_model_id=pm.id AND v.status='active' AND v.price_type='manual' AND v.manually_locked) active_manual_locked,
      m.default_parameters,mp.site_price_cny,mp.base_credits,mp.site_price_currency,mp.min_gross_margin_rate
    FROM ai_studio.provider_models pm
    JOIN ai_studio.ai_models m ON m.id=pm.model_id
    LEFT JOIN ai_studio.model_pricing mp ON mp.model_id=pm.model_id
    LEFT JOIN LATERAL (SELECT v.* FROM ai_studio.provider_model_price_versions v
      WHERE v.provider_model_id=pm.id AND v.status='active'
        AND v.price_type IN ('account_actual','aggregator','manual')
      ORDER BY CASE v.price_type WHEN 'account_actual' THEN 0 WHEN 'manual' THEN 1 ELSE 2 END,
        v.version_no DESC LIMIT 1) pv ON TRUE`);
}

function equalList(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function rowKey(row) { return `${row.provider_id}:${row.provider_model_id}`; }

async function validateRows(rows, actor, transaction = null) {
  const mappings = await loadMappings(transaction);
  const mappingByKey = new Map(mappings.map((mapping) => [`${mapping.provider_id}:${mapping.provider_model_id}`, mapping]));
  const snapshot = await getPricingControlSnapshot();
  const modelById = new Map(snapshot.models.map((model) => [model.id, model]));
  const fxSnapshot = snapshot.fxSnapshot || (snapshot.exchangeRate ? {
    id: snapshot.exchangeRate.id,
    usdToCny: snapshot.exchangeRate.rate,
    rates: { USD_CNY: snapshot.exchangeRate.rate, CNY_CNY: 1 },
  } : {});
  const seen = new Set();
  const siteUpdateByModel = new Map();
  const report = [];
  for (const row of rows) {
    const conflicts = [];
    const mapping = mappingByKey.get(rowKey(row));
    const model = modelById.get(row.canonical_model_id);
    if (!row.canonical_model_id || !row.provider_id || !row.provider_model_id) conflicts.push('MODEL_AND_CHANNEL_IDS_REQUIRED');
    if (!mapping) conflicts.push('MAPPING_NOT_FOUND_IMPORT_CANNOT_CREATE_MAPPING');
    if (mapping && model && mapping.model_id !== row.canonical_model_id) conflicts.push('CANONICAL_MODEL_MISMATCH');
    if (!model) conflicts.push('CANONICAL_MODEL_NOT_FOUND');
    if (seen.has(rowKey(row))) conflicts.push('DUPLICATE_PROVIDER_MODEL_ROW');
    seen.add(rowKey(row));
    if (row.price_config === null) conflicts.push('PRICE_CONFIG_JSON_INVALID');
    if (row.conservative_upper_bound_config === null) conflicts.push('CONSERVATIVE_BOUND_JSON_INVALID');

    if (mapping) {
      if (mapping.review_status !== 'approved' && mapping.review_status !== 'pending_review') conflicts.push('MAPPING_NOT_REVIEWED');
      if (row.provider_model_version && row.provider_model_version !== mapping.provider_model_version) conflicts.push('MAPPING_VERSION_CHANGE_REQUIRES_MAPPING_REVIEW');
      if (row.provider_endpoint && row.provider_endpoint !== mapping.provider_endpoint) conflicts.push('MAPPING_ENDPOINT_CHANGE_REQUIRES_MAPPING_REVIEW');
      if (row.task_types.length && !equalList(row.task_types, asList(mapping.supported_task_types))) conflicts.push('MAPPING_TASK_CHANGE_REQUIRES_MAPPING_REVIEW');
      const mappingCapabilities = asObject(mapping.capabilities);
      if (row.input_types.length && !equalList(row.input_types, asList(mappingCapabilities.input_types))) conflicts.push('MAPPING_INPUT_CHANGE_REQUIRES_MAPPING_REVIEW');
      if (row.output_types.length && !equalList(row.output_types, asList(mappingCapabilities.output_types))) conflicts.push('MAPPING_OUTPUT_CHANGE_REQUIRES_MAPPING_REVIEW');
      if (row.resolutions.length && !equalList(row.resolutions, asList(mapping.supported_resolutions))) conflicts.push('MAPPING_RESOLUTION_CHANGE_REQUIRES_MAPPING_REVIEW');
      if (row.durations.length && !equalList(row.durations, asList(mapping.supported_durations))) conflicts.push('MAPPING_DURATION_CHANGE_REQUIRES_MAPPING_REVIEW');
      if (row.qualities.length && !equalList(row.qualities, asList(mapping.supported_qualities))) conflicts.push('MAPPING_QUALITY_CHANGE_REQUIRES_MAPPING_REVIEW');
      if (row.regions.length && !equalList(row.regions, asList(mapping.supported_regions))) conflicts.push('MAPPING_REGION_CHANGE_REQUIRES_MAPPING_REVIEW');
      if (row.license_requirements.length && !equalList(row.license_requirements, asList(mapping.license_requirements))) conflicts.push('MAPPING_LICENSE_CHANGE_REQUIRES_MAPPING_REVIEW');
      if (row.verified_license_conditions.length
        && !equalList(row.verified_license_conditions, asList(mappingCapabilities.verified_license_conditions))) {
        conflicts.push('MAPPING_LICENSE_VERIFICATION_CHANGE_REQUIRES_MAPPING_REVIEW');
      }
      if ((mapping.active_manual_locked || mapping.manually_locked) && row.price_type && row.price_type !== 'manual') conflicts.push('MANUAL_PRICE_LOCKED');
    }

    const activeSameType = asObject(asObject(mapping?.active_prices)[row.price_type]);
    const hasPriceIntent = Boolean(row.price_type && (Object.keys(row.price_config || {}).length
      || Object.keys(row.conservative_upper_bound_config || {}).length
      || row.billing_unit || row.currency || row.source_url || row.source_api));
    if (ROUTABLE_PRICE_TYPES.has(row.price_type) && !isRoutableBillingUnit(row.billing_unit)) {
      conflicts.push('ROUTABLE_BILLING_UNIT_UNVERIFIED');
    }
    const samePriceVersion = Boolean(activeSameType.id
      && String(activeSameType.billing_unit || '') === row.billing_unit
      && String(activeSameType.currency || '').toUpperCase() === row.currency
      && stableJson(asObject(activeSameType.price_config)) === stableJson(row.price_config || {})
      && stableJson(asObject(activeSameType.applicability)) === stableJson(row.applicability || {})
      && stableJson(asObject(activeSameType.conservative_upper_bound_config)) === stableJson(row.conservative_upper_bound_config || {})
      && String(activeSameType.conservative_upper_bound_currency || '').toUpperCase() === row.conservative_upper_bound_currency
      && String(activeSameType.conservative_upper_bound_reason || '') === row.conservative_upper_bound_reason);
    const hasPriceChange = hasPriceIntent && !samePriceVersion;
    if (hasPriceChange) {
      if (!['official_public', 'account_actual', 'aggregator', 'manual'].includes(row.price_type)) conflicts.push('PRICE_TYPE_INVALID');
      if (!row.billing_unit || !row.currency) conflicts.push('PRICE_UNIT_AND_CURRENCY_REQUIRED');
      if (ROUTABLE_PRICE_TYPES.has(row.price_type) && (!/^[A-Z]{3,16}$/.test(row.currency) || row.currency === 'UNKNOWN')) conflicts.push('ROUTABLE_CURRENCY_UNVERIFIED');
      if (!row.source_url && !row.source_api) conflicts.push('PRICE_SOURCE_REQUIRED');
      if (!row.source_observed_at || !Number.isFinite(new Date(row.source_observed_at).getTime())) conflicts.push('PRICE_OBSERVED_AT_REQUIRED');
      if (row.expires_at && (!Number.isFinite(new Date(row.expires_at).getTime()) || new Date(row.expires_at).getTime() <= Date.now())) conflicts.push('PRICE_EXPIRY_INVALID');
      if (!Object.keys(row.price_config || {}).length && !Object.keys(row.conservative_upper_bound_config || {}).length) conflicts.push('PRICE_CONFIG_OR_CONSERVATIVE_BOUND_REQUIRED');
      if (Object.values(row.price_config || {}).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) conflicts.push('PRICE_CONFIG_NEGATIVE_OR_INVALID');
      if (Object.keys(row.conservative_upper_bound_config || {}).length) {
        const upperExpiry = new Date(row.conservative_upper_bound_expires_at).getTime();
        if (!elevatedRole(actor)) conflicts.push('CONSERVATIVE_BOUND_REQUIRES_ELEVATED_ROLE');
        if (!['USD', 'CNY', 'RMB'].includes(row.conservative_upper_bound_currency)
          || !row.conservative_upper_bound_reason || !Number.isFinite(upperExpiry)
          || upperExpiry <= Date.now() || upperExpiry > Date.now() + 7 * 86400000) {
          conflicts.push('CONSERVATIVE_BOUND_CURRENCY_REASON_OR_EXPIRY_INVALID');
        }
        if (Object.values(row.conservative_upper_bound_config).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) conflicts.push('CONSERVATIVE_BOUND_NEGATIVE_OR_INVALID');
      }
    }

    const sitePrice = row.site_price_cny ? Number(row.site_price_cny) : null;
    const creditCount = row.credits ? Number(row.credits) : null;
    if (row.site_price_cny && (!Number.isFinite(sitePrice) || sitePrice <= 0)) conflicts.push('SITE_PRICE_INVALID');
    if (row.credits && (!Number.isInteger(creditCount) || creditCount <= 0)) conflicts.push('CREDITS_INVALID');
    if (mapping && model && (sitePrice !== null || creditCount !== null)) {
      const siteKey = JSON.stringify([sitePrice, creditCount]);
      const priorSiteKey = siteUpdateByModel.get(mapping.model_id);
      if (priorSiteKey && priorSiteKey !== siteKey) conflicts.push('DUPLICATE_SITE_PRICE_MODEL_CONFLICT');
      else siteUpdateByModel.set(mapping.model_id, siteKey);
    }
    if (row.override_reason) {
      if (!elevatedRole(actor)) conflicts.push('MARGIN_OVERRIDE_REQUIRES_ELEVATED_ROLE');
      const overrideExpires = new Date(row.override_expires_at).getTime();
      if (!Number.isFinite(overrideExpires) || overrideExpires <= Date.now() || overrideExpires > Date.now() + 14 * 86400000) conflicts.push('OVERRIDE_EXPIRY_MUST_BE_WITHIN_14_DAYS');
    }
    if (!hasPriceChange && !row.site_price_cny && !row.credits) conflicts.push('NO_UPDATABLE_FIELDS');

    let marginPreview = null;
    if (mapping && model && (sitePrice !== null || creditCount !== null)) {
      const defaultParameters = asObject(model.default_parameters);
      const competitors = mappings.filter((candidate) => candidate.model_id === mapping.model_id && candidate.enabled
        && candidate.review_status === 'approved' && ROUTABLE_PRICE_TYPES.has(candidate.active_price_type));
      const estimates = competitors.map((candidate) => {
        const importedIsRoutePrice = hasPriceChange && candidate.id === mapping.id && ROUTABLE_PRICE_TYPES.has(row.price_type);
        let config = importedIsRoutePrice ? row.price_config : asObject(candidate.active_price_config);
        let currency = importedIsRoutePrice ? row.currency : candidate.active_currency;
        const billingUnit = importedIsRoutePrice ? row.billing_unit : candidate.active_billing_unit;
        const lastObservedAt = importedIsRoutePrice ? new Date(row.source_observed_at).getTime()
          : new Date(candidate.active_source_observed_at || 0).getTime();
        const expiry = importedIsRoutePrice ? (row.expires_at ? new Date(row.expires_at).getTime() : null)
          : candidate.active_expires_at ? new Date(candidate.active_expires_at).getTime() : null;
        let unusableReason = !importedIsRoutePrice && (!Number.isFinite(lastObservedAt) || Date.now() - lastObservedAt > 24 * 3600000)
          ? 'PRICE_STALE' : null;
        if (expiry !== null && Number.isFinite(expiry) && expiry <= Date.now()) unusableReason = 'PRICE_EXPIRED';
        if (unusableReason || !Object.keys(config || {}).length) {
          const boundConfig = importedIsRoutePrice ? row.conservative_upper_bound_config : asObject(candidate.active_upper_bound_config);
          const boundCurrency = importedIsRoutePrice ? row.conservative_upper_bound_currency : candidate.active_upper_bound_currency;
          const boundExpires = importedIsRoutePrice ? row.conservative_upper_bound_expires_at : candidate.active_upper_bound_expires_at;
          if (Object.keys(boundConfig || {}).length && ['USD', 'CNY', 'RMB'].includes(String(boundCurrency || '').toUpperCase())
            && Number.isFinite(new Date(boundExpires).getTime()) && new Date(boundExpires).getTime() > Date.now()) {
            config = boundConfig;
            currency = boundCurrency;
            unusableReason = null;
          }
        }
        if (unusableReason) return { known: false, providerId: candidate.provider_id, reason: unusableReason };
        return config && Object.keys(config).length
          ? { ...estimateRequestCost(config, defaultParameters, { currency, billingUnit, fxSnapshot }), providerId: candidate.provider_id }
          : { known: false, providerId: candidate.provider_id, reason: 'PRICE_UNKNOWN' };
      });
      const unknown = estimates.find((estimate) => !estimate.known);
      if (!estimates.length) conflicts.push('SITE_PRICE_NO_APPROVED_COST_CHANNEL');
      else if (unknown) conflicts.push(`SITE_PRICE_COST_UNKNOWN:${unknown.providerId}:${unknown.reason}`);
      else {
        const price = sitePrice ?? creditCount * CREDIT_PRICING_POLICY.cnyPerCredit;
        const credits = creditCount ?? Number(mapping.base_credits || Math.ceil(price / CREDIT_PRICING_POLICY.cnyPerCredit));
        const highestCostCny = Math.max(...estimates.map((estimate) => estimate.estimatedCostCny));
        const reservedCostCny = highestCostCny * (1 + CREDIT_PRICING_POLICY.providerCostReserveRate);
        const grossMarginRate = price > 0 ? Number(((price - reservedCostCny) / price).toFixed(4)) : null;
        const floor = CREDIT_PRICING_POLICY.targetContributionMarginRate;
        marginPreview = { sitePriceCny: price, credits, estimatedCostCny: Math.min(...estimates.map((estimate) => estimate.estimatedCostCny)),
          worstEligibleCostCny: highestCostCny,
          reservedCostCny, grossMarginRate, minimumGrossMarginRate: floor,
          passed: grossMarginRate !== null && grossMarginRate >= floor };
        if (!marginPreview.passed && !row.override_reason) conflicts.push('SITE_PRICE_BELOW_MARGIN_FLOOR');
        if (!marginPreview.passed && row.override_reason && reservedCostCny >= price) conflicts.push('SITE_PRICE_BELOW_COST_RESERVE');
      }
    }
    const sitePriceChanged = sitePrice !== null && mapping
      && Number(mapping.site_price_cny || 0) !== sitePrice;
    const creditsChanged = creditCount !== null && mapping && Number(mapping.base_credits || 0) !== creditCount;
    report.push({ rowNumber: row.__row_number, key: rowKey(row), modelId: row.canonical_model_id,
      providerId: row.provider_id, providerModelId: row.provider_model_id,
      change: { price: hasPriceChange, sitePrice: Boolean(sitePriceChanged), credits: Boolean(creditsChanged) },
      prior: mapping ? { modelId: mapping.model_id, priceVersionId: mapping.active_price_id,
        sitePriceCny: mapping.site_price_cny === null ? null : Number(mapping.site_price_cny), credits: mapping.base_credits,
        priceLocked: Boolean(mapping.manually_locked) } : null,
      proposed: { priceType: row.price_type || null, billingUnit: row.billing_unit || null, currency: row.currency || null,
        sitePriceCny: sitePrice, credits: creditCount },
      marginPreview, conflicts, valid: conflicts.length === 0,
      normalized: row,
    });
  }
  return report;
}

export async function previewPriceImport({ rows, sourceFilename = '', actor } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw Object.assign(new Error('导入文件没有数据行'), { code: 'IMPORT_EMPTY' });
  if (rows.length > 2000) throw Object.assign(new Error('单批最多导入 2000 行'), { code: 'IMPORT_ROW_LIMIT' });
  const normalized = normalizeRows(rows);
  const report = await validateRows(normalized, actor);
  const validCount = report.filter((row) => row.valid).length;
  const conflictCount = report.length - validCount;
  const batchId = makeId('imp');
  await execute(`INSERT INTO ai_studio.model_price_import_batches
      (id,status,mode,source_filename,row_count,valid_count,conflict_count,report_json,actor_id,created_at)
    VALUES ($1,'previewed','dry_run',$2,$3,$4,$5,$6::jsonb,$7,now())`, [
    batchId, String(sourceFilename).slice(0, 255), report.length, validCount, conflictCount,
    JSON.stringify(report), actor?.id || null,
  ]);
  return { batchId, mode: 'dry_run', rowCount: report.length, validCount, conflictCount,
    canApply: conflictCount === 0, rows: report };
}

export async function applyPriceImport({ batchId, actor } = {}) {
  return withTransaction(async (tx) => {
    const batch = await tx.queryOne(`SELECT * FROM ai_studio.model_price_import_batches WHERE id=$1 FOR UPDATE`, [batchId]);
    if (!batch || batch.status !== 'previewed') throw Object.assign(new Error('导入预览不存在或已处理'), { code: 'IMPORT_PREVIEW_NOT_APPLICABLE' });
    if (String(batch.actor_id) !== String(actor?.id)) throw Object.assign(new Error('只能确认本人创建的导入预览'), { code: 'IMPORT_ACTOR_MISMATCH' });
    const oldReport = typeof batch.report_json === 'string' ? JSON.parse(batch.report_json) : batch.report_json || [];
    const rows = oldReport.map((item) => item.normalized);
    const freshReport = await validateRows(rows, actor, tx);
    if (freshReport.some((row) => !row.valid)) throw Object.assign(new Error('数据或成本条件已变化，请重新生成导入预览'), { code: 'IMPORT_PREVIEW_STALE' });

    const rollback = [];
    const applied = [];
    const handledSiteModels = new Set();
    for (const item of freshReport) {
      const row = item.normalized;
      const mapping = await tx.queryOne(`SELECT pm.id,pm.model_id,pm.provider_id,pm.provider_model_id,
          (SELECT COALESCE(MAX(version_no),0)::int FROM ai_studio.provider_model_price_versions WHERE provider_model_id=pm.id) max_version
        FROM ai_studio.provider_models pm WHERE pm.provider_id=$1 AND pm.provider_model_id=$2 FOR UPDATE`,
      [row.provider_id, row.provider_model_id]);
      if (!mapping) throw Object.assign(new Error('导入映射在确认过程中已变化'), { code: 'IMPORT_PREVIEW_STALE' });
      const rowRollback = { modelId: mapping.model_id, providerModelId: mapping.id,
        newPriceVersionId: null, previousPriceVersionId: null, newSitePriceVersionId: null,
        previousSitePriceVersionId: null, previousPricing: null };
      const hasPriceChange = item.change.price;
      if (hasPriceChange) {
        const priceVersionId = makeId('pver');
        const active = await tx.queryOne(`SELECT id FROM ai_studio.provider_model_price_versions
          WHERE provider_model_id=$1 AND status='active' AND price_type=$2 LIMIT 1 FOR UPDATE`, [mapping.id, row.price_type]);
        await tx.execute(`INSERT INTO ai_studio.provider_model_price_versions
            (id,provider_model_id,version_no,price_type,billing_unit,currency,price_config,applicability,
             source_url,source_api,source_observed_at,fetched_at,expires_at,evidence_digest,status,
             manually_locked,change_summary,previous_version_id,modified_by,
             conservative_upper_bound_config,conservative_upper_bound_currency,
             conservative_upper_bound_expires_at,conservative_upper_bound_reason)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,now(),$12,$13,'pending_review',
             $14,$15::jsonb,$16,$17,$18::jsonb,$19,$20,$21)`, [priceVersionId, mapping.id, Number(mapping.max_version || 0) + 1,
          row.price_type, row.billing_unit, row.currency, JSON.stringify(row.price_config), JSON.stringify(row.applicability),
          row.source_url || null, row.source_api || null, new Date(row.source_observed_at).toISOString(),
          row.expires_at ? new Date(row.expires_at).toISOString() : null,
          crypto.createHash('sha256').update(JSON.stringify({ row: item.proposed, config: row.price_config })).digest('hex'),
          row.price_type === 'manual', JSON.stringify({ importBatchId: batchId, stagedForReview: true }), active?.id || null,
          actor?.id || null,
          Object.keys(row.conservative_upper_bound_config || {}).length ? JSON.stringify(row.conservative_upper_bound_config) : null,
          Object.keys(row.conservative_upper_bound_config || {}).length ? row.conservative_upper_bound_currency : null,
          Object.keys(row.conservative_upper_bound_config || {}).length ? new Date(row.conservative_upper_bound_expires_at).toISOString() : null,
          Object.keys(row.conservative_upper_bound_config || {}).length ? row.conservative_upper_bound_reason : null]);
        rowRollback.newPriceVersionId = priceVersionId;
        rowRollback.previousPriceVersionId = active?.id || null;
      }
      if ((item.change.sitePrice || item.change.credits) && !handledSiteModels.has(mapping.model_id)) {
        handledSiteModels.add(mapping.model_id);
        const previousPricing = await tx.queryOne('SELECT * FROM ai_studio.model_pricing WHERE model_id=$1 FOR UPDATE', [mapping.model_id]);
        const activeSite = await tx.queryOne(`SELECT id,version_no FROM ai_studio.model_site_price_versions
          WHERE model_id=$1 AND status='active' FOR UPDATE`, [mapping.model_id]);
        rowRollback.previousPricing = previousPricing || null;
        rowRollback.previousSitePriceVersionId = activeSite?.id || null;
        const price = Number(row.site_price_cny || item.marginPreview?.sitePriceCny);
        const credits = Number(row.credits || item.marginPreview?.credits);
        const nextSiteVersionId = makeId('spv');
        const versionNoRow = await tx.queryOne(`SELECT COALESCE(MAX(version_no),0)::int max_version
          FROM ai_studio.model_site_price_versions WHERE model_id=$1`, [mapping.model_id]);
        if (activeSite) await tx.execute(`UPDATE ai_studio.model_site_price_versions SET status='superseded' WHERE id=$1`, [activeSite.id]);
        await tx.execute(`INSERT INTO ai_studio.model_site_price_versions
            (id,model_id,version_no,site_price,currency,credits,status,price_locked,effective_at,expires_at,
             min_gross_margin_rate,override_reason,override_expires_at,previous_version_id,modified_by)
          VALUES ($1,$2,$3,$4,'CNY',$5,'active',TRUE,now(),$6,$7,$8,$9,$10,$11)`, [
          nextSiteVersionId, mapping.model_id, Number(versionNoRow?.max_version || 0) + 1, price, credits,
          row.expires_at ? new Date(row.expires_at).toISOString() : null,
          row.override_reason ? 0 : CREDIT_PRICING_POLICY.targetContributionMarginRate,
          row.override_reason || null, row.override_expires_at ? new Date(row.override_expires_at).toISOString() : null,
          activeSite?.id || null, actor?.id || null,
        ]);
        if (previousPricing) {
          await tx.execute(`UPDATE ai_studio.model_pricing SET base_credits=$2,site_price_cny=$3,
              site_price_currency='CNY',price_locked=TRUE,price_valid_from=now(),price_valid_until=$4,
              override_reason=$5,override_expires_at=$6,active_site_price_version_id=$7,updated_at=now()
            WHERE model_id=$1`, [mapping.model_id, credits, price,
            row.expires_at ? new Date(row.expires_at).toISOString() : null,
            row.override_reason || null, row.override_expires_at ? new Date(row.override_expires_at).toISOString() : null,
            nextSiteVersionId]);
        } else {
          const pricingId = makeId('prc');
          await tx.execute(`INSERT INTO ai_studio.model_pricing
              (id,model_id,pricing_type,base_credits,formula_config,subscription_discounts,min_credits,
               min_gross_margin_rate,is_active,site_price_cny,site_price_currency,price_locked,price_valid_from,
               price_valid_until,override_reason,override_expires_at,active_site_price_version_id,created_at,updated_at)
            VALUES ($1,$2,'fixed',$3,'{}'::jsonb,'{}'::jsonb,10,$4,TRUE,$5,'CNY',TRUE,now(),$6,$7,$8,$9,now(),now())`, [
            pricingId, mapping.model_id, credits,
            row.override_reason ? 0 : CREDIT_PRICING_POLICY.targetContributionMarginRate,
            price, row.expires_at ? new Date(row.expires_at).toISOString() : null,
            row.override_reason || null, row.override_expires_at ? new Date(row.override_expires_at).toISOString() : null,
            nextSiteVersionId,
          ]);
        }
        rowRollback.newSitePriceVersionId = nextSiteVersionId;
      }
      rollback.push(rowRollback);
      applied.push({ rowNumber: item.rowNumber, providerModelId: mapping.id,
        priceStatus: rowRollback.newPriceVersionId ? 'pending_review' : null,
        sitePriceVersionId: rowRollback.newSitePriceVersionId || null });
    }
    await tx.execute(`UPDATE ai_studio.model_price_import_batches SET status='applied',mode='apply',
        report_json=$2::jsonb,rollback_json=$3::jsonb,applied_at=now(),valid_count=$4,conflict_count=0
      WHERE id=$1`, [batchId, JSON.stringify(freshReport), JSON.stringify(rollback), freshReport.length]);
    return { batchId, status: 'applied', rows: applied,
      message: '渠道价格进入待审核版本；站点售价已按预览批次发布并保留回滚版本。' };
  });
}

export async function rollbackPriceImport({ batchId, actor } = {}) {
  return withTransaction(async (tx) => {
    const batch = await tx.queryOne(`SELECT * FROM ai_studio.model_price_import_batches WHERE id=$1 FOR UPDATE`, [batchId]);
    if (!batch || batch.status !== 'applied') throw Object.assign(new Error('只有已应用批次可以回滚'), { code: 'IMPORT_NOT_ROLLBACKABLE' });
    if (String(batch.actor_id) !== String(actor?.id) && !elevatedRole(actor)) throw Object.assign(new Error('无权回滚该批次'), { code: 'IMPORT_ACTOR_MISMATCH' });
    const rollback = typeof batch.rollback_json === 'string' ? JSON.parse(batch.rollback_json) : batch.rollback_json || [];
    for (const row of [...rollback].reverse()) {
      if (row.newPriceVersionId) {
        const imported = await tx.queryOne(`SELECT id,provider_model_id,price_type,status
          FROM ai_studio.provider_model_price_versions WHERE id=$1 FOR UPDATE`, [row.newPriceVersionId]);
        if (imported?.status === 'active') {
          const current = await tx.queryOne(`SELECT id FROM ai_studio.provider_model_price_versions
            WHERE provider_model_id=$1 AND price_type=$2 AND status='active' FOR UPDATE`,
          [imported.provider_model_id, imported.price_type]);
          if (current?.id !== imported.id) {
            throw Object.assign(new Error('導入價格已被更新版本取代；為避免覆蓋後續修改，請先人工處理價格版本'), { code: 'IMPORT_ROLLBACK_PRICE_CONFLICT' });
          }
          await tx.execute(`UPDATE ai_studio.provider_model_price_versions SET status='rejected' WHERE id=$1`, [imported.id]);
          if (row.previousPriceVersionId) {
            await tx.execute(`UPDATE ai_studio.provider_model_price_versions SET status='active' WHERE id=$1 AND status='superseded'`, [row.previousPriceVersionId]);
          }
        } else if (['pending_review','staged'].includes(imported?.status)) {
          await tx.execute(`UPDATE ai_studio.provider_model_price_versions SET status='rejected' WHERE id=$1`, [imported.id]);
        }
      }
      if (row.newSitePriceVersionId) {
        await tx.execute(`UPDATE ai_studio.model_site_price_versions SET status='rejected' WHERE id=$1 AND status='active'`, [row.newSitePriceVersionId]);
        if (row.previousSitePriceVersionId) {
          await tx.execute(`UPDATE ai_studio.model_site_price_versions SET status='active' WHERE id=$1`, [row.previousSitePriceVersionId]);
        }
        if (row.previousPricing) {
          const previous = row.previousPricing;
          await tx.execute(`UPDATE ai_studio.model_pricing SET base_credits=$2,site_price_cny=$3,site_price_currency=$4,
              price_locked=$5,price_valid_from=$6,price_valid_until=$7,published_by=$8,override_reason=$9,
              override_expires_at=$10,active_site_price_version_id=$11,updated_at=now() WHERE model_id=$1`, [
            row.modelId, previous.base_credits, previous.site_price_cny, previous.site_price_currency,
            previous.price_locked, previous.price_valid_from, previous.price_valid_until, previous.published_by,
            previous.override_reason, previous.override_expires_at, row.previousSitePriceVersionId,
          ]);
        } else {
          await tx.execute(`DELETE FROM ai_studio.model_pricing WHERE model_id=$1`, [row.modelId]);
        }
      }
    }
    await tx.execute(`UPDATE ai_studio.model_price_import_batches SET status='rolled_back',rolled_back_at=now() WHERE id=$1`, [batchId]);
    return { batchId, status: 'rolled_back', restoredRows: rollback.length };
  });
}

export async function exportPriceRows(format = 'csv') {
  const snapshot = await getPricingControlSnapshot();
  const rows = [];
  for (const model of snapshot.models) {
    for (const route of model.routes) {
      const price = route.active_price_version || {};
      const official = route.official_price_version?.price_config || {};
      const channel = ['account_actual', 'aggregator', 'manual'].includes(price.price_type) ? price.price_config : {};
      rows.push({
        canonical_model_id: model.id,
        provider_id: route.provider_id,
        provider_model_id: route.provider_model_id,
        provider_model_version: route.provider_model_version || '',
        provider_endpoint: route.provider_endpoint || '',
        task_types: JSON.stringify(route.supported_task_types || []),
        input_types: JSON.stringify(route.capabilities?.input_types || []),
        output_types: JSON.stringify(route.capabilities?.output_types || []),
        resolutions: JSON.stringify(route.supported_resolutions || []),
        durations: JSON.stringify(route.supported_durations || []),
        qualities: JSON.stringify(route.supported_qualities || []),
        regions: JSON.stringify(route.supported_regions || []),
        license_requirements: JSON.stringify(route.license_requirements || []),
        verified_license_conditions: JSON.stringify(route.capabilities?.verified_license_conditions || []),
        price_version_id: price.id || '',
        price_version_no: price.version_no || '',
        official_price_version_id: route.official_price_version?.id || '',
        channel_price_version_id: price.id || '',
        price_type: price.price_type || '',
        billing_unit: price.billing_unit || '',
        currency: price.currency || '',
        price_config_json: Object.keys(price.price_config || {}).length ? JSON.stringify(price.price_config) : '',
        applicability_json: JSON.stringify(price.applicability || {}),
        official_price_json: Object.keys(official || {}).length ? JSON.stringify(official) : '',
        official_billing_unit: route.official_price_version?.billing_unit || '',
        official_currency: route.official_price_version?.currency || '',
        official_source_url: route.official_price_version?.source_url || '',
        official_source_api: route.official_price_version?.source_api || '',
        official_source_observed_at: route.official_price_version?.source_observed_at || '',
        channel_price_json: Object.keys(channel || {}).length ? JSON.stringify(channel) : '',
        channel_billing_unit: price.billing_unit || '',
        channel_currency: price.currency || '',
        channel_source_url: price.source_url || '',
        channel_source_api: price.source_api || '',
        channel_source_observed_at: price.source_observed_at || '',
        conservative_upper_bound_json: Object.keys(price.conservative_upper_bound_config || {}).length
          ? JSON.stringify(price.conservative_upper_bound_config) : '',
        conservative_upper_bound_currency: price.conservative_upper_bound_currency || '',
        conservative_upper_bound_expires_at: price.conservative_upper_bound_expires_at || '',
        conservative_upper_bound_reason: price.conservative_upper_bound_reason || '',
        site_price_cny: model.site_price_cny ?? '',
        credits: model.base_credits ?? '',
        source_url: price.source_url || '',
        source_api: price.source_api || '',
        source_observed_at: price.source_observed_at || '',
        fetched_at: price.fetched_at || '',
        effective_at: price.effective_at || '',
        expires_at: price.expires_at || model.price_valid_until || '',
        price_status: price.status || 'missing',
        mapping_status: route.review_status || 'needs_specification',
        enabled: route.enabled === true,
        override_reason: model.override_reason || '',
        override_expires_at: model.override_expires_at || '',
      });
    }
  }
  const content = format === 'xlsx' ? buildXlsx(rows) : buildCsv(rows);
  return { content, rows: rows.length, columns: PRICE_IMPORT_COLUMNS };
}

export function parsePriceImport({ format, content, base64 } = {}) {
  const bytes = base64 ? Buffer.from(base64, 'base64') : Buffer.from(String(content || ''), 'utf8');
  if (bytes.byteLength > 10 * 1024 * 1024) throw Object.assign(new Error('导入文件不得超过 10 MB'), { code: 'IMPORT_FILE_TOO_LARGE' });
  if (format === 'xlsx') return parseXlsx(bytes);
  if (format === 'csv') return parseCsv(bytes.toString('utf8'));
  throw Object.assign(new Error('仅支持 CSV 与 XLSX 文件'), { code: 'IMPORT_FORMAT_UNSUPPORTED' });
}
