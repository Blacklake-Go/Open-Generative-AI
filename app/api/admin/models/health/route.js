import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getChannelsHealthOverview } from '@/lib/services/circuitBreaker';
// 探针只保留一份实现：credential 探针没有网络往返，必须由 healthProbe 统一标注验证等级并双写 ops_bill。
import { probeProviderChannel } from '@/lib/services/healthProbe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;

  const channels = await getChannelsHealthOverview();
  return okResponse({ channels }, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const providerId = body.providerId || body.provider_id;

  if (!providerId) {
    return errorResponse('VALIDATION_ERROR', '请指定要探测的供应商 ID', 422, guard.requestId);
  }

  const result = await probeProviderChannel(providerId);
  return okResponse(result, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
