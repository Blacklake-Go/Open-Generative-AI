import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { readMetaSignedRequest, verifyMetaSignedRequest } from '@/lib/auth/metaSignedRequest.js';
import { removeInstagramIdentity } from '@/lib/services/instagramMetaCallbacks.js';
import { getResolvedOAuthConfig } from '@/lib/oauth.js';
import { consumeRateLimit, rateLimitResponse } from '@/lib/security/requestGuard.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, callback: 'instagram-deauthorize' });
}

export async function POST(request) {
  let config;
  try {
    config = await getResolvedOAuthConfig('instagram');
  } catch {
    return NextResponse.json({ error: 'Instagram callback is not configured' }, { status: 503 });
  }
  if (!config?.resolvedClientSecret || !config?.resolvedClientId) {
    return NextResponse.json({ error: 'Instagram callback is not configured' }, { status: 503 });
  }

  let userId;
  try {
    const signedRequest = await readMetaSignedRequest(request);
    ({ userId } = verifyMetaSignedRequest(
      signedRequest,
      config.resolvedClientSecret,
      config.resolvedClientId,
    ));
  } catch {
    return NextResponse.json({ error: 'Invalid Instagram deauthorization callback' }, { status: 400 });
  }

  try {
    const subject = crypto.createHash('sha256').update(userId).digest('hex');
    const limit = await consumeRateLimit({ scope: 'meta_instagram_deauthorize', subject, limit: 60, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    await removeInstagramIdentity(userId, { eventType: 'instagram_deauthorized' });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[instagram/deauthorize] callback persistence failed:', error?.code || 'unknown');
    return NextResponse.json({ error: 'Unable to process Instagram deauthorization callback' }, { status: 503 });
  }
}
