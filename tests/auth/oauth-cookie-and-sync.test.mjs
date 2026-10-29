import {NextResponse} from 'next/server.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getSessionCookieDomain,
  setSessionCookie,
  clearSessionCookie,
} from '../../lib/services/auth.js';
import { htmlResponse } from '../../lib/services/oauthCallback.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('getSessionCookieDomain resolves domains accurately', () => {
  const origEnv = { ...process.env };
  try {
    delete process.env.COOKIE_DOMAIN;
    delete process.env.PUBLIC_APP_URL;

    // 1. supdance.com apex and subdomains
    assert.equal(
      getSessionCookieDomain({ headers: new Map([['host', 'supdance.com']]) }),
      '.supdance.com'
    );
    assert.equal(
      getSessionCookieDomain({ headers: new Map([['host', 'www.supdance.com']]) }),
      '.supdance.com'
    );
    assert.equal(
      getSessionCookieDomain({ headers: new Map([['x-forwarded-host', 'www.supdance.com:443']]) }),
      '.supdance.com'
    );
    assert.equal(
      getSessionCookieDomain({ headers: new Map([['host', 'supdance.com']]) }),
      '.supdance.com'
    );
    assert.equal(
      getSessionCookieDomain({ headers: new Map([['host', 'www.supdance.com']]) }),
      '.supdance.com'
    );
    assert.equal(
      getSessionCookieDomain({ headers: new Map([['x-forwarded-host', 'www.supdance.com:443']]) }),
      '.supdance.com'
    );

    // 2. localhost / 127.0.0.1 -> undefined (host-only)
    assert.equal(
      getSessionCookieDomain({ headers: new Map([['host', 'localhost:3000']]) }),
      undefined
    );
    assert.equal(
      getSessionCookieDomain({ headers: new Map([['host', '127.0.0.1:3100']]) }),
      undefined
    );

    // 3. Fallback to PUBLIC_APP_URL when req is not passed
    process.env.PUBLIC_APP_URL = 'https://www.supdance.com';
    assert.equal(getSessionCookieDomain(), '.supdance.com');

    process.env.PUBLIC_APP_URL = 'http://127.0.0.1:3100';
    assert.equal(getSessionCookieDomain(), undefined);

    // 4. COOKIE_DOMAIN override
    process.env.COOKIE_DOMAIN = '.supdance.com';
    assert.equal(getSessionCookieDomain(), '.supdance.com');
    process.env.COOKIE_DOMAIN = 'supdance.com';
    assert.equal(getSessionCookieDomain(), '.supdance.com');
  } finally {
    process.env = origEnv;
  }
});

test('setSessionCookie and clearSessionCookie configure domain and expiry properly', () => {
  const origEnv = { ...process.env };
  try {
    process.env.PUBLIC_APP_URL = 'https://www.supdance.com';

    // Mock response cookies
    const cookieJar = [];
    const mockResponse = {
      cookies: {
        set(name, value, options) {
          cookieJar.push({ name, value, options });
        },
      },
    };

    const expires = new Date(Date.now() + 86400000).toISOString();
    setSessionCookie(mockResponse, 'test-token', expires, {
      headers: new Map([['host', 'www.supdance.com']]),
    });

    assert.equal(cookieJar.length, 1);
    assert.equal(cookieJar[0].name, 'ko_session');
    assert.equal(cookieJar[0].value, 'test-token');
    assert.equal(cookieJar[0].options.domain, '.supdance.com');
    assert.equal(cookieJar[0].options.path, '/');
    assert.equal(cookieJar[0].options.httpOnly, true);

    const actualResponse=NextResponse.json({ok:true});
    clearSessionCookie(actualResponse,{headers:new Headers({host:'www.supdance.com'})});
    const expired=actualResponse.headers.getSetCookie();
    assert.equal(expired.length,2);
    assert.equal(expired.filter(cookie=>cookie.includes('Domain=.supdance.com')).length,1);
    assert.ok(expired.every(cookie=>cookie.includes('Max-Age=0')));
  } finally {
    process.env = origEnv;
  }
});

test('htmlResponse includes sanitized user in payload when provided', async () => {
  const req = {
    headers: new Map([['host', 'www.supdance.com']]),
  };
  const testUser = {
    id: 'usr_test123',
    email: 'test@supdance.com',
    phone: '13800000000',
    displayName: 'Test Creator',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'user',
    status: 'active',
    hasPassword: true,
    password_hash: 'secret_hash_should_not_leak',
    onboardingCompleted: true,
  };

  const response = htmlResponse(req, {
    ok: true,
    returnTo: '/studio',
    action: 'login',
    provider: 'google',
    isNew: false,
    user: testUser,
  });

  const body = await response.text();
  assert.match(body, /usr_test123/);
  assert.match(body, /test@supdance\.com/);
  assert.match(body, /Test Creator/);
  // Sensitive password hash must not be leaked into payload
  assert.doesNotMatch(body, /secret_hash_should_not_leak/);
});

test('Frontend components follow reliable sync and no premature success notifications', async () => {
  const shellCode = await fs.readFile(path.join(repoRoot, 'components/StandaloneShell.js'), 'utf8');
  const modalCode = await fs.readFile(path.join(repoRoot, 'components/AuthModal.js'), 'utf8');
  const profileCode = await fs.readFile(path.join(repoRoot, 'components/account/tabs/ProfileTab.js'), 'utf8');

  // StandaloneShell must retry sync before showing success
  assert.match(shellCode, /syncAccountWithRetry/);
  // AuthModal must retry session check with backoff
  assert.match(modalCode, /syncSessionWithRetry/);
  // ProfileTab must ignore non-bind actions
  assert.match(profileCode, /data\.action && data\.action !== 'bind'/);
});
