import 'server-only';

import { queryMany, queryOne, execute, nowIso, randomId } from '../db/index.js';
import { BRANDS, resolveBrand, getBrandById } from '../modelCenter/brandDictionary.js';

/**
 * 获取各供应商关联的品牌分布统计（用于供应商卡片展示与快速透视）
 * 返回 Map: providerId -> { totalModels, totalBrands, topBrands: [{ id, shortName, count }], allBrands }
 */
export async function getProviderBrandStats() {
  try {
    const rows = await queryMany(`
      SELECT
        pm.provider_id,
        pm.id AS channel_id,
        pm.model_id,
        pm.provider_model_id,
        pm.enabled,
        m.name,
        m.display_name,
        m.category,
        m.capabilities
      FROM ai_studio.provider_models pm
      JOIN ai_studio.ai_models m ON m.id = pm.model_id
      ORDER BY pm.provider_id ASC
    `);

    const statsMap = new Map();

    for (const r of rows) {
      const pid = r.provider_id;
      if (!statsMap.has(pid)) {
        statsMap.set(pid, {
          totalModels: 0,
          brandCounts: new Map(),
        });
      }

      const pEntry = statsMap.get(pid);
      pEntry.totalModels++;

      const brand = resolveBrand(r);
      const bCount = (pEntry.brandCounts.get(brand.id) || 0) + 1;
      pEntry.brandCounts.set(brand.id, bCount);
    }

    const resultMap = {};
    for (const [pid, data] of statsMap.entries()) {
      const brandsList = Array.from(data.brandCounts.entries()).map(([bid, count]) => {
        const b = getBrandById(bid);
        return {
          id: bid,
          name: b.name,
          shortName: b.shortName,
          badge: b.badge,
          tone: b.tone,
          logoUrl: b.logoUrl,
          iconText: b.iconText,
          count,
        };
      });

      // 按模型数量从多到少排序
      brandsList.sort((a, b) => b.count - a.count);

      resultMap[pid] = {
        totalModels: data.totalModels,
        totalBrands: brandsList.length,
        topBrands: brandsList.slice(0, 3),
        brandsList,
      };
    }

    return resultMap;
  } catch (error) {
    console.error('[modelBrands] Failed to get provider brand stats:', error.message);
    return {};
  }
}

/**
 * 获取品牌模型明细页面完整数据（支持跨供应商与单供应商深钻）
 */
