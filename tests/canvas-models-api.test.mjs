import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../app/api/canvas/models/route.js';

test('Canvas model API rejects untrusted origins before querying an account', async () => {
  const response = await GET(new Request('https://www.supdance.com/api/canvas/models', { headers: { Origin: 'https://evil.example' } }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'CANVAS_ORIGIN_INVALID');
});

test('Canvas model API requires an authenticated session', async () => {
  const response = await GET(new Request('https://www.supdance.com/api/canvas/models', { headers: { Origin: 'https://canvas.supdance.com' } }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'UNAUTHENTICATED');
});
