import 'server-only';

const VIDEO_MODEL_ALIASES = Object.freeze({
  'seedance-2.0': 'doubao-seedance-2-0-260128',
  'seedance-2.0-fast': 'doubao-seedance-2-0-fast-260128',
  'seedance-1.0-pro-fast': 'doubao-seedance-1-0-pro-fast-251015',
});

export function isVolcengineVideoModel(providerModelId, providerEndpoint) {
  const id = String(providerModelId || '').toLowerCase();
  const endpoint = String(providerEndpoint || '').toLowerCase();
  return id.includes('seedance')
    || id.includes('video')
    || endpoint.includes('contents/generations/tasks');
}

function resolveVideoModel(providerModelId) {
  const raw = String(providerModelId || '').trim();
  return VIDEO_MODEL_ALIASES[raw.toLowerCase()] || raw;
}

function firstImage(parameters = {}) {
  const candidates = [
    parameters.first_frame_url,
    parameters.firstFrameUrl,
    parameters.start_image_url,
    parameters.image_url,
    parameters.imageUrl,
    parameters.image,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const list = parameters.image_urls || parameters.images || parameters.reference_images;
  if (Array.isArray(list) && list.length) {
    const first = list.find((item) => typeof item === 'string' && item.trim());
    if (first) return first.trim();
  }
  return null;
}

function lastImage(parameters = {}) {
  const candidates = [parameters.end_frame_url, parameters.last_frame_url, parameters.lastFrameUrl, parameters.endImageUrl];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function buildVideoContent(prompt, parameters = {}, model = '') {
  const flags = [];
  const resolution = parameters.resolution || parameters.size || '720p';
  if (resolution) flags.push('--resolution ' + String(resolution));
  const duration = Number(parameters.duration || parameters.video_duration || parameters.output_duration || 5);
  flags.push('--duration ' + String(Number.isFinite(duration) ? duration : 5));
  const ratio = parameters.aspect_ratio || parameters.aspectRatio || parameters.ratio;
  if (ratio) flags.push('--ratio ' + String(ratio));
  if (parameters.watermark !== undefined) flags.push('--watermark ' + String(Boolean(parameters.watermark)));
  if (parameters.camera_motion || parameters.cameraMotion || parameters.camera_fixed !== undefined) {
    const cameraFixed = parameters.camera_fixed !== undefined
      ? Boolean(parameters.camera_fixed)
      : String(parameters.camera_motion || parameters.cameraMotion || '').toLowerCase() === 'fixed';
    flags.push('--camerafixed ' + String(cameraFixed));
  }
  if (parameters.generate_audio !== undefined && /seedance-(2|2-5|2\.5)/i.test(model)) {
    flags.push('--generate_audio ' + String(Boolean(parameters.generate_audio)));
  }
  const content = [{ type: 'text', text: [prompt || '', ...flags].join(' ').trim() }];
  const first = firstImage(parameters);
  const last = lastImage(parameters);
  if (first) content.push({ type: 'image_url', image_url: { url: first }, role: 'first_frame' });
  if (last) content.push({ type: 'image_url', image_url: { url: last }, role: 'last_frame' });
  return content;
}

function publicError(data, status, fallback) {
  const error = new Error(String(data?.error?.message || fallback || ('Volcengine video request failed HTTP ' + status)).slice(0, 500));
  error.providerStatus = status;
  error.code = data?.error?.code || null;
  return error;
}

export async function createVolcengineVideoTask({ apiKey, baseUrl, providerModelId, providerEndpoint, prompt, parameters = {}, signal } = {}) {
  if (!apiKey) throw new Error('火山方舟 API 密钥未配置');
  const model = resolveVideoModel(providerModelId);
  const endpointPath = String(providerEndpoint || '').includes('contents/generations/tasks')
    ? String(providerEndpoint).replace(/^https?:\/\/[^/]+/, '')
    : '/contents/generations/tasks';
  const url = String(baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '') + endpointPath;
  const body = { model, content: buildVideoContent(prompt, parameters, model) };
  if (parameters.watermark !== undefined) body.watermark = Boolean(parameters.watermark);
  if (parameters.seed !== undefined && parameters.seed !== null) body.seed = Number(parameters.seed);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  const taskId = data?.id || data?.data?.id;
  if (!response.ok || !taskId) throw publicError(data, response.status, 'Volcengine video task submission failed');
  return { providerRequestId: String(taskId), status: 'processing', resultUrl: null, actualCostUsd: null, metadata: { model, requestBodyKeys: Object.keys(body) } };
}

export async function getVolcengineVideoTask(providerTaskId, { apiKey, baseUrl, signal } = {}) {
  if (!apiKey) throw new Error('火山方舟 API 密钥未配置');
  const base = String(baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
  const url = base + '/contents/generations/tasks/' + encodeURIComponent(String(providerTaskId));
  const response = await fetch(url, { method: 'GET', headers: { Authorization: 'Bearer ' + apiKey }, signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw publicError(data, response.status, 'Volcengine video task query failed');
  const raw = String(data?.status || '').toLowerCase();
  const status = raw === 'succeeded' ? 'succeeded'
    : raw === 'failed' ? 'failed'
    : raw === 'cancelled' || raw === 'canceled' ? 'cancelled'
    : 'processing';
  const resultUrl = status === 'succeeded' ? (data?.content?.video_url || null) : null;
  return {
    status,
    resultUrl,
    progress: status === 'succeeded' ? 100 : status === 'processing' ? 50 : 0,
    error: status === 'failed' ? (data?.error?.message || 'Volcengine video task failed') : null,
    errorCode: status === 'failed' ? (data?.error?.code || null) : null,
    actualCostUsd: null,
    rawData: data,
    metadata: { usage: data?.usage || null, resolution: data?.resolution || null, duration: data?.duration || null },
  };
}
