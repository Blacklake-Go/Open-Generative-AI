import { query, queryMany, queryOne, execute, nowIso } from '../db/index.js';
import { costUsdToNumber, isPrimaryChannel } from '../modelCenter/routing.js';

export const CORE_MODEL_IDS = Object.freeze(new Set([
  // 生图核心
  'seedream-5.0-pro',
  'seedream-5.0-flash',
  'seedream-5.0-lite',
  'seedream-4.5',
  'seedream-5.0',
  'gpt-image',
  'imagen-4',
  // 生视频核心
  'kling-3.0',
  'kling-2.6',
  'kling-2.5',
  'kling-2.1',
  'kling-o1',
  'seedance-2.0',
  'hailuo-2.3',
  'hailuo-02',
  'wan-2.1',
  'veo-2',
  'veo-3',
  'gemini-omni-flash',
  'sora-turbo',
  'luma-dream-machine',
  'runway-image-to-video',
  'hunyuan-video',
  'cogvideo-2b',
  'infinitetalk',
  // 语音核心
  'minimax-speech-2.6',
  'minimax-voice-clone',
  // 文本核心
  'deepseek-r1',
  'deepseek-v3',
]));

export const CAPABILITY_AUTO_ALIASES = Object.freeze({
  'auto': { category: 'image', defaultModelId: 'seedream-5.0-pro' },
  'auto-image': { category: 'image', defaultModelId: 'seedream-5.0-pro' },
  'image': { category: 'image', defaultModelId: 'seedream-5.0-pro' },
  'image_generate': { category: 'image', defaultModelId: 'seedream-5.0-pro' },
  'text_to_image': { category: 'image', defaultModelId: 'seedream-5.0-pro' },
  't2i': { category: 'image', defaultModelId: 'seedream-5.0-pro' },
  'i2i': { category: 'image', defaultModelId: 'seedream-5.0-pro' },
  'auto-video': { category: 'video', defaultModelId: 'kling-2.6' },
  'video': { category: 'video', defaultModelId: 'kling-2.6' },
  'video_generate': { category: 'video', defaultModelId: 'kling-2.6' },
  'text_to_video': { category: 'video', defaultModelId: 'kling-2.6' },
  'image_to_video': { category: 'video', defaultModelId: 'kling-2.6' },
  't2v': { category: 'video', defaultModelId: 'kling-2.6' },
  'i2v': { category: 'video', defaultModelId: 'kling-2.6' },
  'auto-audio': { category: 'audio', defaultModelId: 'minimax-speech-2.6' },
  'audio': { category: 'audio', defaultModelId: 'minimax-speech-2.6' },
  'audio_generate': { category: 'audio', defaultModelId: 'minimax-speech-2.6' },
  'music': { category: 'audio', defaultModelId: 'minimax-speech-2.6' },
  'music_generate': { category: 'audio', defaultModelId: 'minimax-speech-2.6' },
  't2a': { category: 'audio', defaultModelId: 'minimax-speech-2.6' },
  'auto-text': { category: 'text', defaultModelId: 'deepseek-r1' },
  'text': { category: 'text', defaultModelId: 'deepseek-r1' },
});

export async function listAllModels() {
  try {
    const res = await query(`
      SELECT id, provider, name, type, cost_usd, credits_price, is_active, sort_order,
             COALESCE(tier, 'backup') AS tier,
             COALESCE(is_visible, true) AS is_visible,
             COALESCE(auto_route_eligible, false) AS auto_route_eligible,
             backup_model_id, backup_provider_id,
             metadata_json, created_at, updated_at
      FROM models_config
      ORDER BY sort_order ASC, created_at ASC
    `);
    return res.rows;
  } catch {
    const res = await query(`
      SELECT id, provider, name, type, cost_usd, credits_price, is_active, sort_order, metadata_json, created_at, updated_at
      FROM models_config
      ORDER BY sort_order ASC, created_at ASC
    `);
    return res.rows.map((row) => ({
      ...row,
      tier: CORE_MODEL_IDS.has(row.id) ? 'core' : 'backup',
      is_visible: CORE_MODEL_IDS.has(row.id),
      auto_route_eligible: CORE_MODEL_IDS.has(row.id),
    }));
  }
}

export async function listActiveModels({ scope = 'visible', category = null } = {}) {
  try {
    const clauses = [
      "m.status != 'disabled'",
    ];
    const configuredPriceAge = Number(process.env.MODEL_PRICE_MAX_AGE_MS);
    const maxPriceAgeMs = Number.isFinite(configuredPriceAge) && configuredPriceAge > 0
      ? Math.min(configuredPriceAge, 7 * 24 * 60 * 60 * 1000)
      : 30 * 24 * 60 * 60 * 1000;
    const params = [];

    if (scope === 'core') {
      clauses.push("COALESCE(m.tier, 'backup') = 'core'");
      clauses.push("COALESCE(m.is_visible, true) = TRUE");
    } else if (scope === 'visible') {
      clauses.push("COALESCE(m.is_visible, true) = TRUE");
    } else if (scope === 'all') {
      // return all non-disabled models
    } else {
      // default: all visible models
      clauses.push("COALESCE(m.is_visible, true) = TRUE");
    }
    if (category) {
      clauses.push(`m.category = $${params.length + 1}`);
      params.push(category);
    }

    const res = await query(`
      WITH eligible_routes AS (
        SELECT
          pm.id AS provider_model_id,
          pm.model_id,
          pm.provider_id,
          pm.cost_config,
          pm.priority,
          pm.metadata
        FROM ai_studio.provider_models pm
        JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
        WHERE pm.enabled = TRUE
          AND NULLIF(BTRIM(pm.provider_endpoint), '') IS NOT NULL
          AND p.enabled = TRUE
          AND COALESCE(p.circuit_state, 'closed') NOT IN ('open', 'circuit_open')
      )
      SELECT
        m.id,
        COALESCE(pm.provider_id, 'muapi') AS provider,
        COALESCE(m.display_name, m.name) AS name,
        m.display_name,
        m.description,
        COALESCE(m.capabilities->>'badge', '') AS badge,
        COALESCE(m.capabilities->>'sub_type', '') AS sub_type,
        m.category AS type,
        m.category,
        COALESCE((pm.cost_config->>'base_cost')::numeric, 0) AS cost_usd,
        pr.base_credits::int AS credits_price,
        COALESCE(pr.pricing_type, 'fixed') AS pricing_type,
        (m.status = 'active') AS is_active,
        COALESCE(m.sort, 0)::int AS sort_order,
        COALESCE(m.tier, 'backup') AS tier,
        COALESCE(m.is_visible, true) AS is_visible,
        COALESCE(m.is_pinned, (m.capabilities->>'is_pinned')::boolean, false) AS is_pinned,
        COALESCE(m.auto_route_eligible, false) AS auto_route_eligible,
        m.backup_model_id AS backup_model_id,
        COALESCE(m.capabilities, '{}'::jsonb) AS capabilities,
        COALESCE(m.capabilities, '{}'::jsonb) AS metadata_json,
        COALESCE(all_pm.providers, ARRAY[COALESCE(pm.provider_id, 'muapi')]) AS available_providers
      FROM ai_studio.ai_models m
      LEFT JOIN ai_studio.model_pricing pr ON pr.model_id = m.id AND pr.is_active = TRUE
      LEFT JOIN LATERAL (
        SELECT provider_id, cost_config
        FROM eligible_routes
        WHERE model_id = m.id
        ORDER BY COALESCE((metadata->>'primary')::boolean, false) DESC, priority DESC, provider_model_id ASC
        LIMIT 1
      ) pm ON TRUE
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(DISTINCT provider_id ORDER BY provider_id) AS providers
        FROM eligible_routes
        WHERE model_id = m.id
      ) all_pm ON TRUE
      WHERE ${clauses.join(' AND ')}
      ORDER BY
        CASE WHEN COALESCE(m.is_pinned, (m.capabilities->>'is_pinned')::boolean, false) THEN 0 ELSE 1 END,
        CASE m.tier WHEN 'core' THEN 0 WHEN 'backup' THEN 1 ELSE 2 END,
        m.sort ASC, m.created_at ASC
    `, params);
    return res.rows;
  } catch (err) {
    console.error('[models.listActiveModels] Query error:', err);
    return [];
  }
}

