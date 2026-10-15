import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listAdminCommunityPosts } from '@/lib/services/community';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentRead);
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  const result = await listAdminCommunityPosts({
    status: params.get('status') || '',
    mediaType: params.get('mediaType') || '',
    featured: params.get('featured') || '',
    q: params.get('q') || '',
    limit: params.get('limit') || 100,
  });

  return okResponse(result, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
