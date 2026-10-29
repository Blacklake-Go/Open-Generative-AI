import { CREDIT_PRICING_POLICY } from '../pricing/creditPolicy.js';
import { summarizeChannelCosts } from './channelCostRange.js';
import 'server-only';

import { queryMany } from '../db/index.js';
import { getReportingFxSnapshot } from '../admin/financialReporting.js';

export function detectModelBrand(modelId = '', modelName = '') {
  const id = String(modelId || '').toLowerCase();
  const name = String(modelName || '').toLowerCase();

  if (id.includes('kling') || name.includes('kling') || name.includes('可灵')) {
    return '快手 (Kling)';
  }
  if (id.includes('flux') || name.includes('flux')) {
    return 'Black Forest Labs (FLUX)';
  }
  if (id.includes('seedream') || id.includes('seedance') || id.includes('doubao') || name.includes('字节') || name.includes('豆包') || name.includes('即梦')) {
    return '字节跳动 (ByteDance)';
  }
  if (id.includes('minimax') || id.includes('hailuo') || name.includes('海螺')) {
    return 'MiniMax (海螺 AI)';
  }
  if (id.includes('veo') || id.includes('imagen') || id.includes('google') || id.includes('gemini')) {
    return 'Google (DeepMind)';
  }
  if (id.includes('gpt') || id.includes('sora') || id.includes('dall') || id.includes('openai')) {
    return 'OpenAI';
  }
  if (id.includes('wan') || id.includes('qwen') || name.includes('万相') || name.includes('千问') || id.includes('alibaba')) {
    return '阿里巴巴 (通义万相)';
  }
  if (id.includes('suno') || name.includes('suno')) {
    return 'Suno (AI 音乐)';
  }
  if (id.includes('udio') || name.includes('udio')) {
    return 'Udio (AI 音乐)';
  }
  if (id.includes('midjourney') || id.includes('mj') || name.includes('midjourney')) {
    return 'Midjourney';
  }
  if (id.includes('hunyuan') || name.includes('混元')) {
    return '腾讯 (混元)';
  }
  if (id.includes('vidu') || name.includes('生数')) {
    return '生数科技 (Vidu)';
  }
  if (id.includes('cogvideo') || name.includes('智谱')) {
    return '智谱 AI (CogVideo)';
  }
  if (id.includes('topaz') || name.includes('topaz')) {
    return 'Topaz Labs';
  }
  if (id.includes('sd-') || id.includes('stability')) {
    return 'Stability AI';
  }
  return '全球精选 AI';
}

/**
 * 获取全量模型价格明细透视大表 (穿透渠道底价、折算售价与毛利率测算)
 */
