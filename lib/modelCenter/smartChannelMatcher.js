import { dataClient, now, randomId } from '../repositories/runtimeDb.js';
import { getCanonicalModelById } from '../repositories/aiCatalog.js';
import { simulateModelRoute } from '../services/modelPricingControl.js';

async function safeInvalidateActiveModelsCache() {
  try {
    const mod = await import('../../app/api/models/active/route.js');
    if (typeof mod?.invalidateActiveModelsCache === 'function') {
      mod.invalidateActiveModelsCache();
    }
  } catch {}
}

/**
 * L1: 规范黄金别名映射表 (Golden Alias Registry)
 * 毫秒级 O(1) 匹配高频知名模型与标准提供商及端点
 */
const GOLDEN_ALIAS_RULES = [
  // GPT 图像与 DALL·E 映射
  {
    pattern: /^(gpt-image|dall-e|dalle)/i,
    category: 'image',
    candidates: [
      {
        providerId: 'openai',
        providerModelId: 'dall-e-3',
        endpoint: '/v1/images/generations',
        confidence: 0.98,
        reason: '命中黄金别名：GPT 图像模型 -> OpenAI 官方 DALL·E 3 直连通道',
      },
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/alibaba/qwen-image-3.0-pro/text-to-image',
        endpoint: '/openapi/v2/alibaba/qwen-image-3.0-pro/text-to-image',
        confidence: 0.88,
        reason: '命中推荐：RunningHub 旗舰级高保真文生图加速通道',
      },
    ],
  },
  // Nano Banana / 快速出图系列
  {
    pattern: /(banana|fast-image|quick-image)/i,
    category: 'image',
    candidates: [
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/alibaba/qwen-image-3.0-pro/text-to-image',
        endpoint: '/openapi/v2/alibaba/qwen-image-3.0-pro/text-to-image',
        confidence: 0.92,
        reason: '命中黄金别名：超快出图模型 -> RunningHub 文生图加速通道',
      },
      {
        providerId: 'volcengine',
        providerModelId: 'seedream-5.0',
        endpoint: '/api/v3/cv/image_generation',
        confidence: 0.86,
        reason: '命中推荐：火山方舟 Seedream 5.0 极速摄影生成通道',
      },
    ],
  },
  // Seedream / 豆包图像系列
  {
    pattern: /(seedream|doubao.*image)/i,
    category: 'image',
    candidates: [
      {
        providerId: 'volcengine',
        providerModelId: 'seedream-5.0',
        endpoint: '/api/v3/cv/image_generation',
        confidence: 1.0,
        reason: '命中黄金别名：字节火山方舟官方 Seedream 5.0',
      },
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/bytedance/jimeng-4.6/text-to-image',
        endpoint: '/openapi/v2/bytedance/jimeng-4.6/text-to-image',
        confidence: 0.90,
        reason: '命中推荐：RunningHub 字节即梦 4.6 旗舰文生图通道',
      },
    ],
  },
  // Seedance / 豆包视频系列
  {
    pattern: /(seedance|doubao.*video)/i,
    category: 'video',
    candidates: [
      {
        providerId: 'volcengine',
        providerModelId: 'seedance-2.5-image-to-video',
        endpoint: '/api/v3/cv/video_generation',
        confidence: 0.98,
        reason: '命中黄金别名：字节火山方舟官方 Seedance 视频生成',
      },
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/alibaba/happyhorse-1.1/image-to-video',
        endpoint: '/openapi/v2/alibaba/happyhorse-1.1/image-to-video',
        confidence: 0.88,
        reason: '命中推荐：RunningHub 旗舰图生视频通道',
      },
    ],
  },
  // Suno / 音乐生成系列
  {
    pattern: /(suno|music|song)/i,
    category: 'audio',
    candidates: [
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/minimax/music-2.6',
        endpoint: '/openapi/v2/minimax/music-2.6',
        confidence: 0.95,
        reason: '命中黄金别名：RunningHub MiniMax 音乐与人声生成通道',
      },
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/bytedance/doubao-seed-audio-1.0',
        endpoint: '/openapi/v2/bytedance/doubao-seed-audio-1.0',
        confidence: 0.88,
        reason: '命中推荐：RunningHub 豆包 Seed Audio 音乐音频通道',
      },
    ],
  },
  // 可灵 Kling 系列
  {
    pattern: /(kling|可灵)/i,
    category: 'video',
    candidates: [
      {
        providerId: 'kling',
        providerModelId: 'kling-v2.5-turbo',
        endpoint: '/v1/videos/text2video',
        confidence: 0.98,
        reason: '命中黄金别名：快手可灵官方 API 极速视频通道',
      },
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/rhart-video/kling-v2.5',
        endpoint: '/openapi/v2/rhart-video/kling-v2.5',
        confidence: 0.88,
        reason: '命中推荐：RunningHub 可灵聚合视频通道',
      },
    ],
  },
  // 海螺 / MiniMax 视频系列
  {
    pattern: /(hailuo|minimax.*video)/i,
    category: 'video',
    candidates: [
      {
        providerId: 'minimax',
        providerModelId: 'minimax-video-01',
        endpoint: '/v1/video_generation',
        confidence: 0.98,
        reason: '命中黄金别名：MiniMax 海螺官方视频通道',
      },
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/minimax/hailuo-h3/image-to-video',
        endpoint: '/task/openapi/create',
        confidence: 0.90,
        reason: '命中推荐：RunningHub 海螺 H3 视频通道',
      },
    ],
  },
  // MiniMax 语音系列
  {
    pattern: /(minimax.*speech|minimax.*voice|speech-2)/i,
    category: 'audio',
    candidates: [
      {
        providerId: 'minimax',
        providerModelId: 'speech-02-hd',
        endpoint: '/v1/t2a_v2',
        confidence: 0.98,
        reason: '命中黄金别名：MiniMax 官方 Speech-02 HD 语音通道',
      },
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/bytedance/doubao-seed-audio-1.0',
        endpoint: '/task/openapi/create',
        confidence: 0.85,
        reason: '命中推荐：RunningHub 豆包音频通道',
      },
    ],
  },
  // 通义万相 Wan 系列
  {
    pattern: /(wan-?2|wanx|万相|万象)/i,
    candidates: [
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/alibaba/wan-2.7/text-to-image-pro',
        endpoint: '/task/openapi/create',
        confidence: 0.96,
        reason: '命中黄金别名：RunningHub 通义万相 2.7 旗舰通道',
      },
      {
        providerId: 'alibaba',
        providerModelId: 'wanx2.1-t2v-turbo',
        endpoint: '/api/v1/services/aigc/video-generation/generation',
        confidence: 0.92,
        reason: '命中推荐：阿里云百炼官方万相 2.1 视频通道',
      },
    ],
  },
  // Vidu 系列
  {
    pattern: /(vidu)/i,
    category: 'video',
    candidates: [
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/vidu/text-to-video-q3-pro',
        endpoint: '/task/openapi/create',
        confidence: 0.96,
        reason: '命中黄金别名：RunningHub Vidu Q3 Pro 视频通道',
      },
    ],
  },
  // Topaz 系列
  {
    pattern: /(topaz|gigapixel)/i,
    category: 'image',
    candidates: [
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/topazlabs/image-gigapixel-high-fidelity-2',
        endpoint: '/task/openapi/create',
        confidence: 0.98,
        reason: '命中黄金别名：RunningHub Topaz 图像超分 High Fidelity 通道',
      },
    ],
  },
  // 悠船 Youchuan 系列
  {
    pattern: /(youchuan|悠船)/i,
    candidates: [
      {
        providerId: 'runninghub',
        providerModelId: 'openapi/v2/youchuan/image-to-video',
        endpoint: '/task/openapi/create',
        confidence: 0.95,
        reason: '命中黄金别名：RunningHub 悠船模型通道',
      },
    ],
  },
  // Google Veo / Imagen 系列
  {
    pattern: /(veo|imagen)/i,
    candidates: [
      {
        providerId: 'google',
        providerModelId: 'imagen-3.0-generate-002',
        endpoint: '/v1beta/models/{model}:predict',
        confidence: 0.95,
        reason: '命中黄金别名：Google Imagen 官方图像通道',
      },
    ],
  },
];

