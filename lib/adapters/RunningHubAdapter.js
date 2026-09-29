import 'server-only';

import { BaseAdapter, NON_RETRYABLE_ERROR_CODES, PROVIDER_ERROR_CODES } from './BaseAdapter.js';

const RUNNINGHUB_BASE = 'https://www.runninghub.ai';
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * RunningHub business error codes, from the official "API Error Code Reference"
 * (https://www.runninghub.cn/runninghub-api-doc-en/doc-8287467). Codes 3xx–9xx carry an
 * uppercase identifier, 1xxx carry an English sentence; both forms are accepted so an
 * `errorCode` field holding either the number or the identifier maps the same way.
 */
const RUNNINGHUB_ERROR_GROUPS = Object.freeze({
  [PROVIDER_ERROR_CODES.INVALID_INPUT]: [
    '301', 'PARAMS_INVALID', '433', 'VALIDATE_PROMPT_FAILED', '803', 'APIKEY_INVALID_NODE_INFO',
    '809', 'APIKEY_FILE_SIZE_EXCEEDED', '1001', '1007', '1008', '1009', '1013', '1101',
  ],
  [PROVIDER_ERROR_CODES.MODEL_UNAVAILABLE]: [
    '380', 'WORKFLOW_NOT_EXISTS', '435', 'TASK_USER_EXCLAPI_INSTANCE_NOT_FOUND', '436',
    'TASK_USER_EXCLAPI_REQUIRED', '810', 'WORKFLOW_NOT_SAVED_OR_NOT_RUNNING', '901', 'WEBAPP_NOT_EXISTS',
  ],
  [PROVIDER_ERROR_CODES.AUTH_ERROR]: [
    '412', 'TOKEN_INVALID', '801', 'APIKEY_UNSUPPORTED_FREE_USER', '802', 'APIKEY_UNAUTHORIZED',
    '806', 'APIKEY_USER_NOT_FOUND', '811', 'CORPAPIKEY_INVALID', '1002', '1014', '1602',
  ],
  [PROVIDER_ERROR_CODES.INSUFFICIENT_PROVIDER_BALANCE]: [
    '416', 'TASK_CREATE_FAILED_BY_NOT_ENOUGH_WALLET', '812', 'CORPAPIKEY_INSUFFICIENT_FUNDS',
  ],
  [PROVIDER_ERROR_CODES.RATE_LIMIT]: [
    '415', 'TASK_INSTANCE_MAXED', '421', 'TASK_QUEUE_MAXED', '1003', '1011',
  ],
  [PROVIDER_ERROR_CODES.TIMEOUT]: ['1006', '1504'],
  [PROVIDER_ERROR_CODES.CONTENT_POLICY]: ['1501', '1505'],
  [PROVIDER_ERROR_CODES.PROVIDER_INTERNAL_ERROR]: [
    '500', 'UNKNOWN_ERROR', '805', 'APIKEY_TASK_STATUS_ERROR', '808', 'APIKEY_UPLOAD_FAILED',
    '1000', '1005', '1010', '1012', '1015',
  ],
});

const RUNNINGHUB_ERROR_MAP = new Map(
  Object.entries(RUNNINGHUB_ERROR_GROUPS).flatMap(([code, keys]) => keys.map((key) => [key, code])),
);

// "Task running" / "task queued" are acknowledgements, not failures: resubmitting would
// create a second paid task.
const RUNNINGHUB_IN_PROGRESS_CODES = new Set(['804', 'APIKEY_TASK_IS_RUNNING', '813', 'APIKEY_TASK_IS_QUEUED']);
const RUNNINGHUB_TASK_NOT_FOUND_CODES = new Set(['423', 'TASK_NOT_FOUNED', '807', 'APIKEY_TASK_NOT_FOUND', '1004']);
const SUCCESS_CODES = new Set(['', '0', '200']);

// Poll failures of these kinds are transient: the upstream task keeps running and keeps
// costing money, so a single failed status read must not fail (and fail over) the job.
const TRANSIENT_POLL_ERROR_CODES = new Set([
  PROVIDER_ERROR_CODES.RATE_LIMIT,
  PROVIDER_ERROR_CODES.NETWORK_ERROR,
  PROVIDER_ERROR_CODES.PROVIDER_INTERNAL_ERROR,
  PROVIDER_ERROR_CODES.TIMEOUT,
  PROVIDER_ERROR_CODES.UNKNOWN_ERROR,
]);

function codeKey(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toUpperCase();
}

export function mapRunningHubErrorCode(rawCode) {
  const key = codeKey(rawCode);
  if (!key) return null;
  return RUNNINGHUB_ERROR_MAP.get(key) || null;
}

function runningHubError({ rawCode, message, providerStatus = 0, providerName = 'runninghub', fallback } = {}) {
  const key = codeKey(rawCode);
  const mapped = mapRunningHubErrorCode(key)
    || (RUNNINGHUB_TASK_NOT_FOUND_CODES.has(key) ? PROVIDER_ERROR_CODES.UNKNOWN_ERROR : null)
    || fallback
    || PROVIDER_ERROR_CODES.UNKNOWN_ERROR;
  const error = new Error(String(message || `RunningHub error ${key || providerStatus || ''}`.trim()).slice(0, 500));
  error.code = mapped;
  error.provider = providerName;
  error.providerStatus = Number(providerStatus) || 0;
  error.providerErrorCode = key || null;
  error.taskNotFound = RUNNINGHUB_TASK_NOT_FOUND_CODES.has(key);
  error.isRetryable = !NON_RETRYABLE_ERROR_CODES.has(mapped);
  return error;
}

function responseErrorCode(data) {
  // v1-style envelopes use { code, msg }; v2 task objects use { errorCode, errorMessage }.
  const errorCode = codeKey(data?.errorCode ?? data?.data?.errorCode);
  if (errorCode && !SUCCESS_CODES.has(errorCode)) return errorCode;
  const code = codeKey(data?.code);
  if (code && !SUCCESS_CODES.has(code)) return code;
  return '';
}

function responseErrorMessage(data) {
  return data?.errorMessage || data?.data?.errorMessage || data?.msg || data?.message || '';
}

function collectResultUrls(value, output = [], depth = 0) {
  if (depth > 6 || value === null || value === undefined) return output;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) output.push(trimmed);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectResultUrls(item, output, depth + 1);
    return output;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'object' && item !== null) {
        collectResultUrls(item, output, depth + 1);
      } else if (/url|file|image|video|audio|output|result/i.test(key)) {
        collectResultUrls(item, output, depth + 1);
      }
    }
  }
  return output;
}

