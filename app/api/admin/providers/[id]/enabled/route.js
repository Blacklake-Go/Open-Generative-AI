import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { logAudit } from '@/lib/admin/audit';
import { setPaymentProviderEnabled } from '@/lib/services/paymentProviders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const ALLOWED = new Set(['alipay', 'wechat', 'stripe', 'paypal']);

async function handlePUT(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  if (!ALLOWED.has(id)) return errorResponse('VALIDATION_ERROR', '不支持的支付渠道', 400, guard.requestId);
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '请提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'payment_provider_toggle', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '支付渠道状态正在更新', 409, guard.requestId);
  }
  let body = {};
  try { body = await request.json(); } catch {}
  if (typeof body.enabled !== 'boolean') {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', 'enabled 必须为布尔值', 422, guard.requestId);
  }
  try {
    const result = await setPaymentProviderEnabled({ actor: guard.user, provider: id, enabled: body.enabled });
    await logAudit({ actor: guard.user, action: 'providers.set_payment_enabled', targetType: 'provider', targetId: id, riskLevel: 'medium', after: result, requestId: guard.requestId });
    await completeIdempotency(idemp.keyHash, result);
    return okResponse(result, guard.requestId);
  } catch (error) {
    await releaseIdempotency(idemp.keyHash);
    throw error;
  }
}

export const PUT = withAdminErrorBoundary(handlePUT);
