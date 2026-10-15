import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getInviteCodeUserHabits } from '@/lib/services/inviteCodes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request, { params }) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  const resolvedParams = await params;
  const id = resolvedParams?.id;
  if (!id) return errorResponse('NOT_FOUND', '邀请码 ID 不能为空', 400, guard.requestId);

  try {
    const users = await getInviteCodeUserHabits(id);
    return okResponse({ users }, guard.requestId);
  } catch (error) {
    console.error('[admin/invites/users]', error);
    return errorResponse('INTERNAL_ERROR', '获取邀请码用户习惯数据失败', 500, guard.requestId);
  }
}

export const GET = withAdminErrorBoundary(handleGET);
