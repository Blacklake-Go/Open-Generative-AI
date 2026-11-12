import { NextResponse } from 'next/server.js';
import { createSession, setSessionCookie, getUserFromRequest, json } from '@/lib/services/auth';
import { completeMainLogin } from '@/lib/federation/login';
import { federationMutationGuard, federationErrorResponse, readFederationBody } from '@/lib/federation/http';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';
export async function POST(request) {
  const guarded = federationMutationGuard(request, { fromMain: true });
  if (guarded) return guarded;
  try {
    const limit = await consumeRateLimit({ scope: 'federation.login.complete', subject: getClientIp(request), limit: 20, windowMs: 600000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    if (await getUserFromRequest(request)) return json({ error: '请从账户连接入口保留现有 ONE 账户与资产' }, { status: 409 });
    const form = await readFederationBody(request, { form: true });
    const userId = await completeMainLogin(request.cookies.get('__Host-supdance_federation_state')?.value, form.get('assertion'));
    const session = await createSession(userId);
    const response = NextResponse.redirect(new URL('/account/connected', process.env.SUPDANCE_ONE_ORIGIN || 'https://one.supdance.com'), { status: 303 });
    setSessionCookie(response, session.token, session.expires, request);
    response.cookies.set('__Host-supdance_federation_state', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) { return federationErrorResponse(error); }
}
