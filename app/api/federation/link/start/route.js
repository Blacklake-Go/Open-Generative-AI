import { getUserFromRequest, json } from '@/lib/services/auth';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/security/requestGuard';
import { beginAccountLink } from '@/lib/federation/accounts';
import { federationMutationGuard, federationErrorResponse, readFederationBody } from '@/lib/federation/http';

export const runtime = 'nodejs';
export async function POST(request) {
  const guarded = federationMutationGuard(request);
  if (guarded) return guarded;
  try {
    const user = await getUserFromRequest(request);
    const limit = await consumeRateLimit({ scope: 'federation.link', subject: user?.id || getClientIp(request), limit: 10, windowMs: 600000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    const body = await readFederationBody(request);
    const result = await beginAccountLink(user, request.cookies.get('ko_session')?.value, body.password);
    return json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return federationErrorResponse(error); }
}