export async function getModelById(id, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  if (!id) return null;
  const cleanId = String(id).trim();

  // 1. 优先从统一标准模型目录中查找 (Canonical AI Model)
  try {
    const canonical = await run(`
      SELECT m.id,
             COALESCE(m.name, m.display_name) AS name,
             m.display_name,
             m.category AS type,
             m.category,
             m.description,
             (m.status != 'disabled') AS is_active,
             m.status,
             COALESCE(m.sort, 0)::int AS sort_order,
             COALESCE(m.sort, 0)::int AS sort,
             COALESCE(m.tier, 'backup') AS tier,
             COALESCE(m.is_visible, true) AS is_visible,
             COALESCE(m.is_pinned, (m.capabilities->>'is_pinned')::boolean, false) AS is_pinned,
             COALESCE(m.is_featured, false) AS is_featured,
             COALESCE(m.auto_route_eligible, false) AS auto_route_eligible,
             m.backup_model_id, m.backup_provider_id,
             COALESCE(m.capabilities->>'badge', '') AS badge,
             COALESCE(m.capabilities->>'sub_type', '') AS sub_type,
             COALESCE(m.capabilities->>'pricing_hint', '') AS pricing_hint,
             COALESCE(m.capabilities, '{}'::jsonb) AS capabilities,
             COALESCE(m.capabilities, '{}'::jsonb) AS metadata_json,
             COALESCE(m.supported_ratios, '[]'::jsonb) AS supported_ratios,
             COALESCE(m.supported_resolutions, '[]'::jsonb) AS supported_resolutions,
             COALESCE(m.supported_durations, '[]'::jsonb) AS supported_durations,
             COALESCE(p.base_credits, mc.credits_price, 20) AS credits_price,
             COALESCE((pm.cost_config->>'base_cost')::numeric, 0) AS cost_usd,
             COALESCE(pm.provider_id, legacy.provider, 'muapi') AS provider,
             m.created_at, m.updated_at
      FROM ai_studio.ai_models m
      LEFT JOIN ai_studio.model_pricing p ON p.model_id = m.id AND p.is_active = TRUE
      LEFT JOIN LATERAL (
        SELECT mc.credits_price, mc.provider FROM ai_studio.models_config mc
        WHERE LOWER(mc.id) = LOWER(m.id) LIMIT 1
      ) legacy ON TRUE
      LEFT JOIN LATERAL (
        SELECT mc.credits_price FROM ai_studio.models_config mc
        WHERE LOWER(mc.id) = LOWER(m.id) AND mc.credits_price > 0 LIMIT 1
      ) mc ON TRUE
      LEFT JOIN LATERAL (
        SELECT provider_id, cost_config FROM ai_studio.provider_models
        WHERE model_id = m.id AND enabled = TRUE
        ORDER BY priority DESC LIMIT 1
      ) pm ON TRUE
      WHERE m.id = $1 OR LOWER(m.id) = LOWER($1)
      LIMIT 1
    `, [cleanId]);
    if (canonical) {
      if (canonical.capabilities && typeof canonical.capabilities === 'string') {
        try { canonical.capabilities = JSON.parse(canonical.capabilities); } catch {}
      }
      if (canonical.supported_ratios && typeof canonical.supported_ratios === 'string') {
        try { canonical.supported_ratios = JSON.parse(canonical.supported_ratios); } catch {}
      }
      if (canonical.supported_resolutions && typeof canonical.supported_resolutions === 'string') {
        try { canonical.supported_resolutions = JSON.parse(canonical.supported_resolutions); } catch {}
      }
      if (canonical.supported_durations && typeof canonical.supported_durations === 'string') {
        try { canonical.supported_durations = JSON.parse(canonical.supported_durations); } catch {}
      }
      return canonical;
    }
  } catch {
    // 兼容部分字段未迁移环境
    try {
      const fallbackCanonical = await run(`
        SELECT id, COALESCE(name, display_name) AS name, category AS type,
               (status != 'disabled') AS is_active, sort AS sort_order,
               COALESCE(tier, 'backup') AS tier,
               COALESCE(is_visible, true) AS is_visible,
               COALESCE(auto_route_eligible, false) AS auto_route_eligible,
               backup_model_id, backup_provider_id,
               COALESCE(capabilities, '{}'::jsonb) AS capabilities,
               COALESCE(capabilities, '{}'::jsonb) AS metadata_json,
               created_at, updated_at
        FROM ai_studio.ai_models
        WHERE id = $1 OR LOWER(id) = LOWER($1)
        LIMIT 1
      `, [cleanId]);
      if (fallbackCanonical) {
        if (fallbackCanonical.capabilities && typeof fallbackCanonical.capabilities === 'string') {
          try { fallbackCanonical.capabilities = JSON.parse(fallbackCanonical.capabilities); } catch {}
        }
        return fallbackCanonical;
      }
    } catch {}
  }

  // 2. 兜底回退：老 models_config 表
  let row = null;
  try {
    row = await run(`
      SELECT id, provider, name, type, cost_usd, credits_price, is_active, sort_order,
             COALESCE(tier, 'backup') AS tier,
             COALESCE(is_visible, true) AS is_visible,
             COALESCE(auto_route_eligible, false) AS auto_route_eligible,
             backup_model_id, backup_provider_id,
             metadata_json,
             metadata_json AS capabilities,
             created_at, updated_at
      FROM models_config
      WHERE id = $1 OR LOWER(id) = LOWER($1)
      LIMIT 1
    `, [cleanId]);
  } catch {
    try {
      row = await run(`
        SELECT id, provider, name, type, cost_usd, credits_price, is_active, sort_order,
               metadata_json,
               metadata_json AS capabilities,
               created_at, updated_at
        FROM models_config
        WHERE id = $1 OR LOWER(id) = LOWER($1)
        LIMIT 1
      `, [cleanId]);
    } catch {}
  }
  if (row) {
    if (row.capabilities && typeof row.capabilities === 'string') {
      try { row.capabilities = JSON.parse(row.capabilities); } catch {}
    }
    return row;
  }
  return null;
}

