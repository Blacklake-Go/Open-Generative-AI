import 'server-only';

import { BaseAdapter, providerErrorText } from './BaseAdapter.js';
import { buildMuapiRequestPayload } from './muapiModelContracts.js';

function muapiEndpoint(providerModelId, providerEndpoint) {
  const configured = String(providerEndpoint || '').trim();
  return configured || `/api/v1/${providerModelId || 'flux-schnell'}`;
}

function reportedMuapiCost(data, headers) {
  const raw = data?.cost?.amount_usd ?? data?.cost_usd ?? headers?.get?.('X-MuAPI-Cost-USD');
  if (raw === undefined || raw === null || raw === '') return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export class MuAPIAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'muapi',
      baseUrl: options.baseUrl || process.env.UPSTREAM_AI_BASE || 'https://api.muapi.ai',
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  async createTask({ providerModelId, providerEndpoint, prompt, parameters = {}, idempotencyKey, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('MuAPI 密钥未配置'));
    }

    let payload;
    try {
      payload = buildMuapiRequestPayload({ providerModelId, prompt, parameters });
    } catch (error) {
      throw this.normalizeError(error);
    }
    const endpoint = muapiEndpoint(providerModelId, providerEndpoint);
    const url = this.resolveProviderEndpoint(endpoint, `/api/v1/${providerModelId || 'flux-schnell'}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(payload),
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(
          providerErrorText(data) || response.statusText || 'MuAPI 任务提交失败',
        );
        err.providerStatus = response.status;
        err.providerDetail = data;
        throw err;
      }

      const requestId = data.request_id || data.id || null;
      const initialResultUrl = data.outputs?.[0] || data.url || data.output?.url || null;

      return {
        providerRequestId: requestId,
        status: initialResultUrl ? 'succeeded' : 'processing',
        resultUrl: initialResultUrl,
        actualCostUsd: reportedMuapiCost(data, response.headers),
        metadata: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerTaskId, { signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('MuAPI 密钥未配置'));
    }

    const pollUrl = `${this.baseUrl}/api/v1/predictions/${providerTaskId}/result`;
    try {
      const response = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        signal,
      });

      if (!response.ok) {
        const err = new Error(`MuAPI 查询失败 HTTP ${response.status}`);
        err.providerStatus = response.status;
        throw err;
      }

      const data = await response.json().catch(() => ({}));
      const rawStatus = String(data.status || '').toLowerCase();
      const status = this.normalizeStatus(rawStatus);
      const resultUrl = data.outputs?.[0] || data.url || data.output?.url || null;
      const errorMsg = providerErrorText(data) || null;

      return {
        status,
        resultUrl,
        progress: data.progress || (status === 'succeeded' ? 100 : 50),
        error: errorMsg,
        actualCostUsd: reportedMuapiCost(data, response.headers),
        rawData: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) return { healthy: false, latencyMs: 0, message: '未配置 MUAPI_API_KEY' };
      const res = await fetch(`${this.baseUrl}/api/v1/models`, {
        method: 'GET',
        headers: { 'x-api-key': this.apiKey },
        signal: AbortSignal.timeout(6000),
      });
      const latencyMs = Date.now() - startedAt;
      return {
        healthy: res.ok,
        latencyMs,
        message: res.ok ? 'OK' : `HTTP ${res.status}`,
      };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, message: err.message };
    }
  }
}
