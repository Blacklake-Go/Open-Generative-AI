import { NextResponse } from 'next/server.js';
import { getUserFromRequest } from '@/lib/services/auth';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/security/requestGuard';
import { completeAccountLink } from '@/lib/federation/accounts';
import { federationMutationGuard, federationErrorResponse, readFederationBody } from '@/lib/federation/http';

export const runtime = 'nodejs';
export async function POST(request) {
  const guarded = federationMutationGuard(request, { fromMain: true });
  if (guarded) return guarded;
  try {
    const user = await getUserFromRequest(request);
    const limit = await consumeRateLimit({ scope: 'federation.complete', subject: user?.id || getClientIp(request), limit: 10, windowMs: 600000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    const form = await readFederationBody(request, { form: true });
    await completeAccountLink(user, request.cookies.get('ko_session')?.value, form.get('assertion'));
    return NextResponse.redirect(new URL('/account/connected', process.env.SUPDANCE_ONE_ORIGIN || 'https://one.supdance.com'),
      { status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) { return federationErrorResponse(error); }
}
