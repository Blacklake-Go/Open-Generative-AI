import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function source(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('coupon verification service masks user identifiers and validates redemption state', async () => {
  const { maskEmail, maskPhone, verifyCoupon } = await import('../../lib/services/coupons.js');

  // Test maskEmail
  assert.equal(maskEmail('admin@supdance.com'), 'adm***@supdance.com');
  assert.equal(maskEmail('ab@test.com'), 'a***@test.com');
  assert.equal(maskEmail('a@test.com'), 'a***@test.com');
  assert.equal(maskEmail(''), '');
  assert.equal(maskEmail(null), '');

  // Test maskPhone
  assert.equal(maskPhone('13812345678'), '138****5678');
  assert.equal(maskPhone('12345'), '12345');
  assert.equal(maskPhone(''), '');

  // Test verifyCoupon without code
  const noCodeRes = await verifyCoupon({ code: '', user: { id: 'u1' } });
  assert.equal(noCodeRes.error, '请输入卡密兑换码');

  // Test verifyCoupon without login
  const noUserRes = await verifyCoupon({ code: 'TEST123', user: null });
  assert.equal(noUserRes.error, '请先登录后再兑换卡密');
});

test('RechargeModal no longer contains exclusive package tab and incorporates confirmation dialog', async () => {
  const rechargeSrc = await source('components/account/RechargeModal.js');

  // Ensure "exclusive" tab is removed
  assert.equal(rechargeSrc.includes('DEFAULT_EXCLUSIVE_FAMILIES'), false);
  assert.equal(rechargeSrc.includes("id: 'exclusive'"), false);
  assert.equal(rechargeSrc.includes('顶级模型专属包'), false);

  // Ensure confirmation dialog & verify flow are present
  assert.equal(rechargeSrc.includes('/api/coupons/verify'), true);
  assert.equal(rechargeSrc.includes('couponConfirmData'), true);
  assert.equal(rechargeSrc.includes('卡密兑换确认'), true);
  assert.equal(rechargeSrc.includes('确认兑换到账'), true);
});

test('CreditsClient includes coupon verification and confirmation modal', async () => {
  const creditsSrc = await source('components/credits/CreditsClient.js');

  assert.equal(creditsSrc.includes('/api/coupons/verify'), true);
  assert.equal(creditsSrc.includes('couponConfirmData'), true);
  assert.equal(creditsSrc.includes('卡密兑换确认'), true);
  assert.equal(creditsSrc.includes('确认兑换到账'), true);
});

test('Admin coupons page and CouponRedemptionDetails component integrate redemption details column', async () => {
  const pageSrc = await source('app/admin/coupons/page.js');
  const detailsSrc = await source('app/admin/coupons/CouponRedemptionDetails.js');

  // Check admin coupons page has redemption details column
  assert.equal(pageSrc.includes('CouponRedemptionDetails'), true);
  assert.equal(pageSrc.includes('兑换明细'), true);

  // Check CouponRedemptionDetails component features
  assert.equal(detailsSrc.includes('待核销'), true);
  assert.equal(detailsSrc.includes('明细详情'), true);
  assert.equal(detailsSrc.includes('卡密兑换明细'), true);
});
