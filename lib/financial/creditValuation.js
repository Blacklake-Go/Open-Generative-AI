import { CREDIT_PRICING_POLICY } from '../pricing/creditPolicy.js';

export const CREDIT_VALUATION_SETTING_KEY = 'credit_valuation';
export const BUILT_IN_CREDIT_VALUATION = Object.freeze({cnyPerCredit:CREDIT_PRICING_POLICY.cnyPerCredit,usdPerCredit:null,usdToCnyRate:null});

// Legacy USD settings cannot override the CNY credit value used by live quotes.
export function resolveCreditValuationFromSetting(_legacySetting, fxSnapshot = {}) {
  const rate=Number(fxSnapshot.usdToCny ?? fxSnapshot.rates?.USD_CNY);
  const known=Number.isFinite(rate) && rate>0;
  return {
    cnyPerCredit:CREDIT_PRICING_POLICY.cnyPerCredit,
    usdToCnyRate:known ? rate : null,
    usdPerCredit:known ? CREDIT_PRICING_POLICY.cnyPerCredit/rate : null,
    creditsPerUsd:known ? rate/CREDIT_PRICING_POLICY.cnyPerCredit : null,
    source:known ? 'runtime_fx_snapshot' : 'fx_unavailable',
  };
}
