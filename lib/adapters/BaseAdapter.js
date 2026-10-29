import 'server-only';

export const PROVIDER_ERROR_CODES = Object.freeze({
  AUTH_ERROR: 'AUTH_ERROR',
  INSUFFICIENT_PROVIDER_BALANCE: 'INSUFFICIENT_PROVIDER_BALANCE',
  RATE_LIMIT: 'RATE_LIMIT',
  TIMEOUT: 'TIMEOUT',
  CONTENT_POLICY: 'CONTENT_POLICY',
  INVALID_INPUT: 'INVALID_INPUT',
  MODEL_ROUTE_UNAVAILABLE: 'MODEL_ROUTE_UNAVAILABLE',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  PROVIDER_INTERNAL_ERROR: 'PROVIDER_INTERNAL_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
});

// 确定不可自动切换供应商的致命错误（输入问题或内容违规）
export const NON_RETRYABLE_ERROR_CODES = new Set([
  PROVIDER_ERROR_CODES.CONTENT_POLICY,
  PROVIDER_ERROR_CODES.INVALID_INPUT,
  'CANVAS_ASSET_URL_UNAVAILABLE',
  'CANVAS_ASSET_REFERENCE_INVALID',
  'CANVAS_ASSET_OWNER_REQUIRED',
]);

/**
 * Only provider-wide failures should affect the provider-wide circuit breaker.
 * A bad model mapping, rejected input, or moderation result says nothing about
 * the health of every other model on that provider.
 */
export function shouldTripProviderCircuitBreaker(code) {
  return code !== PROVIDER_ERROR_CODES.MODEL_ROUTE_UNAVAILABLE
    && !NON_RETRYABLE_ERROR_CODES.has(code);
}

const PROVIDER_ERROR_TEXT_KEYS = Object.freeze([
  'message', 'msg', 'error_message', 'errorMessage', 'detail', 'reason', 'error', 'description',
]);

/**
 * 供应商经常把错误对象直接塞进 error / detail 字段，new Error(obj) 会退化成
 * [object Object]，审计表里就再也查不到真实失败原因。
 */
export function providerErrorText(value, depth = 0) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || depth > 2) return '';
  for (const key of PROVIDER_ERROR_TEXT_KEYS) {
    const text = providerErrorText(value[key], depth + 1);
    if (text && text !== '[object Object]') return text;
  }
  return '';
}

