import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { readMetaSignedRequest, verifyMetaSignedRequest } from '../../lib/auth/metaSignedRequest.js';

const TEST_APP_SECRET = 'unit-test-meta-app-secret';
const TEST_APP_ID = '1234567890';

function makeSignedRequest(payload, secret = TEST_APP_SECRET) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${signature}.${encodedPayload}`;
}

test('verifies Meta signed_request and returns only its app-scoped user ID', () => {
  const value = makeSignedRequest({ algorithm: 'HMAC-SHA256', user_id: '17841400000000000', app_id: TEST_APP_ID });
  assert.deepEqual(verifyMetaSignedRequest(value, TEST_APP_SECRET, TEST_APP_ID), { userId: '17841400000000000' });
});

test('rejects tampered signatures and mismatched app IDs', () => {
  const value = makeSignedRequest({ algorithm: 'HMAC-SHA256', user_id: '17841400000000000', app_id: TEST_APP_ID });
  assert.throws(() => verifyMetaSignedRequest(`${value.slice(0, -1)}x`, TEST_APP_SECRET, TEST_APP_ID));
  assert.throws(() => verifyMetaSignedRequest(value, TEST_APP_SECRET, 'different-app'));
});

test('rejects unsupported algorithms and missing user IDs', () => {
  assert.throws(() => verifyMetaSignedRequest(makeSignedRequest({ algorithm: 'sha1', user_id: '123' }), TEST_APP_SECRET));
  assert.throws(() => verifyMetaSignedRequest(makeSignedRequest({ algorithm: 'HMAC-SHA256' }), TEST_APP_SECRET));
});

test('reads Meta form and JSON callback bodies without accepting missing signatures', async () => {
  const signedRequest = makeSignedRequest({ algorithm: 'HMAC-SHA256', user_id: '123' });
  const formRequest = new Request('https://example.test/callback', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ signed_request: signedRequest }),
  });
  const jsonRequest = new Request('https://example.test/callback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ signed_request: signedRequest }),
  });
  assert.equal(await readMetaSignedRequest(formRequest), signedRequest);
  assert.equal(await readMetaSignedRequest(jsonRequest), signedRequest);

  const emptyRequest = new Request('https://example.test/callback', { method: 'POST', body: 'foo=bar' });
  await assert.rejects(readMetaSignedRequest(emptyRequest));
});