export const MODEL_ENDPOINT_ALIASES = Object.freeze({
  'flux-dev-image': 'flux-dev',
  'flux-schnell-image': 'flux-schnell',
  'hidream_i1_fast_image': 'hidream-i1-fast',
  'hidream_i1_dev_image': 'hidream-i1-dev',
  'ai-image-upscale': 'ai-image-upscaler',
  'bytedance-seedream-image': 'bytedance-seedream-v3',
  'seedance-lite-text-to-video': 'seedance-lite-t2v',
  'seedance-pro-text-to-video': 'seedance-pro-t2v',
  'seedance-v1.5-pro-text-to-video': 'seedance-v1.5-pro-t2v',
  'seedance-v2.0-text-to-video': 'seedance-v2.0-t2v',
  'kling-v2.1-master-text-to-video': 'kling-v2.1-master-t2v',
  'kling-v2.5-turbo-pro-text-to-video': 'kling-v2.5-turbo-pro-t2v',
  'kling-v2.6-pro-text-to-video': 'kling-v2.6-pro-t2v',
  'kling-v2.1-master-image-to-video': 'kling-v2.1-master-i2v',
  'kling-v2.1-standard-image-to-video': 'kling-v2.1-standard-i2v',
  'minimax-hailuo-2.3-standard-text-to-video': 'minimax-hailuo-2.3-standard-t2v',
  'minimax-hailuo-2.3-standard-image-to-video': 'minimax-hailuo-2.3-standard-i2v',
  'kling-v3.0-standard-text-to-video': 'kling-v3.0-standard-t2v',
  'kling-v3.0-standard-image-to-video': 'kling-v3.0-standard-i2v',
  'veo-2-text-to-video': 'veo2-t2v',
  'veo-2-image-to-video': 'veo2-i2v',
  // 2026 SOTA model routing aliases
  'bytedance-seedream-5.0-pro': 'seedream-5.0-pro',
  'bytedance-seedream-5.0-pro-layer': 'seedream-5.0-pro',
  'seedream-5.0-pro-layer': 'seedream-5.0-pro',
  'seedream-pro': 'seedream-5.0-pro',
  'seedream-5.0-flash': 'seedream-5.0-flash',
  'seedream-flash': 'seedream-5.0-flash',
  'seedream-5.0-lite': 'seedream-5.0-lite',
  'seedream-lite': 'seedream-5.0-lite',
  'seedream-layer': 'seedream-5.0-pro',
  'seedream-5.0-edit': 'seedream-5.0-edit',
  'bytedance-seedream-v4.5': 'seedream-4.5',
  'seedance-2.5': 'seedance-2.0',
  'seedance-1.5': 'seedance-2.0',
  'seedance-v2.0-t2v': 'seedance-2.0',
  'seedance-v2.0-i2v': 'seedance-2.0',
  // 可灵主力版本别名
  'kling-3.0-pro': 'kling-3.0',
  'kling-v3.0-standard-t2v': 'kling-3.0',
  'kling-v3.0-standard-i2v': 'kling-3.0',
  'kling-v2.6-pro-t2v': 'kling-2.6',
  'kling-v2.6-pro-i2v': 'kling-2.6',
  'kling-v2.5-turbo-pro-t2v': 'kling-2.5',
  'kling-v2.1-master-t2v': 'kling-2.1',
  'kling-o1-text-to-video': 'kling-o1',
  'kling-o1-image-to-video': 'kling-o1',
  // FLUX 主力版本别名
  'flux-pro': 'flux-1-pro',
  'flux-1.1-pro': 'flux-1-pro',
  'flux-dev': 'flux-1-dev',
  'flux-schnell': 'flux-1-schnell',
  'flux-2-dev': 'flux-2',
  // Suno 主力版本别名
  'suno-create-music': 'suno-v4',
  'suno-extend-music': 'suno-v4',
  'suno-add-vocals': 'suno-v4',
  'suno-remix-music': 'suno-v4',
  'suno-v3-5': 'suno-v3.5',
  'suno-chirp-v3.5': 'suno-v3.5',
  // GPT 图像别名
  'gpt-image-2.5-flash-text-to-image': 'gpt-image-2.5-flash',
  'gpt-image-2.5-sunrise-text-to-image': 'gpt-image-2.5-sunrise',
  'gpt-image-2-text-to-image': 'gpt-image-2',
  'gpt-image-1.5-text-to-image': 'gpt-image-1.5',
  'gpt-image-text-to-image': 'gpt-image',
  'gpt4o-text-to-image': 'gpt-image',
  // Google Imagen 别名
  'google-imagen4': 'imagen-4',
  'google-imagen4-ultra': 'imagen-4',
  'google-imagen4-fast': 'imagen-4',
  'google-imagen-4': 'imagen-4',
  'imagen-4-ultra': 'imagen-4',
  'imagen-4-fast': 'imagen-4',
  'imagen4': 'imagen-4',
  // Seedream 系列别名
  'seedream-5.0': 'seedream-5.0',
  'bytedance-seedream-5.0': 'seedream-5.0',
  'bytedance-seedream-v5.0': 'seedream-5.0',
  'seedream-5.0-lite': 'seedream-5.0-lite',
  'seedream-lite': 'seedream-5.0-lite',
  'bytedance-seedream-5.0-lite': 'seedream-5.0-lite',
  'seedream-4.5': 'seedream-4.5',
  'seedream-v4.5': 'seedream-4.5',
  'bytedance-seedream-4.5': 'seedream-4.5',
  'bytedance-seedream-v4.5': 'seedream-4.5',
  'bytedance-seedream-v4.5-edit': 'seedream-4.5',
});

