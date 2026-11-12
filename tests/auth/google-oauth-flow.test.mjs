import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRedirectUri,
  getPublicAppOrigin,
  buildAuthorizationUrl,
  createOAuthState,
  readOAuthState,
  createPkceVerifier,
  createPkceChallenge,
  fetchOAuthProfile,
} from '../../lib/oauth.js';
import { htmlResponse } from '../../lib/services/oauthCallback.js';
import { closePgPool } from '../../lib/db/pg.js';

after(async () => {
  await closePgPool();
});

function mockRequest(host, proto = 'https') {
  const h = new Map([
    ['host', host],
    ['x-forwarded-host', host],
    ['x-forwarded-proto', proto],
  ]);
  return {
    headers: {
      get: (k) => h.get(k.toLowerCase()) || null,
    },
  };
}

test('Google OAuth redirectUri canonicalization prevents redirect_uri_mismatch on subdomains', () => {
  // canvas.supdance.com must resolve to registered www.supdance.com callback
  const canvasReq = mockRequest('canvas.supdance.com');
  const canvasRedirect = getRedirectUri(canvasReq, 'google');
  assert.equal(canvasRedirect, 'https://www.supdance.com/api/auth/oauth/google/callback');

  // supdance.com (apex) must resolve to registered www.supdance.com callback
  const apexReq = mockRequest('supdance.com');
  const apexRedirect = getRedirectUri(apexReq, 'google');
  assert.equal(apexRedirect, 'https://www.supdance.com/api/auth/oauth/google/callback');

  // www.supdance.com must resolve to registered www.supdance.com callback
  const wwwReq = mockRequest('www.supdance.com');
  const wwwRedirect = getRedirectUri(wwwReq, 'google');
  assert.equal(wwwRedirect, 'https://www.supdance.com/api/auth/oauth/google/callback');
});

test('Google OAuth redirectUri honors GOOGLE_REDIRECT_URI environment variable', () => {
  const original = process.env.GOOGLE_REDIRECT_URI;
  try {
    process.env.GOOGLE_REDIRECT_URI = 'https://custom.supdance.com/api/auth/oauth/google/callback';
    const req = mockRequest('canvas.supdance.com');
    const redirect = getRedirectUri(req, 'google');
    assert.equal(redirect, 'https://custom.supdance.com/api/auth/oauth/google/callback');
  } finally {
    if (original === undefined) {
      delete process.env.GOOGLE_REDIRECT_URI;
    } else {
      process.env.GOOGLE_REDIRECT_URI = original;
    }
  }
});

test('buildAuthorizationUrl includes client_id, scopes, PKCE, prompt, and state for Google', async () => {
  const redirectUri = 'https://www.supdance.com/api/auth/oauth/google/callback';
  const verifier = createPkceVerifier();
  const state = createOAuthState({
    provider: 'google',
    verifier,
    returnTo: '/canvas',
    redirectUri,
    returnOrigin: 'https://canvas.supdance.com',
  });

  const authUrl = await buildAuthorizationUrl('google', redirectUri, state, verifier, {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientIdParam: 'client_id',
    scopes: ['openid', 'email', 'profile'],
    pkce: true,
    authExtraParams: { prompt: 'select_account' },
    resolvedClientId: 'test-google-client-id.apps.googleusercontent.com',
  });

  const parsed = new URL(authUrl);
  assert.equal(parsed.origin, 'https://accounts.google.com');
  assert.equal(parsed.pathname, '/o/oauth2/v2/auth');
  assert.equal(parsed.searchParams.get('client_id'), 'test-google-client-id.apps.googleusercontent.com');
  assert.equal(parsed.searchParams.get('redirect_uri'), redirectUri);
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('scope'), 'openid email profile');
  assert.equal(parsed.searchParams.get('prompt'), 'select_account');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(parsed.searchParams.get('code_challenge'), createPkceChallenge(verifier));

  // Verify state signature and returnOrigin persistence
  const decodedState = readOAuthState(parsed.searchParams.get('state'));
  assert.ok(decodedState);
  assert.equal(decodedState.provider, 'google');
  assert.equal(decodedState.returnOrigin, 'https://canvas.supdance.com');
  assert.equal(decodedState.returnTo, '/canvas');
  assert.equal(decodedState.redirectUri, redirectUri);
  assert.equal(decodedState.verifier, verifier);
});

test('fetchOAuthProfile successfully decodes Google id_token when userinfo endpoint is unreachable', async () => {
  // Construct a realistic Google OpenID Connect id_token (header.payload.sig)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-kid' })).toString('base64url');
  const claims = {
    iss: 'https://accounts.google.com',
    sub: 'google-user-id-99887766',
    email: 'creator@gmail.com',
    email_verified: true,
    name: 'SupDance Creator',
    picture: 'https://lh3.googleusercontent.com/a/test-avatar',
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const dummySig = 'dummy-signature-segment';
  const idToken = `${header}.${payload}.${dummySig}`;

  // When userinfo URL is an invalid/unreachable port, it should fallback to id_token
  const customConfig = {
    userInfoUrl: 'http://127.0.0.1:1/unreachable',
    configured: true,
  };

  const profile = await fetchOAuthProfile('google', 'test_access_token', { id_token: idToken });
  assert.equal(profile.id, 'google-user-id-99887766');
  assert.equal(profile.email, 'creator@gmail.com');
  assert.equal(profile.emailVerified, true);
  assert.equal(profile.displayName, 'SupDance Creator');
  assert.equal(profile.avatarUrl, 'https://lh3.googleusercontent.com/a/test-avatar');
});

test('htmlResponse correctly honors returnOrigin for postMessage and redirects', async () => {
  const req = mockRequest('www.supdance.com');
  const res = htmlResponse(req, {
    ok: true,
    returnTo: '/studio',
    returnOrigin: 'https://canvas.supdance.com',
    provider: 'google',
    action: 'login',
  });

  const body = await res.text();
  // Ensure the target URL redirects back to the returnOrigin (canvas.supdance.com)
  assert.ok(body.includes('https://canvas.supdance.com/studio?auth=success'));
  // Ensure postMessage targets the originating canvas domain with both supdance and koyosim types
  assert.ok(body.includes('window.opener.postMessage(message, "https://canvas.supdance.com")'));
  assert.ok(body.includes('window.opener.postMessage({ ...message, type: \'koyosim-auth-complete\' }, "https://canvas.supdance.com")'));
  assert.ok(body.includes("window.opener.postMessage(message, '*')"));
  // Ensure BroadcastChannel notifies both supdance and koyosim listeners
  assert.ok(body.includes("new BroadcastChannel('supdance_auth_channel')"));
  assert.ok(body.includes("new BroadcastChannel('koyosim_auth_channel')"));
  // Ensure localStorage notifies both supdance and koyosim storage events
  assert.ok(body.includes("localStorage.setItem('supdance_auth_event'"));
  assert.ok(body.includes("localStorage.setItem('koyosim_auth_event'"));
  assert.ok(body.includes("localStorage.setItem('koyosim-oauth-sync'"));
});
