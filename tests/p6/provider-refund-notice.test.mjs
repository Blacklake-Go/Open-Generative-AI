import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const dispatcher = read('lib/services/webhookDispatcher.js');
const alipayRoute = read('app/api/billing/webhooks/alipay/route.js');
const wechatRoute = read('app/api/billing/webhooks/wechat/route.js');

function fnBody(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `缺少 ${name}`);
  const end = source.indexOf('\nasync function ', start + 1);
  const altEnd = source.indexOf('\nexport async function ', start + 1);
  const stop = [end, altEnd].filter((i) => i > start).sort((a, b) => a - b)[0] ?? source.length;
  return source.slice(start, stop);
}

test('厂商侧退款通知有独立核销分支，不再落入 skipReason 空转', () => {
  const body = fnBody(dispatcher, 'dispatchPaymentRefundNoticeInTransaction');
  assert.match(body, /recordPaymentRefund\(/, '退款必须写 payment_ledger');
  assert.match(body, /markOrderRefundedFromWebhook\(/, '订单必须置为 refunded');
  assert.match(body, /reversePaymentCredits\(\{/, '已发额度必须回收');
  assert.match(body, /idempotencyKey: `payment:\$\{eventId\}:credits_refund`/);
  assert.match(body, /riskLevel: 'high'/, '退款核销属于高危资金动作，必须留高风险审计');
});

test('退款核销只处理已入账订单，且渠道必须与下单渠道一致', () => {
  const body = fnBody(dispatcher, 'dispatchPaymentRefundNoticeInTransaction');
  assert.match(body, /if \(order\.status !== 'paid'\)/, '未入账/已退款订单不得再次核销');
  assert.match(body, /refund_already_recorded/);
  assert.match(body, /refund_notice_not_paid/);
  assert.match(body, /与订单渠道/);
  assert.match(body, /if \(!inserted\) return \{ success: true, action: 'refund_already_recorded'/, '账本冲突时必须幂等返回');
});

test('handleProviderPaymentWebhook 接收 refund 载荷并优先走退款履约', () => {
  assert.match(dispatcher, /payment = null, refund = null/);
  const receipt = /const receipt = \{[^}]*refund: refund \|\| null/.exec(dispatcher);
  assert.ok(receipt, '退款载荷必须进入 webhook_events 留痕，否则重放无据可依');
  assert.match(dispatcher, /if \(refund\) \{\s*const refundResult = await dispatchPaymentRefundNoticeInTransaction/);
  assert.match(dispatcher, /if \(!payment\) \{[\s\S]*?action: 'skipped'/, '无支付也无退款时仍按跳过留痕');
  assert.match(dispatcher, /payment: payload\.payment \|\| null,\s*refund: payload\.refund \|\| null/, '后台重放必须带上退款载荷');
});

test('支付宝 TRADE_CLOSED 通知进入退款核销且事件号与支付通知区分', () => {
  assert.match(alipayRoute, /const isClosed = tradeStatus === 'TRADE_CLOSED'/);
  assert.match(alipayRoute, /const eventId = `alipay_\$\{params\.trade_no \|\| outTradeNo.*\}\$\{isClosed \? '_closed' : ''\}`;/, '关单通知与成功通知共用 trade_no，只在关单时加后缀区分，同号会被幂等留痕判为重复');
  assert.match(alipayRoute, /refund: isClosed && outTradeNo \? \{[\s\S]*?refund_amount_minor: Math\.round\(Number\(params\.refund_amount \|\| params\.total_amount \|\| 0\) \* 100\)/);
});

test('微信 REFUND 通知仅在退款成功时核销，事件号与支付通知区分', () => {
  assert.match(wechatRoute, /startsWith\('REFUND\.'\)/);
  assert.match(wechatRoute, /decrypted\?\.refund_status === 'SUCCESS'/, 'ABNORMAL/CLOSED 表示钱未退出，不能回收积分');
  assert.match(wechatRoute, /const isPaid = !isRefundNotice/, '退款通知不得再次触发支付履约');
  assert.match(wechatRoute, /wx_\$\{decrypted\?\.refund_id \|\| transactionId \|\| outTradeNo\}_refund/);
  assert.match(wechatRoute, /refund_amount_minor: Number\(decrypted\?\.amount\?\.refund \|\| 0\)/);
});
