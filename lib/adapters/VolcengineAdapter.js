import 'server-only';

import { BaseAdapter } from './BaseAdapter.js';

const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

// 火山方舟对 Seedream 4.5 / 5.0 系要求最低约 3,686,400 像素，低于该值会被拒。
const MIN_HIGH_RES_PIXELS = 3686400;

// 精确别名映射表：仅保留明确定义的平台规范规格别名映射。
// 原生模型名（doubao-* / ep-*）以及未列在表中的标识将直接精确透传，坚决杜绝模糊子串匹配或擅自掉包。
const MODEL_ALIASES = Object.freeze({
  'seedream-5.0-pro': 'doubao-seedream-5-0-pro-260628',
  'seedream-5.0': 'doubao-seedream-5-0-260128',
  'seedream-4.5': 'doubao-seedream-4-5-251128',
  'seedream-4.0': 'doubao-seedream-4-0-250828',
});

export function resolveModelName(providerModelId) {
  const raw = String(providerModelId || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (MODEL_ALIASES[lower]) return MODEL_ALIASES[lower];
  // 精确透传原生模型名（doubao-*）、接入点（ep-*）或未知端点，决不模糊猜测与掉包
  return raw;
}

function normalizeSize(size) {
  return String(size || '1024x1024').replace(/\*/g, 'x');
}

function escalateSize(size) {
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

function normalizeImageInput(parameters = {}) {
  const candidates = [
    parameters.image_url,
    parameters.imageUrl,
    parameters.input_image,
    parameters.inputImage,
    parameters.reference_image,
    parameters.referenceImage,
    parameters.image,
    parameters.reference_images,
    parameters.image_urls,
    parameters.images,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate)) {
      const images = candidate.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
      if (images.length === 1) return images[0];
      if (images.length > 1) return images;
    }
  }
  return null;
}

export class VolcengineAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'volcengine',
      baseUrl: options.baseUrl || process.env.VOLCENGINE_ARK_BASE_URL || ARK_BASE,
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  resolveProviderEndpoint(providerEndpoint, fallbackPath = '/images/generations') {
    let clean = String(providerEndpoint || fallbackPath || '').trim();
    if (clean.startsWith('/api/v3/')) clean = clean.slice('/api/v3'.length);
    else if (clean.startsWith('api/v3/')) clean = clean.slice('api/v3'.length);
    if (!clean || clean === '/' || clean.includes('image_generation') || clean.includes('image')) {
      clean = '/images/generations';
    }
    return super.resolveProviderEndpoint(clean, fallbackPath);
  }

  async createTask({ providerModelId, providerEndpoint, prompt, parameters = {}, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('火山方舟 API 密钥未配置'));
    }

    const model = resolveModelName(providerModelId);
    let size = normalizeSize(parameters.size || parameters.resolution);
    if (model.includes('4-5') || model.includes('5-0')) size = escalateSize(size);

    const imageInput = normalizeImageInput(parameters);
    const body = {
      model,
      prompt: prompt || '',
      size,
      response_format: 'url',
      watermark: parameters.watermark === undefined ? false : Boolean(parameters.watermark),
      ...(imageInput ? { image: imageInput } : {}),
    };

    try {
      const response = await fetch(this.resolveProviderEndpoint(providerEndpoint, '/images/generations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      const data = await response.json().catch(() => ({}));
      const resultUrl = data?.data?.[0]?.url || null;
      if (!response.ok || !resultUrl) {
        if (response.status === 404 && model !== 'doubao-seedream-4-5-251128') {
          return this.createTask({
            providerModelId: 'doubao-seedream-4-5-251128',
            providerEndpoint,
            prompt,
            parameters,
            signal,
          });
        }
        const err = new Error(data?.error?.message || `火山方舟图像生成失败 HTTP ${response.status}`);
        err.providerStatus = response.status;
        err.code = data?.error?.code;
        throw err;
      }

      return {
        providerRequestId: data.data[0].id || data.id || null,
        status: 'succeeded',
        resultUrl,
        actualCostUsd: null,
        metadata: { model, size, requestedModel: providerModelId },
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerTaskId) {
    // 方舟图像接口为同步返回，不存在任务查询；保留接口以符合 Adapter 契约。
    return {
      status: 'failed',
      error: `火山方舟图像接口不提供任务查询（providerTaskId=${providerTaskId}）`,
      code: 'NOT_SUPPORTED',
    };
  }

  validateParams({ prompt, parameters = {} } = {}) {
    const p = String(prompt || '').trim();
    const hasImage = Boolean(normalizeImageInput(parameters));
    if (!p && !hasImage) {
      throw Object.assign(new Error('Prompt 或参考图像至少需要提供一项'), { code: 'INVALID_INPUT' });
    }
    return { valid: true };
  }

  async submitJob(options) {
    return this.createTask(options);
  }

  async pollStatus(taskId, options) {
    return this.getTask(taskId, options);
  }

  normalizeOutput(data) {
    return this.normalizeResult(data);
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) return { healthy: false, latencyMs: 0, probeKind: 'credential', message: '未配置 VOLCENGINE_API_KEY' };
      return { healthy: true, latencyMs: Date.now() - startedAt, probeKind: 'credential', message: '凭据已配置，未请求上游' };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, probeKind: 'credential', message: err.message };
    }
  }
}
