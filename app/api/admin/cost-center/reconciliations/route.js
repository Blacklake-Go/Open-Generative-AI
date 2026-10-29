import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { logAudit } from '@/lib/admin/audit';
import {
  getProviderCostRecord,
  listCostReconciliationEvents,
  listCostReconciliationQueue,
  reconcileProviderCostRecord,
} from '@/lib/repositories/costRecords';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// README for operators:
// - GET lists records whose provider cost is not yet reconciled (or one record
//   with its decision history). Unknown costs stay NULL in every amount field.
// - POST records a human reconciliation decision. It never changes the user's
//   credits, the provider-reported actual_cost_usd or credits_charged; the
//   reconciled amount is stored separately together with evidence and reason.

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.billingRead);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const costRecordId = String(searchParams.get('cost_record_id') || '').trim();
  const status = String(searchParams.get('status') || '').trim() || null;
  const limit = searchParams.get('limit') || 50;

  if (costRecordId) {
    const record = await getProviderCostRecord(costRecordId);
    if (!record) {
      return errorResponse('COST_RECORD_NOT_FOUND', `成本记录 ${costRecordId} 不存在`, 404, guard.requestId);
    }
    return okResponse({
      record,
      events: await listCostReconciliationEvents(costRecordId, { limit }),
    }, guard.requestId);
  }

  return okResponse({
    rows: await listCostReconciliationQueue({ status, limit }),
    status: status || null,
  }, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.billingWrite);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) {
    return errorResponse('VALIDATION_ERROR', '成本对账必须提供有效的 Idempotency-Key', 422, guard.requestId);
  }

  const idemp = await checkIdempotency({
    scope: 'provider_cost_reconcile',
    key: idempotencyKey,
    actorId: guard.user.id,
  });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '该成本对账请求正在处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const costRecordId = typeof body.costRecordId === 'string' ? body.costRecordId.trim() : '';
  if (!costRecordId) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '必须提供 costRecordId', 422, guard.requestId);
  }

  const before = await getProviderCostRecord(costRecordId);
  if (!before) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('COST_RECORD_NOT_FOUND', `成本记录 ${costRecordId} 不存在`, 404, guard.requestId);
  }

  let result;
  try {
    result = await reconcileProviderCostRecord({
      costRecordId,
      status: body.status,
      reconciledCostUsd: body.reconciledCostUsd ?? null,
      evidenceRef: body.evidenceRef ?? null,
      varianceReason: body.varianceReason ?? null,
      actorId: guard.user.id,
    });
  } catch (error) {
    await releaseIdempotency(idemp.keyHash);
    if (error?.code === 'COST_RECORD_NOT_FOUND') {
      return errorResponse('COST_RECORD_NOT_FOUND', error.message, 404, guard.requestId);
    }
    if (error?.code === 'COST_RECONCILIATION_INVALID') {
      return errorResponse('VALIDATION_ERROR', error.message, 422, guard.requestId);
    }
    throw error;
  }

  await logAudit({
    actor: guard.user,
    action: 'cost.reconcile',
    targetType: 'provider_cost_record',
    targetId: costRecordId,
    riskLevel: 'medium',
    before: {
      status: before.reconciliation_status,
      estimatedCostUsd: before.estimated_cost_usd,
      providerReportedCostUsd: before.actual_cost_usd,
      reconciledCostUsd: before.reconciled_cost_usd,
      evidenceRef: before.billing_evidence_ref,
      varianceReason: before.variance_reason,
    },
    after: {
      status: result.status,
      estimatedCostUsd: before.estimated_cost_usd,
      providerReportedCostUsd: result.providerReportedCostUsd,
      reconciledCostUsd: result.reconciledCostUsd,
      varianceUsd: result.varianceUsd,
      evidenceRef: result.evidenceRef,
      varianceReason: result.varianceReason,
      eventId: result.eventId,
    },
    requestId: guard.requestId,
  });

  await completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
