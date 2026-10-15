import test from 'node:test';
import assert from 'node:assert/strict';

import { canvasMutationGuard, canvasPreflight } from '../../lib/canvas/http.js';

const CANVAS_ORIGIN = 'https://canvas.supdance.com';
const API_URL = 'https://www.supdance.com/api/canvas/session';

test('Canvas preflight allows only the production Canvas origin with credentials', () => {
  const request = new Request(API_URL, { method: 'OPTIONS', headers: { origin: CANVAS_ORIGIN } });
  const response = canvasPreflight(request, 'GET, POST, OPTIONS');
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), CANVAS_ORIGIN);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.match(response.headers.get('access-control-allow-headers') || '', /X-SupDance-Canvas/i);
  assert.match(response.headers.get('access-control-allow-headers') || '', /X-KoyoSIM-Canvas/i);
});

test('Canvas preflight rejects an untrusted origin', () => {
  const request = new Request(API_URL, { method: 'OPTIONS', headers: { origin: 'https://attacker.example' } });
  assert.equal(canvasPreflight(request).status, 403);
});

test('Canvas mutations require the trusted origin, client marker, JSON content type, and body limit', () => {
  const baseHeaders = { origin: CANVAS_ORIGIN, 'content-type': 'application/json', 'x-supdance-canvas': 'infinite-canvas-v1' };
  assert.equal(canvasMutationGuard(new Request(API_URL, { method: 'POST', headers: baseHeaders })), null);
  assert.equal(canvasMutationGuard(new Request(API_URL, { method: 'POST', headers: { ...baseHeaders, 'x-supdance-canvas': '' } })).status, 403);
  assert.equal(canvasMutationGuard(new Request(API_URL, { method: 'POST', headers: { origin: CANVAS_ORIGIN, 'content-type': 'application/json', 'x-koyosim-canvas': 'infinite-canvas-v1' } })), null);
  assert.equal(canvasMutationGuard(new Request(API_URL, { method: 'POST', headers: { ...baseHeaders, 'content-type': 'text/plain' } })).status, 415);
  assert.equal(canvasMutationGuard(new Request(API_URL, { method: 'POST', headers: { ...baseHeaders, 'content-length': '4097' } }), { maxBytes: 4096 }).status, 413);

  // Supdance origin
  const supdanceHeaders = { origin: 'https://www.supdance.com', 'content-type': 'application/json', 'x-supdance-canvas': 'infinite-canvas-v1' };
  assert.equal(canvasMutationGuard(new Request('https://www.supdance.com/api/canvas/session', { method: 'POST', headers: supdanceHeaders })), null);
});