/**
 * 默认供应商端点配置表
 */
const DEFAULT_PROVIDER_ENDPOINTS = Object.freeze({
  openai: {
    image: '/v1/images/generations',
    video: '/v1/videos/generations',
    default: '/v1/images/generations',
  },
  runninghub: {
    default: '/task/openapi/create',
  },
  volcengine: {
    image: '/api/v3/cv/image_generation',
    video: '/api/v3/cv/video_generation',
    default: '/api/v3/cv/image_generation',
  },
  kling: {
    video: '/v1/videos/text2video',
    image: '/v1/images/generations',
    default: '/v1/videos/text2video',
  },
  minimax: {
    video: '/v1/video_generation',
    audio: '/v1/t2a_v2',
    image: '/v1/image_generation',
    default: '/v1/video_generation',
  },
  alibaba: {
    video: '/api/v1/services/aigc/video-generation/generation',
    image: '/api/v1/services/aigc/text2image/image-synthesis',
    default: '/api/v1/services/aigc/text2image/image-synthesis',
  },
  google: {
    default: '/v1beta/models/{model}:predict',
  },
});

function resolveDefaultEndpoint(providerId, category = 'image') {
  const norm = String(providerId || '').toLowerCase();
  const cfg = DEFAULT_PROVIDER_ENDPOINTS[norm];
  if (!cfg) return '/api/v1/generate';
  return cfg[category] || cfg.default || '/api/v1/generate';
}

