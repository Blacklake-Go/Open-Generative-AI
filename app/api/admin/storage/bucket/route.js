import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import {
  getBucketAdminOverview,
  saveBucketAdminCredentials,
  updateBucketAdminConfig,
} from '@/lib/services/storageBucketAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.storageRead);
  if (!guard.ok) return guard.response;
  return okResponse(await getBucketAdminOverview(), guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.storageWrite);
  if (!guard.ok) return guard.response;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);

  let body = {};
  try {
    body = await request.json();
  } catch {}
  const action = String(body.action || '');

  if (action !== 'credentials.save' && action !== 'config.update') {
    return errorResponse('VALIDATION_ERROR', '不支持的桶级配置操作', 422, guard.requestId);
  }

  const section = action === 'config.update' ? String(body.section || '') : '';
  const idemp = await checkIdempotency({
    scope: `storage_bucket_admin_${action}${section ? `_${section}` : ''}`,
    key: idempotencyKey,
    actorId: guard.user.id,
  });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '桶级配置更新正在处理中', 409, guard.requestId);
  }

  try {
    let payload;
    if (action === 'credentials.save') {
      payload = await saveBucketAdminCredentials({
        accessKeyId: body.accessKeyId,
        accessKeySecret: body.accessKeySecret,
        actorEmail: guard.user.email || 'system',
      });
    } else {
      payload = {
        overview: await updateBucketAdminConfig({
          section,
          value: body.value,
          actorEmail: guard.user.email || 'system',
        }),
      };
    }
    await completeIdempotency(idemp.keyHash, payload);
    return okResponse(payload, guard.requestId);
  } catch (error) {
    await releaseIdempotency(idemp.keyHash).catch(() => {});
    const status = Number(error?.statusCode) || 422;
    return errorResponse(error?.code || 'BUCKET_ADMIN_UPDATE_FAILED', String(error?.message || '桶级配置更新失败').slice(0, 300), status, guard.requestId);
  }
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
