const SUCCESS_STATUSES = new Set(['succeeded', 'completed', 'success']);
const FAILURE_STATUSES = new Set(['failed', 'error', 'cancelled', 'canceled']);

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const values = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(values);
  const suffix = [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `studio-${Date.now()}-${suffix || Math.random().toString(36).slice(2)}`;
}

const GENERATION_INTENT_STORAGE_PREFIX = 'supdance:generation-intent:v1:';

function stableSerialize(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 'null' : serialized;
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => stableSerialize(item)).join(',') + ']';
  }

  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined && typeof value[key] !== 'function')
    .sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableSerialize(value[key])).join(',') + '}';
}

function resolveIntentStorage(storageOverride) {
  if (storageOverride) return storageOverride;
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

async function buildIntentStorageKey({ studioId, modelId, prompt, parameters }) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder !== 'function') return null;
  const intent = stableSerialize({ studioId, modelId, prompt, parameters });
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(intent));
  const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  return GENERATION_INTENT_STORAGE_PREFIX + hex;
}

async function resolveGenerationIntent({
  idempotencyKey,
  idempotencyStorage,
  studioId,
  modelId,
  prompt,
  parameters,
}) {
  if (idempotencyKey !== undefined && idempotencyKey !== null) {
    return { key: String(idempotencyKey), storage: null, storageKey: null };
  }

  const storage = resolveIntentStorage(idempotencyStorage);
  let storageKey = null;
  if (storage) {
    try {
      storageKey = await buildIntentStorageKey({ studioId, modelId, prompt, parameters });
      if (storageKey) {
        const existing = storage.getItem(storageKey);
        if (existing && String(existing).trim().length >= 8 && String(existing).trim().length <= 200) {
          return { key: String(existing).trim(), storage, storageKey };
        }
      }
    } catch {
      storageKey = null;
    }
  }

  const key = createIdempotencyKey();
  if (storage && storageKey) {
    try {
      storage.setItem(storageKey, key);
    } catch {
      return { key, storage: null, storageKey: null };
    }
  }
  return { key, storage, storageKey };
}

function clearGenerationIntent(intent) {
  if (!intent?.storage || !intent.storageKey) return;
  try {
    if (intent.storage.getItem(intent.storageKey) === intent.key) {
      intent.storage.removeItem(intent.storageKey);
    }
  } catch {}
}

function generationId(payload) {
  return payload?.creation_id || payload?.creation?.id || payload?.id || payload?.request_id || null;
}

async function quoteIdempotencyKey(generationKey) {
  const candidate = `${generationKey}:quote`;
  if (candidate.length <= 200) return candidate;

  if (!globalThis.crypto?.subtle || typeof TextEncoder !== 'function') {
    throw Object.assign(new Error('The generation idempotency key is too long to quote safely.'), {
      code: 'IDEMPOTENCY_KEY_INVALID',
    });
  }

  const bytes = new TextEncoder().encode(generationKey);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const suffix = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `quote_${suffix}`;
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function requestError(payload, response, fallback) {
  const error = new Error(payload?.error || payload?.message || fallback);
  error.status = response.status;
  error.code = payload?.code || `HTTP_${response.status}`;
  const id = generationId(payload);
  if (id) error.requestId = id;
  return error;
}

function reportPhase(onPhase, phase, requestId) {
  onPhase?.(phase, requestId);
}

async function requestPlatformQuote({ modelId, parameters, idempotencyKey, fetchImpl, onAuthRequired }) {
  const response = await fetchImpl('/api/generation/quote', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': await quoteIdempotencyKey(idempotencyKey),
    },
    body: JSON.stringify({ modelId, parameters }),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    if (response.status === 401) onAuthRequired?.(response.status, payload?.error || '');
    throw requestError(payload, response, 'Could not get a valid server generation quote.');
  }

  const quoteId = payload?.quoteId || payload?.quote_id || null;
  if (!quoteId) {
    throw Object.assign(new Error('The server quote response did not include a quote ID.'), {
      code: 'QUOTE_REQUIRED',
    });
  }

  const credits = payload.creditsQuoted ?? payload.credits ?? null;
  if (typeof window !== 'undefined' && credits != null) {
    window.dispatchEvent(new CustomEvent('supdance:quote', {
      detail: {
        modelId,
        credits,
        quoteId,
        expiresAt: payload.expiresAt || payload.expires_at || null,
        pricingBreakdown: payload.pricingBreakdown || payload.pricing_breakdown || null,
      },
    }));
  }

  return quoteId;
}

