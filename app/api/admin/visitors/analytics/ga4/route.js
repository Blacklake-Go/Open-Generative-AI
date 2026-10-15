import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getVisitorAnalyticsConfig } from '@/lib/services/visitorAnalytics';
import {
  resolveGa4Credentials,
  runGa4RealtimeReport,
  runGa4SummaryReport,
  testGa4DataApiConnection,
} from '@/lib/services/ga4DataApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/visitors/analytics/ga4
 * Pulls real GA4 metrics and reports via Google Analytics Data API (v1beta)
 */
async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '7d';

  // 1. Load config from DB
  const storedConfig = await getVisitorAnalyticsConfig();
  const ga4Config = storedConfig?.googleAnalytics || {};

  // 2. Resolve credentials combining DB config & environment variables
  const creds = resolveGa4Credentials({
    propertyId: ga4Config.propertyId,
    clientEmail: ga4Config.serviceAccountEmail,
    privateKey: ga4Config.serviceAccountPrivateKey,
  });

  if (!creds || !creds.propertyId) {
    return okResponse(
      {
        configured: false,
        measurementId: ga4Config.measurementId || '',
        propertyId: ga4Config.propertyId || '',
        hasCredentials: Boolean(creds?.clientEmail && creds?.privateKey),
        message: '尚未配置完整的 GA4 Property ID 或 Service Account 凭据',
      },
      guard.requestId
    );
  }

  // 3. Fetch real reports from GA4 Data API
  try {
    const [realtime, summary] = await Promise.all([
      runGa4RealtimeReport(creds).catch((err) => ({
        error: err.message,
        activeUsers: 0,
        topPages: [],
      })),
      runGa4SummaryReport(creds, range),
    ]);

    return okResponse(
      {
        configured: true,
        source: creds.source,
        propertyId: creds.propertyId,
        measurementId: ga4Config.measurementId || '',
        realtime,
        summary: summary.summary,
        topPages: summary.topPages,
        topCountries: summary.topCountries,
        fetchedAt: new Date().toISOString(),
      },
      guard.requestId
    );
  } catch (err) {
    return okResponse(
      {
        configured: true,
        propertyId: creds.propertyId,
        error: err?.message || '拉取 GA4 数据源失败',
        fetchedAt: new Date().toISOString(),
      },
      guard.requestId
    );
  }
}

/**
 * POST /api/admin/visitors/analytics/ga4
 * Tests connection to Google Analytics Data API with custom or saved credentials
 */
async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const storedConfig = await getVisitorAnalyticsConfig();
  const ga4Config = storedConfig?.googleAnalytics || {};

  const testParams = {
    propertyId: body.propertyId || ga4Config.propertyId,
    clientEmail: body.serviceAccountEmail || ga4Config.serviceAccountEmail,
    privateKey: body.serviceAccountPrivateKey || ga4Config.serviceAccountPrivateKey,
  };

  const result = await testGa4DataApiConnection(testParams);
  return okResponse(result, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