/**
 * v2 query responses carry `results: [{ url, outputType }]`. Every output is returned so
 * multi-image / multi-clip tasks are not silently truncated to their first file; older
 * envelopes fall back to the generic URL scan.
 */
export function extractRunningHubResults(data) {
  const candidates = [data?.results, data?.data?.results, data?.outputs, data?.data?.outputs, data?.data];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const results = candidate
      .map((item) => {
        if (typeof item === 'string') return { url: item.trim(), outputType: null };
        const url = item?.url || item?.fileUrl || item?.file_url || item?.download_url || null;
        return url ? { url: String(url).trim(), outputType: item?.outputType || item?.fileType || null } : null;
      })
      .filter((item) => item && /^https?:\/\//.test(item.url));
    if (results.length) return results;
  }
  return [...new Set(collectResultUrls(data))].map((url) => ({ url, outputType: null }));
}

export function normalizeRunningHubStatus(rawStatus) {
  const status = String(rawStatus || '').toUpperCase();
  if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'DONE', 'FINISHED'].includes(status)) return 'succeeded';
  if (['FAILED', 'ERROR', 'FAIL'].includes(status)) return 'failed';
  if (['CANCELLED', 'CANCELED'].includes(status)) return 'cancelled';
  if (['QUEUED', 'QUEUE', 'PENDING', 'CREATE', 'CREATED', 'SUBMITTED', 'WAITING'].includes(status)) return 'submitted';
  return 'processing';
}

