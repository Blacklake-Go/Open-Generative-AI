import { getEmailSmtpConfiguration, hasEmailSmtpPassword } from '../emailConfig.js';
import { verifyEmailSmtp } from '../emailService.js';
import { listPublicModelProviderRoutes } from '../repositories/dependencyHealth.js';
import { getStorageConfigAndAdapter } from '../storage/storageService.js';
import { getProviderAdapter, hasProviderAdapter } from '../adapters/index.js';
import { updateProviderHealth } from '../repositories/aiCatalog.js';
import { getServerProviderApiKey } from './providerSecrets.js';
import { DEFAULT_PRICE_MAX_AGE_MS, ROUTE_COST_SOURCE_TYPES, isRoutableBillingUnit } from '../modelCenter/routePricing.js';

const DEFAULT_PROBE_TIMEOUT_MS = 2500;
const DEFAULT_CACHE_MS = 30000;
const DEFAULT_MODEL_HEALTH_MAX_AGE_MS = 15 * 60 * 1000;
const REQUIRED_MODEL_CATEGORIES = Object.freeze(['image', 'video']);

function positiveInt(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function errorCode(error, fallback) {
  const value = String(error?.code || fallback).toUpperCase();
  return /^[A-Z0-9_]{1,64}$/.test(value) ? value : fallback;
}

function errorStatus(code) {
  return ['STORAGE_NOT_CONFIGURED', 'STORAGE_PROVIDER_UNAVAILABLE', 'SMTP_NOT_CONFIGURED', 'SMTP_DISABLED'].includes(code)
    ? 'degraded'
    : 'unhealthy';
}

export function createCachedDependencyProbe({
  probe,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  cacheMs = DEFAULT_CACHE_MS,
  clock = () => Date.now(),
} = {}) {
  if (typeof probe !== 'function') throw new TypeError('A dependency probe function is required.');
  let cached = null;
  let expiresAt = 0;
  let inFlight = null;

  return async ({ force = false } = {}) => {
    if (!force && cached && clock() < expiresAt) return { ...cached, cached: true };
    if (inFlight) return inFlight;

    inFlight = (async () => {
      let timer;
      let result;
      try {
        result = await Promise.race([
          Promise.resolve().then(probe),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Object.assign(new Error('Dependency probe timed out.'), { code: 'DEPENDENCY_PROBE_TIMEOUT' })), timeoutMs);
          }),
        ]);
        if (!['healthy', 'degraded', 'unhealthy', 'unknown'].includes(result?.status)) {
          result = { status: 'unknown', errorCode: 'DEPENDENCY_PROBE_INVALID_RESULT' };
        }
      } catch (error) {
        const code = errorCode(error, 'DEPENDENCY_PROBE_FAILED');
        result = { status: code === 'DEPENDENCY_PROBE_TIMEOUT' ? 'unknown' : errorStatus(code), errorCode: code };
      } finally {
        clearTimeout(timer);
      }

      cached = { ...result, checkedAt: new Date(clock()).toISOString() };
      expiresAt = clock() + cacheMs;
      return { ...cached, cached: false };
    })().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}

function configuredModelHealthMaxAgeMs() {
  const value = Number(process.env.MODEL_HEALTH_MAX_AGE_MS);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 24 * 60 * 60 * 1000) : DEFAULT_MODEL_HEALTH_MAX_AGE_MS;
}

function configuredModelPriceMaxAgeMs() {
  const value = Number(process.env.MODEL_PRICE_MAX_AGE_MS);
  // Use the same configured price age as the router; silently capping an
  // explicitly configured value made readiness disagree with admission.
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PRICE_MAX_AGE_MS;
}

function objectValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return {};
}

function positivePriceField(config, fields) {
  return fields.some((field) => Number(config[field]) > 0);
}

