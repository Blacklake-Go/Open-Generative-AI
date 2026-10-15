import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import {
  getVisitorAnalyticsConfig,
  saveVisitorAnalyticsConfig,
  validateVisitorAnalyticsConfig,
  DEFAULT_VISITOR_ANALYTICS,
  OFFICIAL_CONSOLE_LINKS,
} from '@/lib/services/visitorAnalytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  const config = await getVisitorAnalyticsConfig();

  return okResponse(
    {
      config,
      defaults: DEFAULT_VISITOR_ANALYTICS,
      links: OFFICIAL_CONSOLE_LINKS,
    },
    guard.requestId
  );
}

async function handlePOST(request) {
  // Check usersUpdate (preferred for visitor analytics under users-access) or settingsWrite
  let guard = await requirePermission(request, PERMISSIONS.usersUpdate);
  if (!guard.ok) {
    guard = await requirePermission(request, PERMISSIONS.settingsWrite);
  }
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) {
    return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  }

  const idemp = await checkIdempotency({
    scope: 'visitor_analytics_update',
    key: idempotencyKey,
    actorId: guard.user.id,
  });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '访客分析设置更新正在处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '请求体必须为合法 JSON', 400, guard.requestId);
  }

  const rawConfig = body.config || body;
  const validation = validateVisitorAnalyticsConfig(rawConfig);
  if (!validation.valid) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', validation.errors.join('; '), 422, guard.requestId);
  }

  try {
    const saved = await saveVisitorAnalyticsConfig({
      actor: guard.user,
      config: rawConfig,
      requestId: guard.requestId,
    });

    const responsePayload = {
      config: saved,
      links: OFFICIAL_CONSOLE_LINKS,
    };

    await completeIdempotency(idemp.keyHash, responsePayload);
    return okResponse(responsePayload, guard.requestId);
  } catch (err) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse(err?.message || '保存访客分析配置失败', guard.requestId);
  }
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
