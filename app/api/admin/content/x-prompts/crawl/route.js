import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { executeTwitterCrawl } from '@/lib/services/xPromptCrawler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentWrite);
  if (!guard.ok) return guard.response;

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const category = body.category || 'all';
  const limit = parseInt(body.limit || '15', 10);
  const targetAuthor = body.targetAuthor ? body.targetAuthor.trim() : '';

  const result = await executeTwitterCrawl({
    category,
    limit,
    targetAuthor,
    userEmail: guard.user.email,
  });

  if (!result.success) {
    return errorResponse(result.error || 'CRAWL_FAILED', result.message || '抓取失败', 400, guard.requestId);
  }

  return okResponse(result, guard.requestId);
}

export const POST = withAdminErrorBoundary(handlePOST);
