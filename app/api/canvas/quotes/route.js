import { getUserFromRequest } from '@/lib/services/auth';
import { createGenerationQuote } from '@/lib/services/pricingEngine';
import { getActiveSubscription } from '@/lib/application/dataAccess.js';
import { listActiveModels } from '@/lib/services/models';
import { getCanvasAllowedModelIds } from '@/lib/services/canvasModelConfig';
import { isCanvasServerCapabilityEnabled } from '@/lib/canvas/capabilityPolicy';
import { consumeRateLimit, rateLimitResponse } from '@/lib/security/requestGuard';
import { canvasJson, canvasMutationGuard, canvasPreflight, readCanvasJson, canvasResponse } from '@/lib/canvas/http';
import { getCanvasSessionOwnerConflict } from '@/lib/canvas/sessionOwner';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request) {
  return canvasPreflight(request, 'POST, OPTIONS');
}

export async function POST(request) {
  const guarded = canvasMutationGuard(request);
  if (guarded) return guarded;
  let user;
  try {
    user = await getUserFromRequest(request);
  } catch (error) {
    return canvasJson(request, {
      error: publicErrorMessage(error, '登录状态暂时无法确认，请稍后重试'),
      code: 'AUTH_SESSION_UNAVAILABLE',
    }, { status: 503 });
  }
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const limit = await consumeRateLimit({ scope: 'canvas_quote_user', subject: user.id, limit: 60, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return canvasResponse(request, rateLimitResponse(limit));
    const body = await readCanvasJson(request);
    const ownerConflict = getCanvasSessionOwnerConflict(user.id, body.expectedOwnerUserId);
    if (ownerConflict) return canvasJson(request, ownerConflict, { status: 409 });
    const modelId = String(body.modelId || '').trim();
    const idempotencyKey = String(request.headers.get('idempotency-key') || '').trim();
    if (!modelId) return canvasJson(request, { error: '必须指定模型 ID', code: 'MODEL_ID_REQUIRED' }, { status: 422 });
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return canvasJson(request, { error: '报价请求必须提供有效的幂等键', code: 'IDEMPOTENCY_REQUIRED' }, { status: 422 });
    }
    const catalog = await listActiveModels();
    const model = catalog.find((item) => item.id === modelId);
    if (!model) {
      return canvasJson(request, { error: '模型当前不可用', code: 'MODEL_NOT_AVAILABLE' }, { status: 404 });
    }
    if (!isCanvasServerCapabilityEnabled(model.type)) {
      return canvasJson(request, { error: 'Canvas 当前仅开放已验证的图片生成能力', code: 'CANVAS_CAPABILITY_DISABLED' }, { status: 422 });
    }
    const allowed = await getCanvasAllowedModelIds({ userId: user.id });
    if (!allowed.has(modelId)) {
      return canvasJson(request, { error: '该模型未挂载到无限画布', code: 'CANVAS_MODEL_UNMOUNTED' }, { status: 404 });
    }
    // A failed entitlement lookup must not silently quote this user at the Free tier.
    const subscription = await getActiveSubscription(user.id);
    const quote = await createGenerationQuote({
      userId: user.id,
      modelId,
      parameters: body.parameters && typeof body.parameters === 'object' ? body.parameters : {},
      subscriptionLevel: subscription?.plan_id || 'free',
      idempotencyKey,
    });
    return canvasJson(request, {
      quote_id: quote.quoteId,
      credits: quote.credits,
      pricing_breakdown: quote.pricingBreakdown,
      expires_at: quote.expiresAt,
    }, { status: 201 });
  } catch (error) {
    const status = error.code === 'MODEL_NOT_FOUND' || error.code === 'MODEL_NOT_AVAILABLE' || error.code === 'CANVAS_MODEL_UNMOUNTED' ? 404
      : error.code === 'QUOTE_IDEMPOTENCY_CONFLICT' ? 409
        : error.code === 'BODY_TOO_LARGE' ? 413
          : error.code === 'INVALID_JSON' ? 400
            : ['MODEL_PRICING_UNCONFIGURED', 'SITE_PRICE_NOT_EFFECTIVE', 'SITE_PRICE_EXPIRED', 'PRICING_MARGIN_BELOW_FLOOR'].includes(error.code) ? 422
              : 503;
    return canvasJson(request, {
      error: publicErrorMessage(error, '暂时无法确认可靠报价，请稍后重试'),
      code: error.code || 'QUOTE_FAILED',
    }, { status });
  }
}