function failedGeneration(creation, creationId) {
  const detail = creation.error_reason || creation.error_message || '生成失败';
  const error = new Error(`Generation failed: ${detail}`);
  error.code = creation.error_code || 'GENERATION_FAILED';
  error.requestId = creationId;
  error.generationResult = {
    id: creationId,
    request_id: creationId,
    status: creation.status,
    error: { message: detail, code: error.code },
    cost: {
      amount_credits: Number(creation.credit_cost || 0),
      refund_status: 'unverified',
    },
  };
  return error;
}

function completedGeneration(creation, creationId) {
  const url = creation.result_url || creation.resultUrl || null;
  return {
    id: creationId,
    request_id: creationId,
    status: 'completed',
    url,
    result_url: url,
    outputs: url ? [url] : [],
    cost: {
      refunded: false,
      amount_credits: Number(creation.credit_cost || 0),
    },
  };
}

/**
 * Submit a hosted Studio generation through the platform-owned billing API.
 * Provider credentials are deliberately not accepted by this client boundary.
 */
export async function submitPlatformGeneration({
  modelId,
  studioId = 'studio',
  prompt = '',
  parameters = {},
  label,
  idempotencyKey,
  idempotencyStorage,
  onRequestId,
  onPhase,
  maxAttempts = 900,
  intervalMs = 2_000,
  fetchImpl = globalThis.fetch,
  waitImpl = wait,
  onAuthRequired,
} = {}) {
  if (!modelId) throw new Error('A model ID is required for platform generation.');
  if (typeof fetchImpl !== 'function') throw new Error('Platform generation transport is unavailable.');

  const generationIntent = await resolveGenerationIntent({
    idempotencyKey,
    idempotencyStorage,
    studioId,
    modelId,
    prompt,
    parameters,
  });
  const normalizedIdempotencyKey = String(generationIntent.key || '').trim();
  if (normalizedIdempotencyKey.length < 8 || normalizedIdempotencyKey.length > 200) {
    throw Object.assign(new Error('A valid generation idempotency key is required.'), {
      code: 'IDEMPOTENCY_REQUIRED',
    });
  }

  // Quote the final model settings before creating a billable GenerationJob.
  // The same caller key makes retries reuse the quote and job identity.
  const quoteId = await requestPlatformQuote({
    modelId,
    parameters,
    idempotencyKey: normalizedIdempotencyKey,
    fetchImpl,
    onAuthRequired,
  });

  const submitResponse = await fetchImpl('/api/generations', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': normalizedIdempotencyKey,
    },
    body: JSON.stringify({ modelId, studioId, prompt, parameters, label, quoteId }),
  });
  const submitData = await readJson(submitResponse);

  if (!submitResponse.ok) {
    const error = requestError(submitData, submitResponse, 'Could not create the generation task.');
    const submittedStatus = String(submitData?.creation?.status || submitData?.status || '').toLowerCase();
    if (FAILURE_STATUSES.has(submittedStatus)) clearGenerationIntent(generationIntent);
    if (submitResponse.status === 401) onAuthRequired?.(submitResponse.status, submitData?.error || '');
    throw error;
  }

  const creationId = generationId(submitData);
  if (!creationId) {
    throw Object.assign(new Error('The platform accepted the request without returning a task ID.'), {
      code: 'GENERATION_RESPONSE_INVALID',
    });
  }
  onRequestId?.(creationId);
  reportPhase(onPhase, 'reserved', creationId);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await waitImpl(intervalMs);
    const pollResponse = await fetchImpl(`/api/generations?id=${encodeURIComponent(creationId)}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const trace = await readJson(pollResponse);
    if (!pollResponse.ok) {
      const error = requestError(trace, pollResponse, 'Could not read the generation task.');
      if (pollResponse.status === 401) onAuthRequired?.(pollResponse.status, trace?.error || '');
      if (pollResponse.status >= 500 && attempt + 1 < maxAttempts) continue;
      throw error;
    }

    const creation = trace.creation || trace.task || trace;
    const status = String(creation.status || trace.status || '').toLowerCase();
    if (SUCCESS_STATUSES.has(status)) {
      clearGenerationIntent(generationIntent);
      reportPhase(onPhase, 'completed', creationId);
      return completedGeneration(creation, creationId);
    }
    if (FAILURE_STATUSES.has(status)) {
      clearGenerationIntent(generationIntent);
      reportPhase(onPhase, 'failed', creationId);
      throw failedGeneration(creation, creationId);
    }
  }

  const error = new Error(`Generation timed out after polling. Request ID: ${creationId}`);
  error.code = 'GENERATION_TIMEOUT';
  error.requestId = creationId;
  throw error;
}
