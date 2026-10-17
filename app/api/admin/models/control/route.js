import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { logAudit } from '@/lib/admin/audit';
import { probeProviderChannel } from '@/lib/services/healthProbe.js';
import { getModelControlAuditSnapshot } from '@/lib/services/modelControlAudit.js';
import { publicErrorMessage } from '@/lib/security/publicError.js';
import {
  createExchangeRateSnapshot,
  approveProviderPrice,
  createCatalogMapping,
  previewSitePrice,
  getPricingControlSnapshot,
  publishSitePrice,
  reviewProviderMapping,
  setProviderEnabled,
  setModelRoutingPolicy,
  simulateModelRoute,
  stageProviderPrice,
  syncProviderBalance,
  syncProviderModelCatalog,
  syncProviderPrices,
  updateProviderMappingSpecification,
} from '@/lib/services/modelPricingControl.js';
import { applyPriceImport, parsePriceImport, previewPriceImport, rollbackPriceImport } from '@/lib/services/modelPriceImport.js';
import { updateModel, createModel } from '@/lib/services/models.js';
import { savePricingStrategy } from '@/lib/services/pricingStrategy.js';
import { upsertModelPricing } from '@/lib/repositories/aiCatalog.js';
import { invalidateActiveModelsCache } from '@/app/api/models/active/route.js';
import {
  findMatchingChannelCandidates,
} from '@/lib/modelCenter/smartChannelMatcher.js';
import {
  scanModelHygiene,
  mergeModelAlias,
  runFullHygieneSync,
} from '@/lib/services/modelHygiene.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;
  const url = new URL(request.url);
  return okResponse(await getPricingControlSnapshot({
    callFrom: url.searchParams.get('callsFrom'),
    callTo: url.searchParams.get('callsTo'),
  }), guard.requestId);
}

