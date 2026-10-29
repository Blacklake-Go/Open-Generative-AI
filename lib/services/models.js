import { assertModelPublicationAccess } from './modelPublicationAccess.js';
import { logAudit } from '../admin/audit.js';
import { hasProviderAdapter } from '../adapters/index.js';
import { withTransaction } from '../db/index.js';
import * as modelsRepo from '../repositories/models.js';
import { listPublicModelProviderRoutes } from '../repositories/dependencyHealth.js';
import { getServerProviderApiKey } from './providerSecrets.js';
import { assessPublicModelProviderReadiness } from './dependencyHealth.js';
import { costUsdToNumber } from '../modelCenter/routing.js';
import { isSelectablePublicModel, selectPublicModels } from '../modelCenter/publicDirectory.js';
import { evaluateModelAvailability } from '../modelCenter/availability.js';
import { projectReadyRouteCapabilities } from '../modelCenter/publicCapabilities.js';

export async function getAllModelsOverview() {
  return await modelsRepo.listAllModels();
}

export function isPublicProviderRouteReady(route, configuredProviders = new Set(), now = Date.now()) {
  if (!route?.model_id || !route.mapping_id) return false;
  const readiness = assessPublicModelProviderReadiness([route], {
    credentialProviders: configuredProviders,
    adapterProviders: configuredProviders,
    requiredCategories: [],
    now,
  });
  return readiness.coveredModels === 1;
}

export async function listActiveModels() {
  const models = await modelsRepo.listActiveModels({ scope: 'visible' });
  const providerCredentials = new Map();

  async function checkProvider(prov) {
    const provider = String(prov || 'runninghub').trim().toLowerCase();
    if (!providerCredentials.has(provider)) {
      let configured = false;
      try {
        configured = Boolean(await getServerProviderApiKey({ provider }))
          && hasProviderAdapter(provider);
      } catch {
        configured = false;
      }
      providerCredentials.set(provider, configured);
    }
    return providerCredentials.get(provider);
  }

  let routeRows = [];
  try {
    routeRows = await listPublicModelProviderRoutes();
  } catch {
    // A stale or unavailable route snapshot must never be projected as sellable.
    console.error('[models] Provider route eligibility unavailable; failing closed.');
  }

  const routeProviders = [...new Set(routeRows
    .map((route) => String(route.provider_id || '').trim().toLowerCase())
    .filter(Boolean))];
  const routeProviderResults = await Promise.all(routeProviders.map(async (provider) => ({
    provider,
    configured: await checkProvider(provider),
  })));
  const configuredRouteProviders = new Set(routeProviderResults
    .filter((result) => result.configured)
    .map((result) => result.provider));

  const readyRoutesByModel = new Map();
  for (const route of routeRows) {
    if (!isPublicProviderRouteReady(route, configuredRouteProviders)) continue;
    const key = String(route.model_id);
    if (!readyRoutesByModel.has(key)) readyRoutesByModel.set(key, []);
    readyRoutesByModel.get(key).push(route);
  }

  const visibleModels = [];
  for (const model of models) {
    const primaryProv = String(model.provider || '').trim().toLowerCase();
    const readyRoutes = readyRoutesByModel.get(String(model.id)) || [];
    const available = [...new Set(readyRoutes
      .map((route) => String(route.provider_id || '').trim().toLowerCase())
      .filter(Boolean))];
    const workingProvider = available.includes(primaryProv) ? primaryProv : available[0] || null;
    const hasWorkingRoute = available.length > 0;

    visibleModels.push({
      ...model,
      provider: workingProvider || primaryProv || model.available_providers?.[0] || 'muapi',
      available_providers: available,
      hasWorkingRoute,
      generation_capabilities: projectReadyRouteCapabilities(readyRoutes),
      auto_route_eligible: Boolean(model.auto_route_eligible && model.is_active
        && Number(model.credits_price) > 0 && hasWorkingRoute),
    });
  }

  return visibleModels;
}

export async function findModelByEndpointOrId(key) {
  return modelsRepo.findModelByEndpointOrId(key);
}

