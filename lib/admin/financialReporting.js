import 'server-only';

import { queryMany } from '../db/index.js';
import { CREDIT_PRICING_POLICY } from '../pricing/creditPolicy.js';

export {getCurrentExchangeRateSnapshot as getReportingFxSnapshot} from '../services/exchangeRates.js';

// Historical costs use their locked quote FX, including expired historical rates.
// Missing snapshots stay unknown; today's rate would rewrite historical margins.
const historicalRate = `COALESCE(pcr.fx_snapshot_json->>'usdToCny',
  pcr.fx_snapshot_json->'rates'->>'USD_CNY')`;
const fx = `(CASE WHEN ${historicalRate} ~ '^[0-9]+([.][0-9]+)?$'
  THEN NULLIF((${historicalRate})::numeric, 0) END)`;
// Cost preference: human-reconciled amount first, then the provider-reported
// actual cost, then the internal estimate. Rows with none of the three stay
// NULL (unknown) instead of being treated as free.
const cost = 'COALESCE(pcr.reconciled_cost_usd, pcr.actual_cost_usd, pcr.estimated_cost_usd)';
const costCny = `(CASE WHEN ${cost} = 0 THEN 0 ELSE ${cost} * ${fx} END)`;

function periodFilter(period, alias, column) {
  const time = `${alias}.${column}`;
  switch (period) {
    case 'today': return `${time} >= date_trunc('day', now())`;
    case 'yesterday': return `${time} >= date_trunc('day', now()) - INTERVAL '1 day' AND ${time} < date_trunc('day', now())`;
    case '30d': return `${time} >= now() - INTERVAL '30 day'`;
    case 'month': return `${time} >= date_trunc('month', now())`;
    default: return `${time} >= now() - INTERVAL '7 day'`;
  }
}

export async function getCostReport(period = '7d') {
  return queryMany(`SELECT pcr.model_id, m.display_name AS model_name,
    pcr.provider_id, p.name AS provider_name,
    COUNT(*)::int AS total_requests,
    COUNT(*) FILTER (WHERE att.status = 'succeeded')::int AS success_count,
    COUNT(*) FILTER (WHERE att.status = 'failed')::int AS failure_count,
    ROUND(COUNT(*) FILTER (WHERE att.status = 'succeeded')::numeric / COUNT(*) * 100, 1) AS success_rate,
    ROUND(COALESCE(AVG(att.duration_ms), 0))::int AS avg_duration_ms,
    COUNT(*) FILTER (WHERE pcr.actual_cost_usd IS NULL)::int AS pending_reconciliation,
    COUNT(*) FILTER (WHERE pcr.reconciliation_status NOT IN ('invoice_matched', 'not_billable'))::int AS awaiting_reconciliation,
    COUNT(*) FILTER (WHERE pcr.reconciliation_status = 'cost_gap')::int AS cost_gap_count,
    COUNT(*) FILTER (WHERE ${cost} IS NULL)::int AS unknown_cost_count,
    COUNT(*) FILTER (WHERE ${costCny} IS NULL)::int AS unknown_cny_count,
    ROUND(SUM(pcr.actual_cost_usd)::numeric, 4) AS confirmed_cost_usd,
    ROUND(SUM(pcr.reconciled_cost_usd)::numeric, 4) AS reconciled_cost_usd,
    CASE WHEN COUNT(*) FILTER (WHERE pcr.reconciled_cost_usd IS NOT NULL AND ${fx} IS NULL) = 0
      THEN ROUND(SUM(pcr.reconciled_cost_usd * ${fx})::numeric, 2) END AS reconciled_cost_cny,
    CASE WHEN COUNT(*) FILTER (WHERE ${cost} IS NULL) = 0
      THEN ROUND(SUM(${cost})::numeric, 4) END AS total_cost_usd,
    CASE WHEN COUNT(*) FILTER (WHERE ${cost} IS NULL) = 0
      THEN ROUND(SUM(${cost})::numeric / COUNT(*), 6) END AS avg_cost_usd,
    CASE WHEN COUNT(*) FILTER (WHERE ${costCny} IS NULL) = 0
      THEN ROUND(SUM(${costCny})::numeric, 2) END AS total_cost_cny
    FROM ai_studio.provider_cost_records pcr
    LEFT JOIN ai_studio.generation_attempts att ON att.id = pcr.attempt_id
    LEFT JOIN ai_studio.ai_models m ON m.id = pcr.model_id
    LEFT JOIN ai_studio.ai_providers p ON p.id = pcr.provider_id
    WHERE ${periodFilter(period, 'pcr', 'created_at')}
    GROUP BY pcr.model_id, m.display_name, pcr.provider_id, p.name
    ORDER BY total_cost_usd DESC NULLS LAST, total_requests DESC`);
}