export async function getModelPricingBreakdownList() {
  const fx = await getReportingFxSnapshot();
  /*
   * 渠道成本必须与运行时路由同口径：优先使用 active 价格版本的 price_config，
   * 缺失时才回退 provider_models.cost_config。旧实现只读 base_cost，迁移 022
   * 把视频成本改为 cost_per_output_second 后，后台会把真实成本显示为 0。
   * 渠道行一次取回，再按 model_id 分组在 JS 内用统一估算函数计算。
   */
  const [rows, channelRows] = await Promise.all([
    queryMany(`
      SELECT 
        m.id AS "modelId",
        COALESCE(m.display_name, m.name) AS "modelName",
        m.category,
        m.tier,
        m.status AS "modelStatus",
        COALESCE(m.is_visible, true) AS "isVisible",
        COALESCE(mp.pricing_type, 'fixed') AS "pricingType",
        COALESCE(mp.pricing_mode, 'auto') AS "pricingMode",
        mp.base_credits::int AS "baseCredits",
        COALESCE(mp.formula_config, '{}'::jsonb) AS "formulaConfig",
        COALESCE(mp.min_credits, 10)::int AS "minCredits",
        COALESCE(mp.min_gross_margin_rate, 0.3)::numeric AS "minGrossMarginRate",
        COALESCE(mp.price_locked, false) AS "manuallyLocked",
        mp.manual_override_price_cny AS "manualOverridePriceCny",
        m.updated_at AS "updatedAt"
      FROM ai_studio.ai_models m
      LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = m.id
      WHERE m.status != 'disabled'
      ORDER BY m.sort ASC, m.id ASC
    `),
    queryMany(`
      SELECT pm.model_id, pm.provider_id, pm.provider_model_id, pm.enabled,
             pm.priority, pm.cost_config,
             CASE WHEN pv.id IS NULL THEN NULL ELSE jsonb_build_object(
               'id', pv.id, 'version_no', pv.version_no, 'price_type', pv.price_type,
               'billing_unit', pv.billing_unit, 'currency', pv.currency,
               'price_config', pv.price_config, 'status', pv.status,
               'effective_at', pv.effective_at, 'expires_at', pv.expires_at
             ) END AS active_price_version
      FROM ai_studio.provider_models pm
      LEFT JOIN LATERAL (
        SELECT pv.* FROM ai_studio.provider_model_price_versions pv
        WHERE pv.provider_model_id = pm.id AND pv.status = 'active'
          AND pv.price_type IN ('account_actual','aggregator','manual')
        ORDER BY CASE pv.price_type WHEN 'account_actual' THEN 0 WHEN 'manual' THEN 1 ELSE 2 END,
          pv.version_no DESC
        LIMIT 1
      ) pv ON TRUE
      WHERE pm.enabled = TRUE
    `),
  ]);

  const channelsByModel = new Map();
  for (const channel of channelRows || []) {
    const list = channelsByModel.get(channel.model_id);
    if (list) list.push(channel);
    else channelsByModel.set(channel.model_id, [channel]);
  }

  return (rows || []).map((row) => {
    const brand = detectModelBrand(row.modelId, row.modelName);
    const cost = summarizeChannelCosts(channelsByModel.get(row.modelId) || [], {
      fxSnapshot: fx,
      category: row.category,
      modelId: row.modelId,
    });
    const minCostUsd = cost.minCostUsd;
    const minCostCny = cost.minCostCny;
    const baseCredits = row.baseCredits == null ? null : Number(row.baseCredits);
    // Use the same credit value as runtime quotes.
    const userPriceCny = baseCredits == null ? null : Number((baseCredits * CREDIT_PRICING_POLICY.cnyPerCredit).toFixed(4));
    const userPriceUsd = userPriceCny == null || !fx.usdToCny ? null : Number((userPriceCny / fx.usdToCny).toFixed(4));

    let grossMarginCny = null;
    let marginRate = null;
    let marginStatus = 'unknown';

    if (minCostCny !== null && userPriceCny !== null && userPriceCny > 0) {
      grossMarginCny = Number((userPriceCny - minCostCny).toFixed(4));
      marginRate = Number(((grossMarginCny / userPriceCny) * 100).toFixed(1));

      if (marginRate < 0) {
        marginStatus = 'loss'; // 成本倒挂亏损 (标红)
      } else if (marginRate < 30) {
        marginStatus = 'low'; // 低毛利预警 (标黄)
      } else if (marginRate < 50) {
        marginStatus = 'healthy'; // 健康毛利 (青色)
      } else {
        marginStatus = 'high'; // 高毛利 (绿色)
      }
    }

    return {
      modelId: row.modelId,
      modelName: row.modelName,
      category: row.category,
      brand,
      tier: row.tier,
      modelStatus: row.modelStatus,
      isVisible: row.isVisible,
      pricingType: row.pricingType,
      pricingMode: row.pricingMode,
      baseCredits,
      minCredits: Number(row.minCredits || 10),
      minGrossMarginRate: Number(row.minGrossMarginRate || 0.3),
      manuallyLocked: Boolean(row.manuallyLocked),
      manualOverridePriceCny: row.manualOverridePriceCny ? Number(row.manualOverridePriceCny) : null,
      channelCount: cost.channelCount,
      pricedChannels: cost.pricedChannels,
      unpricedChannels: cost.unpricedChannels,
      priceVersionChannels: cost.priceVersionChannels,
      costConfigChannels: cost.costConfigChannels,
      unpricedReasons: cost.unpricedReasons,
      minCostUsd,
      minCostCny,
      maxCostUsd: cost.maxCostUsd,
      maxCostCny: cost.maxCostCny,
      minCostChannel: cost.minCostChannel,
      costBasis: cost.costBasis,
      userPriceCny,
      userPriceUsd,
      grossMarginCny,
      marginRate,
      marginStatus,
      formulaConfig: row.formulaConfig || {},
      updatedAt: row.updatedAt,
    };
  });
}

