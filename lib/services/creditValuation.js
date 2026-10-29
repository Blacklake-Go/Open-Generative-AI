import 'server-only';
import { getCurrentExchangeRateSnapshot } from './exchangeRates.js';
import { resolveCreditValuationFromSetting } from '../financial/creditValuation.js';
export { CREDIT_VALUATION_SETTING_KEY } from '../financial/creditValuation.js';

export async function resolveCreditValuation() {
  const fxSnapshot = await getCurrentExchangeRateSnapshot();
  return {...resolveCreditValuationFromSetting(null,fxSnapshot),fxSnapshot};
}
