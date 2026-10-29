import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCreditValuationFromSetting} from '../lib/financial/creditValuation.js';
import {costUsdToNumber} from '../lib/modelCenter/routing.js';
import {estimateProviderCost} from '../lib/pricing/creditPolicy.js';

test('valuation, CNY channel costs and legacy estimates use the supplied runtime FX without a fixed fallback',()=>{
  const fx={usdToCny:7};
  const value=resolveCreditValuationFromSetting({usdPerCredit:999},fx);
  assert.equal(value.cnyPerCredit,0.07);
  assert.equal(value.usdPerCredit,0.01);
  assert.equal(costUsdToNumber({baseCost:14,currency:'CNY',fxSnapshot:fx}),2);
  assert.equal(costUsdToNumber({baseCost:14,currency:'CNY'}),null);
  assert.equal(resolveCreditValuationFromSetting(null).usdPerCredit,null);
  assert.equal(estimateProviderCost({base_cost:2,currency:'USD'}, {},fx).costCny,14);
  assert.equal(estimateProviderCost({base_cost:2,currency:'USD'}).configured,false);
});
