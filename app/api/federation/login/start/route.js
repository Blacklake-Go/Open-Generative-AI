import { getUserFromRequest, json } from '@/lib/services/auth';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/security/requestGuard';
import { beginMainLogin } from '@/lib/federation/login';
import { federationMutationGuard, federationErrorResponse, readFederationBody } from '@/lib/federation/http';

export const runtime = 'nodejs';
export async function POST(request) {
  const guarded = federationMutationGuard(request);
  if (guarded) return guarded;
  try {
    if (await getUserFromRequest(request)) return json({ error: '请从账户连接入口保留现有 ONE 账户与资产' }, { status: 409 });
    const limit = await consumeRateLimit({ scope: 'federation.login', subject: getClientIp(request), limit: 10, windowMs: 600000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    await readFederationBody(request);
    const result = await beginMainLogin();
    const response = json({ authorizeUrl: result.authorizeUrl }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set('__Host-supdance_federation_state', result.browserToken, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 300 });
    return response;
  } catch (error) { return federationErrorResponse(error); }
}
