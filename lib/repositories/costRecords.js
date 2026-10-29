import 'server-only';

import crypto from 'node:crypto';
import { execute, nowIso, queryMany, queryOne, randomId, withTransaction } from '../db/index.js';

const RECONCILING_STATUSES = new Set(['invoice_matched', 'disputed', 'not_billable', 'cost_gap']);
const MAX_EVIDENCE_REF_LENGTH = 512;
const MAX_REASON_LENGTH = 1000;

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
  // Manual reconciliation states also lock actual_cost_usd/cost_source; the
  // reconciled amount lives in reconciled_cost_usd and is written only by
  // reconcileProviderCostRecord. Retries here never touch it.
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

function reconciliationError(message, code = 'COST_RECONCILIATION_INVALID') {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Validate a manual reconciliation before touching the database.
 * Rules mirror what the columns can represent:
 *  - invoice_matched / not_billable must carry an explicit amount (0 is a fact, not an estimate)
 *  - cost_gap keeps the cost NULL and only records why the amount is unknown
 *  - disputed may leave the amount unknown while the bill is contested
 * Extracted as a pure function so the rules stay testable without PostgreSQL.
 */
export function normalizeCostReconciliation({ status, reconciledCostUsd = null, evidenceRef = null, varianceReason = null } = {}) {
  if (!RECONCILING_STATUSES.has(status)) {
    throw reconciliationError(`不支持的对账状态: ${status ?? '(空)'}`);
  }

  let amount = null;
  if (reconciledCostUsd !== null && reconciledCostUsd !== undefined) {
    if (typeof reconciledCostUsd === 'number') {
      amount = reconciledCostUsd;
    } else if (typeof reconciledCostUsd === 'string' && /^[0-9]+(\.[0-9]+)?$/.test(reconciledCostUsd.trim())) {
      amount = Number(reconciledCostUsd.trim());
    } else {
      amount = NaN;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      throw reconciliationError('对账金额必须是非负数字');
    }
  }

  const evidence = typeof evidenceRef === 'string' && evidenceRef.trim() ? evidenceRef.trim() : null;
  const reason = typeof varianceReason === 'string' && varianceReason.trim() ? varianceReason.trim() : null;
  if (evidence && evidence.length > MAX_EVIDENCE_REF_LENGTH) {
    throw reconciliationError(`账单证据引用不能超过 ${MAX_EVIDENCE_REF_LENGTH} 个字符`);
  }
  if (reason && reason.length > MAX_REASON_LENGTH) {
    throw reconciliationError(`差异原因不能超过 ${MAX_REASON_LENGTH} 个字符`);
  }

  if (status === 'invoice_matched') {
    if (amount === null) throw reconciliationError('账单已匹配必须填写对账确认金额');
    if (!evidence) throw reconciliationError('账单已匹配必须提供账单证据引用');
  }
  if (status === 'not_billable') {
    if (amount === null) throw reconciliationError('供应商未计费必须明确确认金额为 0');
    if (amount !== 0) throw reconciliationError('供应商未计费的对账金额只能为 0');
  }
  if (status === 'disputed' && !reason) {
    throw reconciliationError('争议状态必须填写差异原因');
  }
  if (status === 'cost_gap') {
    if (amount !== null) throw reconciliationError('历史成本缺口必须保持金额未知（null）');
    if (!reason) throw reconciliationError('历史成本缺口必须填写原因');
  }

  return { status, reconciledCostUsd: amount, evidenceRef: evidence, varianceReason: reason };
}

/**
 * Record a manual reconciliation decision for one cost record.
 * Estimated / provider-reported / reconciled amounts stay independent:
 * this writes only reconciled_cost_usd + evidence/reason, never
 * actual_cost_usd, credits_charged or any user credit balance.
 * A row lock serialises concurrent reconciliations and every decision is
 * appended to provider_cost_reconciliation_events.
 */
export async function reconcileProviderCostRecord({
  costRecordId,
  status,
  reconciledCostUsd = null,
  evidenceRef = null,
  varianceReason = null,
  actorId,
  transaction = null,
} = {}) {
  if (!costRecordId) throw reconciliationError('必须指定要核对的成本记录', 'COST_RECORD_NOT_FOUND');
  const normalized = normalizeCostReconciliation({ status, reconciledCostUsd, evidenceRef, varianceReason });

  const run = async (tx) => {
    const record = await tx.queryOne(`
      SELECT id, job_id, attempt_id, provider_id, model_id,
        actual_cost_usd, estimated_cost_usd, reconciliation_status
      FROM ai_studio.provider_cost_records
      WHERE id = $1
      FOR UPDATE
    `, [costRecordId]);
    if (!record) throw reconciliationError(`成本记录 ${costRecordId} 不存在`, 'COST_RECORD_NOT_FOUND');

    const reported = record.actual_cost_usd === null || record.actual_cost_usd === undefined
      ? null
      : Number(record.actual_cost_usd);
    const variance = reported === null || normalized.reconciledCostUsd === null
      ? null
      : Number((normalized.reconciledCostUsd - reported).toFixed(8));
    const now = nowIso();
    const eventId = `pcre_${randomId()}`;

    await tx.execute(`
      UPDATE ai_studio.provider_cost_records
      SET reconciliation_status = $2,
          reconciled_cost_usd = $3,
          billing_evidence_ref = $4,
          variance_reason = $5,
          reconciled_at = $6,
          reconciled_by = $7
      WHERE id = $1
    `, [
      costRecordId, normalized.status, normalized.reconciledCostUsd,
      normalized.evidenceRef, normalized.varianceReason, now, actorId || null,
    ]);

    await tx.execute(`
      INSERT INTO ai_studio.provider_cost_reconciliation_events
        (id, cost_record_id, job_id, attempt_id, from_status, to_status,
         provider_reported_cost_usd, reconciled_cost_usd, variance_usd,
         evidence_ref, variance_reason, actor_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      eventId, costRecordId, record.job_id, record.attempt_id,
      record.reconciliation_status, normalized.status,
      reported, normalized.reconciledCostUsd, variance,
      normalized.evidenceRef, normalized.varianceReason, actorId || null, now,
    ]);

    return {
      eventId,
      costRecordId,
      jobId: record.job_id,
      attemptId: record.attempt_id,
      providerId: record.provider_id,
      modelId: record.model_id,
      fromStatus: record.reconciliation_status,
      status: normalized.status,
      providerReportedCostUsd: reported,
      reconciledCostUsd: normalized.reconciledCostUsd,
      varianceUsd: variance,
      evidenceRef: normalized.evidenceRef,
      varianceReason: normalized.varianceReason,
      reconciledAt: now,
      actorId: actorId || null,
    };
  };

  if (transaction?.queryOne) return run(transaction);
  return withTransaction(run);
}

export async function getProviderCostRecord(costRecordId) {
  return queryOne(`
    SELECT id, job_id, attempt_id, provider_id, model_id, credits_charged,
      estimated_cost_usd, actual_cost_usd, reconciled_cost_usd, currency,
      price_version_id, fx_snapshot_json, cost_source, reconciliation_status,
      billing_evidence_ref, variance_reason, reconciled_at, reconciled_by, created_at
    FROM ai_studio.provider_cost_records
    WHERE id = $1
  `, [costRecordId]);
}

export async function listCostReconciliationEvents(costRecordId, { limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return queryMany(`
    SELECT id, cost_record_id, job_id, attempt_id, from_status, to_status,
      provider_reported_cost_usd, reconciled_cost_usd, variance_usd,
      evidence_ref, variance_reason, actor_id, created_at
    FROM ai_studio.provider_cost_reconciliation_events
    WHERE cost_record_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT ${safeLimit}
  `, [costRecordId]);
}

/**
 * Queue for the admin cost center: records whose cost is unknown, disputed
 * or recorded as a historical gap. Estimated-only rows stay listed until a
 * human decides, instead of being silently treated as confirmed cost.
 */
export async function listCostReconciliationQueue({ status = null, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const statuses = status && RECONCILING_STATUSES.has(status)
    ? [status]
    : ['pending_reconciliation', 'provider_reported', 'disputed', 'cost_gap'];
  return queryMany(`
    SELECT pcr.id, pcr.job_id, pcr.attempt_id, pcr.provider_id, pcr.model_id,
      pcr.credits_charged, pcr.estimated_cost_usd, pcr.actual_cost_usd,
      pcr.reconciled_cost_usd, pcr.currency, pcr.reconciliation_status,
      pcr.cost_source, pcr.billing_evidence_ref, pcr.variance_reason,
      pcr.reconciled_at, pcr.reconciled_by, pcr.created_at,
      c.status AS job_status
    FROM ai_studio.provider_cost_records pcr
    LEFT JOIN ai_studio.creations c ON c.id = pcr.job_id
    WHERE pcr.reconciliation_status = ANY($1::text[])
    ORDER BY pcr.created_at DESC, pcr.id DESC
    LIMIT ${safeLimit}
  `, [statuses]);
}
