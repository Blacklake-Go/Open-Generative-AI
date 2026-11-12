import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutProductAllowed, subscriptionCheckoutTerms } from '../../lib/payments/launchScope.js';

test('image launch permits universal credits and blocks unrelated product purchases', () => {
  assert.equal(checkoutProductAllowed('credit_pack', 'image'), true);
  assert.equal(checkoutProductAllowed('exclusive_pack', 'image'), false);
  assert.equal(checkoutProductAllowed('subscription', 'image'), false);
  assert.equal(checkoutProductAllowed('unknown', 'image'), false);
});

test('subscription checkout uses exact configured period prices and quota', () => {
  const plan = { quotaBase: 2000, monthlyCny: 140, quarterlyCny: 420, yearlyCny: 1680, monthlyUsd: 20, quarterlyUsd: 60, yearlyUsd: 240 };
  assert.deepEqual(subscriptionCheckoutTerms(plan, 'monthly'), { cnyMinor: 14000, usdMinor: 2000, monthlyCredits: 2000, creditAmount: 2000, periodDays: 31 });
  assert.deepEqual(subscriptionCheckoutTerms(plan, 'yearly'), { cnyMinor: 168000, usdMinor: 24000, monthlyCredits: 2000, creditAmount: 24000, periodDays: 365 });
  assert.equal(subscriptionCheckoutTerms({ quotaBase: 2000 }, 'monthly'), null);
  assert.equal(subscriptionCheckoutTerms({ quotaBase: 0, monthlyCny: 140 }, 'monthly'), null);
  assert.equal(subscriptionCheckoutTerms({ quotaBase: 2000, monthlyCny: 140.001 }, 'monthly'), null);
});