export async function updateModel({ actor, id, updates, requestId }) {
  if (updates.name !== undefined && (typeof updates.name !== 'string' || updates.name.trim().length < 1 || updates.name.trim().length > 120)) {
    return { error: '模型名称必须为 1–120 个字符' };
  }
  for (const [field, label] of [['cost_usd', '成本价'], ['credits_price', '额度价格'], ['sort_order', '排序值']]) {
    if (updates[field] !== undefined && (!Number.isFinite(Number(updates[field])) || Number(updates[field]) < 0)) {
      return { error: `${label}必须是大于等于 0 的有效数字` };
    }
  }
  if (updates.credits_price !== undefined && !Number.isInteger(Number(updates.credits_price))) return { error: '额度价格必须是整数' };
  if (updates.sort_order !== undefined && !Number.isInteger(Number(updates.sort_order))) return { error: '排序值必须是整数' };
  if (updates.is_active !== undefined && typeof updates.is_active !== 'boolean') return { error: '模型启用状态格式无效' };
  if (updates.tier !== undefined && !['core', 'backup', 'experimental', 'disabled'].includes(String(updates.tier).toLowerCase())) {
    return { error: '模型分级必须为 core, backup, experimental 或 disabled' };
  }
  if (updates.is_visible !== undefined && typeof updates.is_visible !== 'boolean') {
    return { error: '模型前台可见性必须为布尔值' };
  }
  if (updates.auto_route_eligible !== undefined && typeof updates.auto_route_eligible !== 'boolean') {
    return { error: '自动路由参与标记必须为布尔值' };
  }
  if (updates.backup_model_id !== undefined && updates.backup_model_id !== null && typeof updates.backup_model_id !== 'string') {
    return { error: '备用模型 ID 格式无效' };
  }
  if (updates.backup_provider_id !== undefined && updates.backup_provider_id !== null && typeof updates.backup_provider_id !== 'string') {
    return { error: '备用供应商 ID 格式无效' };
  }
  if (updates.display_name !== undefined && (typeof updates.display_name !== 'string' || updates.display_name.trim().length > 128)) {
    return { error: '展示名称不能超过 128 个字符' };
  }
  if (updates.description !== undefined && typeof updates.description !== 'string') {
    return { error: '模型描述格式无效' };
  }
  if (updates.sort !== undefined && (!Number.isInteger(Number(updates.sort)) || Number(updates.sort) < 0)) {
    return { error: '排序值必须是大于等于 0 的整数' };
  }
  if (updates.is_featured !== undefined && typeof updates.is_featured !== 'boolean') {
    return { error: '推荐标记必须为布尔值' };
  }
  if (updates.is_pinned !== undefined && typeof updates.is_pinned !== 'boolean') {
    return { error: '置顶标记必须为布尔值' };
  }
  if (updates.badge !== undefined && updates.badge !== null && typeof updates.badge !== 'string') {
    return { error: '徽章标签格式无效' };
  }
  if (updates.sub_type !== undefined && updates.sub_type !== null && typeof updates.sub_type !== 'string') {
    return { error: '子类型格式无效' };
  }
  if (updates.category !== undefined && (typeof updates.category !== 'string' || !updates.category.trim())) {
    return { error: '模型分类格式无效' };
  }
  if (updates.supported_ratios !== undefined && updates.supported_ratios !== null && !Array.isArray(updates.supported_ratios)) {
    return { error: '支持画幅比例格式必须为数组' };
  }
  if (updates.supported_resolutions !== undefined && updates.supported_resolutions !== null && !Array.isArray(updates.supported_resolutions)) {
    return { error: '支持分辨率格式必须为数组' };
  }
  if (updates.supported_durations !== undefined && updates.supported_durations !== null && !Array.isArray(updates.supported_durations)) {
    return { error: '支持时长格式必须为数组' };
  }
  if (updates.capabilities !== undefined && updates.capabilities !== null && typeof updates.capabilities !== 'object') {
    return { error: '模型能力特性格式必须为对象' };
  }
  if (updates.channel_routes !== undefined && updates.channel_routes !== null && !Array.isArray(updates.channel_routes)) {
    return { error: '渠道路由配置必须为数组' };
  }
  return await withTransaction(async (tx) => {
    const previous = await modelsRepo.getModelById(id, tx);
    if (!previous) return { error: '未找到指定模型配置' };
    const updated = await modelsRepo.updateModelConfig(id, updates, tx);
    await logAudit({
      actor,
      action: 'models.update',
      targetType: 'model',
      targetId: id,
      riskLevel: 'medium',
      after: {
        previous: {
          cost_usd: previous.cost_usd,
          credits_price: previous.credits_price,
          is_active: previous.is_active,
          tier: previous.tier,
          is_visible: previous.is_visible,
          auto_route_eligible: previous.auto_route_eligible,
        },
        updated: {
          cost_usd: updated.cost_usd,
          credits_price: updated.credits_price,
          is_active: updated.is_active,
          tier: updated.tier,
          is_visible: updated.is_visible,
          auto_route_eligible: updated.auto_route_eligible,
        },
      },
      requestId,
      transaction: tx,
    });
    return { success: true, model: updated };
  });
}

