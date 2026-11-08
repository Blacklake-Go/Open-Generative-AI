import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_LOCALES, getAuthRoutes } from '../../lib/authCopy.js';

const origin = 'https://www.supdance.com';

function readRedirect(href) {
  return new URL(href, origin).searchParams.get('redirect');
}

test('login and registration preserve the original project across both switches', () => {
  const target = '/p/last-bus?utm_source=bilibili&shot=%E7%AC%AC%E5%9B%9B%E9%95%9C#draft';
  for (const locale of AUTH_LOCALES) {
    const login = getAuthRoutes(locale, '/login', target);
    const register = getAuthRoutes(locale, '/register', readRedirect(login.registerUrl));
    const back = getAuthRoutes(locale, '/login', readRedirect(register.loginUrl));
    assert.equal(register.redirectUrl, target);
    assert.equal(back.redirectUrl, target);
    assert.equal(new URL(login.registerUrl, origin).pathname, `${login.prefix}/register`);
    assert.equal(new URL(register.loginUrl, origin).pathname, `${login.prefix}/login`);
  }
});

test('ordinary entry and unsafe destinations use the local studio and clean switch URLs', () => {
  for (const value of [null, '', 'studio', 'https://outside.example', '//outside.example',
    '/\\outside.example', '/\t/outside.example', '/\n/outside.example', '/\r/outside.example',
    '/%2Foutside.example', '/%5coutside.example', 'javascript:alert(1)']) {
    const routes = getAuthRoutes('zh-CN', '/login', value);
    assert.equal(routes.redirectUrl, '/zh/studio');
    assert.equal(routes.loginUrl, '/zh/login');
    assert.equal(routes.registerUrl, '/zh/register');
  }
});