/**
 * 获取当前前端模型矩阵 (C 端 Studio 展示与售卖态览)
 */
export async function getFrontendModelsMatrixList() {
  const rows = await queryMany(`
    SELECT
      m.id,
      m.name,
      m.display_name AS "displayName",
      m.category,
      m.description,
      m.status,
      m.tier,
      COALESCE(m.is_visible, true) AS "isVisible",
      COALESCE(m.is_featured, false) AS "isFeatured",
      COALESCE(m.is_pinned, (m.capabilities->>'is_pinned')::boolean, false) AS "isPinned",
      COALESCE((m.capabilities->>'is_default')::boolean, false) AS "isDefault",
      COALESCE(m.capabilities->>'badge', '') AS badge,
      COALESCE(m.capabilities->>'pricing_hint', '') AS "pricingHint",
      m.capabilities,
      COALESCE(m.sort, 100)::int AS sort,
      mp.base_credits::int AS "baseCredits",
      COALESCE(rc.channel_count, 0)::int AS "channelCount",
      COALESCE(rc.healthy_count, 0)::int AS "healthyCount"
    FROM ai_studio.ai_models m
    LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = m.id
    LEFT JOIN LATERAL (
      SELECT 
        COUNT(*)::int AS channel_count,
        COUNT(*) FILTER (WHERE pm.enabled = true)::int AS healthy_count
      FROM ai_studio.provider_models pm
      WHERE pm.model_id = m.id AND pm.enabled = true
    ) rc ON true
    WHERE m.status != 'disabled'
    ORDER BY m.sort ASC, m.id ASC
  `);

  return (rows || []).map((row) => {
    const brand = detectModelBrand(row.id, row.displayName || row.name);
    
    // 映射到所属 Studio 工作室
    let studioId = 'ImageStudio';
    let studioLabel = '图像创作 (ImageStudio)';
    if (row.category.includes('video')) {
      studioId = 'VideoStudio';
      studioLabel = '视频创作 (VideoStudio)';
    } else if (row.category.includes('audio') || row.category.includes('music')) {
      studioId = 'AudioStudio';
      studioLabel = '音频音乐 (AudioStudio)';
    } else if (row.category.includes('workflow') || row.category.includes('agent')) {
      studioId = 'WorkflowStudio';
      studioLabel = '工作流 (WorkflowStudio)';
    }

    // 默认 C 端扣费提示说明
    let pricingHint = row.baseCredits == null ? '未定价' : row.pricingHint;
    if (!pricingHint) {
      if (row.category.includes('video')) {
        pricingHint = `基础 ${row.baseCredits} 算力 (5秒视频)`;
      } else if (row.category.includes('audio') || row.category.includes('music')) {
        pricingHint = `基础 ${row.baseCredits} 算力 / 全曲`;
      } else {
        pricingHint = `基础 ${row.baseCredits} 算力 / 张`;
      }
    }

    return {
      id: row.id,
      name: row.name,
      displayName: row.displayName || row.name,
      category: row.category,
      brand,
      studioId,
      studioLabel,
      pricingHint,
      badge: row.badge,
      sort: row.sort,
      baseCredits: row.baseCredits,
      isVisible: Boolean(row.isVisible),
      isPinned: Boolean(row.isPinned),
      isDefault: Boolean(row.isDefault),
      isFeatured: Boolean(row.isFeatured),
      status: row.status,
      tier: row.tier,
      channelCount: Number(row.channelCount || 0),
      healthyCount: Number(row.healthyCount || 0),
    };
  });
}
