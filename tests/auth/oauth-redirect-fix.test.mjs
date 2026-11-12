import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlResponse } from '../../lib/services/oauthCallback.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function mockRequest(host = 'www.supdance.com', proto = 'https') {
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

test('htmlResponse normalizes safePath to localized path when user locale is zh', async () => {
  const req = mockRequest();
  const res = htmlResponse(req, {
    ok: true,
    returnTo: '/studio',
    provider: 'bilibili',
    action: 'login',
    user: { id: '835087', locale: 'zh-CN', displayName: 'Supdance' },
  });
  const html = await res.text();
  assert.ok(html.includes('/zh/studio'), 'Target URL should be localized to /zh/studio');
  assert.ok(!html.includes('window.innerWidth <= 600'), 'Broken innerWidth <= 600 heuristic must be removed');
  assert.ok(html.includes('if (!hasOpener)'), 'Must immediately redirect when there is no opener');
  assert.ok(html.includes('navigateToSite()'), 'Must have safe navigation fallback if window.close is blocked');
});

test('LoginForm and RegisterForm have event deduplication and use window.location.replace', async () => {
  const loginFormCode = await fs.readFile(path.join(repoRoot, 'components/auth/LoginForm.jsx'), 'utf-8');
  const registerFormCode = await fs.readFile(path.join(repoRoot, 'components/auth/RegisterForm.jsx'), 'utf-8');

  assert.ok(loginFormCode.includes('handledAuthRef'), 'LoginForm must declare handledAuthRef');
  assert.ok(loginFormCode.includes('window.location.replace(target)'), 'LoginForm must use window.location.replace for oauth success');
  assert.ok(registerFormCode.includes('handledAuthRef'), 'RegisterForm must declare handledAuthRef');
  assert.ok(registerFormCode.includes('window.location.replace(target)'), 'RegisterForm must use window.location.replace for oauth success');
});

test('app/api/auth/oauth/[provider]/route.js fallback eliminates innerWidth <= 600 bug', async () => {
  const routeCode = await fs.readFile(path.join(repoRoot, 'app/api/auth/oauth/[provider]/route.js'), 'utf-8');
  assert.ok(!routeCode.includes('window.innerWidth <= 600'), 'route.js must not contain innerWidth <= 600');
  assert.ok(routeCode.includes('window.location.replace(fallbackUrl)'), 'route.js must support safe fallback redirection');
});
