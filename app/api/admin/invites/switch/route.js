import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { isInviteCodeRequired, updateGlobalInviteSwitch } from '@/lib/services/inviteCodes';
import { getSettingByKey } from '@/lib/services/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.settingsRead);
  if (!guard.ok) return guard.response;

  const [isRequired, setting] = await Promise.all([
    isInviteCodeRequired(),
    getSettingByKey('invite_code_required').catch(() => null),
  ]);

  return okResponse({
    is_invite_code_required: isRequired,
    setting: setting?.value || null,
  }, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.settingsWrite);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) {
    return errorResponse('VALIDATION_ERROR', '切换全局开关必须提供有效的 Idempotency-Key', 422, guard.requestId);
  }

  const idemp = await checkIdempotency({ scope: 'invites_switch_update', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '开关切换请求正在处理中', 409, guard.requestId);
  }

  try {
    const body = await request.json();
    const enabled = Boolean(body.enabled);

    const result = await updateGlobalInviteSwitch(enabled, guard.user, guard.requestId);
    if (result.error) {
      await releaseIdempotency(idemp.keyHash);
      return errorResponse('SAVE_FAILED', result.error, 400, guard.requestId);
    }

    const payload = {
      success: true,
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: guard.user.email,
    };

    await completeIdempotency(idemp.keyHash, payload);
    return okResponse(payload, guard.requestId);
  } catch (error) {
    await releaseIdempotency(idemp.keyHash);
    console.error('[admin/invites/switch]', error);
    return errorResponse('INTERNAL_ERROR', '切换邀请码开关失败，请稍后重试', 500, guard.requestId);
  }
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
