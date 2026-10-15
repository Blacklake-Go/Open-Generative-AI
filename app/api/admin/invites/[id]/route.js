import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { setInviteCodeStatus } from '@/lib/services/inviteCodes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePATCH(request, { params }) {
  const guard = await requirePermission(request, PERMISSIONS.usersUpdate);
  if (!guard.ok) return guard.response;

  const resolvedParams = await params;
  const id = resolvedParams?.id;
  if (!id) return errorResponse('NOT_FOUND', '邀请码 ID 不能为空', 400, guard.requestId);

  try {
    const body = await request.json();
    const status = body.status;
    if (!['active', 'disabled'].includes(status)) {
      return errorResponse('VALIDATION_ERROR', '无效的状态，仅支持 active 或 disabled', 400, guard.requestId);
    }

    await setInviteCodeStatus(id, status);
    return okResponse({ success: true, id, status }, guard.requestId);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', '更新邀请码状态失败', 500, guard.requestId);
  }
}

export const PATCH = withAdminErrorBoundary(handlePATCH);
