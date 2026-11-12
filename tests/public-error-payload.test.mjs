import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

function businessError(message, code, extra = {}) {
  return Object.assign(new Error(message), { code }, extra);
}

test('publicErrorPayload 透传白名单内的错误码与原文文案', async () => {
  const { publicErrorPayload } = await import('../lib/security/publicError.js');
  const payload = publicErrorPayload(
    businessError('额度不足', 'INSUFFICIENT_CREDITS'),
    '兜底文案',
    'FALLBACK_CODE',
  );
  assert.deepEqual(payload, { error: '额度不足', code: 'INSUFFICIENT_CREDITS' });
});

test('publicErrorPayload 在缺少 error.code 时使用 fallbackCode', async () => {
  const { publicErrorPayload } = await import('../lib/security/publicError.js');
  const payload = publicErrorPayload(new Error('boom'), '兜底文案', 'GENERATION_CREATE_FAILED');
  assert.equal(payload.error, '兜底文案');
  assert.equal(payload.code, 'GENERATION_CREATE_FAILED');
  assert.equal('reasonCodes' in payload, false);
});

test('publicErrorPayload 原因码只透出 UPPER_SNAKE、去重并截断到 8 个', async () => {
  const { publicErrorPayload } = await import('../lib/security/publicError.js');
  const error = businessError('该模型当前未通过公开目录准入', 'MODEL_NOT_PUBLICLY_AVAILABLE', {
    reasonCodes: [
      'NO_VERIFIED_ROUTE',
      'NO_VERIFIED_ROUTE',
      'price missing',
      'secret-token',
      '',
      null,
      'A',
      'MODEL_INACTIVE',
      'TIER_RESTRICTED',
      'SITE_RESTRICTED',
      'AUDIENCE_RESTRICTED',
      'PRICE_MISSING',
      'NOT_ROUTABLE',
      'HIDDEN',
      'MODEL_NOT_FOUND',
    ],
  });
  const payload = publicErrorPayload(error, '兜底文案');
  assert.equal(payload.code, 'MODEL_NOT_PUBLICLY_AVAILABLE');
  assert.deepEqual(payload.reasonCodes, [
    'NO_VERIFIED_ROUTE',
    'A',
    'MODEL_INACTIVE',
    'TIER_RESTRICTED',
    'SITE_RESTRICTED',
    'AUDIENCE_RESTRICTED',
    'PRICE_MISSING',
    'NOT_ROUTABLE',
  ]);
  assert.ok(payload.reasonCodes.length <= 8);
});

test('publicErrorPayload 无适用原因码时不输出该字段', async () => {
  const { publicErrorPayload } = await import('../lib/security/publicError.js');
  const noReasons = publicErrorPayload(businessError('额度不足', 'INSUFFICIENT_CREDITS'), '兜底文案');
  assert.equal('reasonCodes' in noReasons, false);

  const invalidReasons = publicErrorPayload(
    businessError('额度不足', 'INSUFFICIENT_CREDITS', { reasonCodes: ['not-a-code', 'lower_case', 42] }),
    '兜底文案',
  );
  assert.equal('reasonCodes' in invalidReasons, false);
});

test('公开目录准入失败返回可理解原因且不泄露内部细节', async () => {
  const { publicErrorPayload } = await import('../lib/security/publicError.js');
  const payload = publicErrorPayload(
    businessError('该模型当前未通过公开目录准入：该模型暂无可用线路，请选择其他可用模型', 'MODEL_NOT_PUBLICLY_AVAILABLE', {
      reasonCodes: ['NO_VERIFIED_ROUTE'],
    }),
    '创建生成任务失败',
    'GENERATION_CREATE_FAILED',
  );
  assert.equal(payload.code, 'MODEL_NOT_PUBLICLY_AVAILABLE');
  assert.match(payload.error, /请选择其他可用模型/);
  assert.deepEqual(payload.reasonCodes, ['NO_VERIFIED_ROUTE']);

  const internal = publicErrorPayload(
    businessError('postgres://user:secret@db.supdance.internal/app relation "x" does not exist', 'MODEL_NOT_PUBLICLY_AVAILABLE'),
    '创建生成任务失败',
    'GENERATION_CREATE_FAILED',
  );
  assert.equal(internal.error, '创建生成任务失败');
  assert.equal('reasonCodes' in internal, false);
});

test('生成与报价接口统一使用 publicErrorPayload 输出错误体', async () => {
  const expectations = new Map([
    [
      'app/api/generations/route.js',
      /publicErrorPayload\(error, '创建生成任务失败', 'GENERATION_CREATE_FAILED'\)/,
    ],
    [
      'app/api/generation/quote/route.js',
      /publicErrorPayload\(error, '获取模型报价失败', 'QUOTE_FAILED'\)/,
    ],
    [
      'app/api/canvas/jobs/route.js',
      /publicErrorPayload\(error, '创建生成任务失败', 'GENERATION_CREATE_FAILED'\)/,
    ],
    [
      'app/api/canvas/quotes/route.js',
      /publicErrorPayload\(error, '暂时无法确认可靠报价，请稍后重试', 'QUOTE_FAILED'\)/,
    ],
  ]);
  for (const [relativePath, pattern] of expectations) {
    const content = await source(relativePath);
    assert.match(content, pattern, `${relativePath} 未使用统一错误体`);
  }
});
