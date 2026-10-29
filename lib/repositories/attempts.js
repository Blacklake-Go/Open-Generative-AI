import 'server-only';

import { query, queryOne, queryMany, execute, nowIso, randomId } from '../db/index.js';

export async function createGenerationAttempt({
  creationId,
  attemptNumber,
  providerId,
  providerModelId,
  providerEndpoint = null,
  providerModelVersion = null,
  mappingVersion = null,
  requestPayload = {},
  providerRequestId = null,
  estimatedCostUsd = null,
  priceVersionId = null,
  costCurrency = null,
  costSource = null,
  status = 'submitted',
  transaction = null,
} = {}) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const id = `att_${randomId()}`;
  const now = nowIso();

  await run(`
    INSERT INTO ai_studio.generation_attempts
      (id, creation_id, attempt_number, provider_id, provider_model_id,
       request_payload_json, provider_request_id, status, started_at, created_at,
       estimated_cost_usd, price_version_id, cost_currency, cost_source,
       provider_endpoint, provider_model_version, mapping_version)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $9, $10, $11, $12, $13, $14, $15, $16)
  `, [
    id, creationId, attemptNumber, providerId, providerModelId,
    JSON.stringify(requestPayload || {}), providerRequestId, status, now,
    estimatedCostUsd, priceVersionId, costCurrency, costSource,
    providerEndpoint, providerModelVersion, mappingVersion,
  ]);

  return {
    id,
    creation_id: creationId,
    attempt_number: attemptNumber,
    provider_id: providerId,
    provider_model_id: providerModelId,
    status,
    started_at: now,
  };
}

export async function updateGenerationAttemptOutcome(id, {
  status,
  providerRequestId = null,
  durationMs = null,
  errorCode = null,
  errorReason = null,
  actualCostUsd = null,
  costSource = null,
  reconciliationStatus = null,
  metadata = {},
  transaction = null,
} = {}) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();

  await run(`
    UPDATE ai_studio.generation_attempts
    SET status = $1, provider_request_id = COALESCE($2, provider_request_id),
        duration_ms = $3, error_code = $4, error_reason = $5,
        actual_cost_usd = CASE
          WHEN reconciliation_status IN ('pending_reconciliation', 'provider_reported')
            THEN COALESCE($6, actual_cost_usd)
          ELSE actual_cost_usd
        END,
        cost_source = CASE
          WHEN reconciliation_status IN ('pending_reconciliation', 'provider_reported')
            AND ($6 IS NOT NULL OR actual_cost_usd IS NULL)
            THEN COALESCE($7, cost_source)
          ELSE cost_source
        END,
        reconciliation_status = CASE
          WHEN reconciliation_status NOT IN ('pending_reconciliation', 'provider_reported')
            THEN reconciliation_status
          WHEN $11::text IS NOT NULL AND $11::text <> 'pending_reconciliation' THEN $11::text
          WHEN $6 IS NOT NULL THEN 'provider_reported'
          ELSE reconciliation_status
        END,
        metadata_json = COALESCE(metadata_json, '{}'::jsonb) || $8::jsonb,
        completed_at = CASE WHEN $1 IN ('succeeded', 'failed', 'timeout', 'cancelled') THEN $9::timestamptz ELSE NULL END
    WHERE id = $10
      AND NOT (status = 'succeeded' AND $1 IN ('submitted', 'processing'))
  `, [
    status, providerRequestId, durationMs, errorCode, errorReason,
    actualCostUsd, costSource, JSON.stringify(metadata || {}), now, id, reconciliationStatus,
  ]);
}

export async function listAttemptsByCreationId(creationId) {
  return queryMany(`
    SELECT * FROM ai_studio.generation_attempts
    WHERE creation_id = $1
    ORDER BY attempt_number ASC
  `, [creationId]);
}

export async function getLatestAttemptByCreationId(creationId) {
  return queryOne(`
    SELECT * FROM ai_studio.generation_attempts
    WHERE creation_id = $1
    ORDER BY created_at DESC LIMIT 1
  `, [creationId]);
}

export async function getGenerationAttemptForReceipt(creationId, providerId, providerRequestId, transaction = null) {
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return one(`
    SELECT * FROM ai_studio.generation_attempts
    WHERE creation_id = $1 AND provider_id = $2
      AND provider_request_id IS NOT DISTINCT FROM $3
    ORDER BY attempt_number DESC LIMIT 1
  `, [creationId, providerId, providerRequestId]);
}

export async function countActiveAttemptsByProviderModel(providerId, providerModelId, transaction = null) {
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const result = await one(
    `SELECT COUNT(*)::int AS active_count FROM ai_studio.generation_attempts 
     WHERE provider_id = $1 AND provider_model_id = $2 AND status IN ('submitted', 'processing')`,
    [providerId, providerModelId]
  );
  return result?.active_count || 0;
}

