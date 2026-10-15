import 'server-only';

import { BaseAdapter } from './BaseAdapter.js';

const BYTEPLUS_AP_BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3';

const IMAGE_MODELS = Object.freeze({
  'seedream-5.0-pro': 'dola-seedream-5-0-pro-260628',
  'dola-seedream-5-0-pro-260628': 'dola-seedream-5-0-pro-260628',
  'seedream-5.0-flash': 'seedream-5-0-lite-260128',
  'seedream-5.0-lite': 'seedream-5-0-lite-260128',
  'seedream-5-0-lite-260128': 'seedream-5-0-lite-260128',
  'seedream-5.0': 'dola-seedream-5-0-pro-260628',
  'seedream-5.0-edit': 'seededit-3-0-i2i-250628',
  'seededit-3-0-i2i-250628': 'seededit-3-0-i2i-250628',
  'seedream-4.5': 'seedream-4-5-251128',
  'seedream-4-5-251128': 'seedream-4-5-251128',
  'seedream-4.0': 'seedream-4-0-250828',
  'seedream-4-0-250828': 'seedream-4-0-250828',
});

const VIDEO_MODELS = Object.freeze({
  'seedance-2.5': 'dreamina-seedance-2-5-260628',
  'seedance-2.5-image-to-video': 'dreamina-seedance-2-5-260628',
  'dreamina-seedance-2-5-260628': 'dreamina-seedance-2-5-260628',
  'seedance-2.0': 'dreamina-seedance-2-0-260128',
  'dreamina-seedance-2-0-260128': 'dreamina-seedance-2-0-260128',
  'seedance-2.0-fast': 'dreamina-seedance-2-0-fast-260128',
  'dreamina-seedance-2-0-fast-260128': 'dreamina-seedance-2-0-fast-260128',
  'seedance-2.0-mini': 'dreamina-seedance-2-0-mini-260615',
  'dreamina-seedance-2-0-mini-260615': 'dreamina-seedance-2-0-mini-260615',
});

