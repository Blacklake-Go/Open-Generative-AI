import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { adoptPromptToCommunity } from '@/lib/services/xPromptCrawler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentWrite);
  if (!guard.ok) return guard.response;

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const { promptId, title } = body;
  if (!promptId) {
    return errorResponse('VALIDATION_ERROR', '缺少 promptId', 400, guard.requestId);
  }

  try {
    const result = await adoptPromptToCommunity({
      promptId,
      title,
      user: guard.user,
    });
    return okResponse(result, guard.requestId);
  } catch (err) {
    return errorResponse('ADOPT_FAILED', err.message || '采纳发布失败', 400, guard.requestId);
  }
}

export const POST = withAdminErrorBoundary(handlePOST);
