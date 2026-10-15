import { NextResponse } from 'next/server.js';
import { requirePermission, errorResponse, withAdminErrorBoundary } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { logAudit } from '@/lib/admin/audit';
import { exportPriceRows } from '@/lib/services/modelPriceImport.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;
  const format = new URL(request.url).searchParams.get('format') || 'csv';
  if (!['csv', 'xlsx'].includes(format)) return errorResponse('VALIDATION_ERROR', '仅支持 CSV 和 XLSX 导出', 422, guard.requestId);
  const result = await exportPriceRows(format);
  await logAudit({ actor: guard.user, action: 'model_control.export', targetType: 'model_pricing',
    targetId: `rows:${result.rows}`, riskLevel: 'low', after: { format, rows: result.rows }, requestId: guard.requestId });
  const contentType = format === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv; charset=utf-8';
  const filename = `supdance-model-pricing-${new Date().toISOString().slice(0, 10)}.${format}`;
  return new NextResponse(result.content, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Rows': String(result.rows),
    },
  });
}

export const GET = withAdminErrorBoundary(handleGET);
