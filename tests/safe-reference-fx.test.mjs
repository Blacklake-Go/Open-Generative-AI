import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSafeUsdCny } from '../lib/pricing/safeReferenceFx.js';

const page = (date, value, header = '美元') => `<table class="list" id="InfoTable"><tr><th>日期</th><th>${header}</th></tr><tr><td>${date}</td><td>${value}</td></tr></table>`;
const now = Date.parse('2026-10-27T12:00:00Z');

test('official SAFE value is interpreted as CNY per 100 USD and expires on the source date', () => {
  const result = parseSafeUsdCny(page('2026-10-27', '671.71'), now);
  assert.equal(result.rate, 6.7171);
  assert.equal(result.sourceDate, '2026-10-27');
  assert.equal(result.expiresAt, '2026-10-31T16:00:00.000Z');
});

test('changed columns, implausible values, future dates, and stale publications fail closed', () => {
  for (const html of [page('2026-10-27', '671.71', '欧元'), page('2026-10-27', '6.7171'), page('2026-10-28', '671.71'), page('2026-10-22', '671.71'), page('2026-02-31', '671.71')]) {
    assert.throws(() => parseSafeUsdCny(html, now));
  }
});