async function handlePOST(request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '').trim();
  const readOnly = ['simulate', 'preview_site_price', 'match_channel_candidates', 'hygiene_scan'].includes(action);
  const requiredPermission = readOnly ? PERMISSIONS.modelsRead
    : ['probe_health', 'provider_enabled', 'sync_models'].includes(action) ? PERMISSIONS.providersWrite : PERMISSIONS.modelsWrite;
  const guard = await requirePermission(request, requiredPermission,
    action === 'import_preview' ? { maxBodyBytes: 14 * 1024 * 1024 } : undefined);
  if (!guard.ok) return guard.response;

  if (readOnly) {
    if (action === 'hygiene_scan') {
      try {
        const data = await scanModelHygiene();
        return okResponse(data, guard.requestId);
      } catch (error) {
        return errorResponse(error.code || 'HYGIENE_SCAN_FAILED', publicErrorMessage(error, '模型治理体检扫描失败'), 422, guard.requestId);
      }
    }
    const targetModelId = String(body.modelId || body.id || '').trim();
    if (!targetModelId) return errorResponse('VALIDATION_ERROR', '规范模型 ID 为必填项', 422, guard.requestId);
    try {
      if (action === 'preview_site_price') {
        return okResponse({ preview: await previewSitePrice({ ...body, modelId: targetModelId, actor: guard.user }) }, guard.requestId);
      }
      if (action === 'match_channel_candidates') {
        const candidates = await findMatchingChannelCandidates({
          modelId: targetModelId,
          category: body.category,
          limit: body.limit || 5,
        });
        return okResponse({ candidates }, guard.requestId);
      }
      return okResponse({ simulation: await simulateModelRoute({ modelId: targetModelId, parameters: body.parameters || {} }) }, guard.requestId);
    }
    catch (error) { return errorResponse(error.code || 'SIMULATION_FAILED', publicErrorMessage(error, '路由模拟失败'), 422, guard.requestId); }
  }

  if (['bind_and_activate_channel', 'batch_auto_match_channels'].includes(action)) {
    return errorResponse('MAPPING_REVIEW_REQUIRED',
      '候选匹配仅供参考；请先创建待审核映射并核实模型身份、端点、能力与价格，再由管理员审核启用。',
      422, guard.requestId);
  }

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('IDEMPOTENCY_REQUIRED', '该管理写操作必须提供 Idempotency-Key', 422, guard.requestId);
  const idempotency = await checkIdempotency({ scope: `model_control:${action}`, key: idempotencyKey, actorId: guard.user.id });
  if (!idempotency.allowed) {
    if (idempotency.cachedResponse) return okResponse(idempotency.cachedResponse, guard.requestId);
    return errorResponse('IDEMPOTENCY_IN_PROGRESS', '相同操作正在处理，请稍后刷新状态', 409, guard.requestId);
  }

  try {
    let result;
    const before = await getModelControlAuditSnapshot(action, body);
    let targetType = 'model_control';
    let targetId = null;
    let auditAction = `model_control.${action}`;
    let riskLevel = 'medium';
    switch (action) {
      case 'sync_models':
        result = await syncProviderModelCatalog({ providerId: body.providerId, actor: guard.user, requestId: guard.requestId });
        targetType = 'ai_provider'; targetId = body.providerId; riskLevel = 'medium';
        break;
      case 'sync_prices':
        result = await syncProviderPrices({ providerId: body.providerId, actor: guard.user, requestId: guard.requestId });
        targetType = 'ai_provider'; targetId = body.providerId; riskLevel = 'high';
        break;
      case 'sync_balance':
        result = await syncProviderBalance({ providerId: body.providerId, actor: guard.user, requestId: guard.requestId });
        targetType = 'ai_provider'; targetId = body.providerId; riskLevel = 'medium';
        break;
      case 'map_catalog':
        result = await createCatalogMapping({ catalogEntryId: body.catalogEntryId, modelId: body.modelId, specification: body.specification || {}, actor: guard.user });
        targetType = 'provider_model'; targetId = result.id;
        break;
      case 'review_mapping':
        result = await reviewProviderMapping({ mappingId: body.mappingId, approved: body.approved === true, actor: guard.user, reason: body.reason || '' });
        targetType = 'provider_model'; targetId = body.mappingId; riskLevel = 'high';
        break;
      case 'update_mapping_spec':
        result = await updateProviderMappingSpecification({ mappingId: body.mappingId,
          specification: body.specification || {}, approve: body.approve === true,
          actor: guard.user, reason: body.reason || '' });
        targetType = 'provider_model'; targetId = body.mappingId; riskLevel = body.approve ? 'high' : 'medium';
        break;
      case 'stage_price':
        result = await stageProviderPrice({ ...body, actor: guard.user });
        targetType = 'provider_model_price_version'; targetId = result.id; riskLevel = 'high';
        break;
      case 'approve_price':
        result = await approveProviderPrice({ versionId: body.versionId, actor: guard.user });
        targetType = 'provider_model_price_version'; targetId = body.versionId; riskLevel = 'high';
        break;
      case 'publish_site_price': {
        result = await publishSitePrice({ ...body, actor: guard.user });
        targetType = 'model_site_price'; targetId = body.modelId; riskLevel = body.overrideReason ? 'high' : 'medium';
        break;
      }
      case 'provider_enabled':
        result = await setProviderEnabled({ providerId: body.providerId, enabled: body.enabled, actor: guard.user });
        targetType = 'ai_provider'; targetId = body.providerId; riskLevel = 'high';
        break;
      case 'routing_policy':
        result = await setModelRoutingPolicy({
          modelId: body.modelId,
          routingMode: body.routingMode,
          failoverEnabled: body.failoverEnabled,
        });
        targetType = 'routing_policy'; targetId = body.modelId; riskLevel = 'high';
        break;
      case 'pricing_strategy':
      case 'save_pricing_strategy': {
        const { baseMultiplier, minMarginRate, categoryMultipliers, tierMultipliers, specMultipliers } = body;
        if (!baseMultiplier || Number(baseMultiplier) < 1) {
          throw Object.assign(new Error('基准倍率不能小于 1'), { code: 'VALIDATION_ERROR' });
        }
        if (!minMarginRate || Number(minMarginRate) < 0.1 || Number(minMarginRate) > 0.9) {
          throw Object.assign(new Error('最低毛利率应在 10%-90% 之间'), { code: 'VALIDATION_ERROR' });
        }
        result = await savePricingStrategy(
          {
            baseMultiplier: Number(baseMultiplier),
            minMarginRate: Number(minMarginRate),
            categoryMultipliers: categoryMultipliers || {},
            tierMultipliers: tierMultipliers || {},
            specMultipliers: specMultipliers || {},
          },
          guard.user?.id
        );
        invalidateActiveModelsCache();
        targetType = 'pricing_strategy'; targetId = result?.id || 'default'; riskLevel = 'high';
        break;
      }
      case 'save_model_pricing':
      case 'update_model_pricing': {
        const modelId = body.modelId || body.model_id;
        if (!modelId) {
          throw Object.assign(new Error('modelId 为必填项'), { code: 'VALIDATION_ERROR' });
        }
        const baseCredits = Number(body.baseCredits ?? body.base_credits);
        if (!Number.isInteger(baseCredits) || baseCredits <= 0) {
          throw Object.assign(new Error('必须提供已核实的正整数积分价格'), { code: 'VALIDATION_ERROR' });
        }
        const pricingType = body.pricingType || body.pricing_type || 'fixed';
        const pricingMode = body.pricingMode || body.pricing_mode || 'auto';
        const manualOverridePriceCny = body.manualOverridePriceCny !== undefined && body.manualOverridePriceCny !== null
          ? Number(body.manualOverridePriceCny)
          : (pricingMode === 'manual' || pricingMode === 'locked') ? Number((baseCredits * 0.1).toFixed(4)) : null;
        const minGrossMarginRate = Number(body.minGrossMarginRate ?? body.min_gross_margin_rate ?? 0.3);

        const updated = await upsertModelPricing({
          model_id: modelId,
          pricing_type: pricingType,
          pricing_mode: pricingMode,
          base_credits: baseCredits,
          manual_override_price_cny: manualOverridePriceCny,
          price_locked: pricingMode === 'locked' || Boolean(body.priceLocked || body.price_locked),
          formula_config: body.formulaConfig || body.formula_config || {},
          subscription_discounts: {},
          min_credits: Number(body.minCredits ?? body.min_credits ?? 10),
          min_gross_margin_rate: minGrossMarginRate,
          is_active: body.isActive !== false && body.is_active !== false,
        });
        invalidateActiveModelsCache();
        result = updated;
        targetType = 'model_pricing'; targetId = modelId; riskLevel = 'high';
        break;
      }
      case 'update_model_tiering': {
        const updateRes = await updateModel({
          actor: guard.user,
          id: body.modelId,
          updates: {
            tier: body.tier,
            is_visible: body.isVisible ?? body.is_visible,
            auto_route_eligible: body.autoRouteEligible ?? body.auto_route_eligible,
            backup_model_id: body.backupModelId ?? body.backup_model_id,
            backup_provider_id: body.backupProviderId ?? body.backup_provider_id,
            is_active: body.isActive ?? body.is_active,
            provider: body.provider,
            credits_price: body.creditsPrice ?? body.credits_price,
            cost_usd: body.costUsd ?? body.cost_usd,
            display_name: body.displayName ?? body.display_name,
            description: body.description,
            sort: body.sort,
            is_featured: body.isFeatured ?? body.is_featured,
            is_pinned: body.isPinned ?? body.is_pinned,
            badge: body.badge,
            sub_type: body.subType ?? body.sub_type,
            category: body.category,
            supported_ratios: body.supportedRatios ?? body.supported_ratios,
            supported_resolutions: body.supportedResolutions ?? body.supported_resolutions,
            supported_durations: body.supportedDurations ?? body.supported_durations,
            capabilities: body.capabilities,
            channel_routes: body.channelRoutes || body.channel_routes,
            pricing_hint: body.pricingHint || body.pricing_hint,
          },
          requestId: guard.requestId,
        });
        if (updateRes.error) {
          throw Object.assign(new Error(updateRes.error), { code: 'MODEL_UPDATE_FAILED' });
        }
        invalidateActiveModelsCache();
        result = updateRes.model;
        targetType = 'ai_model'; targetId = body.modelId; riskLevel = 'medium';
        break;
      }
      case 'create_model': {
        const isVisible = body.isVisible !== undefined
          ? Boolean(body.isVisible)
          : (body.is_visible !== undefined ? Boolean(body.is_visible) : false);
        const pricingHint = body.pricingHint || body.pricing_hint || '';
        const createRes = await createModel({
          actor: guard.user,
          model: {
            id: body.modelId,
            name: body.name || body.displayName || body.modelId,
            displayName: body.displayName || body.name || body.modelId,
            category: body.category || 'image',
            description: body.description || '',
            badge: body.badge || 'New',
            subType: body.subType || body.sub_type || '',
            pricingHint,
            sort: body.sort !== undefined ? Number(body.sort) : 1,
            creditsPrice: body.creditsPrice !== undefined ? Number(body.creditsPrice) : undefined,
            isVisible,
            isPinned: Boolean(body.isPinned ?? body.is_pinned),
            isFeatured: Boolean(body.isFeatured ?? body.is_featured),
            tier: body.tier || (isVisible ? 'core' : 'backup'),
            supportedRatios: body.supportedRatios ?? body.supported_ratios,
            supportedResolutions: body.supportedResolutions ?? body.supported_resolutions,
            supportedDurations: body.supportedDurations ?? body.supported_durations,
            capabilities: body.capabilities,
          },
          requestId: guard.requestId,
        });
        if (createRes.error) {
          throw Object.assign(new Error(createRes.error), { code: 'MODEL_CREATE_FAILED' });
        }
        invalidateActiveModelsCache();
        result = createRes.model;
        targetType = 'ai_model'; targetId = body.modelId; riskLevel = 'medium';
        break;
      }
      case 'bulk_update_sort': {
        if (!Array.isArray(body.items) || body.items.length === 0) {
          throw Object.assign(new Error('items 数组不能为空'), { code: 'VALIDATION_ERROR' });
        }
        invalidateActiveModelsCache();
        const results = [];
        for (const item of body.items.slice(0, 100)) {
          const sortRes = await updateModel({
            actor: guard.user,
            id: item.modelId,
            updates: { sort: item.sort },
            requestId: guard.requestId,
          });
          if (sortRes.error) {
            results.push({ modelId: item.modelId, error: sortRes.error });
          } else {
            results.push({ modelId: item.modelId, sort: item.sort, ok: true });
          }
        }
        result = { updated: results.filter(r => r.ok).length, total: body.items.length, results };
        targetType = 'ai_model'; targetId = 'bulk_sort'; riskLevel = 'medium';
        break;
      }
      case 'exchange_rate':
        result = await createExchangeRateSnapshot({ ...body, actor: guard.user });
        targetType = 'exchange_rate_snapshot'; targetId = result.id; riskLevel = 'high';
        break;
      case 'probe_health':
        result = await probeProviderChannel(body.providerId);
        targetType = 'ai_provider'; targetId = body.providerId; riskLevel = 'low';
        break;
      case 'import_preview': {
        const rows = parsePriceImport({ format: body.format, content: body.content, base64: body.base64 });
        result = await previewPriceImport({ rows, sourceFilename: body.filename || '', actor: guard.user });
        targetType = 'model_price_import_batch'; targetId = result.batchId;
        break;
      }
      case 'import_apply':
        result = await applyPriceImport({ batchId: body.batchId, actor: guard.user });
        targetType = 'model_price_import_batch'; targetId = body.batchId; riskLevel = 'high';
        break;
      case 'import_rollback':
        result = await rollbackPriceImport({ batchId: body.batchId, actor: guard.user });
        targetType = 'model_price_import_batch'; targetId = body.batchId; riskLevel = 'high';
        break;
      case 'hygiene_merge': {
        const { sourceModelId, targetModelId } = body;
        if (!sourceModelId || !targetModelId) {
          throw Object.assign(new Error('缺少 sourceModelId 或 targetModelId'), { code: 'VALIDATION_ERROR' });
        }
        result = await mergeModelAlias({ sourceModelId, targetModelId, actor: guard.user });
        targetType = 'ai_model';
        targetId = targetModelId;
        riskLevel = 'medium';
        break;
      }
      case 'hygiene_sync': {
        const stats = await runFullHygieneSync();
        result = { stats };
        targetType = 'ai_model';
        targetId = 'all';
        riskLevel = 'high';
        break;
      }
      default:
        throw Object.assign(new Error('未知的模型定价操作'), { code: 'MODEL_CONTROL_ACTION_UNKNOWN' });
    }
    await logAudit({ actor: guard.user, action: auditAction, targetType, targetId, riskLevel,
      before, after: result, requestId: guard.requestId });
    await completeIdempotency(idempotency.keyHash, result);
    return okResponse({ result }, guard.requestId);
  } catch (error) {
    await releaseIdempotency(idempotency.keyHash);
    const status = ['MARGIN_OVERRIDE_FORBIDDEN', 'IMPORT_ACTOR_MISMATCH', 'EXCHANGE_RATE_PERMISSION_REQUIRED'].includes(error.code) ? 403 : 422;
    return errorResponse(error.code || 'MODEL_CONTROL_FAILED', publicErrorMessage(error, '模型控制操作失败'), status, guard.requestId);
  }
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
