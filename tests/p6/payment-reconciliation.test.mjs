import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as billingRepo from '../../lib/repositories/billing.js';
import { cycleDue, RECONCILE_INTERVALS } from '../../lib/services/paymentReconciliation.js';

const repoSrc = readFileSync(new URL('../../lib/repositories/billing.js', import.meta.url), 'utf8');
const workerSrc = readFileSync(new URL('../../scripts/generation-worker.mjs', import.meta.url), 'utf8');
const reconcileSrc = readFileSync(new URL('../../lib/services/paymentReconciliation.js', import.meta.url), 'utf8');
const billingSvcSrc = readFileSync(new URL('../../lib/services/billing.js', import.meta.url), 'utf8');

function sliceFn(src, name) {
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `缺少函数 ${name}`);
  const next = src.indexOf('\nexport ', start + 1);
  return src.slice(start, next < 0 ? src.length : next);
}

test('cycleDue 只在间隔满后放行', () => {
  const now = 1_000_000;
  assert.equal(cycleDue({ intervalMs: 60_000, now }), true, '首轮必须立即执行，服务重启后不丢单');
  assert.equal(cycleDue({ lastRunAt: now - 59_000, intervalMs: 60_000, now }), false);
  assert.equal(cycleDue({ lastRunAt: now - 60_000, intervalMs: 60_000, now }), true);
});

test('对账节奏保留安全下限', () => {
  assert.ok(RECONCILE_INTERVALS.paymentSyncMs >= 10_000, '查单间隔过短会打爆厂商接口');
  assert.ok(RECONCILE_INTERVALS.paymentGraceMs >= 30_000, '宽限期过短会和正常回调抢同一笔履约');
  assert.ok(RECONCILE_INTERVALS.paymentMaxAgeMs >= 60_000);
});

test('listOrdersAwaitingPaymentSync 已实现且只取未入账订单', () => {
  // R9 根因：paymentReconciliation 调用的这个仓储函数此前根本不存在，对账一旦被调用即抛 TypeError。
  assert.equal(typeof billingRepo.listOrdersAwaitingPaymentSync, 'function');
  const sql = sliceFn(repoSrc, 'listOrdersAwaitingPaymentSync');
  assert.match(sql, /status IN \('created','pending','processing'\)/, '不能重复查已入账/已退款的单');
  assert.doesNotMatch(sql, /'paid'|'refunded'/, '终态订单必须排除在查单候选之外');
  assert.match(sql, /provider IN \('alipay','wechat','stripe'\)/);
  assert.match(sql, /created_at <= \$1/);
  assert.match(sql, /created_at >= \$2/);
  assert.match(sql, /LIMIT \$3/);
  assert.doesNotMatch(sql, /\$\{/, '候选查询不得拼接用户输入');
});

test('worker 常驻循环按周期触发查单对账', () => {
  assert.match(workerSrc, /import \{ reconcilePendingPaymentOrders, cycleDue, RECONCILE_INTERVALS \} from '\.\.\/lib\/services\/paymentReconciliation\.js';/);
  assert.match(workerSrc, /await syncPendingPayments\(\);/, '主循环必须调用对账，否则模块依旧是死代码');
  assert.match(workerSrc, /lastPaymentSyncAt = Date\.now\(\);/, '失败也要先推进时间戳，避免重试风暴');
  assert.ok(
    workerSrc.indexOf('lastPaymentSyncAt = Date.now();') < workerSrc.indexOf('reconcilePendingPaymentOrders({ limit'),
    '时间戳必须在查单前推进'
  );
  assert.match(workerSrc, /code: error\.code \|\| 'PAYMENT_SYNC_FAILED'/, '对账失败必须带错误码落日志，不能静默');
});

test('对账以系统身份核销且单条失败不中断整轮', () => {
  assert.match(reconcileSrc, /syncOrderPaymentStatus\(row\.id, null\)/);
  assert.match(reconcileSrc, /catch \(error\) \{[\s\S]*results\.push/);
});

test('退款积分欠账有读取方', () => {
  // R30 根因：creditService 只往 credit_refund_obligations 写入，全仓没有任何 SELECT，欠账永久沉默。
  assert.equal(typeof billingRepo.listOutstandingCreditRefundObligations, 'function');
  const sql = sliceFn(repoSrc, 'listOutstandingCreditRefundObligations');
  assert.match(sql, /FROM credit_refund_obligations/);
  assert.match(sql, /status = 'PENDING'/, '已结清的欠账不该反复告警');
  assert.match(sql, /granted_amount > reversed_amount/, '余额已回收完的记录不再算欠账');
  assert.match(sql, /LIMIT \$1/);
  assert.doesNotMatch(sql, /\$\{/, '欠账查询不得拼接输入');
  assert.match(reconcileSrc, /await billingRepo\.listOutstandingCreditRefundObligations\(/, '对账轮次必须读欠账表');
  assert.match(reconcileSrc, /return \{ scanned: rows\.length, results, outstandingCreditRefunds \}/);
  assert.match(reconcileSrc, /CREDIT_REFUND_OBLIGATIONS_READ_FAILED/, '读表失败要带错误码，不能静默吞掉');
  assert.match(workerSrc, /console\.warn\('\[generation-worker\] credit refund shortfall'/, '有欠账必须落到 worker 日志');
});

test('退款接口把积分回收结果回传给操作者', () => {
  const fn = sliceFn(billingSvcSrc, 'processOrderRefund');
  assert.match(fn, /const creditRecovery = await reversePaymentCredits\(/, '回收结果不能写完整就不管');
  assert.match(fn, /credit_unrecovered: creditRecovery\?\.unrecoveredAmount \?\? null/, '审计日志必须留下未回收数额');
  assert.match(fn, /reversedAmount: Number\(outcome\.creditRecovery\.reversedAmount \|\| 0\)/);
  assert.match(fn, /unrecoveredAmount: Number\(outcome\.creditRecovery\.unrecoveredAmount \|\| 0\)/);
});
