/**
 * Volcengine (火山引擎 / 豆包 Seedream) Provider Plugin
 * Handles Volcengine Ark API Seedream 4.0 / 4.5 text2image and image2image normalization and submission.
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

const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
const MIN_HIGH_RES_PIXELS = 3686400;

const VERSIONED_MODELS: Array<[string[], string]> = [
  [['5.0-pro', '5-0-pro', '5.0-flash', '5-0-flash', '5.0', '5-0', '4.5', '4-5', 'edit', 'i2i'], 'doubao-seedream-4-5-251128'],
  [['4.0', 'v4', '4-0', '3.0', '3-0'], 'doubao-seedream-4-0-250828'],
];

function resolveModelName(providerModelId: string): string {
  const raw = String(providerModelId || '').trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith('doubao-') || lower.startsWith('ep-')) return raw;
  for (const [markers, model] of VERSIONED_MODELS) {
    if (markers.some((marker) => lower.includes(marker))) return model;
  }
  return 'doubao-seedream-4-5-251128';
}

function escalateSize(size: string): string {
  const [w, h] = String(size).split('x').map(Number);
  const width = Number.isFinite(w) && w > 0 ? w : 1024;
  const height = Number.isFinite(h) && h > 0 ? h : 1024;
  if (width * height >= MIN_HIGH_RES_PIXELS) return size;
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.1) return '2048x2048';
  if (ratio > 1.5) return '2560x1440';
  if (ratio < 0.7) return '1440x2560';
  if (ratio > 1.1) return '2304x1728';
  return '1728x2304';
}

export class VolcengineProviderPlugin extends BaseModelProvider {
  readonly providerId = 'volcengine';
  private baseUrl: string;

  constructor(options: { baseUrl?: string } = {}) {
    super();
    this.baseUrl = (options.baseUrl || ARK_BASE).replace(/\/+$/, '');
  }

  async validateParams(
    _modelId: string,
    params: Record<string, unknown>
  ): Promise<ParameterValidationResult> {
    const raw = await super.validateParams(_modelId, params);
    if (!raw.valid) return raw;

    const normalized: Record<string, unknown> = { ...raw.normalizedParams };
    let size = String(normalized.size || normalized.resolution || '1024x1024').replace(/\*/g, 'x');
    normalized.size = escalateSize(size);
    return { valid: true, normalizedParams: normalized };
  }

  async submitJob(context: ProviderJobContext): Promise<ProviderSubmitResult> {
    const apiKey = await getServerProviderApiKey({ provider: 'volcengine' });
    if (!apiKey) {
      throw Object.assign(new Error('火山引擎 API 密钥未配置'), { code: 'AUTH_ERROR' });
    }

    const model = resolveModelName(context.providerModelId);
    const url = `${this.baseUrl}/images/generations`;

    const body: Record<string, unknown> = {
      model,
      prompt: context.prompt || '',
      size: context.normalizedParams.size || '2048x2048',
      response_format: 'url',
    };

    const imageRef = context.normalizedParams.image_url || context.normalizedParams.imageUrl || context.normalizedParams.input_image;
    if (imageRef) {
      body.image = imageRef;
    }

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
      data?: Array<{ url?: string }>;
      error?: { message?: string; code?: string };
    };

    if (!response.ok || !data.data?.[0]?.url) {
      const errorMsg = data.error?.message || '火山方舟图像生成失败';
      throw Object.assign(new Error(errorMsg), {
        code: response.status === 401 ? 'AUTH_ERROR' : 'PROVIDER_INTERNAL_ERROR',
        providerStatus: response.status,
      });
    }

    const outputs = this.normalizeOutput(data);
    return {
      providerRequestId: `volc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
    return { status: 'COMPLETED', progress: 100 };
  }

  normalizeOutput(rawResponse: unknown): StandardMediaOutput[] {
    const data = rawResponse as { data?: Array<{ url?: string }> };
    if (!Array.isArray(data?.data)) return [];
    return data.data
      .filter((item) => Boolean(item.url))
      .map((item) => ({
        type: 'image',
        url: item.url!,
        mimeType: 'image/jpeg',
      }));
  }
}
