import 'server-only';
import { execute, queryMany } from '../lib/db/index.js';
import {
  CREDIT_PRICING_POLICY,
  providerCostCandidates,
  quoteCreditsFromProviderCostCny,
} from '../lib/pricing/creditPolicy.js';

const apply = process.argv.includes('--apply');

function asObject(value) {
  if (!value || typeof value === 'object') return value || {};
  try { return JSON.parse(value); } catch { return {}; }
}

function isVideo(category) {
  return ['video', 'video_image', 'video_text'].includes(String(category));
}

function normalizeVideoCost(row) {
  const config = { ...asObject(row.cost_config) };
  if (!isVideo(row.category)) return config;

  const hasPerSecond = Number(config.cost_per_output_second || config.cost_per_second) > 0;
  const legacyPerSecond = Number(config.base_cost || 0);
  if (!hasPerSecond && legacyPerSecond > 0) {
    config.cost_per_output_second = legacyPerSecond;
    config.base_cost = 0;
    if (/(edit|recast|r2v|motion-control|video-to-video)/i.test(row.model_id)) {
      config.cost_per_input_second = Number(config.cost_per_input_second || legacyPerSecond);
    }
  }
  config.default_output_seconds = Number(config.default_output_seconds || 5);
  config.duration_scales = false;
  config.pricing_policy_version = '2026-09-22';
  return config;
}

async function main() {
  if (apply) {
    const { getMigrationStatus } = await import('../lib/db/migrations.js');
    const migrationStatus = await getMigrationStatus();
    if (!migrationStatus.ok) {
      throw new Error(`迁移账本不健康，拒绝写入价盘（drift=${(migrationStatus.drifted || []).join(',') || 'none'}，pending=${(migrationStatus.pending || []).join(',') || 'none'}）`);
    }
    const appliedPricingPolicy = (migrationStatus.applied || []).some((item) =>
      String(item.version || '').endsWith('_pricing_policy_v2'));
    const pendingPricingPolicy = (migrationStatus.pending || []).find((version) =>
      String(version).endsWith('_pricing_policy_v2'));
    if (!appliedPricingPolicy) {
      throw new Error(
        `${pendingPricingPolicy || 'pricing_policy_v2'} 尚未执行，请先通过 npm run db:migrate 完成数据库迁移`,
      );
    }
  }

  const [models, providerRows] = await Promise.all([
    queryMany('SELECT id, category FROM ai_studio.ai_models ORDER BY id ASC'),
    queryMany(`
      SELECT pm.id, pm.model_id, pm.provider_id, pm.provider_model_id, pm.priority, pm.cost_config,
             m.category
      FROM ai_studio.provider_models pm
      JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
      JOIN ai_studio.ai_models m ON m.id = pm.model_id
      WHERE pm.enabled = TRUE AND p.enabled = TRUE
      ORDER BY pm.model_id ASC, pm.priority DESC, pm.id ASC
    `),
  ]);

  const providersByModel = new Map();
  for (const row of providerRows) {
    const list = providersByModel.get(row.model_id) || [];
    list.push({ ...row, cost_config: normalizeVideoCost(row) });
    providersByModel.set(row.model_id, list);
  }

  let priced = 0;
  let unpriced = 0;
  for (const model of models) {
    const providers = providersByModel.get(model.id) || [];
    const candidates = providerCostCandidates(providers, {});
    const mostExpensive = candidates[0] || null;
    if (!mostExpensive) {
      unpriced += 1;
      console.log(`${apply ? 'SKIP' : 'DRY'}\t${model.id}\tNO_ENABLED_COST_SOURCE`);
      continue;
    }

    const quote = quoteCreditsFromProviderCostCny(mostExpensive.costCny);
    const pricingType = isVideo(model.category) ? 'formula' : 'fixed';
    const formulaConfig = {
      pricing_policy_version: '2026-09-22',
      cost_source_required: true,
      credit_value_cny: CREDIT_PRICING_POLICY.cnyPerCredit,
      provider_cost_reserve_rate: CREDIT_PRICING_POLICY.providerCostReserveRate,
      target_contribution_margin_rate: CREDIT_PRICING_POLICY.targetContributionMarginRate,
      credit_rounding: CREDIT_PRICING_POLICY.creditRounding,
      membership_price_multiplier: 1,
    };

    console.log([
      apply ? 'APPLY' : 'DRY',
      model.id,
      pricingType,
      `cost=${mostExpensive.costCny.toFixed(4)}CNY`,
      `credits=${quote.credits}`,
      `source=${mostExpensive.providerId}/${mostExpensive.providerModelId}`,
    ].join('\t'));

    if (apply) {
      for (const provider of providers) {
        await execute(
          'UPDATE ai_studio.provider_models SET cost_config = $1::jsonb, updated_at = now() WHERE id = $2',
          [JSON.stringify(provider.cost_config), provider.id],
        );
      }
      await execute(`
        INSERT INTO ai_studio.model_pricing
          (id, model_id, pricing_type, base_credits, formula_config, subscription_discounts,
           min_credits, min_gross_margin_rate, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, '{}'::jsonb, $6, $7, TRUE, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET
          pricing_type = EXCLUDED.pricing_type,
          base_credits = EXCLUDED.base_credits,
          formula_config = ai_studio.model_pricing.formula_config || EXCLUDED.formula_config,
          subscription_discounts = '{}'::jsonb,
          min_credits = GREATEST(ai_studio.model_pricing.min_credits, EXCLUDED.min_credits),
          min_gross_margin_rate = $7,
          is_active = TRUE,
          updated_at = now()
      `, [
        `prc_${model.id.replace(/[^a-zA-Z0-9]/g, '_')}`,
        model.id,
        pricingType,
        quote.credits,
        JSON.stringify(formulaConfig),
        CREDIT_PRICING_POLICY.minimumCredits,
        CREDIT_PRICING_POLICY.targetContributionMarginRate,
      ]);
      priced += 1;
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', priced: apply ? priced : models.length - unpriced, unpriced }));
  if (unpriced > 0 && apply) {
    console.warn('WARNING: 未配置上游成本的模型未被开启定价；请补全 provider_models.cost_config 后再次执行。');
  }
}

main().catch((error) => {
  console.error('PRICING_SYNC_FAILED:', error.message);
  process.exitCode = 1;
});