export async function findModelByEndpointOrId(key, options = {}) {
  if (!key) return null;
  let clean = String(key).trim().toLowerCase();

  // 若传入的是通用 auto，根据参数推断所属能力类型
  if (clean === 'auto') {
    const params = options.parameters || {};
    const cat = String(options.category || params.category || params.mode || '').toLowerCase();
    if (cat.includes('video') || params.video_url || params.input_video) {
      clean = 'auto-video';
    } else if (cat.includes('audio') || cat.includes('music')) {
      clean = 'auto-audio';
    } else {
      clean = 'auto-image';
    }
  }

  // 1. 若是能力别名或 Auto Router 标识，优先动态查询数据库中配置的参与 Auto Router 的 Core 模型
  if (CAPABILITY_AUTO_ALIASES[clean]) {
    const targetCategory = CAPABILITY_AUTO_ALIASES[clean].category;
    try {
      const coreAutoModel = await queryOne(`
        SELECT m.id, m.name, m.display_name, m.category AS type, m.status,
               (m.status = 'active') AS is_active, m.sort AS sort_order,
               COALESCE(m.capabilities, '{}'::jsonb) AS capabilities,
               COALESCE(m.capabilities, '{}'::jsonb) AS metadata_json,
               COALESCE(m.tier, 'core') AS tier,
               COALESCE(m.is_visible, true) AS is_visible,
               COALESCE(m.auto_route_eligible, true) AS auto_route_eligible,
               m.backup_model_id, m.backup_provider_id,
               COALESCE(p.base_credits, mc.credits_price, 100) AS credits_price,
               COALESCE((pm.cost_config->>'base_cost')::numeric, 0) AS cost_usd,
               COALESCE(pm.provider_id, 'muapi') AS provider
        FROM ai_studio.ai_models m
        LEFT JOIN ai_studio.model_pricing p ON p.model_id = m.id
        LEFT JOIN LATERAL (
          SELECT mc.credits_price FROM ai_studio.models_config mc
          WHERE LOWER(mc.id) = LOWER(m.id) AND mc.credits_price > 0 LIMIT 1
        ) mc ON TRUE
        LEFT JOIN LATERAL (
          SELECT provider_id, cost_config FROM ai_studio.provider_models
          WHERE model_id = m.id AND enabled = TRUE
          ORDER BY priority DESC LIMIT 1
        ) pm ON TRUE
        WHERE m.status = 'active'
          AND COALESCE(m.tier, 'backup') = 'core'
          AND COALESCE(m.auto_route_eligible, true) = TRUE
          AND m.category = $1
        ORDER BY m.sort ASC, m.created_at ASC
        LIMIT 1
      `, [targetCategory]);
      if (coreAutoModel) {
        if (coreAutoModel.capabilities && typeof coreAutoModel.capabilities === 'string') {
          try { coreAutoModel.capabilities = JSON.parse(coreAutoModel.capabilities); } catch {}
        }
        return coreAutoModel;
      }
    } catch {
      // 数据库暂未应用迁移时走静态别名回退
    }
    clean = CAPABILITY_AUTO_ALIASES[clean].defaultModelId;
  }

  // 计算去除常见后缀与别名后的候选列表
  const strippedSuffix = clean
    .replace(/-(text-to-video|image-to-video|video-to-video|text-to-image|image-to-image|prompt-to-video)$/, '')
    .replace(/-(image|video|audio|pro|fast)$/, '');
  const aliasedId = MODEL_ENDPOINT_ALIASES[clean] || MODEL_ENDPOINT_ALIASES[strippedSuffix];
  const candidateKeys = [...new Set([clean, strippedSuffix, aliasedId].filter(Boolean))];

  // 2. 优先从统一标准模型目录中查找 (Canonical AI Model)
  try {
    const canonical = await queryOne(`
      SELECT m.id, m.name, m.display_name, m.category AS type, m.status,
             (m.status != 'disabled') AS is_active, m.sort AS sort_order,
             COALESCE(m.capabilities, '{}'::jsonb) AS capabilities,
             COALESCE(m.capabilities, '{}'::jsonb) AS metadata_json,
             COALESCE(m.tier, 'backup') AS tier,
             COALESCE(m.is_visible, true) AS is_visible,
             COALESCE(m.auto_route_eligible, false) AS auto_route_eligible,
             m.backup_model_id, m.backup_provider_id,
             COALESCE(p.base_credits, mc.credits_price, 20) AS credits_price,
             COALESCE((pm.cost_config->>'base_cost')::numeric, 0) AS cost_usd,
             COALESCE(pm.provider_id, 'runninghub') AS provider
      FROM ai_studio.ai_models m
      LEFT JOIN ai_studio.model_pricing p ON p.model_id = m.id
      LEFT JOIN LATERAL (
        SELECT mc.credits_price FROM ai_studio.models_config mc
        WHERE LOWER(mc.id) = LOWER(m.id) AND mc.credits_price > 0 LIMIT 1
      ) mc ON TRUE
      LEFT JOIN LATERAL (
        SELECT provider_id, cost_config FROM ai_studio.provider_models
        WHERE model_id = m.id AND enabled = TRUE
        ORDER BY priority DESC LIMIT 1
      ) pm ON TRUE
      WHERE LOWER(m.id) = ANY($1) OR LOWER(m.slug) = ANY($1)
      ORDER BY (LOWER(m.id) = $2) DESC, (m.status = 'active') DESC
      LIMIT 1
    `, [candidateKeys, clean]);
    if (canonical) {
      if (canonical.capabilities && typeof canonical.capabilities === 'string') {
        try { canonical.capabilities = JSON.parse(canonical.capabilities); } catch {}
      }
      if (!canonical.tier && CORE_MODEL_IDS.has(canonical.id)) {
        canonical.tier = 'core';
        canonical.is_visible = true;
      }
      if (canonical.backup_model_id && canonical.backup_model_id !== canonical.id && (!canonical.is_visible || canonical.status === 'disabled')) {
        const targetModel = await getModelById(canonical.backup_model_id);
        if (targetModel) return targetModel;
      }
      return canonical;
    }
  } catch {
    const legacyCanonical = await queryOne(`
      SELECT m.id, m.name, m.display_name, m.category AS type, m.status,
             (m.status != 'disabled') AS is_active, m.sort AS sort_order,
             COALESCE(m.capabilities, '{}'::jsonb) AS capabilities,
             COALESCE(m.capabilities, '{}'::jsonb) AS metadata_json,
             COALESCE(p.base_credits, mc.credits_price, 20) AS credits_price,
             COALESCE((pm.cost_config->>'base_cost')::numeric, 0) AS cost_usd,
             COALESCE(pm.provider_id, 'runninghub') AS provider
      FROM ai_studio.ai_models m
      LEFT JOIN ai_studio.model_pricing p ON p.model_id = m.id
      LEFT JOIN LATERAL (
        SELECT mc.credits_price FROM ai_studio.models_config mc
        WHERE LOWER(mc.id) = LOWER(m.id) AND mc.credits_price > 0 LIMIT 1
      ) mc ON TRUE
      LEFT JOIN LATERAL (
        SELECT provider_id, cost_config FROM ai_studio.provider_models
        WHERE model_id = m.id AND enabled = TRUE
        ORDER BY priority DESC LIMIT 1
      ) pm ON TRUE
      WHERE LOWER(m.id) = ANY($1) OR LOWER(m.slug) = ANY($1)
      ORDER BY (LOWER(m.id) = $2) DESC, (m.status = 'active') DESC
      LIMIT 1
    `, [candidateKeys, clean]);
    if (legacyCanonical) {
      if (legacyCanonical.capabilities && typeof legacyCanonical.capabilities === 'string') {
        try { legacyCanonical.capabilities = JSON.parse(legacyCanonical.capabilities); } catch {}
      }
      return {
        ...legacyCanonical,
        tier: CORE_MODEL_IDS.has(legacyCanonical.id) ? 'core' : 'backup',
        is_visible: CORE_MODEL_IDS.has(legacyCanonical.id),
        auto_route_eligible: CORE_MODEL_IDS.has(legacyCanonical.id),
      };
    }
  }

  // 3. 查找老 models_config 表精确匹配 ID
  let row = await queryOne('SELECT * FROM models_config WHERE LOWER(id) = $1', [clean]);
  if (row) {
    return {
      ...row,
      capabilities: row.capabilities || row.metadata_json || {},
      tier: row.tier || (CORE_MODEL_IDS.has(row.id) ? 'core' : 'backup'),
      is_visible: row.is_visible !== undefined ? row.is_visible : CORE_MODEL_IDS.has(row.id),
    };
  }

  // 4. 显式别名字典映射匹配
  if (aliasedId) {
    row = await queryOne('SELECT * FROM models_config WHERE LOWER(id) = $1', [aliasedId]);
    if (row) {
      return {
        ...row,
        capabilities: row.capabilities || row.metadata_json || {},
        tier: row.tier || (CORE_MODEL_IDS.has(row.id) ? 'core' : 'backup'),
        is_visible: row.is_visible !== undefined ? row.is_visible : CORE_MODEL_IDS.has(row.id),
      };
    }
  }

  // 5. 去掉常见后缀模糊匹配 (如 -image, -video, -text-to-video 等)
  const normalizedKey = clean
    .replace(/-(text-to-video|image-to-video|video-to-video|text-to-image|image-to-image)$/, '')
    .replace(/-(image|video|audio|pro|fast)$/, '');
  row = await queryOne('SELECT * FROM models_config WHERE LOWER(id) = $1', [normalizedKey]);
  if (row) {
    return {
      ...row,
      capabilities: row.capabilities || row.metadata_json || {},
      tier: row.tier || (CORE_MODEL_IDS.has(row.id) ? 'core' : 'backup'),
      is_visible: row.is_visible !== undefined ? row.is_visible : CORE_MODEL_IDS.has(row.id),
    };
  }

  // 6. 后缀省略匹配
  row = await queryOne(`SELECT * FROM models_config WHERE LOWER(id) LIKE $1 || '%'
    ORDER BY length(id) ASC, id ASC LIMIT 1`, [clean]);
  if (row) {
    return {
      ...row,
      capabilities: row.capabilities || row.metadata_json || {},
      tier: row.tier || (CORE_MODEL_IDS.has(row.id) ? 'core' : 'backup'),
      is_visible: row.is_visible !== undefined ? row.is_visible : CORE_MODEL_IDS.has(row.id),
    };
  }
  return null;
}