function priceVersionIssue(mapping, now, maxPriceAgeMs) {
  const price = objectValue(mapping.active_price_version);
  if (!price.id) return 'PRICE_MISSING';
  if (!ROUTE_COST_SOURCE_TYPES.includes(String(price.price_type || '').toLowerCase())) return 'PRICE_TYPE_NOT_ROUTEABLE';
  if (price.status !== 'active') return 'PRICE_NOT_ACTIVE';
  if (!isRoutableBillingUnit(price.billing_unit)) return 'BILLING_UNIT_UNVERIFIED';
  if (!['USD', 'CNY', 'RMB'].includes(String(price.currency || '').toUpperCase())) return 'PRICE_CURRENCY_UNSUPPORTED';

  const effectiveAt = price.effective_at ? new Date(price.effective_at).getTime() : null;
  const expiresAt = price.expires_at ? new Date(price.expires_at).getTime() : null;
  const observedAt = new Date(price.source_observed_at || price.fetched_at || price.created_at || 0).getTime();
  if (effectiveAt !== null && Number.isFinite(effectiveAt) && effectiveAt > now) return 'PRICE_NOT_EFFECTIVE';
  if (expiresAt !== null && Number.isFinite(expiresAt) && expiresAt <= now) return 'PRICE_EXPIRED';
  if (!Number.isFinite(observedAt) || observedAt <= 0 || now - observedAt > maxPriceAgeMs) return 'PRICE_STALE';

  const priceConfig = objectValue(price.price_config);
  const legacyCost = objectValue(mapping.cost_config);
  const hasPrice = positivePriceField(priceConfig, [
    'base_cost', 'unit_amount', 'amount', 'unit_cost', 'cost_per_output_second', 'cost_per_second',
    'cost_per_input_second', 'cost_per_input_token', 'cost_per_output_token', 'cost_per_1k_input_tokens',
    'cost_per_1k_output_tokens', 'cost_per_image', 'cost_per_reference_image',
    'cost_per_reference_video_second', 'tool_fee', 'cost_per_unit',
  ]) || priceConfig.is_free === true || priceConfig.free === true || priceConfig.dynamic_pricing === true;
  const hasLegacyCost = positivePriceField(legacyCost, [
    'base_cost', 'unit_amount', 'amount', 'unit_cost', 'cost_per_output_second', 'cost_per_second',
    'cost_per_input_second', 'cost_per_input_token', 'cost_per_output_token', 'cost_per_1k_input_tokens',
    'cost_per_1k_output_tokens', 'cost_per_image', 'cost_per_reference_image',
    'cost_per_reference_video_second', 'tool_fee', 'cost_per_unit',
  ]) || legacyCost.is_free === true || legacyCost.free === true;
  if (!hasPrice || !hasLegacyCost) return 'PRICE_CONFIG_MISSING';
  return null;
}

function categoryFamilies(rows) {
  const categories = new Set((rows || []).map((row) => String(row.model_category || '').toLowerCase()));
  return new Set([
    ...(categories.has('image') || categories.has('image_edit') ? ['image'] : []),
    ...(categories.has('video') || categories.has('video_image') || categories.has('video_text') ? ['video'] : []),
  ]);
}

export function assessPublicModelProviderReadiness(rows, {
  credentialProviders = new Set(),
  adapterProviders = new Set(),
  providerStatusOverrides = new Map(),
  now = Date.now(),
  maxHealthAgeMs = DEFAULT_MODEL_HEALTH_MAX_AGE_MS,
  maxPriceAgeMs = DEFAULT_PRICE_MAX_AGE_MS,
  requiredCategories = REQUIRED_MODEL_CATEGORIES,
} = {}) {
  const models = new Map();
  for (const row of rows || []) {
    if (!models.has(row.model_id)) models.set(row.model_id, []);
    if (row.mapping_id) models.get(row.model_id).push(row);
  }

  if (models.size === 0) {
    return {
      status: 'degraded', activeModels: 0, coveredModels: 0, unavailableModels: 0,
      staleHealthModels: 0, providers: [], missingCategories: [...requiredCategories], errorCode: 'NO_PUBLIC_MODELS',
    };
  }

  const modelStatuses = [];
  const providerStatuses = new Map();
  let staleHealthModels = 0;

  for (const [modelId, mappings] of models) {
    const statuses = [];
    for (const mapping of mappings) {
      const providerId = String(mapping.provider_id || '').trim().toLowerCase();
      const priceIssue = priceVersionIssue(mapping, now, maxPriceAgeMs);
      if (!mapping.mapping_enabled || String(mapping.review_status || 'approved') !== 'approved' || !mapping.provider_enabled
        || !providerId || !String(mapping.provider_endpoint || '').trim()
        || !adapterProviders.has(providerId) || !credentialProviders.has(providerId) || priceIssue) {
        statuses.push('degraded');
        if (providerId) providerStatuses.set(providerId, 'degraded');
        continue;
      }

      if (['open', 'circuit_open'].includes(String(mapping.circuit_state || '').toLowerCase())) {
        statuses.push('unhealthy');
        providerStatuses.set(providerId, 'unhealthy');
        continue;
      }

      const providerOverride = providerStatusOverrides instanceof Map
        ? providerStatusOverrides.get(providerId)
        : providerStatusOverrides?.[providerId];
      if (providerOverride === 'healthy') {
        statuses.push('healthy');
        const previous = providerStatuses.get(providerId);
        if (!previous || previous === 'degraded' || previous === 'unknown') {
          providerStatuses.set(providerId, 'healthy');
        }
        continue;
      }
      if (['degraded', 'unhealthy', 'unknown'].includes(providerOverride)) {
        statuses.push(providerOverride);
        providerStatuses.set(providerId, providerOverride);
        continue;
      }

      const checkedAt = mapping.last_health_check_at ? new Date(mapping.last_health_check_at).getTime() : 0;
      if (!Number.isFinite(checkedAt) || checkedAt <= 0 || now - checkedAt > maxHealthAgeMs) {
        statuses.push('unknown');
        providerStatuses.set(providerId, 'unknown');
        continue;
      }

      const providerHealth = String(mapping.health_status || '').toLowerCase();
      const status = providerHealth === 'healthy' ? 'healthy'
        : providerHealth === 'degraded' ? 'degraded'
          : 'unhealthy';
      statuses.push(status);
      const previous = providerStatuses.get(providerId);
      if (!previous || (previous === 'degraded' && status === 'healthy')) providerStatuses.set(providerId, status);
    }

    const modelStatus = statuses.includes('healthy') ? 'healthy'
      : statuses.includes('degraded') ? 'degraded'
        : statuses.includes('unknown') ? 'unknown'
          : 'unhealthy';
    if (modelStatus === 'unknown') staleHealthModels += 1;
    modelStatuses.push({ modelId, status: modelStatus });
  }

  const coveredModels = modelStatuses.filter((model) => model.status === 'healthy').length;
  const unavailableModels = modelStatuses.length - coveredModels;
  const availableCategories = categoryFamilies(rows);
  const missingCategories = [...new Set(requiredCategories)].filter((category) => !availableCategories.has(category));
  const status = unavailableModels === 0 && missingCategories.length === 0 ? 'healthy'
    : modelStatuses.some((model) => model.status === 'unknown') ? 'unknown'
      : modelStatuses.some((model) => model.status === 'unhealthy') ? 'unhealthy'
        : 'degraded';

  return {
    status,
    activeModels: modelStatuses.length,
    coveredModels,
    unavailableModels,
    staleHealthModels,
    missingCategories,
    providers: [...providerStatuses.entries()].map(([providerId, providerStatus]) => ({ providerId, status: providerStatus })),
    ...(status === 'healthy' ? {} : {
      errorCode: status === 'unknown' ? 'PROVIDER_HEALTH_STALE'
        : status === 'degraded' && unavailableModels === 0 && missingCategories.length > 0
          ? 'PUBLIC_MODEL_CATEGORY_UNAVAILABLE' : 'PROVIDER_ROUTE_UNAVAILABLE',
    }),
  };
}

