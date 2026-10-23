const PILOT_PACK_ID = 'credit_490';

export function pilotCheckoutEligible({
  userId,
  provider,
  productType,
  planId,
  pilotEnabled = process.env.PAYMENT_PILOT_ENABLED,
  paidCheckoutEnabled = process.env.PUBLIC_PAID_CHECKOUT_ENABLED,
  allowedUserIds = process.env.PAYMENT_PILOT_USER_IDS,
}) {
  if (pilotEnabled !== 'true' || paidCheckoutEnabled === 'true') return false;
  if (!userId || provider !== 'alipay' || productType !== 'credit_pack' || planId !== PILOT_PACK_ID) return false;
  const ids = String(allowedUserIds || '').split(',').map((id) => id.trim()).filter(Boolean);
  return ids.includes(String(userId));
}

export { PILOT_PACK_ID };

export function alipayCheckoutPathConfigured({
  precreateDisabled = process.env.ALIPAY_PRECREATE_DISABLED,
  pagePayEnabled = process.env.ALIPAY_PAGE_PAY_ENABLED,
} = {}) {
  return precreateDisabled !== 'true' || pagePayEnabled === 'true';
}