export async function getProfitReport(period = '7d') {
  const creditValue = CREDIT_PRICING_POLICY.cnyPerCredit;
  const complete = 'BOOL_AND(COALESCE(cost_agg.cost_complete, false))';
  const chargedCredits = "SUM(CASE WHEN c.status = 'succeeded' THEN c.credit_cost ELSE 0 END)";
  const revenue = `${chargedCredits} * $1::numeric`;
  const cnyCost = 'SUM(cost_agg.total_cost_cny)';
  return queryMany(`SELECT c.model AS model_id, m.display_name AS model_name, m.category,
    mp.min_gross_margin_rate, ${chargedCredits}::int AS total_credits,
    ROUND(${revenue}, 2) AS revenue_cny,
    COUNT(*) FILTER (WHERE NOT COALESCE(cost_agg.cost_complete, false))::int AS unknown_cost_count,
    COALESCE(SUM(cost_agg.pending_reconciliation), 0)::int AS pending_reconciliation,
    COALESCE(SUM(cost_agg.awaiting_reconciliation), 0)::int AS awaiting_reconciliation,
    COALESCE(SUM(cost_agg.reconciled_cost_usd), 0)::numeric AS reconciled_cost_usd,
    CASE WHEN BOOL_AND(COALESCE(cost_agg.usd_complete, false))
      THEN ROUND(SUM(cost_agg.total_cost_usd)::numeric, 4) END AS cost_usd,
    CASE WHEN ${complete} THEN ROUND(${cnyCost}::numeric, 2) END AS cost_cny_est,
    CASE WHEN ${complete} THEN ROUND(${revenue} - ${cnyCost}, 2) END AS gross_profit_cny,
    CASE WHEN ${complete} AND ${revenue} > 0
      THEN ROUND((${revenue} - ${cnyCost}) / (${revenue}) * 100, 1) END AS gross_margin_pct,
    COUNT(*)::int AS generation_count
    FROM ai_studio.creations c
    LEFT JOIN ai_studio.ai_models m ON m.id = c.model
    LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = c.model AND mp.is_active = TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(${cost}) AS total_cost_usd, SUM(${costCny}) AS total_cost_cny,
        COUNT(*) > 0 AND COUNT(*) FILTER (WHERE ${cost} IS NULL) = 0 AS usd_complete,
        COUNT(*) > 0 AND COUNT(*) FILTER (WHERE ${costCny} IS NULL) = 0 AS cost_complete,
        COUNT(*) FILTER (WHERE pcr.actual_cost_usd IS NULL)::int AS pending_reconciliation,
        COUNT(*) FILTER (WHERE pcr.reconciliation_status NOT IN ('invoice_matched', 'not_billable'))::int AS awaiting_reconciliation,
        SUM(pcr.reconciled_cost_usd) AS reconciled_cost_usd
      FROM ai_studio.provider_cost_records pcr WHERE pcr.job_id = c.id
    ) cost_agg ON TRUE
    WHERE (c.status = 'succeeded' OR EXISTS (
      SELECT 1 FROM ai_studio.provider_cost_records incurred WHERE incurred.job_id = c.id
    )) AND ${periodFilter(period, 'c', 'updated_at')}
    GROUP BY c.model, m.display_name, m.category, mp.min_gross_margin_rate
    ORDER BY revenue_cny DESC`, [creditValue]);
}
