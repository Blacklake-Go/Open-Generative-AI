import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { errorResponse } from '@/lib/admin/authz';
import { getSubscriptionFaqConfig, saveSubscriptionFaqConfig, DEFAULT_SUBSCRIPTION_FAQ_CONFIG } from '@/lib/services/subscriptionFaq';

export const runtime = 'nodejs';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.plansRead);
  if (!guard.ok) return guard.response;
  const config = await getSubscriptionFaqConfig();
  return okResponse({ config, defaults: DEFAULT_SUBSCRIPTION_FAQ_CONFIG }, guard.requestId);
}

async function handlePUT(request) {
  const guard = await requirePermission(request, PERMISSIONS.plansWrite);
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json();
    const requestId = request.headers.get('x-request-id') || undefined;
    const result = await saveSubscriptionFaqConfig({
      actor: guard.user,
      config: body.config || body,
      requestId,
    });

    if (result.error) {
      return errorResponse('VALIDATION_ERROR', result.error, 400, guard.requestId);
    }

    return okResponse({ success: true, config: result.config }, guard.requestId);
  } catch (err) {
    console.error('[api/admin/subscription-faq] PUT error:', err);
    throw err;
  }
}

export const GET = withAdminErrorBoundary(handleGET);
export const PUT = withAdminErrorBoundary(handlePUT);