export function resolveModel(providerModelId, category) {
  const raw = String(providerModelId || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (category === 'video') {
    if (VIDEO_MODELS[lower]) return VIDEO_MODELS[lower];
    // 精确透传原生或接入点模型 ID (ep-* 或 dreamina-*)，决不强制兜底
    return raw;
  }
  if (IMAGE_MODELS[lower]) {
    return IMAGE_MODELS[lower];
  }
  // 精确透传原生或接入点模型 ID (ep-* 或 dola-* / seed*)，决不强制兜底
  return raw;
}

function normalizeSize(size) {
  return String(size || '1024x1024').replace(/\*/g, 'x');
}

function toVideoContent(parameters = {}, prompt = '') {
  const content = [{ type: 'text', text: prompt || '' }];
  const image = parameters.image_url || parameters.imageUrl || parameters.first_frame_image;
  if (image) content.push({ type: 'image_url', image_url: { url: image }, role: 'reference_image' });
  const video = parameters.video_url || parameters.videoUrl;
  if (video) content.push({ type: 'video_url', video_url: { url: video }, role: 'reference_video' });
  return content;
}

export class BytePlusAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({ providerId: 'byteplus', baseUrl: options.baseUrl || process.env.BYTEPLUS_ARK_BASE_URL || BYTEPLUS_AP_BASE, apiKey: options.apiKey, config: options.config || {} });
  }

  async createTask({ providerModelId, providerEndpoint, prompt, parameters = {}, signal } = {}) {
    if (!this.apiKey) throw this.normalizeError(new Error('BytePlus ModelArk API Key 未配置'));
    const category = parameters.category || (String(providerModelId || '').toLowerCase().includes('seedance') ? 'video' : 'image');
    const model = resolveModel(providerModelId, category);
    const endpoint = category === 'video' ? '/contents/generations/tasks' : '/images/generations';
    const body = category === 'video'
      ? { model, content: toVideoContent(parameters, prompt), ...(parameters.resolution ? { resolution: parameters.resolution } : {}), ...(parameters.ratio ? { ratio: parameters.ratio } : {}), ...(parameters.duration ? { duration: Number(parameters.duration) } : {}), generate_audio: parameters.generate_audio === undefined ? true : Boolean(parameters.generate_audio), watermark: parameters.watermark === undefined ? false : Boolean(parameters.watermark) }
      : { model, prompt: prompt || '', size: normalizeSize(parameters.size || parameters.resolution), response_format: 'url', watermark: parameters.watermark === undefined ? false : Boolean(parameters.watermark), ...(parameters.image_url || parameters.imageUrl ? { image: parameters.image_url || parameters.imageUrl } : {}) };
    try {
      const response = await fetch(this.resolveProviderEndpoint(providerEndpoint, endpoint), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify(body), signal });
      const data = await response.json().catch(() => ({}));
      const resultUrl = data?.data?.[0]?.url || data?.content?.video_url || null;
      const taskId = data?.id || data?.task_id || data?.data?.[0]?.id || null;
      if (!response.ok || (!resultUrl && !taskId)) { const err = new Error(data?.error?.message || `BytePlus 任务提交失败 HTTP ${response.status}`); err.providerStatus = response.status; err.code = data?.error?.code; throw err; }
      return { providerRequestId: taskId, status: resultUrl ? 'succeeded' : 'processing', resultUrl, actualCostUsd: null, metadata: { model, category, requestedModel: providerModelId, response: data } };
    } catch (error) { throw this.normalizeError(error); }
  }

  async getTask(providerTaskId, { signal } = {}) {
    if (!this.apiKey) throw this.normalizeError(new Error('BytePlus ModelArk API Key 未配置'));
    try {
      const response = await fetch(`${this.baseUrl}/contents/generations/tasks/${encodeURIComponent(providerTaskId)}`, { method: 'GET', headers: { Authorization: `Bearer ${this.apiKey}` }, signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { const err = new Error(data?.error?.message || `BytePlus 任务查询失败 HTTP ${response.status}`); err.providerStatus = response.status; throw err; }
      const status = this.normalizeStatus(data?.status);
      return { status, resultUrl: data?.content?.video_url || data?.data?.[0]?.url || null, progress: status === 'succeeded' ? 100 : status === 'processing' ? 50 : 0, error: data?.error?.message || null, actualCostUsd: null, rawData: data };
    } catch (error) { throw this.normalizeError(error); }
  }

  validateParams({ prompt, parameters = {} } = {}) {
    const p = String(prompt || '').trim();
    const hasImage = Boolean(parameters.image_url || parameters.imageUrl || parameters.first_frame_image);
    const hasVideo = Boolean(parameters.video_url || parameters.videoUrl);
    if (!p && !hasImage && !hasVideo) {
      throw Object.assign(new Error('Prompt 或参考媒体至少需要提供一项'), { code: 'INVALID_INPUT' });
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
      if (!this.apiKey) return { healthy: false, latencyMs: 0, probeKind: 'credential', message: '未配置 BYTEPLUS_API_KEY' };
      const response = await fetch(`${this.baseUrl}/models`, { method: 'GET', headers: { Authorization: `Bearer ${this.apiKey}` }, signal: AbortSignal.timeout(6000) });
      if (!response.ok) return { healthy: false, latencyMs: Date.now() - startedAt, probeKind: 'http', message: `BytePlus 上游鉴权失败 HTTP ${response.status}`, status: response.status };
      const data = await response.json().catch(() => ({}));
      return { healthy: true, latencyMs: Date.now() - startedAt, probeKind: 'http', message: '已连通 BytePlus ModelArk', modelCount: Array.isArray(data?.data) ? data.data.length : 0 };
    } catch (err) { return { healthy: false, latencyMs: Date.now() - startedAt, probeKind: 'http', message: err.message }; }
  }
}