export function createProviderScopeOverflowStatus(rows) {
  const activeModels = new Set((rows || []).map((row) => row.model_id).filter(Boolean)).size;
  return {
    status: 'unknown',
    activeModels,
    coveredModels: null,
    unavailableModels: null,
    staleHealthModels: null,
    missingCategories: null,
    providers: [],
    errorCode: 'PROVIDER_SCOPE_TOO_LARGE',
  };
}

async function probeStorage() {
  const startedAt = Date.now();
  const { adapter } = await getStorageConfigAndAdapter({ timeoutMs: 2000 });
  const result = await adapter.testConnection();
  return {
    status: result.status === 'healthy' ? 'healthy' : 'unknown',
    provider: result.provider,
    latencyMs: Date.now() - startedAt,
  };
}

export async function assessEmailDeliveryReadiness({ config, passwordConfigured, verificationSecret, verifySmtp }) {
  if (String(verificationSecret || '').length < 32) {
    return { status: 'degraded', provider: 'smtp', errorCode: 'AUTH_VERIFICATION_SECRET_NOT_CONFIGURED' };
  }
  if (!config.enabled) return { status: 'degraded', provider: 'smtp', errorCode: 'SMTP_DISABLED' };
  if (!config.username || !passwordConfigured) return { status: 'degraded', provider: 'smtp', errorCode: 'SMTP_NOT_CONFIGURED' };

  const startedAt = Date.now();
  const result = await verifySmtp({ timeoutMs: 2000 });
  const status = result.status === 'healthy'
    ? 'healthy'
    : result.errorCode === 'SMTP_TIMEOUT' ? 'unknown' : 'unhealthy';
  return {
    status,
    provider: 'smtp',
    latencyMs: result.latencyMs ?? Date.now() - startedAt,
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
  };
}

async function probeEmail() {
  const [config, passwordConfigured] = await Promise.all([
    getEmailSmtpConfiguration(),
    hasEmailSmtpPassword(),
  ]);
  return assessEmailDeliveryReadiness({
    config,
    passwordConfigured,
    verificationSecret: process.env.AUTH_VERIFICATION_CODE_SECRET,
    verifySmtp: verifyEmailSmtp,
  });
}

