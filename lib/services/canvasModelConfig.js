import 'server-only';

import { publicCanvasModel } from '../canvas/modelDescriptor.js';
import { modelPublicationPolicy } from '../modelCenter/publicationPolicy.js';
import { filterModelsForPublicationAccess } from './modelPublicationAccess.js';
import { modelModality } from '../modelCenter/capabilitySchema.js';
import { listActiveModels } from './models.js';
import { isSelectablePublicModel } from '../modelCenter/publicDirectory.js';
import { filterCanvasModelsByVerification, getCanvasTestOnlyModelIds, getCanvasVerifiedModelIdsForUser, parseCanvasE2EVerifiedModelIds } from '../canvas/modelPolicy.js';
import { resolveBrand } from '../modelCenter/brandDictionary.js';
import { getSettingByKey, saveSystemSetting } from './settings.js';

export const CANVAS_CONFIG_KEY = 'canvas_model_config';
export const CANVAS_CAPABILITIES = ['image', 'video', 'text', 'audio', 'music'];

const emptyMounts = () => ({ image: [], video: [], text: [], audio: [], music: [] });
const emptyDefaults = () => ({
  imageModelId: '', videoModelId: '', textModelId: '', audioModelId: '', musicModelId: '',
  canvasImageCount: '1', audioVoice: 'alloy', audioFormat: 'mp3',
  audioSpeed: '1', audioInstructions: '', systemPrompt: '',
});

export async function listCanvasModelCandidates({ listModels = listActiveModels } = {}) {
  const models = await listModels();
  return models.filter(isSelectablePublicModel).map((model) => {
    const brand = resolveBrand(model);
    const capability = modelModality(model);
    return {
      id: model.id,
      name: model.display_name || model.name,
      capability,
      credits: Number(model.credits_price),
      brandId: brand.id,
      brandName: brand.shortName,
      brandBadge: brand.badge,
      brandLogoUrl: brand.logoUrl,
      providerId: model.provider,
      metadata_json:{publicationPolicy:modelPublicationPolicy(model)},
      verifiedByPublication: (typeof model.metadata_json==='object' ? model.metadata_json : model.capabilities)?.publicationVerifiedCapabilityVersion === publicCanvasModel(model,{schemaVersion:2}).capabilityVersion,
    };
  }).filter((model) => CANVAS_CAPABILITIES.includes(model.capability));
}

function readStoredConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const mountedModelIds = emptyMounts();
  for (const capability of CANVAS_CAPABILITIES) {
    mountedModelIds[capability] = Array.isArray(value.mountedModelIds?.[capability])
      ? value.mountedModelIds[capability].filter((id) => typeof id === 'string') : [];
  }
  return { mountedModelIds, defaults: { ...emptyDefaults(), ...(value.defaults || {}) } };
}

export async function getCanvasModelConfig() {
  const setting = await getSettingByKey(CANVAS_CONFIG_KEY);
  return readStoredConfig(setting?.value);
}

export async function getCanvasAllowedModelIds({ userId = '' } = {}) {
  const config = await getCanvasModelConfig();
  const candidates = await listCanvasModelCandidates();
  const candidateModelIds = candidates.map((model) => model.id);
  const testUserIds = parseCanvasE2EVerifiedModelIds(process.env.CANVAS_E2E_TEST_USER_IDS);
  const testModelIds = parseCanvasE2EVerifiedModelIds(process.env.CANVAS_E2E_TEST_MODEL_IDS);
  const mountedModelIds = config
    ? Object.values(projectCanvasConfig(config, candidates).mountedModelIds).flat()
    : [];
  const envVerified = process.env.CANVAS_E2E_VERIFIED_MODEL_IDS;
  const defaultVerifiedIds = [...parseCanvasE2EVerifiedModelIds(envVerified),...candidates.filter(model=>model.verifiedByPublication).map(model=>model.id)];
  const allowed = filterCanvasModelsByVerification({
    mountedModelIds,
    candidateModelIds,
    verifiedModelIds: getCanvasVerifiedModelIdsForUser({
      globalVerifiedModelIds: defaultVerifiedIds,
      testUserIds,
      testModelIds,
      userId,
    }),
  });
  for (const modelId of getCanvasTestOnlyModelIds({ testUserIds, testModelIds, candidateModelIds, userId })) {
    allowed.add(modelId);
  }
  const accessible=await filterModelsForPublicationAccess(candidates,{userId,site:'canvas'});
  return new Set(accessible.filter(model=>allowed.has(model.id)).map(model=>model.id));
}

function fallbackDefaultModelId(ids, capability) {
  if (!ids.length) return '';
  if (capability === 'audio') {
    return ids.find((id) => /speech|tts/i.test(id) && !/clone/i.test(id))
      || ids.find((id) => !/clone/i.test(id))
      || ids[0];
  }
  return ids[0];
}

