import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isChinaIp, resolveClientIp } from '../../lib/security/chinaIpBlock.js';
import { getSocialLoginProviders } from '../../lib/auth/socialProviders.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the nginx real IP decides the login region over client-supplied headers', () => {
  const headers = new Headers({
    'x-real-ip': '38.49.42.54',
    'x-forwarded-for': '114.114.114.114, 38.49.42.54',
    'cf-connecting-ip': '114.114.114.114',
    'x-client-ip': '114.114.114.114',
    'cf-ipcountry': 'CN',
  });
  const resolved = resolveClientIp(headers);
  assert.deepEqual(resolved, { ip: '38.49.42.54', source: 'x-real-ip' });
  assert.equal(isChinaIp(resolved.ip, headers), false);
});

test('a mainland visitor remains mainland despite an overseas forged header', () => {
  const headers = new Headers({
    'x-real-ip': '114.114.114.114',
    'cf-connecting-ip': '8.8.8.8',
    'cf-ipcountry': 'US',
  });
  const resolved = resolveClientIp(headers);
  assert.deepEqual(resolved, { ip: '114.114.114.114', source: 'x-real-ip' });
  assert.equal(isChinaIp(resolved.ip, headers), true);
});

test('invalid and local real IPs fall back to the forwarded hop appended by our proxy', () => {
  for (const realIp of ['not-an-ip', '127.0.0.1']) {
    assert.deepEqual(resolveClientIp(new Headers({
      'x-real-ip': realIp,
      'x-forwarded-for': 'invalid, 114.114.114.114, 127.0.0.1',
    })), { ip: '114.114.114.114', source: 'x-forwarded-for' });
  }
});

test('X-Forwarded-For prefers the right-most public hop so clients cannot prepend a forged region', () => {
  const resolved = resolveClientIp(new Headers({
    'x-forwarded-for': '114.114.114.114, 8.8.8.8',
  }));
  assert.deepEqual(resolved, { ip: '8.8.8.8', source: 'x-forwarded-for' });
});

test('IPv4-mapped IPv6 is normalized before region lookup', () => {
  const resolved = resolveClientIp(new Headers({ 'x-real-ip': '::ffff:114.114.114.114' }));
  assert.deepEqual(resolved, { ip: '114.114.114.114', source: 'x-real-ip' });
  assert.equal(isChinaIp(resolved.ip), true);
});

test('loopback IP falls back to CDN country header when public IP is absent', () => {
  const cnHeaders = new Headers({ 'x-real-ip': '127.0.0.1', 'cf-ipcountry': 'CN' });
  assert.equal(isChinaIp('127.0.0.1', cnHeaders), true);

  const usHeaders = new Headers({ 'x-real-ip': '127.0.0.1', 'cf-ipcountry': 'US' });
  assert.equal(isChinaIp('127.0.0.1', usHeaders), false);
});

test('regional social login providers hide only channels that cannot work, keeping unknown ones visible', async () => {
  const mainlandProviders = getSocialLoginProviders('mainland_china', {
    // null means "credential lookup failed" — it must stay visible (fail open).
    configured: { qq: true, wechat: false, douyin: null, bilibili: true },
  });
  assert.deepEqual(
    mainlandProviders.map((p) => p.id),
    ['qq', 'douyin', 'bilibili']
  );
  assert.deepEqual(
    mainlandProviders.filter((p) => p.configured).map((p) => p.id),
    ['qq', 'bilibili']
  );

  const internationalProviders = getSocialLoginProviders('international', {
    // Instagram missing from the map = unknown, so it must still render.
    configured: { google: true, x: true, tiktok: true },
  });
  assert.deepEqual(
    internationalProviders.map((p) => p.id),
    ['google', 'x', 'tiktok', 'instagram']
  );

  const operatorDisabled = getSocialLoginProviders('international', {
    config: { international: [{ id: 'instagram', enabled: false }] },
  });
  assert.deepEqual(
    operatorDisabled.map((p) => p.id),
    ['google', 'x', 'tiktok']
  );

  const [authCard, loginForm, registerForm, socialButtons] = await Promise.all([
    fs.readFile(path.join(repoRoot, 'components/auth/AuthCard.jsx'), 'utf8'),
    fs.readFile(path.join(repoRoot, 'components/auth/LoginForm.jsx'), 'utf8'),
    fs.readFile(path.join(repoRoot, 'components/auth/RegisterForm.jsx'), 'utf8'),
    fs.readFile(path.join(repoRoot, 'components/auth/SocialLoginButtons.jsx'), 'utf8'),
  ]);

  assert.doesNotMatch(authCard, /p\.available\s*&&/);
  assert.doesNotMatch(loginForm, /p\.available\s*&&/);
  assert.doesNotMatch(registerForm, /p\.available\s*&&/);
  assert.match(socialButtons, /rounded-full/);

  // All three surfaces must share the single client contract; a duplicated
  // fetch is how region/provider drift sneaks back in.
  for (const source of [authCard, loginForm, registerForm]) {
    assert.doesNotMatch(source, /fetch\('\/api\/auth\/social-options'/);
    assert.match(source, /from '@\/lib\/auth\/socialOptionsClient'/);
  }
});

