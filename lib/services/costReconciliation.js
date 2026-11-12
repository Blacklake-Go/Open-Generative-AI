import 'server-only';
import { getProviderCostRecord, listCostReconciliationEvents, listCostReconciliationQueue, reconcileProviderCostRecord } from '../repositories/costRecords.js';
import { logAudit } from '../admin/audit.js';

function missingRecord() { return Object.assign(new Error('成本记录不存在'), { code: 'COST_RECORD_NOT_FOUND' }); }
export async function readCostReconciliations({ costRecordId, status, limit }) {
  if (!costRecordId) return { rows: await listCostReconciliationQueue({ status, limit }), status: status || null };
  const record = await getProviderCostRecord(costRecordId);
  if (!record) throw missingRecord();
  return { record, events: await listCostReconciliationEvents(costRecordId, { limit }) };
}

// Human cost reconciliation records separate evidence; provider actual cost,
// charged credits and the member wallet remain under their original authority.
export async function recordCostReconciliation({ actor, requestId, ...input }) {
  const before = await getProviderCostRecord(input.costRecordId);
  if (!before) throw missingRecord();
  const result = await reconcileProviderCostRecord({ ...input, actorId: actor.id });
  await logAudit({ actor, action: 'cost.reconcile', targetType: 'provider_cost_record', targetId: input.costRecordId,
    riskLevel: 'medium', requestId,
    before: { status: before.reconciliation_status, estimatedCostUsd: before.estimated_cost_usd,
      providerReportedCostUsd: before.actual_cost_usd, reconciledCostUsd: before.reconciled_cost_usd,
      evidenceRef: before.billing_evidence_ref, varianceReason: before.variance_reason },
    after: { status: result.status, estimatedCostUsd: before.estimated_cost_usd,
      providerReportedCostUsd: result.providerReportedCostUsd, reconciledCostUsd: result.reconciledCostUsd,
      varianceUsd: result.varianceUsd, evidenceRef: result.evidenceRef, varianceReason: result.varianceReason, eventId: result.eventId },
  });
  return result;
}
