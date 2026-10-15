/**
 * Kling (快手可灵) Provider Plugin
 * Handles Kling AI text2video and image2video task submission, status polling, and normalization.
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

export class KlingProviderPlugin extends BaseModelProvider {
  readonly providerId = 'kling';
  private baseUrl: string;

  constructor(options: { baseUrl?: string } = {}) {
    super();
    this.baseUrl = (options.baseUrl || process.env.KLING_BASE_URL || 'https://api.klingai.com').replace(/\/+$/, '');
  }

  async validateParams(
    _modelId: string,
    params: Record<string, unknown>
  ): Promise<ParameterValidationResult> {
    const raw = await super.validateParams(_modelId, params);
    if (!raw.valid) return raw;

    const normalized: Record<string, unknown> = { ...raw.normalizedParams };
    normalized.duration = normalized.duration ? String(parseInt(String(normalized.duration), 10)) : '5';
    normalized.aspect_ratio = normalized.aspectRatio || normalized.aspect_ratio || '16:9';
    normalized.mode = normalized.quality === 'pro' || normalized.mode === 'pro' ? 'pro' : 'std';
    return { valid: true, normalizedParams: normalized };
  }

  async submitJob(context: ProviderJobContext): Promise<ProviderSubmitResult> {
    const apiKey = await getServerProviderApiKey({ provider: 'kling' });
    if (!apiKey) {
      throw Object.assign(new Error('快手可灵供应商凭据未配置'), { code: 'AUTH_ERROR' });
    }

    const hasImage = Boolean(context.normalizedParams.image_url || context.normalizedParams.imageUrl || context.normalizedParams.image);
    const endpoint = hasImage ? '/v1/videos/image2video' : '/v1/videos/text2video';
    const url = `${this.baseUrl}${endpoint}`;

    const body: Record<string, unknown> = {
      model_name: context.providerModelId || 'kling-video-2-6',
      prompt: context.prompt || '',
      duration: context.normalizedParams.duration || '5',
      aspect_ratio: context.normalizedParams.aspect_ratio || '16:9',
      mode: context.normalizedParams.mode || 'std',
      ...(hasImage ? { image: context.normalizedParams.image_url || context.normalizedParams.imageUrl || context.normalizedParams.image } : {}),
      ...(context.negativePrompt ? { negative_prompt: context.negativePrompt } : {}),
    };

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
      code?: number;
      message?: string;
      data?: { task_id?: string };
    };

    if (!response.ok || data.code !== 0 || !data.data?.task_id) {
      throw Object.assign(new Error(data.message || '可灵任务提交失败'), {
        code: response.status === 401 ? 'AUTH_ERROR' : 'PROVIDER_INTERNAL_ERROR',
        providerStatus: response.status,
      });
    }

    return {
      providerRequestId: data.data.task_id,
      status: 'PROCESSING',
      rawResponse: data,
    };
  }

  async pollStatus(
    providerRequestId: string,
    context: ProviderJobContext
  ): Promise<ProviderJobStatus> {
    const apiKey = await getServerProviderApiKey({ provider: 'kling' });
    if (!apiKey) {
      throw Object.assign(new Error('快手可灵供应商凭据未配置'), { code: 'AUTH_ERROR' });
    }

    const hasImage = Boolean(context.normalizedParams.image_url || context.normalizedParams.imageUrl || context.normalizedParams.image);
    const endpoint = hasImage ? '/v1/videos/image2video' : '/v1/videos/text2video';
    const url = `${this.baseUrl}${endpoint}/${encodeURIComponent(providerRequestId)}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const data = (await response.json().catch(() => ({}))) as {
      code?: number;
      message?: string;
      data?: {
        task_status?: string;
        task_status_msg?: string;
        task_result?: { videos?: Array<{ id: string; url: string; duration: string }> };
      };
    };

    const taskStatus = String(data.data?.task_status || '').toLowerCase();
    if (taskStatus === 'succeed') {
      const outputs = this.normalizeOutput(data);
      return {
        status: 'COMPLETED',
        progress: 100,
        outputs,
        rawResponse: data,
      };
    }

    if (taskStatus === 'failed') {
      return {
        status: 'FAILED',
        errorCode: 'PROVIDER_EXECUTION_FAILED',
        errorReason: data.data?.task_status_msg || '可灵视频生成失败',
      };
    }

    return {
      status: 'PROCESSING',
      progress: 50,
    };
  }

  normalizeOutput(rawResponse: unknown): StandardMediaOutput[] {
    const data = rawResponse as {
      data?: { task_result?: { videos?: Array<{ url?: string; duration?: string }> } };
    };
    const videos = data?.data?.task_result?.videos;
    if (!Array.isArray(videos)) return [];
    return videos
      .filter((v) => Boolean(v.url))
      .map((v) => ({
        type: 'video',
        url: v.url!,
        mimeType: 'video/mp4',
        duration: v.duration ? Number(v.duration) : undefined,
      }));
  }
}
