import 'server-only';

import { queryOne, execute } from '../db/index.js';

export async function findActivePricingStrategy(transaction = null) {
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return one(
    `SELECT * FROM ai_studio.pricing_strategy WHERE is_active = true ORDER BY updated_at DESC LIMIT 1`
  );
}

export async function upsertPricingStrategy(strategy, updatedBy, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const { baseMultiplier, minMarginRate, categoryMultipliers, tierMultipliers, specMultipliers } = strategy;

  await run(`UPDATE ai_studio.pricing_strategy SET is_active = false WHERE is_active = true`);

  return one(`
    INSERT INTO ai_studio.pricing_strategy (
      base_multiplier, min_margin_rate, category_multipliers, tier_multipliers, spec_multipliers,
      is_active, updated_by
    ) VALUES ($1, $2, $3, $4, $5, true, $6)
    RETURNING *
  `, [
    baseMultiplier,
    minMarginRate,
    JSON.stringify(categoryMultipliers || {}),
    JSON.stringify(tierMultipliers || {}),
    JSON.stringify(specMultipliers || {}),
    updatedBy,
  ]);
}
