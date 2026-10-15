import 'server-only';

import crypto from 'node:crypto';
import { query, queryOne, queryMany, execute, nowIso, randomId } from '../db/index.js';

export async function insertProviderCostRecord({
  jobId,
  attemptId = null,
  providerId,
  modelId,
  creditsCharged = 0,
  estimatedCostUsd = null,
  actualCostUsd = null,
  currency = 'USD',
  priceVersionId = null,
  fxSnapshot = {},
  costSource = null,
  reconciliationStatus = actualCostUsd === null || actualCostUsd === undefined ? 'pending_reconciliation' : 'provider_reported',
  transaction = null,
} = {}) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const id = attemptId
    ? `pcr_${crypto.createHash('sha256').update(String(attemptId)).digest('hex').slice(0, 28)}`
    : `pcr_${randomId()}`;
  const now = nowIso();

  await run(`
    INSERT INTO ai_studio.provider_cost_records
      (id, job_id, attempt_id, provider_id, model_id, credits_charged,
       estimated_cost_usd, actual_cost_usd, currency, created_at, price_version_id,
       fx_snapshot_json, cost_source, reconciliation_status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
    ON CONFLICT (id) DO NOTHING
  `, [
    id, jobId, attemptId, providerId, modelId,
    Number(creditsCharged || 0), estimatedCostUsd === null ? null : Number(estimatedCostUsd),
    actualCostUsd === null || actualCostUsd === undefined ? null : Number(actualCostUsd),
    currency, now, priceVersionId, JSON.stringify(fxSnapshot || {}), costSource, reconciliationStatus,
  ]);

  return id;
}
