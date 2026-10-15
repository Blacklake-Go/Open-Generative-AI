import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { getAllPlansConfig } from '@/lib/services/adminRead';
import { createPlan } from '@/lib/services/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.plansRead);
  if (!guard.ok) return guard.response;

  const plans = await getAllPlansConfig();
  return okResponse(plans, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.plansWrite);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) {
    return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  }

  const idemp = await checkIdempotency({ scope: 'plan_create', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '套餐创建正在处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = await createPlan({
    actor: guard.user,
    planId: body.id || body.planId,
    name: body.name,
    monthlyCny: body.monthlyCny,
    monthlyUsd: body.monthlyUsd,
    yearlyCny: body.yearlyCny,
    yearlyUsd: body.yearlyUsd,
    quarterlyCny: body.quarterlyCny,
    quarterlyUsd: body.quarterlyUsd,
    quotaBase: body.quotaBase,
    concurrency: body.concurrency,
    asyncConcurrency: body.asyncConcurrency,
    portraitCapacity: body.portraitCapacity,
    storageGb: body.storageGb,
    badge: body.badge,
    exclusiveFeatures: body.exclusiveFeatures,
    features: body.features,
    displayOrder: body.displayOrder,
    enabled: body.enabled,
    requestId: guard.requestId,
  });

  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse(result.error, guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, result.plan);
  return okResponse(result.plan, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