function reportedCostUsd(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export class BaseAdapter {
  constructor({ providerId, baseUrl, apiKey, config = {} } = {}) {
    this.providerId = providerId;
    this.baseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : '';
    this.apiKey = apiKey || null;
    this.config = config;
  }

  /**
   * Resolve a reviewed mapping endpoint without allowing a mapping row to redirect
   * provider credentials to another host. Endpoints are paths on the configured
   * provider origin; absolute URLs are accepted only on that same origin.
   *
   * A root-relative path resolves against `baseUrl` as a directory, not against the
   * origin: `new URL('/x', 'https://host/api/v3')` would silently discard the `/api/v3`
   * prefix and every Ark/BytePlus call would 404. Mappings that must escape the prefix
   * carry an explicit same-origin absolute URL instead.
   */
  resolveProviderEndpoint(providerEndpoint, fallbackPath) {
    const base = new URL(this.baseUrl);
    const raw = String(providerEndpoint || fallbackPath || '').trim();
    if (!raw) throw Object.assign(new Error('渠道映射缺少实际调用端点'), { code: 'PROVIDER_ENDPOINT_REQUIRED' });
    const baseDirectory = `${this.baseUrl.replace(/\/+$/, '')}/`;
    const target = new URL(raw.startsWith('/') ? raw.slice(1) : raw, baseDirectory);
    if (target.origin !== base.origin || target.username || target.password || target.hash) {
      throw Object.assign(new Error('渠道调用端点必须位于已配置的供应商主机'), { code: 'PROVIDER_ENDPOINT_INVALID' });
    }
    return target.toString();
  }

  /**
   * 提交生成任务给供应商
   * @param {Object} options { providerModelId, prompt, parameters, idempotencyKey, signal }
   * @returns {Promise<{ providerRequestId: string, status: string, resultUrl?: string, actualCostUsd?: number, metadata?: Object }>}
   */
  async createTask(options) {
    throw new Error(`createTask not implemented for provider ${this.providerId}`);
  }

  /**
   * 轮询或查询供应商任务最新进度
   * @param {string} providerTaskId
   * @param {Object} options { signal }
   * @returns {Promise<{ status: string, resultUrl?: string, progress?: number, error?: string, rawData?: Object }>}
   */
  async getTask(providerTaskId, options = {}) {
    throw new Error(`getTask not implemented for provider ${this.providerId}`);
  }

  /**
   * 取消任务 (如支持)
   */
  async cancelTask(providerTaskId) {
    return { cancelled: false, reason: 'NOT_SUPPORTED' };
  }

  /**
   * 估算上游成本
   */
  estimateCost({ providerModelId, parameters = {} } = {}) {
    return { estimatedCostUsd: null, currency: 'USD', known: false };
  }

  /**
   * 状态归一化为系统标准任务状态
   * 标准状态: 'submitted' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
   */
  normalizeStatus(rawStatus) {
    const s = String(rawStatus || '').toLowerCase();
    if (['completed', 'succeeded', 'success', 'done'].includes(s)) return 'succeeded';
    if (['failed', 'error', 'rejected'].includes(s)) return 'failed';
    if (['cancelled', 'canceled'].includes(s)) return 'cancelled';
    if (['processing', 'in_progress', 'running', 'generating'].includes(s)) return 'processing';
    return 'submitted';
  }

  /**
   * 结果提取归一化
   */
  normalizeResult(rawResponse) {
    return {
      resultUrl: rawResponse?.outputs?.[0] || rawResponse?.url || rawResponse?.video_url || null,
      providerRequestId: rawResponse?.request_id || rawResponse?.id || rawResponse?.task_id || null,
      actualCostUsd: reportedCostUsd(rawResponse?.cost?.amount_usd ?? rawResponse?.cost_usd),
      metadata: rawResponse || {},
    };
  }

  /**
   * 异常归一化映射为统一标准错误
   */
  normalizeError(error) {
    const rawMessage = typeof error?.message === 'string' ? error.message.trim() : '';
    const message = ((rawMessage && rawMessage !== '[object Object]')
      ? rawMessage
      : providerErrorText(error?.providerDetail ?? error?.responseBody ?? error?.cause))
      || '供应商请求失败';
    const status = Number(error?.providerStatus || error?.status || error?.response?.status || 0);
    const rawCode = String(error?.code || '').toUpperCase();
    const strErr = (message + ' ' + rawCode).toLowerCase();
    const modelRouteUnavailable = /invalidendpointormodel\.(?:notfound|modelidaccessdisabled)|model(?:[_\.]|\s)?not[_\.]?found|endpoint(?:[_\.]|\s)?not[_\.]?found|modelnotopen|endpointnotopen/.test(strErr)
      || /\b(?:model|endpoint)\b.{0,200}\b(?:does not exist|doesn't exist|not found|not exist|do not have access|does not have access|not accessible|not enabled|not activated|not allowed|access disabled|not open|not opened)\b/i.test(strErr);

    let code = PROVIDER_ERROR_CODES.UNKNOWN_ERROR;

    if (modelRouteUnavailable) {
      code = PROVIDER_ERROR_CODES.MODEL_ROUTE_UNAVAILABLE;
    } else if (status === 401 || status === 403 || strErr.includes('unauthorized') || strErr.includes('auth') || strErr.includes('forbidden') || strErr.includes('api key')) {
      code = PROVIDER_ERROR_CODES.AUTH_ERROR;
    } else if (status === 402 || /\binsufficient (?:balance|funds|credit)|corporate funds|top up|\bquota\b|\barrears\b/i.test(strErr)) {
      code = PROVIDER_ERROR_CODES.INSUFFICIENT_PROVIDER_BALANCE;
    } else if (status === 429 || strErr.includes('rate limit') || strErr.includes('too many requests')) {
      code = PROVIDER_ERROR_CODES.RATE_LIMIT;
    } else if (error?.name === 'AbortError' || status === 408 || status === 504 || strErr.includes('timeout') || strErr.includes('timed out')) {
      code = PROVIDER_ERROR_CODES.TIMEOUT;
    } else if (strErr.includes('nsfw') || strErr.includes('moderation') || strErr.includes('content policy') || strErr.includes('sensitive') || strErr.includes('safety') || strErr.includes('violation')) {
      code = PROVIDER_ERROR_CODES.CONTENT_POLICY;
    } else if (status === 400 || status === 422 || strErr.includes('invalid') || strErr.includes('parameter') || strErr.includes('resolution')) {
      code = PROVIDER_ERROR_CODES.INVALID_INPUT;
    } else if (status === 503 || strErr.includes('maintenance') || strErr.includes('unavailable') || strErr.includes('overloaded')) {
      code = PROVIDER_ERROR_CODES.MODEL_UNAVAILABLE;
    } else if (status >= 500 && status < 600) {
      code = PROVIDER_ERROR_CODES.PROVIDER_INTERNAL_ERROR;
    } else if (strErr.includes('fetch failed') || strErr.includes('econnrefused') || strErr.includes('network')) {
      code = PROVIDER_ERROR_CODES.NETWORK_ERROR;
    }

    const normalized = new Error(message.slice(0, 500));
    normalized.code = rawCode.startsWith('STORAGE_') || rawCode.startsWith('CANVAS_') || rawCode === PROVIDER_ERROR_CODES.MODEL_ROUTE_UNAVAILABLE
      ? rawCode
      : code;
    normalized.provider = this.providerId;
    normalized.providerStatus = status;
    normalized.isRetryable = !NON_RETRYABLE_ERROR_CODES.has(normalized.code);
    if (error?.actualCostUsd !== undefined) normalized.actualCostUsd = error.actualCostUsd;
    if (error?.providerRequestId !== undefined) normalized.providerRequestId = error.providerRequestId;
    // An adapter may prove the provider refused or terminally failed the task
    // (for example a polled "failed" status). That proof must survive
    // normalization so settlement can release credits instead of leaving the
    // task in reconciliation forever.
    if (error?.terminalFailure === true) normalized.terminalFailure = true;
    return normalized;
  }

  /**
   * 处理供应商 Webhook 回调
   */
  async handleWebhook(payload, headers = {}) {
    return {
      providerRequestId: payload?.request_id || payload?.id || payload?.task_id || null,
      status: this.normalizeStatus(payload?.status),
      resultUrl: payload?.outputs?.[0] || payload?.url || null,
      actualCostUsd: reportedCostUsd(payload?.cost?.amount_usd ?? payload?.cost_usd),
      rawPayload: payload,
    };
  }

  /**
   * 诊断健康检查
   */
  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) {
        return { healthy: false, latencyMs: 0, message: '未配置 API Key 凭据' };
      }
      return { healthy: true, latencyMs: Date.now() - startedAt, message: 'OK' };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, message: err.message };
    }
  }

  /**
   * 查询账户余额
   */
  async getBalance() {
    return { balance: null, currency: 'USD', notSupported: true };
  }
}
