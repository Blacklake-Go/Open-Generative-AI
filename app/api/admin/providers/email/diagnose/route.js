import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { runEmailSmtpDiagnostics } from '@/lib/emailAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;
  const key = getRequiredIdempotencyKey(request);
  if (!key) return errorResponse('VALIDATION_ERROR', '质量诊断请求必须提供 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'email_smtp_diagnose', key, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '邮件质量诊断正在处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  try {
    const result = await runEmailSmtpDiagnostics({ actor: guard.user, channel: body?.channel, requestId: guard.requestId });
    await completeIdempotency(idemp.keyHash, result);
    return okResponse(result, guard.requestId);
  } catch (error) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('DIAGNOSE_FAILED', error?.message || '发信质量诊断执行失败', 500, guard.requestId);
  }
}

export const POST = withAdminErrorBoundary(handlePOST);
