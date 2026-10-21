import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listWebhookEvents } from '@/lib/services/adminRead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractOrderId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return (
    payload.order_id ||
    payload.orderId ||
    payload.out_trade_no ||
    payload.outTradeNo ||
    payload.data?.object?.metadata?.order_id ||
    payload.data?.object?.metadata?.orderId ||
    payload.data?.object?.id ||
    payload.resource?.custom_id ||
    payload.resource?.id ||
    payload.id ||
    null
  );
}

function resolveSignatureStatus(row) {
  if (row.status === 'rejected' && /签名|sign|verify/i.test(row.last_error || '')) {
    return '验签未通过';
  }
  if (row.status === 'processed' || row.status === 'received') {
    return '验签通过';
  }
  if (row.status === 'replayed') {
    return '已重放';
  }
  if (row.status === 'failed') {
    return '处理失败';
  }
  return row.status || '未知';
}

async function handleGET(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const searchParams = new URLSearchParams(request.nextUrl.searchParams);
  searchParams.set('provider', id);
  if (!searchParams.get('limit')) {
    searchParams.set('limit', '10');
  }

  const result = await listWebhookEvents(searchParams);
  const rows = (result.rows || []).map((row) => ({
    provider: row.provider,
    eventId: row.event_id,
    eventType: row.event_type || 'callback',
    status: row.status,
    signatureStatus: resolveSignatureStatus(row),
    orderId: extractOrderId(row.payload_json),
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    processedAt: row.processed_at,
  }));

  return okResponse(rows, guard.requestId, result.meta);
}

export const GET = withAdminErrorBoundary(handleGET);
