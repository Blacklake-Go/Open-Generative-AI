import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCostReconciliation } from '../../lib/repositories/costRecords.js';

const invalid = { code: 'COST_RECONCILIATION_INVALID' };

function normalize(overrides = {}) {
  return normalizeCostReconciliation({ status: 'disputed', varianceReason: '账单与上报不一致', ...overrides });
}

test('only the four reconciling statuses are accepted', () => {
  for (const status of ['pending_reconciliation', 'provider_reported', '', null, undefined, 'invoice matched', 'INVOICE_MATCHED']) {
    assert.throws(() => normalize({ status }), (error) => error.code === invalid.code,
      `status ${String(status)} must be rejected`);
  }
  const valid = {
    invoice_matched: { reconciledCostUsd: 1, evidenceRef: 'bill-1' },
    disputed: { varianceReason: '原因' },
    not_billable: { reconciledCostUsd: 0 },
    cost_gap: { varianceReason: '原因' },
  };
  for (const [status, input] of Object.entries(valid)) {
    assert.equal(normalizeCostReconciliation({ status, ...input }).status, status);
  }
});

test('amounts accept numbers and plain decimal strings, including zero', () => {
  const cases = [
    [0, 0], [1.25, 1.25], ['0', 0], ['12', 12], ['0.00000001', 0.00000001],
    ['  7.5  ', 7.5], [42, 42],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalize({ reconciledCostUsd: input }).reconciledCostUsd, expected);
  }
});

test('amounts reject negatives, non-finite and non-numeric shapes instead of coercing them', () => {
  const rejected = [-1, '-1', '-0.5', NaN, Infinity, -Infinity, true, false, {}, [], '1e3', '1,000', '0x10', 'abc', '', '  '];
  for (const reconciledCostUsd of rejected) {
    assert.throws(() => normalize({ reconciledCostUsd }), (error) => error.code === invalid.code,
      `amount ${String(reconciledCostUsd)} must be rejected`);
  }
});

test('null and undefined amounts stay unknown rather than becoming zero', () => {
  for (const reconciledCostUsd of [null, undefined]) {
    assert.equal(normalize({ reconciledCostUsd }).reconciledCostUsd, null);
  }
});

test('evidence and reason are trimmed, blank values become null, and lengths are capped', () => {
  const normalized = normalize({ evidenceRef: '  bill-2026-10  ', varianceReason: '  差 2 美元  ' });
  assert.equal(normalized.evidenceRef, 'bill-2026-10');
  assert.equal(normalized.varianceReason, '差 2 美元');

  for (const value of ['', '   ', null, undefined, 42]) {
    assert.equal(normalize({ evidenceRef: value }).evidenceRef, null);
    assert.equal(normalize({ status: 'not_billable', reconciledCostUsd: 0, varianceReason: value }).varianceReason, null);
  }

  const maxEvidence = 'e'.repeat(512);
  const maxReason = 'r'.repeat(1000);
  assert.equal(normalize({ evidenceRef: maxEvidence, varianceReason: maxReason }).evidenceRef, maxEvidence);
  assert.throws(() => normalize({ evidenceRef: 'e'.repeat(513) }), /512/);
  assert.throws(() => normalize({ varianceReason: 'r'.repeat(1001) }), /1000/);
});

test('invoice_matched requires both a confirmed amount and billing evidence', () => {
  assert.throws(() => normalize({ status: 'invoice_matched' }), /必须填写对账确认金额/);
  assert.throws(() => normalize({ status: 'invoice_matched', evidenceRef: 'bill-1' }), /必须填写对账确认金额/);
  assert.throws(() => normalize({ status: 'invoice_matched', reconciledCostUsd: 2 }), /必须提供账单证据引用/);
  const ok = normalize({ status: 'invoice_matched', reconciledCostUsd: '2.5', evidenceRef: ' bill-1 ' });
  assert.equal(ok.reconciledCostUsd, 2.5);
  assert.equal(ok.evidenceRef, 'bill-1');
});

test('not_billable must explicitly confirm zero and cannot claim a positive amount', () => {
  assert.throws(() => normalize({ status: 'not_billable' }), /必须明确确认金额为 0/);
  assert.throws(() => normalize({ status: 'not_billable', reconciledCostUsd: 0.01 }), /只能为 0/);
  assert.equal(normalize({ status: 'not_billable', reconciledCostUsd: 0 }).reconciledCostUsd, 0);
  assert.equal(normalize({ status: 'not_billable', reconciledCostUsd: '0' }).reconciledCostUsd, 0);
});

test('disputed requires a reason but may leave the amount unknown', () => {
  assert.throws(() => normalize({ status: 'disputed', varianceReason: null }), /必须填写差异原因/);
  assert.throws(() => normalize({ status: 'disputed', varianceReason: '   ' }), /必须填写差异原因/);
  const unknown = normalize({ status: 'disputed', varianceReason: '供应商按次计费，账单待核' });
  assert.equal(unknown.reconciledCostUsd, null);
  assert.equal(normalize({ status: 'disputed', varianceReason: '原因', reconciledCostUsd: 3 }).reconciledCostUsd, 3);
});

test('cost_gap keeps the amount unknown and demands a reason', () => {
  assert.throws(() => normalize({ status: 'cost_gap', varianceReason: null }), /必须填写原因/);
  assert.throws(() => normalize({ status: 'cost_gap', varianceReason: '原因', reconciledCostUsd: 0 }), /必须保持金额未知/);
  assert.throws(() => normalize({ status: 'cost_gap', varianceReason: '原因', reconciledCostUsd: 1 }), /必须保持金额未知/);
  const gap = normalize({ status: 'cost_gap', varianceReason: '2025-11 账单未提供' });
  assert.deepEqual(gap, {
    status: 'cost_gap',
    reconciledCostUsd: null,
    evidenceRef: null,
    varianceReason: '2025-11 账单未提供',
  });
});

test('normalization returns only the four decision fields', () => {
  const result = normalize({ reconciledCostUsd: 1 });
  assert.deepEqual(Object.keys(result).sort(), ['evidenceRef', 'reconciledCostUsd', 'status', 'varianceReason']);
});
