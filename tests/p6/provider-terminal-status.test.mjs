import test from 'node:test';
import assert from 'node:assert/strict';
import { providerConfirmedClosed } from '../../lib/payments/orderTerminal.js';

test('native orders close only on a matching provider terminal response', () => {
  assert.equal(providerConfirmedClosed('alipay', { orderId: 'o1', tradeStatus: 'TRADE_CLOSED' }, 'o1'), true);
  assert.equal(providerConfirmedClosed('wechat', { orderId: 'o1', tradeState: 'CLOSED' }, 'o1'), true);
  assert.equal(providerConfirmedClosed('alipay', { orderId: 'o2', tradeStatus: 'TRADE_CLOSED' }, 'o1'), false);
  assert.equal(providerConfirmedClosed('alipay', { orderId: 'o1', tradeStatus: 'WAIT_BUYER_PAY' }, 'o1'), false);
  assert.equal(providerConfirmedClosed('wechat', { orderId: 'o1', tradeState: 'NOTPAY' }, 'o1'), false);
  assert.equal(providerConfirmedClosed('stripe', { orderId: 'o1', tradeStatus: 'TRADE_CLOSED' }, 'o1'), false);
  assert.equal(providerConfirmedClosed('alipay', null, 'o1'), false);
});
