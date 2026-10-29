import 'server-only';

import { queryOne, withTransaction, nowIso } from '../db/index.js';
import { pagedQuery } from '../admin/pagination.js';
import { hasPermission, PERMISSIONS } from '../admin/permissions.js';
import { logAudit } from '../admin/audit.js';
import { insertGenerationEvent, updateGenerationOutcome } from '../repositories/creations.js';
import { validateCreditAllocations } from '../financial/creditLots.js';
import { voidCredits } from '../financial/creditService.js';
import { pollGenerationTask } from './generationCore.js';

function reject(message, code = 'RECONCILIATION_EVIDENCE_REQUIRED') {
  throw Object.assign(new Error(message), { code });
}

export async function listGenerationReconciliations(searchParams) {
  return pagedQuery({ searchParams, tableAlias: 'pending', baseSql: `SELECT * FROM (
    SELECT COALESCE(c.id,'reservation:'||r.id) AS id, c.id AS creation_id,
      r.id AS reservation_id, COALESCE(c.user_id,r.user_id) AS user_id,
      COALESCE(c.model,r.model_id) AS model_id, c.status AS task_status,
      c.provider, c.provider_request_id, c.updated_at AS task_updated_at,
      COALESCE(r.reserved_amount,0)::int AS reserved_amount, r.bucket_split_json,
      r.bucket_allocations_json IS NULL AND
        (COALESCE(r.bucket_split_json->>'daily','0') <> '0' OR COALESCE(r.bucket_split_json->>'subscription','0') <> '0') AS needs_expiry_evidence,
      COALESCE(c.created_at,r.created_at) AS created_at,
      CASE WHEN c.id IS NULL THEN 'UNLINKED_RESERVATION'
        WHEN c.status IN ('failed','cancelled') THEN 'TERMINAL_TASK_RESERVED_FUNDS'
        ELSE 'UPSTREAM_OUTCOME_UNCONFIRMED' END AS reason
    FROM ai_studio.creations c FULL JOIN ops_bill.credit_reservations r ON c.reservation_id=r.id
    WHERE (r.status='RESERVED' AND (
      (c.id IS NULL AND r.expires_at <= now()) OR c.status IN ('failed','cancelled') OR
      (r.bucket_allocations_json IS NULL AND
        (COALESCE(r.bucket_split_json->>'daily','0') <> '0' OR COALESCE(r.bucket_split_json->>'subscription','0') <> '0'))))
      OR (c.status='processing' AND EXISTS(SELECT 1 FROM ai_studio.generation_events e
        WHERE e.creation_id=c.id AND e.event_type='TASK_RECONCILIATION_REQUIRED'))
    ) pending WHERE TRUE` });
}

