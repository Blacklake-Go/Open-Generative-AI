import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { resolveAuthEmbedOptions, authEmbedFrameAncestors } from '../../lib/auth/embedAuth.js';
import { middleware } from '../../middleware.js';

test('embedded auth accepts only exact trusted parent origins and normalizes its view options', () => {
  for (const parentOrigin of ['', 'https://evil.example', 'https://canvas.supdance.com.evil.example', 'https://canvas.supdance.com/path', 'https://user@canvas.supdance.com', 'http://localhost:3000']) {
    assert.equal(resolveAuthEmbedOptions({ parentOrigin }, { production: true }), null);
  }
  assert.deepEqual(resolveAuthEmbedOptions({ parentOrigin: 'https://canvas.supdance.com', mode: 'forgot', tab: 'phone', locale: 'zh-CN' }), {
    parentOrigin: 'https://canvas.supdance.com', mode: 'forgot', tab: 'phone', locale: 'zh-CN',
  });
  assert.ok(resolveAuthEmbedOptions({ parentOrigin: 'http://localhost:3000' }, { production: false }));
  assert.doesNotMatch(authEmbedFrameAncestors(true), /localhost|\*|evil/);
});

test('only the embedded auth page permits trusted framing while regular login keeps DENY', async () => {
  const embedded = await middleware(new NextRequest('https://www.supdance.com/embed-auth?parentOrigin=https%3A%2F%2Fcanvas.supdance.com'));
  assert.equal(embedded.headers.get('x-frame-options'), null);
  assert.match(embedded.headers.get('content-security-policy'), /frame-ancestors 'self'.*https:\/\/canvas\.supdance\.com/);
  const login = await middleware(new NextRequest('https://www.supdance.com/login'));
  assert.equal(login.headers.get('x-frame-options'), 'DENY');
  assert.match(login.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
