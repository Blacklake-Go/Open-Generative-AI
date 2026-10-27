import { query, queryOne, queryMany, execute, nowIso, randomId } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

const SUCCESS_STATUSES_SQL = "('succeeded', 'completed', 'success')";
const ACTIVE_STATUSES_SQL = "('queued', 'pending', 'processing', 'running')";

const CREATION_COLUMNS_SQL = `c.id, c.user_id, c.studio_id, c.label, c.result_url, c.result_object_key, c.storage_status, c.status, c.credit_cost,
           c.actual_cost_usd, c.error_reason, c.reservation_id, c.idempotency_key,
           c.provider, c.model, c.provider_request_id, c.duration_ms, c.error_code, c.parent_creation_id, c.created_at, u.email`;

/**
 * Shared admin filter builder for the creations list (q / status / studio_id / user_id).
 * Returns SQL clauses plus positional parameters starting at `$1`.
 */
function buildCreationFilters(params) {
  const clauses = ['1=1'];
  const sqlParams = [];
  const nextParameter = () => `$${sqlParams.length + 1}`;
  const add = (value) => {
    const placeholder = nextParameter();
    sqlParams.push(value);
    return placeholder;
  };

  const q = String(params.get('q') || '').trim();
  if (q) {
    const like = `%${q}%`;
    clauses.push(`(u.email ILIKE ${add(like)} OR c.user_id ILIKE ${add(like)} OR c.id ILIKE ${add(like)} OR c.label ILIKE ${add(like)} OR c.model ILIKE ${add(like)})`);
  }

  const status = String(params.get('status') || '').trim();
  if (status) clauses.push(`c.status = ${add(status)}`);

  const studioId = String(params.get('studio_id') || '').trim();
  if (studioId) clauses.push(`c.studio_id = ${add(studioId)}`);

  const userId = String(params.get('user_id') || '').trim();
  if (userId) clauses.push(`c.user_id = ${add(userId)}`);

  return { clauses, sqlParams };
}

export async function listCreations(searchParams) {
  const params = toSearchParams(searchParams);
  const { clauses, sqlParams } = buildCreationFilters(params);

  const baseSql = `
    SELECT ${CREATION_COLUMNS_SQL}
    FROM creations c
    JOIN users u ON u.id = c.user_id
    WHERE ${clauses.join(' AND ')}
  `;

  return await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    tableAlias: 'c',
  });
}

/**
 * Lists one row per user: the user's latest creation that matches the filters,
 * plus per-user aggregates. Cursor pagination runs on (latest created_at, user_id).
 * Row shape: `id` = user_id, `task_id` = latest creation id, `created_at` = latest creation time.
 */
export async function listCreationUserGroups(searchParams) {
  const params = toSearchParams(searchParams);
  const { clauses, sqlParams } = buildCreationFilters(params);

  const baseSql = `
    SELECT * FROM (
      WITH filtered AS (
        SELECT ${CREATION_COLUMNS_SQL}
        FROM creations c
        JOIN users u ON u.id = c.user_id
        WHERE ${clauses.join(' AND ')}
      ),
      ranked AS (
        SELECT f.*,
               ROW_NUMBER() OVER w_sorted AS rn,
               COUNT(*) OVER w_user AS task_count,
               COUNT(*) FILTER (WHERE f.status IN ${SUCCESS_STATUSES_SQL}) OVER w_user AS succeeded_count,
               COUNT(*) FILTER (WHERE f.status IN ${ACTIVE_STATUSES_SQL}) OVER w_user AS active_count,
               COALESCE(SUM(f.credit_cost) OVER w_user, 0) AS total_credits,
               COALESCE(SUM(f.actual_cost_usd) OVER w_user, 0) AS total_cost_usd
        FROM filtered f
        WINDOW w_user AS (PARTITION BY f.user_id),
               w_sorted AS (PARTITION BY f.user_id ORDER BY f.created_at DESC, f.id DESC)
      )
      SELECT r.user_id AS id, r.id AS task_id, r.user_id, r.email, r.studio_id, r.label, r.result_url, r.result_object_key,
             r.storage_status, r.status, r.credit_cost, r.actual_cost_usd, r.error_reason, r.error_code,
             r.provider, r.model, r.duration_ms, r.created_at,
             r.task_count, r.succeeded_count, r.active_count,
             (r.task_count - r.succeeded_count - r.active_count) AS failed_count,
             r.total_credits, r.total_cost_usd
      FROM ranked r
      WHERE r.rn = 1
    ) g
    WHERE 1=1
  `;

  return await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    tableAlias: 'g',
  });
}

