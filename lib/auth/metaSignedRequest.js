import crypto from 'node:crypto';

const MAX_SIGNED_REQUEST_BODY_LENGTH = 16 * 1024;

export async function readMetaSignedRequest(request) {
  const rawBody = await request.text();
  if (!rawBody || rawBody.length > MAX_SIGNED_REQUEST_BODY_LENGTH) {
    throw new Error('Invalid Meta callback body');
  }

  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  let signedRequest = null;

  if (contentType.includes('application/json')) {
    try {
      const body = JSON.parse(rawBody);
      signedRequest = body?.signed_request;
    } catch {
      throw new Error('Invalid Meta callback body');
    }
  } else {
    signedRequest = new URLSearchParams(rawBody).get('signed_request');
  }

  if (typeof signedRequest !== 'string' || !signedRequest.trim()) {
    throw new Error('Missing Meta signed request');
  }
  return signedRequest.trim();
}

export function verifyMetaSignedRequest(signedRequest, appSecret, expectedAppId = null) {
  const secret = String(appSecret || '');
  const value = String(signedRequest || '');
  if (!secret || value.length > MAX_SIGNED_REQUEST_BODY_LENGTH) {
    throw new Error('Invalid Meta signed request');
  }

  const parts = value.split('.');
  if (parts.length !== 2) throw new Error('Invalid Meta signed request');
  const [signaturePart, payloadPart] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(signaturePart) || !/^[A-Za-z0-9_-]+$/.test(payloadPart)) {
    throw new Error('Invalid Meta signed request');
  }

  const receivedSignature = Buffer.from(signaturePart, 'base64url');
  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadPart).digest();
  if (receivedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(receivedSignature, expectedSignature)) {
    throw new Error('Invalid Meta signed request signature');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid Meta signed request payload');
  }

  if (String(payload?.algorithm || '').toUpperCase() !== 'HMAC-SHA256') {
    throw new Error('Unsupported Meta signed request algorithm');
  }

  const userId = String(payload?.user_id || '').trim();
  if (!userId || userId.length > 200) throw new Error('Missing Meta user identifier');

  if (payload.app_id !== undefined && expectedAppId && String(payload.app_id) !== String(expectedAppId)) {
    throw new Error('Meta signed request app mismatch');
  }

  return { userId };
}
