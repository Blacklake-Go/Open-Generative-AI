/**
 * OpenAI Provider Plugin
 * Handles DALL-E and OpenAI-compatible image/text model invocation and normalization.
 */

import { BaseModelProvider } from '../base.provider.ts';
import type {
  ParameterValidationResult,
  ProviderJobContext,
  ProviderJobStatus,
  ProviderSubmitResult,
  StandardMediaOutput,
} from '../../contracts/provider.ts';
import { getServerProviderApiKey } from '../../../services/providerSecrets.js';

export class OpenAIProviderPlugin extends BaseModelProvider {
  readonly providerId = 'openai';
  private baseUrl: string;

  constructor(options: { baseUrl?: string } = {}) {
    super();
    this.baseUrl = (options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '');
  }

  async validateParams(
    _modelId: string,
    params: Record<string, unknown>
  ): Promise<ParameterValidationResult> {
    const raw = await super.validateParams(_modelId, params);
    if (!raw.valid) return raw;

    const normalized: Record<string, unknown> = { ...raw.normalizedParams };
    // Map aspectRatio to supported resolutions
    if (normalized.aspectRatio === '16:9') {
      normalized.resolution = '1792x1024';
    } else if (normalized.aspectRatio === '9:16') {
      normalized.resolution = '1024x1792';
    } else if (normalized.aspectRatio === '1:1' || !normalized.resolution) {
      normalized.resolution = '1024x1024';
    }

    normalized.quality = normalized.quality === 'hd' ? 'hd' : 'standard';
    return { valid: true, normalizedParams: normalized };
  }

  async submitJob(context: ProviderJobContext): Promise<ProviderSubmitResult> {
    const apiKey = await getServerProviderApiKey({ provider: 'openai' });
    if (!apiKey) {
      throw Object.assign(new Error('OpenAI 供应商凭据未配置'), { code: 'AUTH_ERROR' });
    }

    const model = context.providerModelId || 'dall-e-3';
    const body = {
      model,
      prompt: context.prompt || '',
      n: 1,
      size: context.normalizedParams.resolution || '1024x1024',
      quality: context.normalizedParams.quality || 'standard',
    };

    const url = `${this.baseUrl}/v1/images/generations`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: context.timeoutMs ? AbortSignal.timeout(context.timeoutMs) : undefined,
    });

    const data = (await response.json().catch(() => ({}))) as {
      data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
      error?: { message?: string; code?: string };
    };

    if (!response.ok || !data.data?.[0]?.url) {
      const errorMsg = data.error?.message || 'OpenAI 图像生成失败';
      throw Object.assign(new Error(errorMsg), {
        code: response.status === 401 ? 'AUTH_ERROR' : response.status === 429 ? 'RATE_LIMIT' : 'PROVIDER_INTERNAL_ERROR',
        providerStatus: response.status,
      });
    }

    const outputs = this.normalizeOutput(data);
    return {
      providerRequestId: `oai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'COMPLETED',
      outputs,
      actualCostUsd: null,
      rawResponse: data,
    };
  }

  async pollStatus(
    _providerRequestId: string,
    _context: ProviderJobContext
  ): Promise<ProviderJobStatus> {
    // OpenAI DALL-E is synchronous
    return {
      status: 'COMPLETED',
      progress: 100,
    };
  }

  normalizeOutput(rawResponse: unknown): StandardMediaOutput[] {
    const data = rawResponse as { data?: Array<{ url?: string; revised_prompt?: string }> };
    if (!Array.isArray(data?.data)) return [];
    return data.data
      .filter((item) => Boolean(item.url))
      .map((item) => ({
        type: 'image',
        url: item.url!,
        mimeType: 'image/png',
      }));
  }
}