/**
 * Batched history for the accordion: for each given user, returns creations ranked
 * 2..(perUser + 1) under the same filters (rank 1 is already shown as the group head).
 */
export async function listRecentCreationsForUsers(searchParams, userIds, perUser = 5) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const params = toSearchParams(searchParams);
  const filterParams = new URLSearchParams(params);
  filterParams.delete('user_id');
  const { clauses, sqlParams } = buildCreationFilters(filterParams);
  const usersPlaceholder = `$${sqlParams.length + 1}`;
  const limitPlaceholder = `$${sqlParams.length + 2}`;

  const sql = `
    SELECT * FROM (
      SELECT ${CREATION_COLUMNS_SQL},
             ROW_NUMBER() OVER (PARTITION BY c.user_id ORDER BY c.created_at DESC, c.id DESC) AS rn
      FROM creations c
      JOIN users u ON u.id = c.user_id
      WHERE ${clauses.join(' AND ')} AND c.user_id = ANY(${usersPlaceholder})
    ) ranked
    WHERE ranked.rn BETWEEN 2 AND ${limitPlaceholder}
    ORDER BY ranked.user_id, ranked.rn
  `;

  const res = await query(sql, [...sqlParams, userIds, Number(perUser) + 1]);
  return res.rows || [];
}

export async function listFailedCreations(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ["c.status NOT IN ('succeeded', 'completed', 'success')"];
  const sqlParams = [];
  let parameterIndex = 0;
  const nextParameter = () => `$${++parameterIndex}`;

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(u.email ILIKE ${nextParameter()} OR c.error_code ILIKE ${nextParameter()} OR c.error_reason ILIKE ${nextParameter()} OR c.model ILIKE ${nextParameter()})`);
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const baseSql = `
    SELECT c.id, c.user_id, c.studio_id, c.label, c.status, c.credit_cost,
           c.actual_cost_usd, c.error_reason, c.reservation_id, c.idempotency_key,
           c.provider, c.model, c.provider_request_id, c.duration_ms, c.error_code, c.created_at, u.email
    FROM creations c
    JOIN users u ON u.id = c.user_id
    WHERE ${clauses.join(' AND ')}
  `;

  return await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    tableAlias: 'c',
  });
}

export async function getFailureClusters() {
  const res = await query(`
    SELECT COALESCE(error_code, 'UNKNOWN_ERROR') AS code,
           COUNT(*) AS count,
           MAX(created_at) AS last_occurred_at
    FROM creations
    WHERE status NOT IN ('succeeded', 'completed', 'success')
    GROUP BY COALESCE(error_code, 'UNKNOWN_ERROR')
    ORDER BY count DESC
    LIMIT 10
  `);
  return res.rows;
}

export async function findCreationById(id, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    SELECT c.*, u.email
    FROM creations c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = $1
  `, [id]);
}