export function projectCanvasConfig(config, candidates, {schemaVersion = 2} = {}) {
  if (!config) return { configured: false, mountedModelIds: null, defaults: emptyDefaults() };
  const eligible = new Map(candidates.map((model) => [model.id, model.capability]));
  const mountedModelIds = emptyMounts();
  const defaults = { ...config.defaults };
  // 旧版配置把音乐模型挂在 audio 组且没有独立的 music 组：拆分后补齐两组默认值，保证旧客户端继续可读写。
  const legacyAudioShape = (config.mountedModelIds.audio || []).some((id) => eligible.get(id) === 'music')
    && !(config.mountedModelIds.music || []).length;
  for (const capability of CANVAS_CAPABILITIES) {
    const configured = [...(config.mountedModelIds[capability] || []), ...(capability === 'music' ? config.mountedModelIds.audio || [] : [])];
    mountedModelIds[capability] = [...new Set(configured)].filter((id) => eligible.get(id) === capability);
    if (capability === 'music' && !defaults.musicModelId && eligible.get(config.defaults.audioModelId) === 'music') defaults.musicModelId = config.defaults.audioModelId;
    const key = `${capability}ModelId`;
    if (!mountedModelIds[capability].includes(defaults[key])) {
      defaults[key] = legacyAudioShape && (capability === 'music' || capability === 'audio')
        ? fallbackDefaultModelId(mountedModelIds[capability], capability)
        : '';
    }
  }
  if (schemaVersion === 1) {
    mountedModelIds.audio = [...new Set([...mountedModelIds.audio,...mountedModelIds.music])];
    delete mountedModelIds.music;
    // v1 客户端的 audio 组同时包含语音和音乐：优先保留原 audio 默认，其次使用迁移后的音乐默认。
    defaults.audioModelId = [config.defaults.audioModelId, defaults.musicModelId]
      .find((id) => id && mountedModelIds.audio.includes(id)) || '';
    delete defaults.musicModelId;
  }
  return { configured: true, schemaVersion, mountedModelIds, defaults };
}

export function validateCanvasModelConfig(input, candidates) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '配置格式无效';
  const mounts = input.mountedModelIds;
  const defaults = input.defaults;
  if (!mounts || !defaults || typeof mounts !== 'object' || typeof defaults !== 'object') return '模型挂载和默认配置不能为空';
  const eligible = new Map(candidates.map((model) => [model.id, model.capability]));
  for (const capability of CANVAS_CAPABILITIES) {
    const ids = mounts[capability];
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some((id) => eligible.get(id) !== capability)) {
      return `${capability} 挂载列表包含无效、重复或当前不可用的模型`;
    }
    const defaultId = defaults[`${capability}ModelId`];
    if (typeof defaultId !== 'string' || (ids.length && !ids.includes(defaultId)) || (!ids.length && defaultId)) {
      return `${capability} 默认模型必须属于已挂载模型`;
    }
  }
  const count = Number(defaults.canvasImageCount);
  if (!Number.isInteger(count) || count < 1 || count > 15) return '默认生图张数必须在 1–15 之间';
  const speed = Number(defaults.audioSpeed);
  if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) return '默认音频语速必须在 0.25–4 之间';
  if (!['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'].includes(defaults.audioVoice)) return '默认音频声音无效';
  if (!['mp3', 'wav', 'opus', 'aac', 'flac', 'pcm'].includes(defaults.audioFormat)) return '默认音频格式无效';
  if (typeof defaults.audioInstructions !== 'string' || typeof defaults.systemPrompt !== 'string') return '提示词必须为文本';
  return null;
}

export async function saveCanvasModelConfig({ actor, input, requestId }) {
  const candidates = await listCanvasModelCandidates();
  if (!input?.mountedModelIds || !input?.defaults) return {error:'模型挂载和默认配置不能为空'};
  const candidateTypes = new Map(candidates.map(model => [model.id,model.capability]));
  if (Object.entries(input.mountedModelIds).some(([group,ids]) => !CANVAS_CAPABILITIES.includes(group) || !Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => candidateTypes.get(id) !== group && !(group === 'audio' && candidateTypes.get(id) === 'music')))) return {error:'挂载列表包含无效、重复或模态不匹配的模型'};
  input = projectCanvasConfig(input, candidates);
  const error = validateCanvasModelConfig(input, candidates);
  if (error) return { error };
  const mountedModelIds = emptyMounts();
  for (const capability of CANVAS_CAPABILITIES) mountedModelIds[capability] = input.mountedModelIds[capability];
  const defaults = Object.fromEntries(Object.keys(emptyDefaults()).map((key) => [key, String(input.defaults[key])]));
  return saveSystemSetting({ actor, key: CANVAS_CONFIG_KEY, value: { mountedModelIds, defaults }, visibility: 'private', requestId });
}