export async function getBrandModelsPageData({ providerId = null } = {}) {
  const [providersRaw, channelsRaw, canonicalModelsRaw] = await Promise.all([
    queryMany(`
      SELECT p.id, p.slug, p.name, p.provider_type, p.enabled, p.priority,
             p.health_status, p.circuit_state, p.base_url, p.api_mode,
             COUNT(pm.id)::int AS bound_models_count
      FROM ai_studio.ai_providers p
      LEFT JOIN ai_studio.provider_models pm ON pm.provider_id = p.id
      GROUP BY p.id
      ORDER BY p.priority DESC, p.id ASC
    `),
    queryMany(`
      SELECT
        pm.id,
        pm.model_id,
        pm.provider_id,
        pm.provider_model_id,
        pm.provider_endpoint,
        pm.enabled,
        pm.priority,
        pm.cost_config,
        pm.review_status,
        pm.created_at,
        pm.updated_at,
        m.name AS model_name,
        m.display_name,
        m.category,
        m.capabilities,
        m.status AS canonical_status,
        p.name AS provider_name,
        p.provider_type,
        p.health_status,
        p.circuit_state
      FROM ai_studio.provider_models pm
      JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
      JOIN ai_studio.ai_models m ON m.id = pm.model_id
      ORDER BY pm.priority DESC, pm.created_at DESC
    `),
    queryMany(`
      SELECT id, name, display_name, category, capabilities, status
      FROM ai_studio.ai_models
      WHERE status != 'disabled'
      ORDER BY sort ASC, id ASC
    `),
  ]);

  // 给每条 channel 挂上归属品牌
  const channels = channelsRaw.map((row) => {
    const brand = resolveBrand({
      id: row.model_id,
      name: row.model_name,
      display_name: row.display_name,
      capabilities: row.capabilities,
      provider_model_id: row.provider_model_id,
    });
    return {
      id: row.id,
      modelId: row.model_id,
      providerId: row.provider_id,
      providerName: row.provider_name,
      providerType: row.provider_type,
      providerModelId: row.provider_model_id,
      providerEndpoint: row.provider_endpoint || '',
      enabled: Boolean(row.enabled),
      priority: Number(row.priority ?? 100),
      costConfig: row.cost_config || {},
      reviewStatus: row.review_status || 'approved',
      modelName: row.model_name,
      displayName: row.display_name || row.model_name,
      category: row.category,
      healthStatus: row.health_status || 'healthy',
      circuitState: row.circuit_state || 'closed',
      brandId: brand.id,
      brandName: brand.name,
      brandShortName: brand.shortName,
      brandTone: brand.tone,
      brandLogoUrl: brand.logoUrl,
      brandIconText: brand.iconText,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  // 格式化可用候选模型（供快速挂载抽屉下拉选择）
  const canonicalCandidates = canonicalModelsRaw.map((m) => {
    const brand = resolveBrand(m);
    return {
      id: m.id,
      name: m.name,
      displayName: m.display_name || m.name,
      category: m.category,
      brandId: brand.id,
      brandShortName: brand.shortName,
    };
  });

  return {
    providers: providersRaw,
    channels,
    canonicalCandidates,
    allBrands: BRANDS,
    selectedProviderId: providerId || 'all',
  };
}

/**
 * 快速挂载/新增品牌模型至指定供应商
 */
export async function bindBrandModel({
  providerId,
  modelId,
  providerModelId,
  priority = 100,
  baseCost = 0.01,
  currency = 'USD',
  providerEndpoint = '',
  enabled = true,
  transaction = null,
}) {
  const cleanProviderId = String(providerId || '').trim().toLowerCase();
  const cleanModelId = String(modelId || '').trim().toLowerCase();
  const cleanProviderModelId = String(providerModelId || '').trim();

  if (!cleanProviderId || !cleanModelId || !cleanProviderModelId) {
    throw new Error('providerId, modelId, and providerModelId are required non-empty strings');
  }

  const parsedCost = Number(baseCost);
  const cleanBaseCost = Number.isFinite(parsedCost) && parsedCost >= 0 ? parsedCost : 0.01;
  const parsedPriority = Number(priority);
  const cleanPriority = Number.isFinite(parsedPriority) ? Math.round(parsedPriority) : 100;
  const cleanCurrency = String(currency || 'USD').trim().toUpperCase() || 'USD';

  const now = nowIso();
  const newId = `pm_${cleanModelId.replace(/[^a-zA-Z0-9_]/g, '_')}_${cleanProviderId}_${randomId(6)}`;

  const costConfig = JSON.stringify({
    currency: cleanCurrency,
    base_cost: cleanBaseCost,
    pricing_source: 'manual_admin_binding',
  });

  const runOne = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;

  const row = await runOne(`
    INSERT INTO ai_studio.provider_models (
      id, model_id, provider_id, provider_model_id, provider_endpoint,
      enabled, priority, cost_config, review_status, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'approved', $9, $9
    )
    ON CONFLICT (model_id, provider_id, provider_model_id)
    DO UPDATE SET
      provider_endpoint = EXCLUDED.provider_endpoint,
      priority = EXCLUDED.priority,
      cost_config = EXCLUDED.cost_config,
      review_status = EXCLUDED.review_status,
      enabled = EXCLUDED.enabled,
      updated_at = EXCLUDED.updated_at
    RETURNING id
  `, [
    newId,
    cleanModelId,
    cleanProviderId,
    cleanProviderModelId,
    providerEndpoint || '',
    Boolean(enabled),
    cleanPriority,
    costConfig,
    now,
  ]);

  return {
    success: true,
    id: row?.id || newId,
    providerId: cleanProviderId,
    modelId: cleanModelId,
    providerModelId: cleanProviderModelId,
  };
}

/**
 * 切换渠道模型启用/禁用
 */
export async function toggleChannelModel(channelId, enabled) {
  const cleanId = String(channelId || '').trim();
  if (!cleanId) {
    throw new Error('channelId is required');
  }
  const now = nowIso();
  const row = await queryOne(`
    UPDATE ai_studio.provider_models
    SET enabled = $1, updated_at = $2
    WHERE id = $3
    RETURNING id, enabled
  `, [Boolean(enabled), now, cleanId]);
  if (!row) {
    throw new Error(`Channel model not found: ${cleanId}`);
  }
  return { success: true, channelId: cleanId, enabled: Boolean(enabled) };
}

/**
 * 修改渠道模型优先级
 */
export async function updateChannelPriority(channelId, priority) {
  const cleanId = String(channelId || '').trim();
  if (!cleanId) {
    throw new Error('channelId is required');
  }
  const parsedPriority = Number(priority);
  const cleanPriority = Number.isFinite(parsedPriority) ? Math.round(parsedPriority) : 100;
  const now = nowIso();
  const row = await queryOne(`
    UPDATE ai_studio.provider_models
    SET priority = $1, updated_at = $2
    WHERE id = $3
    RETURNING id, priority
  `, [cleanPriority, now, cleanId]);
  if (!row) {
    throw new Error(`Channel model not found: ${cleanId}`);
  }
  return { success: true, channelId: cleanId, priority: cleanPriority };
}

/**
 * 解除/删除渠道模型挂载
 */
export async function unbindChannelModel(channelId) {
  const cleanId = String(channelId || '').trim();
  if (!cleanId) {
    throw new Error('channelId is required');
  }
  const row = await queryOne(`
    DELETE FROM ai_studio.provider_models
    WHERE id = $1
    RETURNING id
  `, [cleanId]);
  if (!row) {
    throw new Error(`Channel model not found: ${cleanId}`);
  }
  return { success: true, channelId: cleanId };
}
