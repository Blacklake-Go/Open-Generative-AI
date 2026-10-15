import { normalizeProviderError } from '../payments/provider.js';

const circuits = new Map();

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function transient(error) {
  return Boolean(error?.retryable) || [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(error?.providerStatus || error?.status));
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export function resetProviderCircuits() { circuits.clear(); }

export function createResilientProvider({
  provider,
  providerName = 'unknown',
  timeoutMs = positiveInt(process.env.PROVIDER_TIMEOUT_MS, 60_000),
  maxAttempts = positiveInt(process.env.PROVIDER_MAX_RETRIES, 2),
  failureThreshold = positiveInt(process.env.PROVIDER_CIRCUIT_FAILURE_THRESHOLD, 5),
  resetMs = positiveInt(process.env.PROVIDER_CIRCUIT_RESET_MS, 30_000),
  sleep: sleepImpl = sleep,
  onCall = null,
} = {}) {
  if (!provider || typeof provider.generate !== 'function') throw new TypeError('generation provider must expose generate');
  async function generate(input) {
    const now = Date.now();
    const state = circuits.get(providerName) || { failures: 0, openedAt: 0 };
    if (state.openedAt && now - state.openedAt < resetMs) {
      throw Object.assign(new Error('模型供应商熔断中，请稍后重试'), { code: 'PROVIDER_CIRCUIT_OPEN', retryable: true });
    }
    if (state.openedAt) { state.openedAt = 0; state.failures = 0; }
    let lastError;
    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let timeoutId;
      try {
        const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(Object.assign(new Error('模型供应商请求超时'), { code: 'PROVIDER_TIMEOUT', retryable: true })), timeoutMs); });
        const result = await Promise.race([provider.generate({ ...input, signal: controller.signal }), timeout]);
        clearTimeout(timer);
        clearTimeout(timeoutId);
        circuits.set(providerName, { failures: 0, openedAt: 0 });
        await onCall?.({ provider: providerName, action: 'generate', status: 'succeeded', latencyMs: Date.now() - startedAt, attempt });
        return result;
      } catch (error) {
        clearTimeout(timer);
        clearTimeout(timeoutId);
        lastError = error?.name === 'AbortError'
          ? Object.assign(new Error('模型供应商请求超时'), { code: 'PROVIDER_TIMEOUT', retryable: true })
          : normalizeProviderError(error, { provider: providerName, action: 'generate' });
        await onCall?.({ provider: providerName, action: 'generate', status: 'failed', latencyMs: Date.now() - startedAt, attempt, errorCode: lastError.code });
        if (!transient(lastError) || attempt >= Math.max(1, maxAttempts)) break;
        await sleepImpl(Math.min(2_000, 100 * (2 ** (attempt - 1))));
      }
    }
    state.failures += 1;
    if (state.failures >= failureThreshold) state.openedAt = Date.now();
    circuits.set(providerName, state);
    throw lastError;
  }
  return { ...provider, generate };
}
