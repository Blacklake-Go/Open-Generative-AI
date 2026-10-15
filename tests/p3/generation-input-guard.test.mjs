import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  BaseAdapter,
  NON_RETRYABLE_ERROR_CODES,
  PROVIDER_ERROR_CODES,
  providerErrorText,
  shouldTripProviderCircuitBreaker,
} from '../../lib/adapters/BaseAdapter.js';
import { MuAPIAdapter } from '../../lib/adapters/MuAPIAdapter.js';
import { VolcengineAdapter } from '../../lib/adapters/VolcengineAdapter.js';

const coreSource = fs.readFileSync(new URL('../../lib/services/generationCore.js', import.meta.url), 'utf8');

test('provider error text survives nested error objects instead of [object Object]', () => {
  assert.equal(providerErrorText({ error: { message: ' Insufficient balance ' } }), 'Insufficient balance');
  assert.equal(providerErrorText({ detail: 'quota exceeded' }), 'quota exceeded');
  assert.equal(providerErrorText('plain text'), 'plain text');
  assert.equal(providerErrorText(null), '');
  assert.equal(providerErrorText({ error: { code: 4001 } }), '');
  // 递归深度受限，超深结构只能退化成空串，不能把整棵对象树塞进审计表。
  assert.equal(providerErrorText({ a: { b: { c: { d: { message: 'deep' } } } } }), '');
});

test('adapter error normalization never surfaces [object Object] to logs', () => {
  const adapter = new BaseAdapter({ providerId: 'mock', apiKey: 'k' });

  const objectError = adapter.normalizeError(Object.assign(new Error('[object Object]'), {
    providerStatus: 402,
    providerDetail: { error: { message: '账户余额不足，请充值' } },
  }));
  assert.equal(objectError.code, PROVIDER_ERROR_CODES.INSUFFICIENT_PROVIDER_BALANCE);
  assert.equal(objectError.message, '账户余额不足，请充值');
  assert.equal(objectError.isRetryable, true);

  const contentPolicy = adapter.normalizeError(Object.assign(new Error('flagged by moderation'), { providerStatus: 400 }));
  assert.equal(contentPolicy.code, PROVIDER_ERROR_CODES.CONTENT_POLICY);
  assert.equal(contentPolicy.isRetryable, false);

  const truncated = adapter.normalizeError(new Error('x'.repeat(900)));
  assert.ok(truncated.message.length <= 500);
});

test('Volcengine model and endpoint access failures are route scoped, retryable, and not provider-wide', () => {
  const adapter = new BaseAdapter({ providerId: 'volcengine', apiKey: 'k' });
  const endpointFailure = adapter.normalizeError(Object.assign(new Error(
    'The model or endpoint doubao-seedream-5-0-260128 does not exist or you do not have access to it.',
  ), { providerStatus: 400, code: 'InvalidEndpointOrModel.NotFound' }));

  assert.equal(endpointFailure.code, PROVIDER_ERROR_CODES.MODEL_ROUTE_UNAVAILABLE);
  assert.equal(endpointFailure.isRetryable, true);
  assert.equal(shouldTripProviderCircuitBreaker(endpointFailure.code), false);
  const modelIdDisabled = adapter.normalizeError(Object.assign(new Error(
    'Accessing the model via Model ID is not allowed for your account. Please use a custom endpoint ID instead.',
  ), { providerStatus: 404, code: 'InvalidEndpointOrModel.ModelIDAccessDisabled' }));
  assert.equal(modelIdDisabled.code, PROVIDER_ERROR_CODES.MODEL_ROUTE_UNAVAILABLE);
  assert.equal(shouldTripProviderCircuitBreaker(PROVIDER_ERROR_CODES.INVALID_INPUT), false);
  assert.equal(shouldTripProviderCircuitBreaker(PROVIDER_ERROR_CODES.CONTENT_POLICY), false);
  assert.equal(shouldTripProviderCircuitBreaker(PROVIDER_ERROR_CODES.MODEL_UNAVAILABLE), true);

  const badPrompt = adapter.normalizeError(Object.assign(new Error('invalid prompt parameter'), { providerStatus: 400 }));
  assert.equal(badPrompt.code, PROVIDER_ERROR_CODES.INVALID_INPUT);
});

