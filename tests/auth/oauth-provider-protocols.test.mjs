import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exchangeOAuthCode,
  getOAuthProvider,
} from '../../lib/oauth.js';

test('X OAuth authorization uses the current x.com endpoint', () => {
  assert.equal(
    getOAuthProvider('x').authorizeUrl,
    'https://x.com/i/oauth2/authorize'
  );
});

test('QQ exchanges its code with GET and the same registered redirect URI', async () => {
  const originalFetch = globalThis.fetch;
  const redirectUri = 'https://www.supdance.com/api/auth/oauth/qq/callback';
  let requestUrl;
  let requestOptions;

  globalThis.fetch = async (url, options) => {
    requestUrl = new URL(url);
    requestOptions = options;
    return new Response(JSON.stringify({ access_token: 'test-qq-access-token' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const config = {
      ...getOAuthProvider('qq'),
      resolvedClientId: 'test-qq-client-id',
      resolvedClientSecret: 'test-qq-client-secret',
    };

    const token = await exchangeOAuthCode(
      'qq',
      'test-authorization-code',
      redirectUri,
      null,
      config
    );

    assert.equal(requestUrl.origin, 'https://graph.qq.com');
    assert.equal(requestUrl.pathname, '/oauth2.0/token');
    assert.equal(requestOptions.method, 'GET');
    assert.equal(requestOptions.body, undefined);
    assert.equal(requestUrl.searchParams.get('grant_type'), 'authorization_code');
    assert.equal(requestUrl.searchParams.get('client_id'), 'test-qq-client-id');
    assert.equal(requestUrl.searchParams.get('client_secret'), 'test-qq-client-secret');
    assert.equal(requestUrl.searchParams.get('code'), 'test-authorization-code');
    assert.equal(requestUrl.searchParams.get('redirect_uri'), redirectUri);
    assert.equal(requestUrl.searchParams.get('fmt'), 'json');
    assert.equal(token.access_token, 'test-qq-access-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