export async function updateModelConfig(id, updates, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const existing = await getModelById(id, transaction);
  if (!existing) return null;

  const cost_usd = updates.cost_usd !== undefined ? Number(updates.cost_usd) : existing.cost_usd;
  const credits_price = updates.credits_price !== undefined ? Number(updates.credits_price) : existing.credits_price;
  const is_active = updates.is_active !== undefined ? Boolean(updates.is_active) : existing.is_active;
  const name_val = (updates.name !== undefined && updates.name !== null && String(updates.name).trim() !== '')
    ? String(updates.name).trim()
    : null;
  const name = name_val || existing.name;
  const provider = updates.provider || existing.provider || 'muapi';
  const sort_order = updates.sort_order !== undefined ? Number(updates.sort_order) : existing.sort_order;
  const tier = updates.tier || existing.tier || 'backup';
  const is_visible = updates.is_visible !== undefined ? Boolean(updates.is_visible) : (existing.is_visible !== undefined ? Boolean(existing.is_visible) : true);
  const auto_route_eligible = updates.auto_route_eligible !== undefined ? Boolean(updates.auto_route_eligible) : (existing.auto_route_eligible !== undefined ? Boolean(existing.auto_route_eligible) : true);
  const backup_model_id = (updates.backup_model_id !== undefined && updates.backup_model_id !== null && String(updates.backup_model_id).trim() !== '')
    ? String(updates.backup_model_id).trim()
    : (updates.backup_model_id === null || updates.backup_model_id === '' ? null : (existing.backup_model_id || null));
  const backup_provider_id = (updates.backup_provider_id !== undefined && updates.backup_provider_id !== null && String(updates.backup_provider_id).trim() !== '')
    ? String(updates.backup_provider_id).trim()
    : (updates.backup_provider_id === null || updates.backup_provider_id === '' ? null : (existing.backup_provider_id || null));

  let metadata = {};
  try {
    metadata = typeof existing.metadata_json === 'string' ? JSON.parse(existing.metadata_json) : (existing.metadata_json || {});
  } catch {}
  if (updates.routing_mode !== undefined) {
    metadata.routing_mode = updates.routing_mode;
  }
  metadata.tier = tier;
  metadata.is_visible = is_visible;
  metadata.is_pinned = updates.is_pinned !== undefined ? Boolean(updates.is_pinned) : (existing.is_pinned !== undefined ? Boolean(existing.is_pinned) : false);
  metadata.auto_route_eligible = auto_route_eligible;
  metadata.backup_model_id = backup_model_id;
  metadata.backup_provider_id = backup_provider_id;
  if (updates.category) {
    metadata.category = updates.category;
  }
  if (updates.metadata_json !== undefined) {
    metadata = typeof updates.metadata_json === 'object' ? { ...metadata, ...updates.metadata_json } : metadata;
  }
  if (updates.capabilities !== undefined) {
    let extraCaps = updates.capabilities;
    if (typeof extraCaps === 'string') {
      try { extraCaps = JSON.parse(extraCaps); } catch {}
    }
    if (typeof extraCaps === 'object' && extraCaps !== null && !Array.isArray(extraCaps)) {
      metadata = { ...metadata, ...extraCaps };
    }
  }
  if (updates.badge !== undefined) {
    const cleanBadge = (updates.badge === null || updates.badge === undefined) ? '' : String(updates.badge).trim();
    if (cleanBadge === '') {
      delete metadata.badge;
    } else {
      metadata.badge = cleanBadge;
    }
  }
  if (updates.sub_type !== undefined) {
    const cleanSubType = (updates.sub_type === null || updates.sub_type === undefined) ? '' : String(updates.sub_type).trim();
    if (cleanSubType === '') {
      delete metadata.sub_type;
    } else {
      metadata.sub_type = cleanSubType;
    }
  }
  if (updates.pricing_hint !== undefined) {
    const cleanPricingHint = (updates.pricing_hint === null || updates.pricing_hint === undefined) ? '' : String(updates.pricing_hint).trim();
    if (cleanPricingHint === '') {
      delete metadata.pricing_hint;
    } else {
      metadata.pricing_hint = cleanPricingHint;
    }
  }

  const timestamp = nowIso();

  // 1. 更新 models_config 表
  try {
    await run(`
      UPDATE models_config
      SET name = $1, cost_usd = $2, credits_price = $3, is_active = $4, sort_order = $5, provider = $6,
          tier = $7, is_visible = $8, auto_route_eligible = $9, backup_model_id = $10, backup_provider_id = $11,
          metadata_json = $12::jsonb, updated_at = $13
      WHERE id = $14
    `, [name, cost_usd, credits_price, is_active, sort_order, provider, tier, is_visible, auto_route_eligible, backup_model_id, backup_provider_id, JSON.stringify(metadata), timestamp, id]);
  } catch {
    await run(`
      UPDATE models_config
      SET name = $1, cost_usd = $2, credits_price = $3, is_active = $4, sort_order = $5, provider = $6, metadata_json = $7::jsonb, updated_at = $8
      WHERE id = $9
    `, [name, cost_usd, credits_price, is_active, sort_order, provider, JSON.stringify(metadata), timestamp, id]);
  }

  // 2. 同步更新规范目录 ai_studio.ai_models 表
  try {
    let status;
    if (updates.status !== undefined && updates.status !== null && String(updates.status).trim() !== '') {
      status = String(updates.status).trim();
    } else if (updates.is_active !== undefined) {
      status = updates.is_active ? (tier === 'deprecated' ? 'disabled' : tier === 'experimental' ? 'maintenance' : 'active') : 'disabled';
    } else {
      status = existing.status || (is_active ? (tier === 'deprecated' ? 'disabled' : tier === 'experimental' ? 'maintenance' : 'active') : 'disabled');
    }

    const display_name_val = (updates.display_name !== undefined && updates.display_name !== null && String(updates.display_name).trim() !== '')
      ? String(updates.display_name).trim()
      : null;
    const description_val = updates.description !== undefined ? updates.description : null;
    const is_pinned_val = updates.is_pinned !== undefined ? Boolean(updates.is_pinned) : null;
    const sort_val = updates.sort !== undefined ? Number(updates.sort) : (updates.sort_order !== undefined ? Number(updates.sort_order) : null);
    const is_featured_val = updates.is_featured !== undefined ? Boolean(updates.is_featured) : null;
    const badge_val = updates.badge !== undefined ? ((updates.badge === null || updates.badge === undefined || String(updates.badge).trim() === '') ? '' : String(updates.badge).trim()) : null;
    const sub_type_val = updates.sub_type !== undefined ? ((updates.sub_type === null || updates.sub_type === undefined || String(updates.sub_type).trim() === '') ? '' : String(updates.sub_type).trim()) : null;
    const pricing_hint_val = updates.pricing_hint !== undefined ? ((updates.pricing_hint === null || updates.pricing_hint === undefined || String(updates.pricing_hint).trim() === '') ? '' : String(updates.pricing_hint).trim()) : null;
    const category_val = (updates.category !== undefined && updates.category !== null && String(updates.category).trim() !== '')
      ? String(updates.category).trim()
      : null;

    try {
      await run(`
        UPDATE ai_studio.ai_models
        SET name = COALESCE($1, name),
            status = $2,
            sort = COALESCE($3, sort),
            tier = $4,
            is_visible = $5,
            auto_route_eligible = $6,
            backup_model_id = $7,
            backup_provider_id = $8,
            display_name = COALESCE($11, display_name),
            description = COALESCE($12, description),
            is_featured = COALESCE($13, is_featured),
            is_pinned = COALESCE($14, is_pinned),
            category = COALESCE($15, category),
            updated_at = $9
        WHERE id = $10
      `, [name_val, status, sort_val, tier, is_visible, auto_route_eligible, backup_model_id, backup_provider_id, timestamp, id, display_name_val, description_val, is_featured_val, is_pinned_val, category_val]);
    } catch {
      await run(`
        UPDATE ai_studio.ai_models
        SET name = COALESCE($1, name),
            status = $2,
            sort = COALESCE($3, sort),
            tier = $4,
            is_visible = $5,
            auto_route_eligible = $6,
            backup_model_id = $7,
            backup_provider_id = $8,
            display_name = COALESCE($11, display_name),
            description = COALESCE($12, description),
            is_featured = COALESCE($13, is_featured),
            category = COALESCE($14, category),
            updated_at = $9
        WHERE id = $10
      `, [name_val, status, sort_val, tier, is_visible, auto_route_eligible, backup_model_id, backup_provider_id, timestamp, id, display_name_val, description_val, is_featured_val, category_val]);
    }

    if (
      is_pinned_val !== null ||
      badge_val !== null ||
      sub_type_val !== null ||
      pricing_hint_val !== null ||
      updates.capabilities !== undefined ||
      updates.supported_ratios !== undefined ||
      updates.supported_resolutions !== undefined ||
      updates.supported_durations !== undefined
    ) {
      try {
        let rawCaps = existing.capabilities ?? existing.metadata_json ?? {};
        let caps = {};
        if (typeof rawCaps === 'string') {
          try {
            caps = JSON.parse(rawCaps);
          } catch {
            caps = {};
          }
        } else if (typeof rawCaps === 'object' && rawCaps !== null && !Array.isArray(rawCaps)) {
          caps = { ...rawCaps };
        }

        if (is_pinned_val !== null) caps.is_pinned = is_pinned_val;
        if (badge_val !== null) {
          if (badge_val === '') delete caps.badge;
          else caps.badge = badge_val;
        }
        if (sub_type_val !== null) {
          if (sub_type_val === '') delete caps.sub_type;
          else caps.sub_type = sub_type_val;
        }
        if (pricing_hint_val !== null) {
          if (pricing_hint_val === '') delete caps.pricing_hint;
          else caps.pricing_hint = pricing_hint_val;
        }
        if (updates.capabilities) {
          let extraCaps = updates.capabilities;
          if (typeof extraCaps === 'string') {
            try { extraCaps = JSON.parse(extraCaps); } catch {}
          }
          if (typeof extraCaps === 'object' && extraCaps !== null && !Array.isArray(extraCaps)) {
            caps = { ...caps, ...extraCaps };
          }
        }

        const setClauses = ['capabilities = $1::jsonb'];
        const params = [JSON.stringify(caps)];
        let pIdx = 1;

        if (updates.supported_ratios !== undefined) {
          setClauses.push(`supported_ratios = $${++pIdx}::jsonb`);
          params.push(JSON.stringify(updates.supported_ratios));
        }
        if (updates.supported_resolutions !== undefined) {
          setClauses.push(`supported_resolutions = $${++pIdx}::jsonb`);
          params.push(JSON.stringify(updates.supported_resolutions));
        }
        if (updates.supported_durations !== undefined) {
          setClauses.push(`supported_durations = $${++pIdx}::jsonb`);
          params.push(JSON.stringify(updates.supported_durations));
        }

        params.push(id);
        await run(`
          UPDATE ai_studio.ai_models
          SET ${setClauses.join(', ')}
          WHERE id = $${++pIdx}
        `, params);
      } catch (err) {
        console.error('[updateModelConfig] error updating capabilities/ratios:', err.message);
      }
    }
  } catch (err) {
    console.error('[updateModelConfig] error updating ai_models:', err.message);
  }

  // 3. 若修改了额度或价格，同步写入 model_pricing
  if (updates.credits_price !== undefined || updates.cost_usd !== undefined) {
    try {
      await run(`
        INSERT INTO ai_studio.model_pricing (id, model_id, pricing_type, base_credits, updated_at)
        VALUES ($1, $2, 'fixed', $3, $4)
        ON CONFLICT (model_id) DO UPDATE SET
          base_credits = EXCLUDED.base_credits,
          updated_at = EXCLUDED.updated_at
      `, [`pr_${id}`, id, credits_price, timestamp]);
    } catch {}
  }

  // 4. 若传入了渠道配置变更（优先级或启用状态），同步更新 ai_studio.provider_models
  if (Array.isArray(updates.channel_routes || updates.channelRoutes)) {
    const routesToUpdate = updates.channel_routes || updates.channelRoutes;
    for (const cr of routesToUpdate) {
      if (cr && cr.id) {
        try {
          await run(`
            UPDATE ai_studio.provider_models
            SET priority = COALESCE($1, priority),
                enabled = COALESCE($2, enabled),
                updated_at = $3
            WHERE id = $4 AND model_id = $5
          `, [
            cr.priority !== undefined && Number.isFinite(Number(cr.priority)) ? Number(cr.priority) : null,
            cr.enabled !== undefined ? Boolean(cr.enabled) : null,
            timestamp,
            cr.id,
            id
          ]);
        } catch (routeErr) {
          console.error('[updateModelConfig] error updating provider_models route:', routeErr.message);
        }
      }
    }
  }

  return await getModelById(id, transaction);
}

