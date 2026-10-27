import 'server-only';

import crypto from 'node:crypto';
import { getResolvedOAuthConfig } from '@/lib/oauth.js';
import { isChinaIp, resolveClientIp } from '@/lib/security/chinaIpBlock.js';
import { getSettingByKey } from '@/lib/services/settings.js';
import { SOCIAL_LOGIN_SETTING_KEY, getSocialLoginProviders } from '@/lib/auth/socialProviders.js';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const JWKS_DEFAULT_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;
const ALLOWED_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

let jwksCache = { keys: [], expiresAt: 0 };

export function isOverseasRequest(headers) {
  const { ip } = resolveClientIp(headers);
  return !isChinaIp(ip, headers);
}

async function isGoogleLoginEnabledByAdmin() {
  const stored = await getSettingByKey(SOCIAL_LOGIN_SETTING_KEY).catch(() => null);
  const providers = getSocialLoginProviders('international', {
    config: stored?.value ?? stored,
    configured: { google: true },
  });
  return providers.some((provider) => provider.id === 'google' && provider.configured);
}

export async function getGoogleOneTapConfig(headers) {
  if (!isOverseasRequest(headers)) return { enabled: false };
  const [oauthConfig, enabledByAdmin] = await Promise.all([
    getResolvedOAuthConfig('google'),
    isGoogleLoginEnabledByAdmin(),
  ]);
  if (!enabledByAdmin || !oauthConfig?.configured || !oauthConfig.resolvedClientId) {
    return { enabled: false };
  }
  return { enabled: true, clientId: oauthConfig.resolvedClientId };
}

async function fetchJwks() {
  if (jwksCache.keys.length && Date.now() < jwksCache.expiresAt) return jwksCache.keys;

  const response = await fetch(CERTS_URL, {
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`GOOGLE_JWKS_HTTP_${response.status}`);

  const data = await response.json();
  const keys = Array.isArray(data?.keys)
    ? data.keys.filter((key) => key?.kid && key?.n && key?.e)
    : [];
  if (!keys.length) throw new Error('GOOGLE_JWKS_EMPTY');

  const maxAgeSeconds = Number(String(response.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 0);
  jwksCache = {
    keys,
    expiresAt: Date.now() + (maxAgeSeconds > 0 ? maxAgeSeconds * 1000 : JWKS_DEFAULT_TTL_MS),
  };
  return keys;
}

export async function verifyGoogleIdToken(idToken, clientId) {
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID_MISSING');
  if (typeof idToken !== 'string' || !idToken) throw new Error('GOOGLE_ID_TOKEN_MISSING');

  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('GOOGLE_ID_TOKEN_MALFORMED');

  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('GOOGLE_ID_TOKEN_MALFORMED');
  }

  if (header?.alg !== 'RS256' || !header?.kid) throw new Error('GOOGLE_ID_TOKEN_ALG');

  let keys = await fetchJwks();
  let jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    jwksCache.expiresAt = 0;
    keys = await fetchJwks();
    jwk = keys.find((key) => key.kid === header.kid);
  }
  if (!jwk) throw new Error('GOOGLE_ID_TOKEN_KID');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signatureValid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    publicKey,
    Buffer.from(parts[2], 'base64url')
  );
  if (!signatureValid) throw new Error('GOOGLE_ID_TOKEN_SIGNATURE');

  const now = Math.floor(Date.now() / 1000);
  if (!ALLOWED_ISSUERS.has(payload?.iss)) throw new Error('GOOGLE_ID_TOKEN_ISSUER');
  if (payload?.aud !== clientId) throw new Error('GOOGLE_ID_TOKEN_AUDIENCE');
  if (payload?.azp && payload.azp !== clientId) throw new Error('GOOGLE_ID_TOKEN_AUTHORIZED_PARTY');
  if (!payload?.sub) throw new Error('GOOGLE_ID_TOKEN_SUBJECT');
  if (!Number.isFinite(payload?.exp) || payload.exp + CLOCK_SKEW_SECONDS < now) {
    throw new Error('GOOGLE_ID_TOKEN_EXPIRED');
  }
  if (Number.isFinite(payload?.iat) && payload.iat > now + CLOCK_SKEW_SECONDS * 5) {
    throw new Error('GOOGLE_ID_TOKEN_ISSUED_IN_FUTURE');
  }

  return payload;
}
