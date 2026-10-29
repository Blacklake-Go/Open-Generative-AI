import 'server-only';

import { BaseAdapter } from './BaseAdapter.js';

export class DeepSeekAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'deepseek',
      baseUrl: options.baseUrl || 'https://api.deepseek.com',
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  async createTask({ providerModelId, providerEndpoint, prompt, parameters = {}, idempotencyKey, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('DeepSeek API 密钥未配置'));
    }

    const url = this.resolveProviderEndpoint(providerEndpoint, '/chat/completions');
    const model = providerModelId || 'deepseek-chat';

    const messages = Array.isArray(parameters.messages) && parameters.messages.length > 0
      ? parameters.messages
      : [
          ...(parameters.system ? [{ role: 'system', content: parameters.system }] : []),
          { role: 'user', content: prompt || parameters.prompt || '' },
        ];

    const body = {
      model,
      messages,
      stream: false,
      ...(parameters.temperature !== undefined ? { temperature: parameters.temperature } : {}),
      ...(parameters.max_tokens ? { max_tokens: parameters.max_tokens } : {}),
      ...(parameters.top_p !== undefined ? { top_p: parameters.top_p } : {}),
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || (!data.choices?.[0]?.message && !data.data?.[0])) {
        const err = new Error(data.error?.message || data.message || 'DeepSeek 请求失败');
        err.providerStatus = response.status;
        throw err;
      }

      const message = data.choices?.[0]?.message;
      const content = message?.content || '';

      return {
        providerRequestId: data.id || `ds_${Date.now()}`,
        status: 'succeeded',
        resultUrl: null,
        output: content,
        resultText: content,
        actualCostUsd: null,
        metadata: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerTaskId, { signal } = {}) {
    return {
      status: 'processing',
      resultUrl: null,
      reconciliationRequired: true,
      reason: 'SYNCHRONOUS_RESULT_NOT_RECOVERABLE',
    };
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) return { healthy: false, latencyMs: 0, message: '未配置 DEEPSEEK_API_KEY' };
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      return { healthy: res.ok, latencyMs: Date.now() - startedAt, message: res.ok ? 'OK' : `HTTP ${res.status}` };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, message: err.message };
    }
  }

  async getBalance() {
    if (!this.apiKey) return { balance: null, currency: 'CNY', notSupported: false };
    try {
      const res = await fetch(`${this.baseUrl}/user/balance`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return { balance: null, currency: 'CNY', notSupported: false };
      const data = await res.json();
      const first = data.balance_infos?.[0];
      return {
        balance: first ? Number(first.total_balance) : null,
        currency: first?.currency || 'CNY',
        isAvailable: Boolean(data.is_available),
      };
    } catch {
      return { balance: null, currency: 'CNY', notSupported: false };
    }
  }
}
