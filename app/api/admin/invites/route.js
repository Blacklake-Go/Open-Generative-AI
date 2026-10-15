import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import {
  listAdminInviteCodesWithHabits,
  getInviteStatsOverview,
  batchGenerateInviteCodes,
} from '@/lib/services/inviteCodes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  const url = request.nextUrl;
  const status = url.searchParams.get('status') || null;
  const search = url.searchParams.get('search') || '';
  const page = Number(url.searchParams.get('page')) || 1;
  const pageSize = Number(url.searchParams.get('pageSize')) || 20;

  const [listResult, overview] = await Promise.all([
    listAdminInviteCodesWithHabits({ status, search, page, pageSize }),
    getInviteStatsOverview(),
  ]);

  return okResponse({
    ...listResult,
    overview,
  }, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.usersUpdate);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) {
    return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  }

  const idemp = await checkIdempotency({ scope: 'invites_batch_create', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '邀请码批量创建正在处理中', 409, guard.requestId);
  }

  try {
    const body = await request.json();
    const count = Math.max(1, Math.min(100, Number(body.count) || 1));
    const maxUses = Math.max(1, Math.min(10000, Number(body.maxUses) || 1));
    const notes = String(body.notes || '').trim().slice(0, 500);
    const expiresDays = body.expiresDays ? Math.max(1, Number(body.expiresDays)) : null;

    const created = await batchGenerateInviteCodes({
      count,
      maxUses,
      notes,
      createdBy: guard.user.email || 'admin',
      expiresDays,
    });

    const result = {
      codes: created,
      count: created.length,
    };

    await completeIdempotency(idemp.keyHash, result);
    return okResponse(result, guard.requestId);
  } catch (error) {
    await releaseIdempotency(idemp.keyHash);
    console.error('[admin/invites/create]', error);
    return errorResponse('INTERNAL_ERROR', '邀请码生成操作暂时不可用，请稍后重试', 500, guard.requestId);
  }
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