export async function reconcileGeneration({ actor, creationId = null, reservationId = null, action,
  evidence = {}, originalExpiries = {}, idempotencyKey, requestId = null }) {
  if (!hasPermission(actor?.role, PERMISSIONS.generationsWrite)) reject('没有任务核对权限', 'FORBIDDEN');
  if (!idempotencyKey || (!creationId && !reservationId)) reject('缺少核对对象或幂等标识', 'VALIDATION_ERROR');
  const initial = creationId ? await queryOne('SELECT * FROM ai_studio.creations WHERE id=$1', [creationId])
    : reservationId ? await queryOne('SELECT * FROM ai_studio.creations WHERE reservation_id=$1', [reservationId]) : null;
  if (initial && reservationId && initial.reservation_id !== reservationId) reject('任务与预扣单不一致', 'RECONCILIATION_CONFLICT');
  creationId = initial?.id || creationId;
  if (creationId && !initial) reject('任务不存在', 'NOT_FOUND');
  if (action === 'poll') {
    if (!initial?.provider_request_id) reject('没有上游任务回执，不能重新提交或盲目轮询', 'PROVIDER_RECEIPT_REQUIRED');
    const result = await pollGenerationTask({ creationId, force: true });
    await logAudit({ actor, action: 'generation.reconciliation_poll', targetType: 'creation', targetId: creationId,
      requestId, after: { status: result.creation?.status || 'processing' } });
    return { status: result.creation?.status || 'processing' };
  }
  if (action !== 'confirm_failure') reject('未知的核对动作', 'VALIDATION_ERROR');
  if (!hasPermission(actor.role, PERMISSIONS.creditsAdjust)) reject('释放冻结款同时需要积分调整权限', 'FORBIDDEN');
  if (!['provider_failed', 'not_submitted'].includes(evidence.kind)
    || typeof evidence.reference !== 'string' || !/^[a-z0-9][a-z0-9._:/-]*$/i.test(evidence.reference)
    || !Number.isFinite(Date.parse(evidence.observedAt)) || Date.parse(evidence.observedAt) > Date.now()) {
    reject('须记录已核实的供应商终态或未提交证明、凭据编号及核对时间');
  }
  const targetReservation = initial?.reservation_id || reservationId;
  return withTransaction(async (tx) => {
    // Match settlement's reservation -> creation lock order.
    const reservation = targetReservation ? await tx.queryOne('SELECT * FROM ops_bill.credit_reservations WHERE id=$1 FOR UPDATE', [targetReservation]) : null;
    const creation = creationId ? await tx.queryOne('SELECT * FROM ai_studio.creations WHERE id=$1 FOR UPDATE', [creationId]) : null;
    if (targetReservation && !reservation) reject('预扣单不存在', 'NOT_FOUND');
    if (creation && reservation && (creation.reservation_id !== reservation.id || creation.user_id !== reservation.user_id)) reject('任务与预扣单不一致', 'RECONCILIATION_CONFLICT');
    if (creation?.status === 'succeeded' || reservation?.status === 'COMMITTED') reject('已成功结算的任务不能按失败退款', 'RECONCILIATION_CONFLICT');
    if (reservation?.status === 'VOIDED') return { status: creation?.status || 'failed', idempotent: true,
      releasedAmount: reservation.released_amount, expiredAmount: reservation.expired_amount };
    if (creation && !['processing', 'failed', 'cancelled'].includes(creation.status)) reject('任务状态不接受失败核对', 'RECONCILIATION_CONFLICT');
    // Durable provider success evidence outranks manual failure proof. The
    // creation row is already locked, and checkpoint writes lock it first too,
    // so this read cannot race a newly persisted result.
    if (creation) {
      const checkpoint = await tx.queryOne(
        'SELECT stage FROM ai_studio.generation_result_checkpoints WHERE creation_id=$1',
        [creation.id],
      );
      if (checkpoint) reject('已存在供应商成功结果证据，不能按失败退款，请先恢复结果归档', 'RECONCILIATION_CONFLICT');
    }
    const providerRequestId = creation?.provider_request_id || creation?.external_request_id || null;
    if (evidence.kind === 'not_submitted' && providerRequestId) reject('已有上游回执，不能认定为未提交');
    if (evidence.kind === 'provider_failed' && (!providerRequestId || evidence.providerRequestId !== providerRequestId)) reject('失败证明必须与当前上游任务回执一致');
    if (reservation && !reservation.bucket_allocations_json) {
      const split = reservation.bucket_split_json;
      const allocations = [];
      for (const bucket of ['daily','subscription','perpetual']) {
        if (!split[bucket]) continue;
        let expiresAt = null;
        if (bucket !== 'perpetual') {
          const original = originalExpiries[bucket];
          if (!original || !['expires','permanent'].includes(original.kind)) reject('旧预扣须提供每个原资金桶的有效期凭据');
          if (original.kind === 'expires') {
            const time = Date.parse(original.expiresAt);
            if (!Number.isFinite(time) || time <= new Date(reservation.created_at).getTime()) reject('原有效期必须晚于原预扣时间');
            expiresAt = new Date(time).toISOString();
          }
        }
        allocations.push({ bucket, source: 'wallet', amount: split[bucket], expiresAt });
      }
      validateCreditAllocations(allocations, split);
      await tx.execute('UPDATE ops_bill.credit_reservations SET bucket_allocations_json=$1::jsonb WHERE id=$2', [JSON.stringify(allocations), reservation.id]);
    }
    const release = reservation ? await voidCredits({ reservationId: reservation.id, expectedUserId: reservation.user_id, transaction: tx }) : { releasedAmount: 0, expiredAmount: 0 };
    let status = creation?.status || 'failed';
    if (creation?.status === 'processing') {
      const updated = await updateGenerationOutcome(creation.id, { status: 'failed', expectedStatus: 'processing',
        errorCode: 'RECONCILIATION_CONFIRMED_FAILED', errorReason: '上游结果已核对为失败，预留积分已按原有效期处理', transaction: tx });
      status = updated.status;
    }
    if (creation) await insertGenerationEvent({ creationId: creation.id, userId: creation.user_id,
      eventType: 'TASK_RECONCILIATION_RESOLVED', fromStatus: creation.status, toStatus: status,
      reservationId: reservation?.id, provider: creation.provider, providerRequestId,
      idempotencyKey, metadata: { evidence, releasedAmount: release.releasedAmount, expiredAmount: release.expiredAmount }, transaction: tx });
    await logAudit({ actor, action: 'generation.reconciliation_confirm_failure', targetType: creation ? 'creation' : 'credit_reservation',
      targetId: creation?.id || reservation.id, riskLevel: 'high', requestId,
      before: { status: creation?.status, reservationStatus: reservation?.status },
      after: { evidence, originalExpiries, status, releasedAmount: release.releasedAmount, expiredAmount: release.expiredAmount, observedAt: nowIso() }, transaction: tx });
    return { status, releasedAmount: release.releasedAmount, expiredAmount: release.expiredAmount };
  });
}