export async function createModel(modelData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const timestamp = nowIso();
  const id = String(modelData.id || '').trim();
  const slug = id;
  const name = String(modelData.name || id).trim();
  const displayName = String(modelData.displayName || name).trim();
  const category = String(modelData.category || 'image').trim();
  const description = String(modelData.description || '').trim();
  const status = 'active';
  const sort = modelData.sort !== undefined ? Number(modelData.sort) : 1;
  const isFeatured = Boolean(modelData.isFeatured);
  const isPinned = Boolean(modelData.isPinned);
  const isVisible = modelData.isVisible !== undefined ? Boolean(modelData.isVisible) : false;
  const tier = modelData.tier || 'core';
  const capabilities = typeof modelData.capabilities === 'object' && modelData.capabilities ? { ...modelData.capabilities } : {};
  if (modelData.badge) capabilities.badge = String(modelData.badge).trim();
  if (modelData.subType || modelData.sub_type) capabilities.sub_type = String(modelData.subType || modelData.sub_type).trim();
  const pricingHint = String(modelData.pricingHint || modelData.pricing_hint || '').trim();
  if (pricingHint) capabilities.pricing_hint = pricingHint;
  capabilities.is_pinned = isPinned;

  const supportedResolutions = Array.isArray(modelData.supportedResolutions) ? modelData.supportedResolutions
    : Array.isArray(modelData.supported_resolutions) ? modelData.supported_resolutions : [];
  const supportedDurations = Array.isArray(modelData.supportedDurations) ? modelData.supportedDurations
    : Array.isArray(modelData.supported_durations) ? modelData.supported_durations : [];
  const supportedRatios = Array.isArray(modelData.supportedRatios) ? modelData.supportedRatios
    : Array.isArray(modelData.supported_ratios) ? modelData.supported_ratios : [];

  await run(`
    INSERT INTO ai_studio.ai_models (
      id, slug, name, display_name, category, description,
      status, sort, is_featured, is_pinned, is_visible, tier,
      capabilities, default_parameters, supported_resolutions, supported_durations,
      supported_ratios, supported_input_types, supported_output_types, auto_route_eligible,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12,
      $13::jsonb, '{}'::jsonb, $14::jsonb, $15::jsonb,
      $16::jsonb, '[]'::jsonb, '[]'::jsonb, FALSE,
      $17, $17
    )
  `, [
    id, slug, name, displayName, category, description,
    status, sort, isFeatured, isPinned, isVisible, tier,
    JSON.stringify(capabilities),
    JSON.stringify(supportedResolutions),
    JSON.stringify(supportedDurations),
    JSON.stringify(supportedRatios),
    timestamp
  ]);

  if (modelData.creditsPrice !== undefined) {
    await run(`
        INSERT INTO ai_studio.model_pricing (id, model_id, pricing_type, base_credits, updated_at)
        VALUES ($1, $2, 'fixed', $3, $4)
        ON CONFLICT (model_id) DO UPDATE SET
          base_credits = EXCLUDED.base_credits,
          updated_at = EXCLUDED.updated_at
      `, [`pr_${id}`, id, Number(modelData.creditsPrice), timestamp]);
  }

  try {
    await run(`
      INSERT INTO models_config (
        id, provider, name, type, cost_usd, credits_price, is_active, sort_order,
        tier, is_visible, auto_route_eligible, metadata_json, created_at, updated_at
      ) VALUES (
        $1, 'muapi', $2, $3, 0, $4, TRUE, $5,
        $6, $7, FALSE, $8::jsonb, $9, $9
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        credits_price = EXCLUDED.credits_price,
        sort_order = EXCLUDED.sort_order,
        tier = EXCLUDED.tier,
        is_visible = EXCLUDED.is_visible,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = EXCLUDED.updated_at
    `, [
      id, name, category, Number(modelData.creditsPrice || 20), sort,
      tier, isVisible, JSON.stringify(capabilities), timestamp
    ]);
  } catch {}

  return await getModelById(id, transaction);
}