export async function findUserCreationByIdempotency(userId, idempotencyKey, transaction = null) {
  if (!userId || !idempotencyKey) return null;
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    SELECT c.*, u.email
    FROM creations c
    JOIN users u ON u.id = c.user_id
    WHERE c.user_id = $1 AND c.idempotency_key = $2
  `, [userId, idempotencyKey]);
}

export async function listUserCreations(userId, limit = 50, studioId = '') {
  const params = [userId];
  let filterSql = '';
  if (studioId && studioId !== 'all') {
    params.push(studioId);
    filterSql = ` AND c.studio_id = $${params.length}`;
  }
  params.push(Math.min(100, Math.max(1, Number(limit) || 50)));
  const result = await query(`
    SELECT c.*, p.id AS community_post_id, p.likes_count AS community_likes,
      (p.id IS NOT NULL) AS is_shared
    FROM ai_studio.creations c
    LEFT JOIN ai_studio.community_posts p ON c.id = p.creation_id AND p.status = 'published'
    WHERE c.user_id = $1 AND c.deleted_at IS NULL ${filterSql}
    ORDER BY c.created_at DESC
    LIMIT $${params.length}
  `, params);
  return result.rows;
}

export async function listQueuedGenerationIds(batchSize = 10) {
  return queryMany(`
    SELECT id
    FROM creations
    WHERE status = 'queued'
    ORDER BY created_at ASC, id ASC
    LIMIT $1
  `, [Math.min(50, Math.max(1, Number(batchSize) || 10))]);
}

export async function listStaleGenerationIds(cutoff, limit = 50) {
  return queryMany(`
    SELECT id
    FROM creations
    WHERE status = 'processing' AND updated_at <= $1
    ORDER BY updated_at ASC
    LIMIT $2
  `, [cutoff, Math.min(100, Math.max(1, Number(limit) || 50))]);
}

export async function listUserSubscriptions(userId, limit = 20) {
  return queryMany(`
    SELECT id, provider, plan_id, status, current_period_end, created_at, updated_at
    FROM subscriptions WHERE user_id = $1
    ORDER BY updated_at DESC LIMIT $2
  `, [userId, limit]);
}

export async function listUserCreationSummaries(userId, limit = 20) {
  return queryMany(`
    SELECT id, studio_id, label, result_url, status, credit_cost, created_at
    FROM creations WHERE user_id = $1 AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT $2
  `, [userId, limit]);
}

export async function getUserCreationById(userId, creationId) {
  return queryOne(
    `SELECT c.*, p.id AS community_post_id, (p.id IS NOT NULL) AS is_shared
     FROM ai_studio.creations c
     LEFT JOIN ai_studio.community_posts p ON c.id = p.creation_id AND p.status = 'published'
     WHERE c.id = $1 AND c.user_id = $2 AND c.deleted_at IS NULL`,
    [creationId, userId]
  );
}

export async function deleteUserCreation(userId, creationId) {
  return (await execute(`
    UPDATE creations
    SET deleted_at = COALESCE(deleted_at, now()), updated_at = now()
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
  `, [creationId, userId])) > 0;
}

export async function createGenerationTask({
  userId,
  studioId = 'studio',
  modelId,
  provider,
  label,
  creditCost,
  reservationId,
  idempotencyKey,
  inputSummary,
  quoteId = null,
  routingMode = 'balanced',
  estimatedCostUsd = null,
  transaction = null,
}) {
  const id = randomId('gen');
  const now = nowIso();
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    INSERT INTO creations (
      id, user_id, studio_id, label, status, credit_cost, reservation_id,
      idempotency_key, provider, model, input_summary_json, metadata_json,
      quote_id, routing_mode, estimated_cost_usd,
      created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, $8, $9, $10::jsonb, $10::jsonb, $11, $12, $13, $14, $14)
    ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING *
  `, [id, userId, studioId, label || `生成 ${modelId}`, creditCost, reservationId, idempotencyKey, provider, modelId, JSON.stringify(inputSummary || {}), quoteId, routingMode, estimatedCostUsd, now]);
}

export async function linkReservationToCreation(reservationId, creationId, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return await run(`
    UPDATE credit_reservations
    SET creation_id = COALESCE(creation_id, $2)
    WHERE id = $1 AND (creation_id IS NULL OR creation_id = $2)
  `, [reservationId, creationId]);
}

export async function linkAssetToCreation(creationId, assetId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    UPDATE ai_studio.creations c
    SET asset_id = $2, updated_at = NOW()
    WHERE c.id = $1 AND (c.asset_id IS NULL OR c.asset_id = $2)
      AND EXISTS (
        SELECT 1 FROM ai_studio.user_assets a
        WHERE a.id = $2 AND a.creation_id = c.id AND a.user_id = c.user_id
          AND a.visibility = 'private' AND a.storage_status = 'ready' AND a.deleted_at IS NULL
      )
    RETURNING c.id, c.asset_id
  `, [creationId, assetId]);
}

export async function claimQueuedGeneration(creationId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    UPDATE creations
    SET status = 'processing', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
    WHERE id = $1 AND status = 'queued'
    RETURNING *
  `, [creationId]);
}