test('Volcengine reports current-account Model ID access failure and preserves Pro as a distinct route', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    requests += 1;
    const body = JSON.parse(init.body);
    bodies.push(body);
    if (body.model === 'doubao-seedream-5-0-260128') {
      return new Response(JSON.stringify({ error: {
        code: 'InvalidEndpointOrModel.NotFound',
        message: 'The model or endpoint doubao-seedream-5-0-260128 does not exist or you do not have access to it.',
      } }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ data: [{ id: 'request-1', url: 'https://example.invalid/result.png' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const adapter = new VolcengineAdapter({ apiKey: 'unit-test-key' });

    await assert.rejects(
      () => adapter.createTask({ providerModelId: 'seedream-5.0', prompt: 'a cat' }),
      (error) => error.code === PROVIDER_ERROR_CODES.MODEL_ROUTE_UNAVAILABLE
        && error.providerStatus === 404,
    );
    assert.equal(requests, 1, 'configured Model ID should reach the provider and expose its actual access result');
    assert.equal(bodies[0].model, 'doubao-seedream-5-0-260128');

    const result = await adapter.createTask({ providerModelId: 'seedream-5.0-pro', prompt: 'a cat' });
    assert.equal(result.providerRequestId, 'request-1');
    assert.equal(bodies[1].model, 'doubao-seedream-5-0-pro-260628');
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Volcengine forwards Canvas reference images through Ark image input without changing T2I', async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ data: [{ id: `request-${bodies.length}`, url: 'https://example.invalid/result.png' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const adapter = new VolcengineAdapter({ apiKey: 'unit-test-key' });
    await adapter.createTask({
      providerModelId: 'seedream-4.5',
      prompt: 'edit this image',
      parameters: { reference_images: ['https://assets.invalid/a.png', 'https://assets.invalid/b.png'] },
    });
    await adapter.createTask({
      providerModelId: 'seedream-4.5',
      prompt: 'use this reference',
      parameters: { image_urls: ['https://assets.invalid/single.png'] },
    });
    await adapter.createTask({ providerModelId: 'seedream-4.5', prompt: 'a red paper boat' });

    assert.deepEqual(bodies[0].image, ['https://assets.invalid/a.png', 'https://assets.invalid/b.png']);
    assert.equal(bodies[1].image, 'https://assets.invalid/single.png');
    assert.equal(Object.hasOwn(bodies[2], 'image'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('muapi channel reports the upstream reason for a failed task submission', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: 'balance_not_enough', message: 'Insufficient balance, top up your account' },
  }), { status: 402, headers: { 'content-type': 'application/json' } });

  try {
    const adapter = new MuAPIAdapter({ apiKey: 'unit-test-key' });
    await assert.rejects(
      () => adapter.createTask({ providerModelId: 'flux-schnell', prompt: 'a cat' }),
      (error) => {
        assert.equal(error.code, PROVIDER_ERROR_CODES.INSUFFICIENT_PROVIDER_BALANCE);
        assert.equal(error.provider, 'muapi');
        assert.equal(error.providerStatus, 402);
        assert.equal(error.message, 'Insufficient balance, top up your account');
        assert.ok(!error.message.includes('[object Object]'));
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generation service validates the prompt before reserving credits', () => {
  const validationAt = coreSource.indexOf("code: 'PROMPT_REQUIRED'");
  const reservationAt = coreSource.indexOf('await reserveCredits({');
  assert.notEqual(validationAt, -1, 'empty-prompt guard must exist');
  assert.notEqual(reservationAt, -1, 'credit reservation anchor must exist');
  assert.ok(validationAt < reservationAt, '参数验证必须先于预扣积分');

  assert.match(coreSource, /code: 'INVALID_PROMPT'/);
  assert.match(coreSource, /code: 'PROMPT_TOO_LONG'/);
  assert.match(coreSource, /MAX_PROMPT_CHARS = 4000/);
  // 是否需要提示词由规范目录 capabilities 决定，不允许写死模型清单。
  assert.match(coreSource, /function requiresPrompt\(\{ model, parameters \}\)/);
  assert.match(coreSource, /const caps = parseJsonObject\(model\?\.metadata_json\)/);
  assert.doesNotMatch(coreSource, /function requiresPrompt[\s\S]{0,900}'[a-z0-9._-]+'\.includes\(/);
});

test('generation failures keep the first upstream cause and a user-facing reason', () => {
  assert.match(coreSource, /let firstAttemptFailure = null/);
  assert.match(coreSource, /if \(firstAttemptFailure\) \{[\s\S]*?lastErrorCode = firstAttemptFailure\.code;/);
  assert.match(coreSource, /lastErrorReason = PROVIDER_FAILURE_TEXT\[normErr\.code\]/);
  assert.match(coreSource, /upstreamError: firstAttemptFailure\?\.upstream/);
  // 供应商额度类错误必须给出解冻话术，不能只报内部码。
  assert.match(coreSource, /INSUFFICIENT_PROVIDER_BALANCE: 'AI 供应商额度不足[^\n]*'/);
  assert.match(coreSource, /MODEL_ROUTE_UNAVAILABLE: '该模型的服务端点当前不可用[^\n]*'/);
  assert.match(coreSource, /if \(shouldTripProviderCircuitBreaker\(normErr\.code\)\)/);
  assert.match(coreSource, /ROUTING_FAILED/);
});

test('model route access failures remain eligible for same-model failover and do not enter the generic no-retry set', () => {
  assert.equal(NON_RETRYABLE_ERROR_CODES.has(PROVIDER_ERROR_CODES.MODEL_ROUTE_UNAVAILABLE), false);
  assert.match(coreSource, /if \(NON_RETRYABLE_ERROR_CODES\.has\(normErr\.code\)\) \{\s*break;[\s\S]*?excludedProviderIds\.push\(providerId\)/);
  assert.match(coreSource, /if \(shouldTripProviderCircuitBreaker\(normErr\.code\)\)\s*\{\s*recordProviderFailure/);
});