export async function getModelWithOperations(modelId, transaction = null) {
  const runOne = transaction?.queryOne
    ? transaction.queryOne.bind(transaction)
    : async (...args) => await queryOne(...args);

  let row = null;
  try {
    row = await runOne(`
      SELECT m.id,
             COALESCE(legacy.provider, pm.provider_id, 'muapi') AS provider,
             COALESCE(m.name, m.display_name) AS name,
             m.display_name,
             m.category AS type,
             COALESCE((pm.cost_config->>'base_cost')::numeric, 0) AS cost_usd,
             pr.base_credits AS credits_price,
             pr.pricing_type AS pricing_type,
             (m.status = 'active') AS is_active,
             m.sort AS sort_order,
             COALESCE(m.tier, 'backup') AS tier,
             COALESCE(m.is_visible, true) AS is_visible,
             COALESCE(m.auto_route_eligible, false) AS auto_route_eligible,
             m.backup_model_id, m.backup_provider_id,
             COALESCE(m.capabilities, '{}'::jsonb) AS capabilities,
             COALESCE(m.capabilities, '{}'::jsonb) AS metadata_json,
             m.created_at, m.updated_at
      FROM ai_studio.ai_models m
      LEFT JOIN LATERAL (
        SELECT pricing_type, base_credits
        FROM ai_studio.model_pricing
        WHERE model_id = m.id AND is_active = TRUE
        ORDER BY updated_at DESC LIMIT 1
      ) pr ON TRUE
      LEFT JOIN LATERAL (
        SELECT provider_id, cost_config
        FROM ai_studio.provider_models
        WHERE model_id = m.id AND enabled = TRUE
        ORDER BY priority DESC, id ASC LIMIT 1
      ) pm ON TRUE
      LEFT JOIN ai_studio.models_config legacy ON legacy.id = m.id
      WHERE m.id = $1
    `, [modelId]);
  } catch {
    row = await runOne(`
      SELECT m.id,
             COALESCE(legacy.provider, pm.provider_id, 'muapi') AS provider,
             COALESCE(m.name, m.display_name) AS name,
             m.display_name,
             m.category AS type,
             COALESCE((pm.cost_config->>'base_cost')::numeric, 0) AS cost_usd,
             pr.base_credits AS credits_price,
             pr.pricing_type AS pricing_type,
             (m.status = 'active') AS is_active,
             m.sort AS sort_order,
             COALESCE(m.capabilities, '{}'::jsonb) AS capabilities,
             COALESCE(m.capabilities, '{}'::jsonb) AS metadata_json,
             m.created_at, m.updated_at
      FROM ai_studio.ai_models m
      LEFT JOIN LATERAL (
        SELECT pricing_type, base_credits
        FROM ai_studio.model_pricing
        WHERE model_id = m.id AND is_active = TRUE
        ORDER BY updated_at DESC LIMIT 1
      ) pr ON TRUE
      LEFT JOIN LATERAL (
        SELECT provider_id, cost_config
        FROM ai_studio.provider_models
        WHERE model_id = m.id AND enabled = TRUE
        ORDER BY priority DESC, id ASC LIMIT 1
      ) pm ON TRUE
      LEFT JOIN ai_studio.models_config legacy ON legacy.id = m.id
      WHERE m.id = $1
    `, [modelId]);
  }

  if (!row) row = await getModelById(modelId, transaction);
  if (!row) return null;

  const runMany = transaction?.queryMany
    ? transaction.queryMany.bind(transaction)
    : async (...args) => (await query(...args)).rows;

  const channels = await runMany(`
    SELECT pm.id, pm.model_id, pm.provider_id, pm.provider_model_id, pm.enabled,
           pm.priority, pm.cost_config, pm.metadata,
           p.name AS provider_name, p.provider_type, p.health_status, p.circuit_state,
           p.enabled AS provider_enabled
    FROM ai_studio.provider_models pm
    JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
    WHERE pm.model_id = $1
    ORDER BY pm.priority DESC, pm.id ASC
  `, [modelId]);

  return {
    ...row,
    tier: row.tier || (CORE_MODEL_IDS.has(row.id) ? 'core' : 'backup'),
    is_visible: row.is_visible !== undefined ? row.is_visible : CORE_MODEL_IDS.has(row.id),
    auto_route_eligible: row.auto_route_eligible !== undefined ? row.auto_route_eligible : CORE_MODEL_IDS.has(row.id),
    routes: channels.map((channel) => ({
      id: channel.id,
      providerId: channel.provider_id,
      providerSlug: channel.provider_id,
      providerName: channel.provider_name,
      providerType: channel.provider_type,
      providerModelId: channel.provider_model_id,
      priority: channel.priority,
      enabled: channel.enabled,
      providerEnabled: Boolean(channel.provider_enabled),
      healthStatus: channel.health_status,
      circuitState: channel.circuit_state,
      baseCost: channel.cost_config?.base_cost ?? null,
      currency: channel.cost_config?.currency || 'USD',
      costUsd: costUsdToNumber({
        baseCost: channel.cost_config?.base_cost ?? null,
        currency: channel.cost_config?.currency || 'USD',
      }),
      metadata: channel.metadata || {},
      isPrimary: isPrimaryChannel(channel),
    })),
  };
}

