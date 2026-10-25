import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { readMetaSignedRequest, verifyMetaSignedRequest } from '@/lib/auth/metaSignedRequest.js';
import { getPublicAppOrigin, getResolvedOAuthConfig } from '@/lib/oauth.js';
import { getInstagramDataDeletionStatus, removeInstagramIdentity } from '@/lib/services/instagramMetaCallbacks.js';
import { consumeRateLimit, rateLimitResponse } from '@/lib/security/requestGuard.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const code = new URL(request.url).searchParams.get('code');
  if (!code) return NextResponse.json({ ok: true, callback: 'instagram-data-deletion' });

  try {
    const status = await getInstagramDataDeletionStatus(code);
    if (!status) return NextResponse.json({ error: 'Deletion request not found' }, { status: 404 });
    return NextResponse.json({
      confirmation_code: code,
      status: 'completed',
      completed_at: status.created_at,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to check deletion request' }, { status: 503 });
  }
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
    return NextResponse.json({ error: 'Invalid Instagram data deletion callback' }, { status: 400 });
  }

  const confirmationCode = crypto.randomBytes(12).toString('hex');
  try {
    const subject = crypto.createHash('sha256').update(userId).digest('hex');
    const limit = await consumeRateLimit({ scope: 'meta_instagram_data_deletion', subject, limit: 10, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    await removeInstagramIdentity(userId, {
      eventType: 'instagram_data_deletion_completed',
      confirmationCode,
    });

    const statusUrl = new URL('/api/auth/oauth/instagram/data-deletion', getPublicAppOrigin(request));
    statusUrl.searchParams.set('code', confirmationCode);
    return NextResponse.json({ url: statusUrl.toString(), confirmation_code: confirmationCode });
  } catch (error) {
    console.error('[instagram/data-deletion] callback persistence failed:', error?.code || 'unknown');
    return NextResponse.json({ error: 'Unable to process Instagram data deletion callback' }, { status: 503 });
  }
}
