import 'server-only';

import crypto from 'node:crypto';
import { execute, nowIso, randomId } from '../db/index.js';

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

  // The first write owns the estimate, price, FX and currency snapshots.
  // Merge under PostgreSQL's conflict lock, not a read-before-write race.
  const onConflict = attemptId ? `DO UPDATE SET
    credits_charged = GREATEST(existing.credits_charged, EXCLUDED.credits_charged),
    actual_cost_usd = CASE
      WHEN existing.reconciliation_status IN ('pending_reconciliation', 'provider_reported')
        THEN COALESCE(EXCLUDED.actual_cost_usd, existing.actual_cost_usd)
      ELSE existing.actual_cost_usd
    END,
    cost_source = CASE
      WHEN existing.reconciliation_status IN ('pending_reconciliation', 'provider_reported')
        AND (EXCLUDED.actual_cost_usd IS NOT NULL OR existing.actual_cost_usd IS NULL)
        THEN COALESCE(EXCLUDED.cost_source, existing.cost_source)
      ELSE existing.cost_source
    END,
    reconciliation_status = CASE
      WHEN existing.reconciliation_status IN ('pending_reconciliation', 'provider_reported')
        AND EXCLUDED.reconciliation_status <> 'pending_reconciliation'
        THEN EXCLUDED.reconciliation_status
      ELSE existing.reconciliation_status
    END
    WHERE existing.job_id IS NOT DISTINCT FROM EXCLUDED.job_id
      AND existing.attempt_id IS NOT DISTINCT FROM EXCLUDED.attempt_id
      AND existing.provider_id IS NOT DISTINCT FROM EXCLUDED.provider_id
      AND existing.model_id IS NOT DISTINCT FROM EXCLUDED.model_id
  ` : 'DO NOTHING';
  // Credits only grow on settlement here; refunds have their own accounting path.
  // There is no separate reconciled amount, so manual states also lock amount/source.
  const affected = await run(`
    INSERT INTO ai_studio.provider_cost_records AS existing
      (id, job_id, attempt_id, provider_id, model_id, credits_charged,
       estimated_cost_usd, actual_cost_usd, currency, created_at, price_version_id,
       fx_snapshot_json, cost_source, reconciliation_status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
    ON CONFLICT (id) ${onConflict}
  `, [
    id, jobId, attemptId, providerId, modelId,
    Number(creditsCharged || 0), estimatedCostUsd === null ? null : Number(estimatedCostUsd),
    actualCostUsd === null || actualCostUsd === undefined ? null : Number(actualCostUsd),
    currency, now, priceVersionId, JSON.stringify(fxSnapshot || {}), costSource, reconciliationStatus,
  ]);

  if (attemptId && affected === 0) {
    const error = new Error(`Provider cost record ${id} has a conflicting job/attempt/provider/model identity.`);
    error.code = 'PROVIDER_COST_IDENTITY_CONFLICT';
    throw error;
  }

  return id;
}
