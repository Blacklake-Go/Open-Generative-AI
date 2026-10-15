/**
 * A catalog is eligible to retire missing rows only when it is non-empty and
 * complete relative to any source-reported total. Callers must still reject
 * malformed/duplicate IDs before applying this decision.
 */
export function canRetireMissingCatalogEntries({ fetchedCount, reportedTotal = null, complete = false } = {}) {
  if (complete !== true) return false;
  const fetched = Number(fetchedCount);
  if (!Number.isInteger(fetched) || fetched <= 0) return false;
  if (reportedTotal === null || reportedTotal === undefined || reportedTotal === '') return true;
  const total = Number(reportedTotal);
  return Number.isInteger(total) && total > 0 && fetched >= total;
}

/**
 * MuAPI serves every task route under `/api/v1`. `BaseAdapter.resolveProviderEndpoint`
 * treats a root-relative mapping path as relative to the configured base URL's
 * *directory*, so a bare catalog path such as `/nano-banana-pro` resolves to the
 * origin root and the supplier answers 404 (verified against the live API:
 * `/api/v1/nano-banana-pro` -> 403 auth-required, `/nano-banana-pro` -> 404).
 * Absolute URLs and already-versioned paths are kept verbatim.
 */
const MUAPI_TASK_PREFIX = '/api/v1/';

export function muapiTaskEndpoint(rawEndpoint, providerModelId) {
  const raw = String(rawEndpoint || '').trim();
  if (!raw) return `${MUAPI_TASK_PREFIX}${encodeURIComponent(providerModelId)}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = `/${raw.replace(/^\/+/, '')}`;
  return path.startsWith(MUAPI_TASK_PREFIX) ? path : `${MUAPI_TASK_PREFIX}${path.slice(1)}`;
}

/**
 * Normalize the public MuAPI catalog fields that have documented billing meaning.
 * `name` is the model identifier, `endpoint_url` is the actual submit path, and
 * fixed catalog `cost` is billed per request. Dynamic models must be quoted from
 * their request-specific estimate endpoint before they can enter routing.
 */
export function normalizeMuapiCatalogItem(item = {}, { observedAt = new Date().toISOString() } = {}) {
  const providerModelId = String(item.name || item.id || '').replace(/^models\//, '').trim();
  if (!providerModelId) return null;

  const endpoint = muapiTaskEndpoint(item.endpoint_url || item.endpoint, providerModelId);
  const dynamic = item.dynamic_pricing === true;
  const amount = item.cost === null || item.cost === undefined ? null : Number(item.cost);
  const catalogPrice = dynamic || (Number.isFinite(amount) && amount >= 0)
    ? {
        priceType: 'aggregator',
        billingUnit: dynamic ? 'per_request_estimate' : 'per_request',
        currency: String(item.cost_currency || 'USD').toUpperCase(),
        priceConfig: dynamic
          ? { dynamic_pricing: true, cost_strategy: item.cost_strategy || null, estimate_endpoint: item.estimate_endpoint || null }
          : { base_cost: amount, currency: String(item.cost_currency || 'USD').toUpperCase(), is_free: amount === 0 },
        sourceObservedAt: observedAt,
        sourceApi: 'MuAPI public programmatic pricing catalog',
      }
    : null;

  return {
    providerModelId,
    endpoint,
    catalogPrice,
    estimateEndpoint: String(item.estimate_endpoint || '').trim() || null,
  };
}
