import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonObjectRequestBody } from '../../lib/security/requestJson.js';

function requestWithBody(body) {
  return new Request('http://localhost/api/generation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

test('generation endpoints accept a JSON object body', async () => {
  const result = await readJsonObjectRequestBody(requestWithBody('{"modelId":"image-model"}'));

  assert.deepEqual(result, { ok: true, value: { modelId: 'image-model' } });
});

test('generation endpoints reject malformed JSON with a typed client error', async () => {
  const result = await readJsonObjectRequestBody(requestWithBody('{"modelId":'));

  assert.deepEqual(result, { ok: false, code: 'INVALID_JSON' });
});

test('generation endpoints reject valid JSON values that are not objects', async () => {
  for (const body of ['null', '[]', '"text"', '17', 'true']) {
    const result = await readJsonObjectRequestBody(requestWithBody(body));
    assert.deepEqual(result, { ok: false, code: 'INVALID_REQUEST_BODY' }, body);
  }
});