export async function listAvailableAppModels(type = 'image') {
  try {
    return await queryMany(`
      SELECT
        m.id, m.name, m.display_name, m.category,
        m.tier, m.description, m.sort,
        COALESCE(m.is_pinned, (m.capabilities->>'is_pinned')::boolean, false) AS is_pinned,
        COALESCE(mp.base_credits, 100) AS base_credits,
        COALESCE(mp.manual_override_price_cny, mp.auto_suggested_price_cny) AS site_price_cny,
        COALESCE(m.capabilities->'tags', '[]'::jsonb) AS tags,
        COALESCE(m.capabilities->'features', '[]'::jsonb) AS features,
        COALESCE(rc.approved_count, 0)::int AS available_routes
      FROM ai_studio.ai_models m
      LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = m.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE pm.enabled = true AND pm.review_status = 'approved')::int AS approved_count
        FROM ai_studio.provider_models pm WHERE pm.model_id = m.id
      ) rc ON TRUE
      WHERE m.category = $1
        AND m.status = 'active'
        AND m.is_visible = true
        AND m.tier IN ('core', 'backup')
        AND COALESCE(rc.approved_count, 0) > 0
      ORDER BY
        CASE WHEN COALESCE(m.is_pinned, (m.capabilities->>'is_pinned')::boolean, false) THEN 0 ELSE 1 END,
        CASE m.tier WHEN 'core' THEN 0 ELSE 1 END,
        m.sort ASC,
        m.created_at ASC
    `, [type]);
  } catch {
    return await queryMany(`
      SELECT
        m.id, m.name, m.display_name, m.category,
        m.tier, m.description, m.sort,
        COALESCE((m.capabilities->>'is_pinned')::boolean, false) AS is_pinned,
        COALESCE(mp.base_credits, 100) AS base_credits,
        COALESCE(mp.manual_override_price_cny, mp.auto_suggested_price_cny) AS site_price_cny,
        COALESCE(m.capabilities->'tags', '[]'::jsonb) AS tags,
        COALESCE(m.capabilities->'features', '[]'::jsonb) AS features,
        COALESCE(rc.approved_count, 0)::int AS available_routes
      FROM ai_studio.ai_models m
      LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = m.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE pm.enabled = true AND pm.review_status = 'approved')::int AS approved_count
        FROM ai_studio.provider_models pm WHERE pm.model_id = m.id
      ) rc ON TRUE
      WHERE m.category = $1
        AND m.status = 'active'
        AND m.is_visible = true
        AND m.tier IN ('core', 'backup')
        AND COALESCE(rc.approved_count, 0) > 0
      ORDER BY
        CASE WHEN COALESCE((m.capabilities->>'is_pinned')::boolean, false) THEN 0 ELSE 1 END,
        CASE m.tier WHEN 'core' THEN 0 ELSE 1 END,
        m.sort ASC,
        m.created_at ASC
    `, [type]);
  }
}

