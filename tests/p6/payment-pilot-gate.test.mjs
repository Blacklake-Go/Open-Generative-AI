import test from 'node:test';
import assert from 'node:assert/strict';
import { pilotCheckoutEligible, alipayCheckoutPathConfigured } from '../../lib/payments/paymentPilot.js';

const base = {
  userId: 'pilot-user',
  provider: 'alipay',
  productType: 'credit_pack',
  planId: 'credit_490',
  pilotEnabled: 'true',
  paidCheckoutEnabled: 'false',
  allowedUserIds: 'other-user, pilot-user',
};

test('payment pilot admits only the named account and smallest universal pack while public checkout is closed', () => {
  assert.equal(pilotCheckoutEligible(base), true);
  for (const change of [
    { userId: 'visitor' }, { provider: 'wechat' }, { productType: 'subscription' },
    { planId: 'credit_1400' }, { pilotEnabled: 'false' }, { paidCheckoutEnabled: 'true' },
    { allowedUserIds: '' },
  ]) {
    assert.equal(pilotCheckoutEligible({ ...base, ...change }), false);
  }
});

test('pilot stays disabled when both Alipay checkout methods are closed', () => {
  assert.equal(alipayCheckoutPathConfigured({ precreateDisabled: 'true', pagePayEnabled: 'false' }), false);
  assert.equal(alipayCheckoutPathConfigured({ precreateDisabled: 'true', pagePayEnabled: 'true' }), true);
  assert.equal(alipayCheckoutPathConfigured({ precreateDisabled: 'false', pagePayEnabled: 'false' }), true);
});
