import { PROVIDER_ERROR_CODES } from './BaseAdapter.js';

const CONTRACTS = Object.freeze([
  {
    ids: ['bytedance-seedream-v3'],
    name: 'Seedream 3',
    aspectRatios: ['1:1', '16:9', '9:16', '3:4', '4:3'],
    taskTypes: ['t2i', 'text_to_image', 'text-to-image'],
  },
  {
    ids: ['gpt-image-2', 'gpt-image-2-text-to-image'],
    name: 'GPT Image 2',
    aspectRatios: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5'],
    resolutions: ['1k', '2k', '4k'],
    qualities: ['low', 'medium', 'high'],
    taskTypes: ['t2i', 'text_to_image', 'text-to-image'],
  },
  {
    ids: ['nano-banana-pro'],
    name: 'Nano Banana Pro',
    aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9', '3:2', '2:3', '5:4', '4:5', '21:9'],
    resolutions: ['1k', '2k', '4k'],
    taskTypes: ['t2i', 'text_to_image', 'text-to-image'],
  },
  {
    ids: ['bytedance-seedream-v5.0', 'seedream-5.0'],
    name: 'Seedream 5.0 Lite',
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2', '21:9'],
    qualities: ['basic', 'high'],
    taskTypes: ['t2i', 'text_to_image', 'text-to-image'],
  },
  {
    ids: ['hunyuan-fast-text-to-video'],
    name: 'HunyuanVideo Fast',
    aspectRatios: ['16:9', '9:16', '1:1'],
    taskTypes: ['t2v', 'text_to_video', 'text-to-video'],
    unsupportedFields: [
      'duration', 'video_duration', 'output_duration', 'input_duration',
      'resolution', 'size', 'output_resolution', 'quality', 'quality_mode',
      'seed', 'negative_prompt', 'negativePrompt', 'watermark',
    ],
  },
]);

const CONTRACT_BY_MODEL_ID = new Map(
  CONTRACTS.flatMap((contract) => contract.ids.map((id) => [id.toLowerCase(), contract])),
);

const COUNT_KEYS = ['n', 'count', 'num_images', 'numImages', 'batch_size', 'batchSize', 'output_count'];
const REFERENCE_KEYS = [
  'image', 'image_url', 'image_urls', 'reference_image', 'reference_images', 'input_image',
  'image_base64', 'init_image', 'source_image', 'images', 'video', 'video_url', 'input_video',
  'source_video', 'audio', 'audio_url', 'input_audio', 'source_audio',
];

function invalidInput(message) {
  return Object.assign(new Error(message), { code: PROVIDER_ERROR_CODES.INVALID_INPUT });
}

function nonEmpty(value) {
  return value !== undefined && value !== null && value !== ''
    && (!Array.isArray(value) || value.length > 0);
}

function normalizeTask(value) {
  const task = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!task) return '';
  if (['t2i', 'text_to_image'].includes(task)) return 't2i';
  if (['t2v', 'text_to_video'].includes(task)) return 't2v';
  return task;
}

function requestedCount(parameters) {
  const values = COUNT_KEYS
    .filter((key) => parameters[key] !== undefined && parameters[key] !== null && parameters[key] !== '')
    .map((key) => Number(parameters[key]));
  if (values.some((value) => !Number.isSafeInteger(value) || value !== 1)) {
    throw invalidInput('MuAPI 此模型每次请求只支持生成 1 个结果');
  }
}

function supportedValue(parameters, keys, allowedValues, label, outputKey, payload) {
  const requestedValues = keys
    .filter((key) => parameters[key] !== undefined && parameters[key] !== null && parameters[key] !== '')
    .map((key) => String(parameters[key]).trim());
  if (!requestedValues.length) return;
  if (!allowedValues) throw invalidInput(`${label} 参数不受此 MuAPI 模型支持`);
  const canonicalValues = requestedValues.map((value) => {
    const canonical = allowedValues.find((item) => item.toLowerCase() === value.toLowerCase());
    if (!canonical) throw invalidInput(`${label}=${value} 不受此 MuAPI 模型支持`);
    return canonical;
  });
  if (canonicalValues.some((value) => value !== canonicalValues[0])) {
    throw invalidInput(`${label} 参数别名不能指定不同值`);
  }
  payload[outputKey] = canonicalValues[0];
}

function hasReferenceInput(parameters) {
  return REFERENCE_KEYS.some((key) => nonEmpty(parameters[key]))
    || Number(parameters.reference_image_count || 0) > 0;
}

function buildStrictPayload(contract, { prompt, parameters = {}, requirePrompt = true } = {}) {
  requestedCount(parameters);
  if (hasReferenceInput(parameters)) {
    throw invalidInput(`${contract.name} 当前映射仅验证了纯文本输入，不接受媒体参考输入`);
  }

  const unsupportedField = (contract.unsupportedFields || []).find((key) => nonEmpty(parameters[key]));
  if (unsupportedField) {
    throw invalidInput(`${contract.name} 当前映射不支持 ${unsupportedField} 参数`);
  }

  const taskValue = parameters.task_type ?? parameters.taskType ?? parameters.generation_mode;
  const task = normalizeTask(taskValue);
  if (task && !contract.taskTypes.map(normalizeTask).includes(task)) {
    const supportedTasks = [...new Set(contract.taskTypes.map(normalizeTask))];
    const taskLabel = supportedTasks.includes('t2v') ? '文生视频' : '文生图';
    throw invalidInput(`${contract.name} 当前映射仅支持${taskLabel}`);
  }

  const resolvedPrompt = typeof prompt === 'string' ? prompt : String(parameters.prompt || '');
  if (requirePrompt && !resolvedPrompt.trim()) throw invalidInput(`${contract.name} 必须提供 prompt`);
  const payload = { prompt: resolvedPrompt };
  supportedValue(parameters, ['aspect_ratio', 'aspectRatio'], contract.aspectRatios, 'aspect_ratio', 'aspect_ratio', payload);
  supportedValue(parameters, ['resolution', 'size', 'output_resolution'], contract.resolutions, 'resolution', 'resolution', payload);
  supportedValue(parameters, ['quality', 'quality_mode'], contract.qualities, 'quality', 'quality', payload);
  return payload;
}

export function buildMuapiRequestPayload({ providerModelId, prompt, parameters = {} } = {}) {
  const contract = CONTRACT_BY_MODEL_ID.get(String(providerModelId || '').trim().toLowerCase());
  if (!contract) return { prompt: prompt || '', ...parameters };
  return buildStrictPayload(contract, { prompt, parameters });
}

export function buildMuapiEstimatePayload(parameters = {}, providerModelId = '') {
  const contract = CONTRACT_BY_MODEL_ID.get(String(providerModelId || '').trim().toLowerCase());
  if (!contract) {
    const allowed = [
      'duration', 'video_duration', 'output_duration', 'input_duration', 'resolution', 'size',
      'output_resolution', 'aspect_ratio', 'quality', 'quality_mode', 'mode', 'num_images', 'width', 'height',
      'n', 'count', 'batch_size', 'task_type', 'taskType', 'operation', 'audio',
    ];
    const payload = { prompt: '' };
    for (const key of allowed) {
      const value = parameters[key];
      if (['string', 'number', 'boolean'].includes(typeof value)) payload[key] = value;
    }
    const refs = parameters.reference_images || parameters.image_urls;
    if (Array.isArray(refs)) payload.reference_image_count = refs.length;
    return payload;
  }
  return buildStrictPayload(contract, { prompt: '', parameters, requirePrompt: false });
}