function progressFor(status) {
  if (status === 'succeeded') return 100;
  if (status === 'submitted') return 5;
  if (status === 'processing') return 50;
  return 0;
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function registryParams(endpointConfig) {
  const config = endpointConfig && typeof endpointConfig === 'object' ? endpointConfig : {};
  if (Array.isArray(config.params)) return config.params;
  if (Array.isArray(config.registry?.params)) return config.registry.params;
  return [];
}

function candidateSourceKeys(param, fieldKey) {
  const field = String(fieldKey || '');
  const label = String(param?.label || '');
  const type = String(param?.type || '').toUpperCase();
  const keys = [field, label];

  if (/prompt|text|description|caption/i.test(field + label) || type === 'TEXT' || type === 'STRING') {
    keys.push('prompt', 'text', 'positivePrompt', 'positive_prompt', 'description');
  }
  if (type === 'IMAGE' || /image|photo|picture|reference/i.test(field + label)) {
    keys.push('imageUrl', 'image_url', 'image', 'inputImage', 'input_image', 'referenceImage', 'reference_image');
  }
  if (type === 'VIDEO' || /video|motion|driving/i.test(field + label)) {
    keys.push('videoUrl', 'video_url', 'video', 'inputVideo', 'input_video', 'referenceVideo', 'reference_video');
  }
  if (type === 'AUDIO' || /audio|voice|sound/i.test(field + label)) {
    keys.push('audioUrl', 'audio_url', 'audio', 'inputAudio', 'input_audio');
  }
  if (/negative/i.test(field + label)) keys.push('negativePrompt', 'negative_prompt');
  if (/aspect|ratio/i.test(field + label)) keys.push('aspectRatio', 'aspect_ratio', 'ratio');
  if (/resolution|size/i.test(field + label)) keys.push('resolution', 'size');
  if (/duration|seconds|length/i.test(field + label)) keys.push('duration', 'seconds', 'length');
  return [...new Set(keys)];
}

function coerceRegistryValue(value, param) {
  if (value === null || value === undefined) return value;
  const type = String(param?.type || '').toUpperCase();
  if (type === 'STRING' || type === 'TEXT') return String(value);
  if (type === 'LIST' && Array.isArray(param?.options)) {
    const selected = param.options.find((option) => {
      const optionValue = option && typeof option === 'object' ? option.value : option;
      return optionValue !== null && optionValue !== undefined && String(optionValue) === String(value);
    });
    if (selected !== undefined) return selected && typeof selected === 'object' ? selected.value : selected;
  }
  return value;
}

function mapParameters({ parameters = {}, prompt = '', endpointConfig = {}, parameterMapping = {} } = {}) {
  const source = parameters && typeof parameters === 'object' ? { ...parameters } : {};
  const params = registryParams(endpointConfig);
  if (!params.length) {
    if (prompt && source.prompt === undefined) source.prompt = prompt;
    return source;
  }

  const body = {};
  const available = new Map(params.map((item) => [String(item?.fieldKey || ''), item]));
  const sourceEntries = Object.entries(source);

  for (const [key, value] of sourceEntries) {
    if (available.has(key)) body[key] = coerceRegistryValue(value, available.get(key));
  }

  for (const [sourceKey, targetKey] of Object.entries(parameterMapping || {})) {
    if (source[sourceKey] !== undefined && targetKey) {
      body[targetKey] = coerceRegistryValue(source[sourceKey], available.get(String(targetKey)));
    }
  }

  for (const [fieldKey, param] of available.entries()) {
    if (!fieldKey || body[fieldKey] !== undefined) continue;
    const keys = candidateSourceKeys(param, fieldKey);
    const targetNorm = normalizeKey(fieldKey);
    const match = sourceEntries.find(([sourceKey]) => {
      const sourceNorm = normalizeKey(sourceKey);
      return keys.includes(sourceKey) || sourceNorm === targetNorm || keys.some((key) => normalizeKey(key) === sourceNorm);
    });
    if (match) body[fieldKey] = coerceRegistryValue(match[1], param);
  }

  if (prompt) {
    const promptParam = params.find((param) => {
      const text = String(param?.fieldKey || '') + ' ' + String(param?.label || '');
      return /prompt|positive.?text|description|caption/i.test(text)
        || ['TEXT', 'STRING'].includes(String(param?.type || '').toUpperCase());
    });
    if (promptParam?.fieldKey && body[promptParam.fieldKey] === undefined) body[promptParam.fieldKey] = prompt;
  }

  for (const key of ['width', 'height', 'resolution', 'aspectRatio', 'duration', 'seed', 'negativePrompt', 'watermark']) {
    if (source[key] !== undefined && available.has(key) && body[key] === undefined) {
      body[key] = coerceRegistryValue(source[key], available.get(key));
    }
  }
  return body;
}

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
    || (Array.isArray(value) && value.length === 0);
}