export async function createModel({ actor, model, requestId }) {
  if (!model || !model.id || typeof model.id !== 'string' || !model.id.trim()) {
    return { error: '模型 ID 为必填项' };
  }
  if (model.creditsPrice !== undefined && (!Number.isInteger(Number(model.creditsPrice)) || Number(model.creditsPrice) <= 0)) {
    return { error: '积分价格必须为已核实的正整数' };
  }
  return await withTransaction(async (tx) => {
    if (await modelsRepo.getModelById(model.id, tx)) {
      return { error: '模型 ID 已存在，请使用编辑或映射审核流程' };
    }
    const created = await modelsRepo.createModel(model, tx);
    await logAudit({
      actor,
      action: 'models.create',
      targetType: 'model',
      targetId: model.id,
      riskLevel: 'medium',
      after: {
        id: created.id,
        name: created.name,
        category: created.category,
        is_visible: created.is_visible,
      },
      requestId,
      transaction: tx,
    });
    return { success: true, model: created };
  });
}

/**
 * 给「模型 + 渠道」快照补上美元报价与毛利率。
 *
 * 估值口径由调用方传入（resolveCreditValuation 解析一次），因为切换主渠道的
 * 事务要在同一个数字下回读前后两版；在展示层再换算一次就会出现同一笔消耗
 * 两个毛利率。无成本来源时 marginPct 返回 null，而不是显示 0% 的假利润。
 *
 * 报价与成本一样必须能被证伪：formula 计价的 base_credits 只是下限，旧实现
 * 把它乘成 priceUsd 会低估售价、把毛利算高；缺成本来源的渠道此前被 `|| 0`
 * 折成 0 成本，等于把「没配成本」显示成「100% 利润」。两者一律返回 null。
 */
export function decorateModel(row, usdPerCredit, fxSnapshot = null) {
  if (!row) return null;
  const routes = Array.isArray(row.routes) ? row.routes : [];
  const fixed = !row.pricing_type || String(row.pricing_type) === 'fixed';
  const creditsPrice = Number(row.credits_price);
  const priceUsd = fixed && Number.isFinite(creditsPrice) && creditsPrice > 0 && Number(usdPerCredit) > 0
    ? Number((creditsPrice * Number(usdPerCredit || 0)).toFixed(6))
    : null;

  const channels = routes.map((route) => {
    const costUsd = costUsdToNumber({...route,fxSnapshot});
    return {
      ...route,
      costUsd,
      priceUsd,
      profitUsd: priceUsd != null && costUsd != null
        ? Number((priceUsd - costUsd).toFixed(6))
        : null,
      marginPct: priceUsd > 0 && costUsd > 0
        ? Number((((priceUsd - costUsd) / priceUsd) * 100).toFixed(2))
        : null,
    };
  });

  const primary = channels.find((channel) => channel.isPrimary) || null;
  return {
    ...row,
    routes: channels,
    channels,
    priceUsd,
    primaryChannelId: primary ? primary.id : null,
    primaryProviderId: primary ? primary.providerId : null,
  };
}

export async function listAvailableAppModels(type = 'image') {
  const models = await listActiveModels();
  return selectPublicModels(models, type);
}

export async function assertPublicModelOrderable(modelId, {userId=null,site='main'} = {}) {
  const models = await listActiveModels();
  let model = models.find((row) => String(row.id) === String(modelId));
  if (!model && modelId) {
    const resolved = await modelsRepo.findModelByEndpointOrId(modelId);
    const targetId = resolved?.backup_model_id || resolved?.id;
    model = models.find((row) => String(row.id) === String(targetId) || String(row.id) === String(resolved?.id));
  }
  if (!isSelectablePublicModel(model)) {
    const availability = evaluateModelAvailability(model);
    throw Object.assign(new Error(`该模型当前未通过公开目录准入：${availability.reasons[0] || '未知原因'}，请选择其他可用模型`), {
      code: 'MODEL_NOT_PUBLICLY_AVAILABLE',
      reasonCodes: availability.reasonCodes,
    });
  }
  await assertModelPublicationAccess(model,{userId,site});
  return model;
}
