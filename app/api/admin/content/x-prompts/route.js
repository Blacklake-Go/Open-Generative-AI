import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getCrawledPrompts, deletePromptItem } from '@/lib/services/xPromptCrawler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentRead);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || 'all';
  const q = searchParams.get('q') || '';
  const status = searchParams.get('status') || 'all';
  const author = searchParams.get('author') || 'all';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '24', 10);

  const result = await getCrawledPrompts({ category, q, status, author, page, pageSize });
  return okResponse(result, guard.requestId);
}

async function handleDELETE(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentWrite);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return errorResponse('VALIDATION_ERROR', '缺少提示词记录 ID', 400, guard.requestId);
  }

  await deletePromptItem(id, guard.user.email);
  return okResponse({ success: true, id }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const DELETE = withAdminErrorBoundary(handleDELETE);