export async function updateGenerationOutcome(creationId, {
  status,
  resultUrl = undefined,
  resultText = undefined,
  resultObjectKey = undefined,
  storageStatus = undefined,
  storageErrorCode = undefined,
  storageAttempts = undefined,
  storageBucket = undefined,
  storageRegion = undefined,
  storageProvider = undefined,
  storageLocationId = undefined,
  storageMimeType = undefined,
  storageSizeBytes = undefined,
  storageChecksum = undefined,
  storagePreviewObjectKey = undefined,
  storageThumbnailObjectKey = undefined,
  provider = undefined,
  model = undefined,
  providerRequestId = undefined,
  errorCode = undefined,
  errorReason = undefined,
  durationMs = undefined,
  actualCostUsd = undefined,
  expectedStatus = undefined,
  nextPollAt = undefined,
  pollLockedUntil = undefined,
  transaction = null,
}) {
  return await updateCreationStatus(creationId, {
    status,
    resultUrl,
    resultText,
    resultObjectKey,
    storageStatus,
    storageErrorCode,
    storageAttempts,
    storageBucket,
    storageRegion,
    storageProvider,
    storageLocationId,
    storageMimeType,
    storageSizeBytes,
    storageChecksum,
    storagePreviewObjectKey,
    storageThumbnailObjectKey,
    provider,
    model,
    providerRequestId,
    errorCode,
    errorReason,
    durationMs,
    actualCostUsd,
    expectedStatus,
    nextPollAt,
    pollLockedUntil,
    transaction,
  });
}

