import 'server-only';

import { queryMany } from '../db/index.js';
import { filterCanvasModelsByVerification, getCanvasTestOnlyModelIds, getCanvasVerifiedModelIdsForUser, parseCanvasE2EVerifiedModelIds } from '../canvas/modelPolicy.js';
import { configuredModelHealthMaxAgeMs, evaluateRouteHealth } from '../modelCenter/routePricing.js';
import { resolveBrand } from '../modelCenter/brandDictionary.js';
import { getSettingByKey, saveSystemSetting } from './settings.js';

export const CANVAS_CONFIG_KEY = 'canvas_model_config';
export const CANVAS_CAPABILITIES = ['image', 'video', 'text', 'audio'];

const emptyMounts = () => ({ image: [], video: [], text: [], audio: [] });
const emptyDefaults = () => ({
  imageModelId: '', videoModelId: '', textModelId: '', audioModelId: '',
  canvasImageCount: '3', audioVoice: 'alloy', audioFormat: 'mp3',
  audioSpeed: '1', audioInstructions: '', systemPrompt: '',
});

export async function listCanvasModelCandidates({ query = queryMany, now = Date.now(), maxHealthAgeMs = configuredModelHealthMaxAgeMs() } = {}) {
  const rows = await query(`
    SELECT m.id, COALESCE(m.display_name, m.name) AS name, m.category,
           pr.base_credits AS credits, p.health_status, p.last_health_check_at,
           m.capabilities, pm.provider_id, pm.provider_model_id, p.name AS provider_name
    FROM ai_studio.ai_models m
    JOIN ai_studio.model_pricing pr ON pr.model_id = m.id
      AND pr.is_active = TRUE AND pr.base_credits > 0
    JOIN ai_studio.provider_models pm ON pm.model_id = m.id
    JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
    WHERE m.status = 'active' AND m.is_visible = TRUE
      AND m.tier IN ('core', 'backup')
      AND m.category IN ('image', 'video', 'text', 'audio', 'music')
      AND pm.enabled = TRUE
      AND pm.review_status = 'approved'
      AND NULLIF(BTRIM(pm.provider_endpoint), '') IS NOT NULL
      AND p.enabled = TRUE
      AND COALESCE(p.circuit_state, 'closed') NOT IN ('open', 'circuit_open')
    ORDER BY m.category, m.sort, pm.priority DESC, m.id
  `);
  const candidates = new Map();
  for (const row of rows) {
    const health = evaluateRouteHealth({
      healthStatus: row.health_status,
      lastHealthCheckAt: row.last_health_check_at,
      now,
      maxHealthAgeMs,
    });
    if (!health.eligible || candidates.has(row.id)) continue;
    const brand = resolveBrand({
      id: row.id,
      name: row.name,
      capabilities: row.capabilities,
      provider_id: row.provider_id,
      provider_model_id: row.provider_model_id,
    });
    candidates.set(row.id, {
      id: row.id,
      name: row.name,
      capability: row.category === 'music' ? 'audio' : row.category,
      credits: Number(row.credits),
      brandId: brand.id,
      brandName: brand.shortName,
      brandBadge: brand.badge,
      brandLogoUrl: brand.logoUrl,
      providerId: row.provider_id,
    });
  }
  return [...candidates.values()];
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
  const defaultVerifiedIds = parseCanvasE2EVerifiedModelIds(envVerified);
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
  return allowed;
}

export function projectCanvasConfig(config, candidates) {
  if (!config) return { configured: false, mountedModelIds: null, defaults: emptyDefaults() };
  const eligible = new Map(candidates.map((model) => [model.id, model.capability]));
  const mountedModelIds = emptyMounts();
  const defaults = { ...config.defaults };
  for (const capability of CANVAS_CAPABILITIES) {
    mountedModelIds[capability] = config.mountedModelIds[capability]
      .filter((id) => eligible.get(id) === capability);
    const key = `${capability}ModelId`;
    if (!mountedModelIds[capability].includes(defaults[key])) defaults[key] = '';
  }
  return { configured: true, mountedModelIds, defaults };
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
  const error = validateCanvasModelConfig(input, candidates);
  if (error) return { error };
  const mountedModelIds = emptyMounts();
  for (const capability of CANVAS_CAPABILITIES) mountedModelIds[capability] = input.mountedModelIds[capability];
  const defaults = Object.fromEntries(Object.keys(emptyDefaults()).map((key) => [key, String(input.defaults[key])]));
  return saveSystemSetting({ actor, key: CANVAS_CONFIG_KEY, value: { mountedModelIds, defaults }, visibility: 'private', requestId });
}