export async function probeRequiredProviders({
  listRoutes = listPublicModelProviderRoutes,
  resolveApiKey = getServerProviderApiKey,
  getAdapter = getProviderAdapter,
  hasAdapter = hasProviderAdapter,
  updateHealth = updateProviderHealth,
  fetchFn = fetch,
  now = Date.now(),
} = {}) {
  const rows = await listRoutes();
  const providerIds = [...new Set(rows
    .filter((row) => row.mapping_enabled && row.provider_enabled && String(row.review_status || 'approved') === 'approved'
      && row.provider_id && !priceVersionIssue(row, now, configuredModelPriceMaxAgeMs()))
    .map((row) => String(row.provider_id).trim().toLowerCase()))];
  if (providerIds.length > 64) {
    return createProviderScopeOverflowStatus(rows);
  }
  const [credentialResults, adapterResults] = await Promise.all([
    Promise.all(providerIds.map(async (providerId) => {
      try {
        return [providerId, Boolean(await resolveApiKey({ provider: providerId }))];
      } catch {
        return [providerId, false];
      }
    })),
    Promise.resolve(providerIds.map((providerId) => [providerId, hasAdapter(providerId)])),
  ]);
  const credentialProviders = new Set(credentialResults.filter(([, configured]) => configured).map(([providerId]) => providerId));
  const adapterProviders = new Set(adapterResults.filter(([, available]) => available).map(([providerId]) => providerId));
  const providerStatusOverrides = new Map();

  if (credentialProviders.has('muapi')) {
    try {
      const apiKey = await resolveApiKey({ provider: 'muapi' });
      const response = await fetchFn('https://api.muapi.ai/api/v1/account/balance', {
        method: 'GET',
        headers: { Accept: 'application/json', 'x-api-key': apiKey },
        cache: 'no-store',
        signal: AbortSignal.timeout(1800),
      });
      if (!response.ok) {
        providerStatusOverrides.set('muapi', 'unknown');
      } else {
        const payload = await response.json();
        const balance = Number(payload?.balance);
        if (!Number.isFinite(balance) || balance < 0) {
          providerStatusOverrides.set('muapi', 'unknown');
        } else if (balance === 0) {
          providerStatusOverrides.set('muapi', 'degraded');
        } else {
          providerStatusOverrides.set('muapi', 'healthy');
        }
      }
    } catch {
      providerStatusOverrides.set('muapi', 'unknown');
    }
  }

  // Active health probing for configured providers with adapters to overcome cold-start staleness
  await Promise.all(providerIds.map(async (providerId) => {
    if (providerStatusOverrides.has(providerId)) return;
    if (!credentialProviders.has(providerId) || !adapterProviders.has(providerId)) {
      providerStatusOverrides.set(providerId, 'degraded');
      return;
    }
    try {
      const adapter = await getAdapter(providerId);
      let timeoutId = null;
      const outcome = await Promise.race([
        adapter.healthCheck(),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('timeout')), 1800);
          timeoutId?.unref?.();
        }),
      ]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });
      if (outcome?.healthy) {
        providerStatusOverrides.set(providerId, 'healthy');
      } else if (outcome?.healthy === false) {
        providerStatusOverrides.set(providerId, 'degraded');
      }
    } catch {
      // If probe throws or times out, un-overridden provider status will fall back to timestamp evaluation
    }
  }));

  for (const [providerId, status] of providerStatusOverrides.entries()) {
    if (status === 'healthy') {
      try {
        await updateHealth(providerId, { healthStatus: 'healthy' });
      } catch {
        // Ignored when DB is unavailable or read-only
      }
    }
  }

  return assessPublicModelProviderReadiness(rows, {
    credentialProviders,
    adapterProviders,
    providerStatusOverrides,
    now,
    maxHealthAgeMs: configuredModelHealthMaxAgeMs(),
    maxPriceAgeMs: configuredModelPriceMaxAgeMs(),
  });
}

const configuredProbeTimeout = positiveInt(process.env.READINESS_DEPENDENCY_TIMEOUT_MS, DEFAULT_PROBE_TIMEOUT_MS, 10000);
const configuredCacheMs = positiveInt(process.env.READINESS_DEPENDENCY_CACHE_MS, DEFAULT_CACHE_MS, 300000);

export const getStorageHealth = createCachedDependencyProbe({
  probe: probeStorage,
  timeoutMs: configuredProbeTimeout,
  cacheMs: configuredCacheMs,
});

export const getEmailHealth = createCachedDependencyProbe({
  probe: probeEmail,
  timeoutMs: configuredProbeTimeout,
  cacheMs: configuredCacheMs,
});

export const getProviderHealth = createCachedDependencyProbe({
  probe: probeRequiredProviders,
  timeoutMs: configuredProbeTimeout,
  cacheMs: configuredCacheMs,
});