function paramOptions(param) {
  const raw = param?.options ?? param?.enum ?? param?.values;
  if (!Array.isArray(raw) || !raw.length) return null;
  return raw.map((option) => (option && typeof option === 'object' ? option.value ?? option.key : option))
    .filter((option) => option !== undefined && option !== null)
    .map(String);
}

/**
 * Reviewed endpoint contracts reject requests before submission so an invalid payload
 * never reaches a paid upstream call. Only explicitly declared constraints are enforced
 * (`required: true`, `options`/`enum`, numeric `min`/`max`); registries without them are
 * passed through unchanged, matching previous behaviour.
 */
export function validateRunningHubPayload(body, endpointConfig = {}) {
  const problems = [];
  for (const param of registryParams(endpointConfig)) {
    const fieldKey = String(param?.fieldKey || '');
    if (!fieldKey) continue;
    const value = body?.[fieldKey];
    if (param?.required === true && isBlank(value)) {
      problems.push(`${fieldKey} is required`);
      continue;
    }
    if (isBlank(value)) continue;
    const options = paramOptions(param);
    if (options && !Array.isArray(value) && !options.includes(String(value))) {
      problems.push(`${fieldKey} must be one of ${options.join(', ')}`);
    }
    const numeric = Number(value);
    if (param?.min !== undefined && Number.isFinite(numeric) && numeric < Number(param.min)) {
      problems.push(`${fieldKey} must be >= ${param.min}`);
    }
    if (param?.max !== undefined && Number.isFinite(numeric) && numeric > Number(param.max)) {
      problems.push(`${fieldKey} must be <= ${param.max}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export class RunningHubAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'runninghub',
      baseUrl: options.baseUrl || process.env.RUNNINGHUB_BASE_URL || RUNNINGHUB_BASE,
      apiKey: options.apiKey,
      config: options.config || {},
    });
    this.fetchImpl = options.fetchImpl || ((...args) => fetch(...args));
  }

  authHeaders(extra = {}) {
    return { Authorization: `Bearer ${this.apiKey}`, ...extra };
  }

  requireKey() {
    if (!this.apiKey) {
      throw runningHubError({ rawCode: '802', message: 'RunningHub API key is not configured' });
    }
  }

  async createTask({ providerModelId, providerEndpoint, prompt, parameters = {}, signal, parameterMapping, endpointConfig } = {}) {
    this.requireKey();
    let endpoint = String(providerEndpoint || '').replace(/^\/+/, '');
    if (!endpoint.startsWith('openapi/') && String(providerModelId || '').replace(/^\/+/, '').startsWith('openapi/')) {
      endpoint = String(providerModelId).replace(/^\/+/, '');
    }
    if (!endpoint.startsWith('openapi/')) {
      endpoint = String(providerModelId || '').replace(/^\/+/, '');
    }
    if (!endpoint.startsWith('openapi/')) {
      throw runningHubError({ rawCode: '1001', message: 'RunningHub channel has no valid OpenAPI path' });
    }

    const contract = endpointConfig || this.config.endpointConfig || {};
    const body = mapParameters({
      parameters,
      prompt,
      endpointConfig: contract,
      parameterMapping: parameterMapping || this.config.parameterMapping || {},
    });
    const validation = validateRunningHubPayload(body, contract);
    if (!validation.ok) {
      throw runningHubError({ rawCode: '301', message: `RunningHub request rejected before submission: ${validation.problems.join('; ')}` });
    }

    let response;
    try {
      response = await this.fetchImpl(this.resolveProviderEndpoint(`/${endpoint}`, `/${endpoint}`), {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw this.normalizeError(error);
    }

    const data = await readJson(response);
    const taskId = data?.taskId || data?.data?.taskId || data?.data?.id || data?.id || null;
    const errorCode = responseErrorCode(data);

    if (taskId && (!errorCode || RUNNINGHUB_IN_PROGRESS_CODES.has(errorCode))) {
      const status = normalizeRunningHubStatus(data?.status || data?.data?.status);
      const results = status === 'succeeded' ? extractRunningHubResults(data) : [];
      return {
        providerRequestId: String(taskId),
        status: results.length ? 'succeeded' : 'processing',
        resultUrl: results[0]?.url || null,
        resultUrls: results.map((item) => item.url),
        results,
        actualCostUsd: null,
        metadata: { endpoint, requestBodyKeys: Object.keys(body), clientId: data?.clientId || null },
      };
    }

    throw runningHubError({
      rawCode: errorCode || (response.ok ? '' : String(response.status)),
      message: responseErrorMessage(data) || `RunningHub task submission failed HTTP ${response.status}`,
      providerStatus: response.status,
      fallback: response.ok ? PROVIDER_ERROR_CODES.PROVIDER_INTERNAL_ERROR : undefined,
    });
  }

  async getTask(providerTaskId, { signal } = {}) {
    this.requireKey();
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/openapi/v2/query`, {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ taskId: String(providerTaskId) }),
        signal,
      });
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.pollStillRunning(normalized);
    }

    const data = await readJson(response);
    const rawStatus = data?.status || data?.data?.status;
    const errorCode = responseErrorCode(data);

    if (!rawStatus && (errorCode || !response.ok)) {
      const error = runningHubError({
        rawCode: errorCode || String(response.status),
        message: responseErrorMessage(data) || `RunningHub task query failed HTTP ${response.status}`,
        providerStatus: response.status,
      });
      if (!error.taskNotFound && TRANSIENT_POLL_ERROR_CODES.has(error.code)) return this.pollStillRunning(error);
      throw error;
    }

    const status = normalizeRunningHubStatus(rawStatus);
    if (status === 'failed' || status === 'cancelled') {
      const mapped = mapRunningHubErrorCode(errorCode);
      return {
        status,
        resultUrl: null,
        resultUrls: [],
        results: [],
        progress: 0,
        error: responseErrorMessage(data) || 'RunningHub task failed',
        errorCode: mapped || PROVIDER_ERROR_CODES.PROVIDER_INTERNAL_ERROR,
        providerErrorCode: errorCode || null,
        actualCostUsd: null,
        rawData: data,
      };
    }

    const results = status === 'succeeded' ? extractRunningHubResults(data) : [];
    if (status === 'succeeded' && !results.length) {
      return {
        status: 'failed',
        resultUrl: null,
        resultUrls: [],
        results: [],
        progress: 0,
        error: 'RunningHub reported success without any output file',
        errorCode: PROVIDER_ERROR_CODES.PROVIDER_INTERNAL_ERROR,
        providerErrorCode: 'EMPTY_RESULT',
        actualCostUsd: null,
        rawData: data,
      };
    }

    return {
      status,
      resultUrl: results[0]?.url || null,
      resultUrls: results.map((item) => item.url),
      results,
      progress: progressFor(status),
      error: null,
      actualCostUsd: null,
      rawData: data,
    };
  }

  pollStillRunning(error) {
    return {
      status: 'processing',
      resultUrl: null,
      resultUrls: [],
      results: [],
      progress: progressFor('processing'),
      error: null,
      pollError: { code: error.code, providerErrorCode: error.providerErrorCode || null, message: error.message },
      actualCostUsd: null,
    };
  }

  /**
   * Upload a user reference file to RunningHub (`/openapi/v2/media/upload/binary`) and
   * return the URL that model endpoints accept as image/video/audio input.
   */
  async uploadMedia({ data, filename = 'upload.bin', mimeType = 'application/octet-stream', signal } = {}) {
    this.requireKey();
    const bytes = data instanceof Uint8Array ? data : data ? new Uint8Array(data) : null;
    if (!bytes || !bytes.byteLength) throw runningHubError({ rawCode: '301', message: 'Upload body is empty' });
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw runningHubError({ rawCode: '1008', message: `Upload exceeds ${MAX_UPLOAD_BYTES} bytes` });
    }
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mimeType }), filename);

    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/openapi/v2/media/upload/binary`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: form,
        signal,
      });
    } catch (error) {
      throw this.normalizeError(error);
    }
    const payload = await readJson(response);
    const url = payload?.data?.download_url || payload?.data?.url || null;
    const errorCode = responseErrorCode(payload);
    if (!response.ok || errorCode || !url) {
      throw runningHubError({
        rawCode: errorCode || (response.ok ? '808' : String(response.status)),
        message: responseErrorMessage(payload) || `RunningHub upload failed HTTP ${response.status}`,
        providerStatus: response.status,
      });
    }
    return {
      url,
      fileName: payload?.data?.filename || null,
      type: payload?.data?.type || null,
      sizeBytes: Number(payload?.data?.size) || bytes.byteLength,
    };
  }

  /**
   * `/uc/openapi/accountStatus` → wallet balance, currency, running task count and key type.
   * Values are parsed defensively: unparseable numbers become null rather than 0 so an
   * unreadable balance is never mistaken for an empty wallet (or a full one).
   */
  async getAccountStatus({ signal } = {}) {
    this.requireKey();
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/uc/openapi/accountStatus`, {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ apikey: this.apiKey }),
        signal: signal || AbortSignal.timeout(6000),
      });
    } catch (error) {
      throw this.normalizeError(error);
    }
    const payload = await readJson(response);
    const errorCode = responseErrorCode(payload);
    if (!response.ok || errorCode || !payload?.data) {
      throw runningHubError({
        rawCode: errorCode || String(response.status),
        message: responseErrorMessage(payload) || `RunningHub account query failed HTTP ${response.status}`,
        providerStatus: response.status,
      });
    }
    const num = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    return {
      remainCoins: num(payload.data.remainCoins),
      remainMoney: num(payload.data.remainMoney),
      currency: payload.data.currency || null,
      currentTaskCounts: num(payload.data.currentTaskCounts),
      apiType: payload.data.apiType || null,
    };
  }

  async getBalance() {
    try {
      const account = await this.getAccountStatus();
      return {
        balance: account.remainMoney,
        coins: account.remainCoins,
        currency: account.currency || 'CNY',
        currentTaskCounts: account.currentTaskCounts,
        apiType: account.apiType,
      };
    } catch (error) {
      return { balance: null, currency: null, error: error.code || 'UNKNOWN_ERROR' };
    }
  }

  /**
   * The account query is a real round trip (key accepted + wallet readable), so it is
   * reported as an `http` probe; `probeContract` only recognises `http` | `credential`.
   * An empty wallet is unhealthy: every submission would fail with 416/812.
   */
  async healthCheck() {
    const startedAt = Date.now();
    if (!this.apiKey) return { healthy: false, latencyMs: 0, probeKind: 'credential', message: '未配置 RUNNINGHUB_API_KEY' };
    try {
      const account = await this.getAccountStatus();
      const balanceKnown = account.remainMoney !== null || account.remainCoins !== null;
      const empty = balanceKnown && (account.remainMoney ?? 0) <= 0 && (account.remainCoins ?? 0) <= 0;
      return {
        healthy: balanceKnown && !empty,
        latencyMs: Date.now() - startedAt,
        probeKind: 'http',
        message: empty ? 'RunningHub 钱包余额为 0' : balanceKnown ? '已连通 RunningHub，余额可读' : 'RunningHub 余额无法解析',
        balance: account.remainMoney,
        coins: account.remainCoins,
        currency: account.currency,
        currentTaskCounts: account.currentTaskCounts,
        apiType: account.apiType,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startedAt,
        probeKind: 'http',
        message: error.message,
        errorCode: error.code,
        providerErrorCode: error.providerErrorCode || null,
      };
    }
  }
}