export async function insertGenerationEvent({
  creationId,
  userId,
  eventType,
  fromStatus = null,
  toStatus = null,
  reservationId = null,
  provider = null,
  providerRequestId = null,
  idempotencyKey = null,
  metadata = {},
  transaction = null,
}) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    INSERT INTO generation_events (
      id, creation_id, user_id, event_type, from_status, to_status,
      reservation_id, provider, provider_request_id, idempotency_key, metadata_json
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    ON CONFLICT (creation_id, event_type, idempotency_key)
      WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id, event_type, created_at
  `, [randomId('gev'), creationId, userId, eventType, fromStatus, toStatus, reservationId, provider, providerRequestId, idempotencyKey, JSON.stringify(metadata || {})]);
}

export async function getGenerationTrace(creationId) {
  const creation = await findCreationById(creationId);
  if (!creation) return null;
  const [events, auditLogs] = await Promise.all([queryMany(`
    SELECT id, event_type, from_status, to_status, reservation_id, provider,
           provider_request_id, idempotency_key, metadata_json, created_at
    FROM generation_events
    WHERE creation_id = $1
    ORDER BY created_at ASC, id ASC
  `, [creationId]), queryMany(`
    SELECT id, actor_id, actor_email, action, target_type, target_id, risk_level,
           before_json, after_json, request_id, created_at
    FROM admin_audit_logs
    WHERE target_type = 'creation' AND target_id = $1
    ORDER BY created_at ASC, id ASC
  `, [creationId])]);
  return {
    creation,
    events: events.map((event) => ({
      ...event,
      metadata: typeof event.metadata_json === 'string' ? JSON.parse(event.metadata_json) : event.metadata_json,
    })),
    auditLogs: auditLogs.map((audit) => ({
      ...audit,
      before: typeof audit.before_json === 'string' ? JSON.parse(audit.before_json) : (audit.before_json || null),
      after: typeof audit.after_json === 'string' ? JSON.parse(audit.after_json) : (audit.after_json || null),
    })),
  };
}

export async function createRetryCreation({ parentCreation, creditCost = 0 }) {
  const id = randomId('gen');
  const now = nowIso();
  await execute(`
    INSERT INTO creations (id, user_id, studio_id, label, status, credit_cost, provider, model, parent_creation_id, metadata_json, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, $8, $9::jsonb, $10, $10)
  `, [id, parentCreation.user_id, parentCreation.studio_id, parentCreation.label, creditCost, parentCreation.provider, parentCreation.model, parentCreation.id, JSON.stringify(parentCreation.metadata_json || {}), now]);
  return findCreationById(id);
}

export async function updateCreationStatus(id, {
  status,
  resultUrl,
  resultText,
  resultObjectKey,
  storageStatus,
  storageErrorCode,
  storageAttempts,
  storageBucket,
  storageRegion,
  storageProvider,
  storageLocationId,
  storageMimeType,
  storageSizeBytes,
  storageChecksum,
  storagePreviewObjectKey,
  storageThumbnailObjectKey,
  provider,
  model,
  providerRequestId,
  errorCode,
  errorReason,
  durationMs,
  actualCostUsd,
  expectedStatus,
  nextPollAt,
  pollLockedUntil,
  transaction = null,
}) {
  const updates = ['updated_at = NOW()'];
  const params = [];
  let parameterIndex = 0;
  const nextParameter = () => `$${++parameterIndex}`;

  if (status !== undefined) {
    updates.push(`status = ${nextParameter()}`);
    params.push(status);
    if (['succeeded', 'failed', 'cancelled'].includes(status)) {
      updates.push('completed_at = COALESCE(completed_at, NOW())');
    }
  }
  if (resultUrl !== undefined) {
    updates.push(`result_url = ${nextParameter()}`);
    params.push(resultUrl);
  }
  if (resultText !== undefined) {
    updates.push(`result_text = ${nextParameter()}`);
    params.push(resultText);
  }
  if (provider !== undefined) {
    updates.push(`provider = ${nextParameter()}`);
    params.push(provider);
  }
  if (model !== undefined) {
    updates.push(`model = ${nextParameter()}`);
    params.push(model);
  }
  const storageFields = [
    ['result_object_key', resultObjectKey],
    ['storage_status', storageStatus],
    ['storage_error_code', storageErrorCode],
    ['storage_attempts', storageAttempts],
    ['storage_bucket', storageBucket],
    ['storage_region', storageRegion],
    ['storage_provider', storageProvider],
    ['storage_location_id', storageLocationId],
    ['storage_mime_type', storageMimeType],
    ['storage_size_bytes', storageSizeBytes],
    ['storage_checksum', storageChecksum],
    ['storage_preview_object_key', storagePreviewObjectKey],
    ['storage_thumbnail_object_key', storageThumbnailObjectKey],
  ];
  for (const [column, value] of storageFields) {
    if (value !== undefined) {
      updates.push(`${column} = ${nextParameter()}`);
      params.push(value);
    }
  }
  if (errorCode !== undefined) {
    updates.push(`error_code = ${nextParameter()}`);
    params.push(errorCode);
  }
  if (errorReason !== undefined) {
    updates.push(`error_reason = ${nextParameter()}`);
    params.push(errorReason);
  }
  if (durationMs !== undefined) {
    updates.push(`duration_ms = ${nextParameter()}`);
    params.push(durationMs);
  }
  if (actualCostUsd !== undefined) {
    updates.push(`actual_cost_usd = ${nextParameter()}`);
    params.push(actualCostUsd);
  }
  if (providerRequestId !== undefined) {
    updates.push(`provider_request_id = ${nextParameter()}`);
    params.push(providerRequestId);
    updates.push(`external_request_id = COALESCE(external_request_id, ${nextParameter()})`);
    params.push(providerRequestId);
  }
  const isTerminal = ['succeeded', 'failed', 'cancelled'].includes(status);
  const resolvedNextPollAt = nextPollAt !== undefined ? nextPollAt : (isTerminal ? null : undefined);
  if (resolvedNextPollAt !== undefined) {
    updates.push(`next_poll_at = ${nextParameter()}`);
    params.push(resolvedNextPollAt ? (resolvedNextPollAt instanceof Date ? resolvedNextPollAt.toISOString() : resolvedNextPollAt) : null);
  }
  const resolvedPollLockedUntil = pollLockedUntil !== undefined ? pollLockedUntil : (isTerminal ? null : undefined);
  if (resolvedPollLockedUntil !== undefined) {
    updates.push(`poll_locked_until = ${nextParameter()}`);
    params.push(resolvedPollLockedUntil ? (resolvedPollLockedUntil instanceof Date ? resolvedPollLockedUntil.toISOString() : resolvedPollLockedUntil) : null);
  }

  const where = [`id = $${params.length + 1}`];
  params.push(id);
  if (expectedStatus !== undefined) {
    where.push(`status = $${params.length + 1}`);
    params.push(expectedStatus);
  }
  const runExecute = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const affected = await runExecute(`UPDATE creations SET ${updates.join(', ')} WHERE ${where.join(' AND ')}`, params);
  if (affected === 0) return null;
  const updatedRow = await findCreationById(id, transaction);
  if (updatedRow) {
    const emitCommittedStatus = async () => {
      const current = transaction ? await findCreationById(id) : updatedRow;
      if (!current) return;
      const { realtimeEmitter } = await import('../ai/queue/realtimeEmitter.ts');
      const statusMap = {
        queued: 'QUEUED',
        processing: 'PROCESSING',
        succeeded: 'COMPLETED',
        completed: 'COMPLETED',
        failed: 'FAILED',
        cancelled: 'CANCELLED',
      };
      realtimeEmitter.emit({
        taskId: current.id,
        userId: current.user_id,
        status: statusMap[current.status] || 'PROCESSING',
        resultUrl: current.result_url || null,
        assetId: current.asset_id || null,
        error: current.status === 'failed' ? { code: current.error_code || 'TASK_FAILED', message: current.error_reason || '任务失败' } : null,
        timestamp: Date.now(),
      });
    };
    if (transaction?.afterCommit) transaction.afterCommit(emitCommittedStatus);
    else if (!transaction) {
      try { await emitCommittedStatus(); } catch {}
    }
  }
  return updatedRow;
}

export async function listDuePollingCreations(batchSize = 10, now = new Date()) {
  const effectiveLimit = Math.min(50, Math.max(1, Number(batchSize) || 10));
  const nowIsoStr = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  return queryMany(`
    SELECT id, user_id, studio_id, label, status, credit_cost, reservation_id,
           provider, model, provider_request_id, input_summary_json, started_at,
           next_poll_at, poll_locked_until, created_at, updated_at
    FROM creations
    WHERE status = 'processing'
      AND provider_request_id IS NOT NULL
      AND next_poll_at IS NOT NULL
      AND next_poll_at <= $1
      AND (poll_locked_until IS NULL OR poll_locked_until < $1)
    ORDER BY next_poll_at ASC
    LIMIT $2
  `, [nowIsoStr, effectiveLimit]);
}

export async function claimDuePollingCreation(creationId, lockDurationSeconds = 30) {
  const lockUntil = new Date(Date.now() + lockDurationSeconds * 1000).toISOString();
  return queryOne(`
    UPDATE creations
    SET poll_locked_until = $2, updated_at = NOW()
    WHERE id = $1
      AND status = 'processing'
      AND provider_request_id IS NOT NULL
      AND (poll_locked_until IS NULL OR poll_locked_until < NOW())
    RETURNING *
  `, [creationId, lockUntil]);
}

export async function scheduleNextPoll(creationId, { nextPollAt, pollLockedUntil = null, transaction = null } = {}) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return await run(`
    UPDATE creations
    SET next_poll_at = $2, poll_locked_until = $3, updated_at = NOW()
    WHERE id = $1 AND status = 'processing'
  `, [creationId, nextPollAt ? (nextPollAt instanceof Date ? nextPollAt.toISOString() : nextPollAt) : null, pollLockedUntil ? (pollLockedUntil instanceof Date ? pollLockedUntil.toISOString() : pollLockedUntil) : null]);
}

export async function acquireCreationIdempotencyLock(userId, normalizedKey, transaction = null) {
  const run = transaction?.query ? transaction.query.bind(transaction) : query;
  return run('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `generation:${String(userId)}:${normalizedKey}`,
  ]);
}

export async function countActiveCreationsByUserId(userId, transaction = null) {
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const result = await one(
    `SELECT COUNT(*)::int AS active_count FROM ai_studio.creations WHERE user_id = $1 AND status IN ('queued', 'processing')`,
    [userId]
  );
  return result?.active_count || 0;
}

