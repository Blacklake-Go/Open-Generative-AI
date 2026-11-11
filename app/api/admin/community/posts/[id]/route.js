import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { updateCommunityPostForAdmin } from '@/lib/services/community';
import { publicCommunityFailure } from '@/lib/community/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePATCH(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.contentWrite);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) {
    return errorResponse('VALIDATION_ERROR', '作品管理写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  }

  const idemp = await checkIdempotency({
    scope: 'community_post_update',
    key: idempotencyKey,
    actorId: guard.user.id,
  });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '社区作品更新正在处理中', 409, guard.requestId);
  }

  const { id } = await context.params;
  let body = {};
  try {
    body = await request.json();
  } catch {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '请求内容无效', 422, guard.requestId);
  }

  let post;
  try { post = await updateCommunityPostForAdmin(id, {
    title: body.title,
    description: body.description,
    modelName: body.modelName,
    tags: body.tags,
    status: body.status,
    isFeatured: body.isFeatured,
    moderationReason: body.moderationReason,
  }, { actor: guard.user, expectedVersion: body.expectedVersion });
  } catch (error) {
    await releaseIdempotency(idemp.keyHash);
    const failure = publicCommunityFailure(error);
    if (failure) return errorResponse(failure.code, failure.message, failure.status, guard.requestId);
    throw error;
  }

  if (!post) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse('社区作品不存在', guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, post);
  return okResponse(post, guard.requestId);
}

export const PATCH = withAdminErrorBoundary(handlePATCH);
