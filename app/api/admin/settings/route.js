import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { getSystemSettingsList, saveSystemSetting } from '@/lib/services/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.settingsRead);
  if (!guard.ok) return guard.response;

  const settings = await getSystemSettingsList();
  return okResponse(settings, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.settingsWrite);
  if (!guard.ok) return guard.response;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'system_setting_update', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '系统设置更新正在处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  if (body.key === 'canvas_model_config') {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '无限画布配置请在专用控制面板中修改', 422, guard.requestId);
  }

  /* --- [TEMPORARY PLUGIN: china-ip-block START] --- */
  if (body.action === 'test_china_ip') {
    await releaseIdempotency(idemp.keyHash);
    const { testIpAddress } = await import('@/plugins/china-ip-block/index.js');
    return okResponse(testIpAddress(body.ip), guard.requestId);
  }
  /* --- [TEMPORARY PLUGIN: china-ip-block END] --- */

  const result = await saveSystemSetting({
    actor: guard.user,
    key: body.key,
    value: body.value,
    visibility: body.visibility || 'private',
    requestId: guard.requestId,
  });

  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse(result.error, guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, result.setting);
  return okResponse(result.setting, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