function normalizeTokens(str = '') {
  return String(str || '')
    .toLowerCase()
    .replace(/^openapi\/v2\//, '')
    .replace(/^rh-/, '')
    .replace(/^rhart-[a-z]+-/, '')
    .replace(/^model-/, '')
    .replace(/-[a-f0-9]{8}$/, '') // 剥离末尾随机哈希
    .replace(/[._/\\-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function calculateJaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

function calculateLevenshteinRatio(strA, strB) {
  const a = String(strA || '').toLowerCase();
  const b = String(strB || '').toLowerCase();
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  const distance = matrix[b.length][a.length];
  const maxLen = Math.max(a.length, b.length);
  return (maxLen - distance) / maxLen;
}

/**
 * 模态硬性拦截器 (Modality Gatekeeper)
 */
function isModalityCompatible(modelCategory, candidateCategory, candidateId) {
  const normCat = String(modelCategory || 'image').toLowerCase();
  const candCat = String(candidateCategory || '').toLowerCase();
  const candId = String(candidateId || '').toLowerCase();

  if (normCat.includes('image') || normCat === 'draw') {
    if (candCat.includes('video') && !candCat.includes('image')) return false;
    if (candCat.includes('audio') || candCat.includes('music')) return false;
    return true;
  }
  if (normCat.includes('video') || normCat.includes('motion')) {
    if (candCat.includes('audio') || candCat.includes('music')) return false;
    if (candCat === 'image' && !candId.includes('video') && !candId.includes('animate')) return false;
    return true;
  }
  if (normCat.includes('audio') || normCat.includes('music') || normCat.includes('voice')) {
    if (candCat.includes('image') || candCat.includes('video')) return false;
    return true;
  }
  return true;
}

function matchesCategory(ruleCategory, targetCategory) {
  if (!ruleCategory) return true;
  const r = String(ruleCategory).toLowerCase();
  const t = String(targetCategory).toLowerCase();
  if (r === t) return true;
  if (r === 'image' && (t.includes('image') || t === 'draw')) return true;
  if (r === 'video' && (t.includes('video') || t.includes('motion') || t.includes('sync') || t.includes('cinema'))) return true;
  if (r === 'audio' && (t.includes('audio') || t.includes('music') || t.includes('voice'))) return true;
  return false;
}

/**
 * 寻找目标规范模型的可用渠道匹配候选
 */
export async function findMatchingChannelCandidates({ modelId, id, category = 'image', db = null, limit = 5 } = {}) {
  const targetId = String(modelId || id || '').trim();
  if (!targetId) return [];
  const client = db || dataClient();

  // 1. 获取模型本身元数据
  const canonical = await getCanonicalModelById(targetId, client).catch(() => null);
  const targetCategory = canonical?.category || category || 'image';

  // 2. 查询 L1 黄金别名表
  const goldenMatches = [];
  for (const rule of GOLDEN_ALIAS_RULES) {
    if (rule.pattern.test(targetId) || (canonical?.name && rule.pattern.test(canonical.name))) {
      if (matchesCategory(rule.category, targetCategory)) {
        for (const cand of rule.candidates) {
          goldenMatches.push({
            providerId: cand.providerId,
            providerModelId: cand.providerModelId,
            endpoint: cand.endpoint || resolveDefaultEndpoint(cand.providerId, targetCategory),
            confidence: cand.confidence,
            reason: cand.reason,
            isHealthy: true,
            source: 'L1_golden_alias',
          });
        }
      }
    }
  }

  // 3. 从数据库中拉取所有可用供应商模型与目录
  const activeProviders = await client.readMany(`
    SELECT id, name, enabled, health_status
    FROM ai_studio.ai_providers
    WHERE enabled = TRUE
  `);
  const providerMap = new Map(activeProviders.map(p => [p.id, p]));

  // 查询已有的 provider_models 候选池（无论当前是 needs_specification 还是 approved）
  const dbProviderModels = await client.readMany(`
    SELECT DISTINCT ON (pm.provider_id, pm.provider_model_id)
      pm.id, pm.provider_id, pm.provider_model_id, pm.provider_endpoint,
      pm.review_status, pm.enabled, pm.supported_task_types,
      p.name AS provider_name, p.enabled AS provider_enabled, p.health_status
    FROM ai_studio.provider_models pm
    JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
    WHERE p.enabled = TRUE
    ORDER BY pm.provider_id, pm.provider_model_id, (pm.review_status = 'approved') DESC
    LIMIT 1000
  `);

  // 4. L2 模糊语义分词匹配
  const targetTokens = normalizeTokens(modelId + ' ' + (canonical?.name || ''));
  const targetClean = targetTokens.join(' ');

  const scoredCandidates = [];

  for (const item of dbProviderModels) {
    if (!isModalityCompatible(targetCategory, '', item.provider_model_id)) {
      continue;
    }

    const candTokens = normalizeTokens(item.provider_model_id);
    const candClean = candTokens.join(' ');

    const tokenScore = calculateJaccardSimilarity(targetTokens, candTokens);
    const editScore = calculateLevenshteinRatio(targetClean, candClean);
    const providerWeight = item.provider_enabled ? (item.health_status === 'healthy' ? 1.0 : 0.8) : 0.4;

    const totalScore = Number((tokenScore * 0.50 + editScore * 0.25 + providerWeight * 0.25).toFixed(3));

    if (totalScore >= 0.45) {
      scoredCandidates.push({
        providerId: item.provider_id,
        providerName: item.provider_name,
        providerModelId: item.provider_model_id,
        endpoint: item.provider_endpoint || resolveDefaultEndpoint(item.provider_id, targetCategory),
        confidence: Math.min(0.99, totalScore),
        reason: `语义分词重合度 ${Math.round(tokenScore * 100)}% · 供应商可用度良好`,
        isHealthy: item.health_status === 'healthy',
        source: 'L2_token_matcher',
      });
    }
  }

  // 5. 合并并按置信度排序
  const merged = [];
  const seen = new Set();

  // 黄金匹配排第一梯队
  for (const g of goldenMatches) {
    const key = `${g.providerId}:${g.providerModelId}`;
    if (!seen.has(key)) {
      seen.add(key);
      const prov = providerMap.get(g.providerId);
      merged.push({
        ...g,
        providerName: prov?.name || g.providerId,
        isHealthy: prov ? prov.health_status === 'healthy' : true,
      });
    }
  }

  // L2 候选按分数降序
  scoredCandidates.sort((a, b) => b.confidence - a.confidence);
  for (const s of scoredCandidates) {
    const key = `${s.providerId}:${s.providerModelId}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(s);
    }
  }

  // 如果仍为空，根据分类提供兜底官方提供商推荐
  if (merged.length === 0) {
    if (matchesCategory('image', targetCategory)) {
      const prov = providerMap.get('runninghub') || providerMap.get('openai') || providerMap.get('volcengine');
      if (prov) {
        merged.push({
          providerId: prov.id,
          providerName: prov.name,
          providerModelId: prov.id === 'openai' ? 'dall-e-3' : 'openapi/v2/alibaba/qwen-image-3.0-pro/text-to-image',
          endpoint: resolveDefaultEndpoint(prov.id, 'image'),
          confidence: 0.75,
          reason: `分类兜底：匹配当前已启用的优质图像提供商 [${prov.name}]`,
          isHealthy: prov.health_status === 'healthy',
          source: 'L2_category_fallback',
        });
      }
    } else if (matchesCategory('video', targetCategory)) {
      const prov = providerMap.get('kling') || providerMap.get('runninghub') || providerMap.get('volcengine');
      if (prov) {
        merged.push({
          providerId: prov.id,
          providerName: prov.name,
          providerModelId: prov.id === 'kling' ? 'kling-v2.5-turbo' : 'openapi/v2/vidu/text-to-video-q3-pro',
          endpoint: resolveDefaultEndpoint(prov.id, 'video'),
          confidence: 0.75,
          reason: `分类兜底：匹配当前已启用的优质视频提供商 [${prov.name}]`,
          isHealthy: prov.health_status === 'healthy',
          source: 'L2_category_fallback',
        });
      }
    } else if (matchesCategory('audio', targetCategory)) {
      const prov = providerMap.get('minimax') || providerMap.get('runninghub');
      if (prov) {
        merged.push({
          providerId: prov.id,
          providerName: prov.name,
          providerModelId: prov.id === 'minimax' ? 'speech-02-hd' : 'openapi/v2/minimax/music-2.6',
          endpoint: resolveDefaultEndpoint(prov.id, 'audio'),
          confidence: 0.75,
          reason: `分类兜底：匹配当前已启用的优质音频提供商 [${prov.name}]`,
          isHealthy: prov.health_status === 'healthy',
          source: 'L2_category_fallback',
        });
      }
    }
  }

  return merged.slice(0, limit);
}

/**
 * L3: 原子化一键绑定并激活渠道 (Zero-Friction Atomic Binding Pipeline)
 */
export async function bindAndActivateChannel({
  modelId,
  id,
  providerId,
  providerModelId,
  endpoint = null,
  category = null,
  priceUsd = 0.02,
  actor = null,
  db = null,
} = {}) {
  const targetId = String(modelId || id || '').trim();
  if (!targetId || !providerId || !providerModelId) {
    throw Object.assign(new Error('modelId, providerId, providerModelId 为必填项'), { code: 'VALIDATION_ERROR' });
  }

  const client = db || dataClient();

  // 1. 获取规范模型
  const canonical = await getCanonicalModelById(targetId, client);
  if (!canonical) {
    throw Object.assign(new Error(`规范模型 ${targetId} 不存在`), { code: 'MODEL_NOT_FOUND' });
  }

  const modelCategory = category || canonical.category || 'image';
  const resolvedEndpoint = (endpoint && String(endpoint).trim()) || resolveDefaultEndpoint(providerId, modelCategory);

  // 2. 根据分类推断规格参数
  let taskTypes = ['t2i', 'i2i', 'text_to_image', 'image_to_image'];
  let inputTypes = ['text', 'image'];
  let outputTypes = ['image'];
  let billingUnit = 'per_request';

  if (modelCategory.includes('video') || modelCategory.includes('motion')) {
    taskTypes = ['t2v', 'i2v', 'text_to_video', 'image_to_video'];
    inputTypes = ['text', 'image'];
    outputTypes = ['video'];
    billingUnit = 'per_second';
  } else if (modelCategory.includes('audio') || modelCategory.includes('music') || modelCategory.includes('voice')) {
    taskTypes = ['t2a', 'text_to_audio'];
    inputTypes = ['text'];
    outputTypes = ['audio'];
    billingUnit = 'per_request';
  }

  const standardResolutions = modelCategory.includes('video')
    ? ['720p', '1080p', '4k', '1280x720', '1920x1080', '1024x1024', '720x1280', '1080x1920', 'auto']
    : ['1024x1024', '1024x1792', '1792x1024', '512x512', '768x768', '1280x720', '720x1280', '1920x1080', '1080x1920', '2048x2048', 'auto'];

  const capabilities = {
    input_types: inputTypes,
    output_types: outputTypes,
    aspect_ratios: ['1:1', '16:9', '9:16', '4:3', '3:4', 'auto'],
    resolutions: standardResolutions,
    qualities: ['standard', 'hd', 'fast', 'pro', 'ultra', 'auto'],
    durations: ['5s', '10s', '4s', '5', '10', '4'],
    verified_license_conditions: [],
    auto_activated: true,
    activated_by: actor?.id || 'admin',
    activated_at: new Date().toISOString(),
  };

  const cleanId = String(modelId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanProvider = String(providerId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const pmId = `pm_${cleanId}_${cleanProvider}`;

  // 3. 确保供应商本身处于 enabled = true
  await client.write(`
    UPDATE ai_studio.ai_providers
    SET enabled = TRUE, updated_at = now()
    WHERE id = $1
  `, [providerId]);

  // 4. 原子写入或更新 provider_models
  const mapping = await client.readOne(`
    INSERT INTO ai_studio.provider_models (
      id, model_id, provider_id, provider_model_id, provider_endpoint,
      enabled, review_status, supported_task_types, capabilities, priority,
      supported_resolutions,
      mapping_version, cost_config, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      TRUE, 'approved', $6::jsonb, $7::jsonb, 100,
      $8::jsonb,
      1, $9::jsonb, now(), now()
    )
    ON CONFLICT (model_id, provider_id, provider_model_id) DO UPDATE SET
      provider_endpoint = EXCLUDED.provider_endpoint,
      enabled = TRUE,
      review_status = 'approved',
      supported_task_types = EXCLUDED.supported_task_types,
      capabilities = EXCLUDED.capabilities,
      supported_resolutions = EXCLUDED.supported_resolutions,
      updated_at = now()
    RETURNING *
  `, [
    pmId,
    targetId,
    providerId,
    providerModelId,
    resolvedEndpoint,
    JSON.stringify(taskTypes),
    JSON.stringify(capabilities),
    JSON.stringify(standardResolutions),
    JSON.stringify({ currency: 'USD', base_cost: priceUsd, unit_cost: priceUsd }),
  ]);

  // 4.5 确保规范模型状态处于激活状态 (status = 'active') 且前台可见
  await client.write(`
    UPDATE ai_studio.ai_models
    SET status = 'active', is_visible = TRUE, updated_at = now()
    WHERE id = $1
  `, [targetId]);

  // 4.6 确保 ai_studio.model_pricing 存在价盘配置，保障模型开通后即刻可调用
  const defaultCredits = modelCategory === 'video' ? 30 : modelCategory === 'audio' ? 15 : 20;
  const prcId = `prc_${targetId.replace(/[^a-zA-Z0-9]/g, '_')}`;
  await client.write(`
    INSERT INTO ai_studio.model_pricing (
      id, model_id, pricing_type, base_credits, formula_config, subscription_discounts,
      min_credits, min_gross_margin_rate, is_active, site_price_currency, price_locked,
      pricing_mode, created_at, updated_at
    ) VALUES (
      $1, $2, 'formula', $3,
      '{"pricing_policy_version":"2026-09-22","target_contribution_margin_rate":0.75,"credit_value_cny":0.07}'::jsonb,
      '{}'::jsonb, 10, 0.75, TRUE, 'CNY', FALSE, 'auto', now(), now()
    ) ON CONFLICT (model_id) DO UPDATE SET
      is_active = TRUE,
      updated_at = now()
  `, [prcId, targetId, defaultCredits]);

  // 5. 确保存在 active 状态的价格版本 (Provider Model Price Version)
  const activePrice = await client.readOne(`
    SELECT id FROM ai_studio.provider_model_price_versions
    WHERE provider_model_id = $1 AND status = 'active'
    LIMIT 1
  `, [mapping.id]);

  if (!activePrice) {
    const pverId = `pver_${randomId()}`;
    await client.write(`
      INSERT INTO ai_studio.provider_model_price_versions (
        id, provider_model_id, version_no, price_type, billing_unit, currency,
        price_config, source_api, status, fetched_at, effective_at, source_observed_at,
        approved_at, approved_by, manually_locked
      ) VALUES (
        $1, $2, 1, 'manual', $3, 'USD',
        $4::jsonb, 'smart_channel_matcher:auto_binding', 'active', now(), now(), now(),
        now(), $5, FALSE
      )
      ON CONFLICT (provider_model_id, version_no) DO UPDATE SET
        status = 'active',
        price_config = EXCLUDED.price_config,
        effective_at = now(),
        approved_at = now()
    `, [
      pverId,
      mapping.id,
      billingUnit,
      JSON.stringify({ base_cost: priceUsd, unit_cost: priceUsd, is_free: false }),
      actor?.id || null,
    ]);
  }

  // 6. 刷新前台活跃模型缓存
  await safeInvalidateActiveModelsCache();

  // 7. 即时仿真测试验证
  let simulation = null;
  try {
    simulation = await simulateModelRoute({ modelId, parameters: {} });
  } catch (simError) {
    simulation = { blocked: true, selectionReason: simError.message };
  }

  return {
    ok: true,
    mapping,
    simulation,
    approvedRoutes: 1,
  };
}

/**
 * 批量自动匹配无通道模型
 */
export async function batchAutoMatchChannels({ minConfidence = 0.70, category = null, actor = null, db = null }) {
  const client = db || dataClient();

  // 1. 查询当前无可用通道的模型列表
  let query = `
    SELECT m.id, m.name, m.category,
      count(pm.id) filter (where pm.review_status = 'approved' and pm.enabled = true) as routes
    FROM ai_studio.ai_models m
    LEFT JOIN ai_studio.provider_models pm ON pm.model_id = m.id
  `;
  const params = [];
  if (category) {
    params.push(category);
    query += ` WHERE m.category = $1 `;
  }
  query += `
    GROUP BY m.id, m.name, m.category
    HAVING count(pm.id) filter (where pm.review_status = 'approved' and pm.enabled = true) = 0
    ORDER BY m.id
  `;

  const unroutedList = await client.readMany(query, params);
  const results = [];
  let matchedCount = 0;

  for (const model of unroutedList) {
    try {
      const candidates = await findMatchingChannelCandidates({
        modelId: model.id,
        category: model.category,
        db: client,
        limit: 1,
      });

      const top = candidates[0];
      if (top && top.confidence >= minConfidence) {
        const bindRes = await bindAndActivateChannel({
          modelId: model.id,
          providerId: top.providerId,
          providerModelId: top.providerModelId,
          endpoint: top.endpoint,
          category: model.category,
          actor,
          db: client,
        });
        results.push({
          modelId: model.id,
          name: model.name,
          category: model.category,
          providerId: top.providerId,
          providerModelId: top.providerModelId,
          confidence: top.confidence,
          ok: true,
          reason: top.reason,
        });
        matchedCount++;
      } else {
        results.push({
          modelId: model.id,
          name: model.name,
          category: model.category,
          ok: false,
          skipped: true,
          reason: top ? `最佳候选匹配度不足 (${Math.round(top.confidence * 100)}% < ${Math.round(minConfidence * 100)}%)` : '无合适供应商候选',
        });
      }
    } catch (err) {
      results.push({
        modelId: model.id,
        name: model.name,
        category: model.category,
        ok: false,
        error: err.message,
      });
    }
  }

  // 刷新缓存
  await safeInvalidateActiveModelsCache();

  return {
    totalUnrouted: unroutedList.length,
    matchedCount,
    results,
  };
}
