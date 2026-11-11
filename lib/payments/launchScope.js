export function checkoutProductAllowed(productType, launchCategories = process.env.PUBLIC_LAUNCH_MODEL_CATEGORIES) {
  if (launchCategories === 'image') return productType === 'credit_pack';
  return ['credit_pack', 'exclusive_pack', 'subscription'].includes(productType);
}

function positiveMoneyMinor(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) && Math.abs(amount * 100 - minor) < 1e-6 ? minor : null;
}

export function subscriptionCheckoutTerms(plan, cycle) {
  const cycles = {
    monthly: { cny: 'monthlyCny', usd: 'monthlyUsd', months: 1, days: 31 },
    quarterly: { cny: 'quarterlyCny', usd: 'quarterlyUsd', months: 3, days: 92 },
    yearly: { cny: 'yearlyCny', usd: 'yearlyUsd', months: 12, days: 365 },
  };
  const selected = cycles[cycle];
  const monthlyCredits = Number(plan?.quotaBase);
  if (!selected || !Number.isSafeInteger(monthlyCredits) || monthlyCredits <= 0) return null;
  const cnyMinor = positiveMoneyMinor(plan?.[selected.cny] ?? plan?.meta?.[selected.cny]);
  const usdMinor = positiveMoneyMinor(plan?.[selected.usd] ?? plan?.meta?.[selected.usd]);
  const creditAmount = monthlyCredits * selected.months;
  if (!Number.isSafeInteger(creditAmount) || !cnyMinor) return null;
  return { cnyMinor, usdMinor, creditAmount, monthlyCredits, periodDays: selected.days };
}
