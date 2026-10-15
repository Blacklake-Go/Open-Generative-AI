import 'server-only';

import crypto from 'node:crypto';
import { queryMany, queryOne, withTransaction } from '../db/index.js';

function newProjectId() {
  return crypto.randomUUID();
}

function migratedProjectId(userId, migrationId) {
  const digest = crypto.createHash('sha256')
    .update(`${String(userId)}\0${String(migrationId)}`)
    .digest('hex');
  return `canvas_${digest.slice(0, 56)}`;
}

export async function listCanvasProjects(userId) {
  return queryMany(`
    SELECT id, name, thumbnail_asset_id, version, created_at, updated_at,
      CASE WHEN jsonb_typeof(snapshot_json->'nodes') = 'array' THEN jsonb_array_length(snapshot_json->'nodes') ELSE 0 END AS node_count,
      CASE WHEN jsonb_typeof(snapshot_json->'connections') = 'array' THEN jsonb_array_length(snapshot_json->'connections') ELSE 0 END AS connection_count
    FROM ai_studio.canvas_projects
    WHERE owner_user_id = $1 AND deleted_at IS NULL
    ORDER BY updated_at DESC, id DESC
  `, [userId]);
}

export async function getCanvasProject(userId, projectId) {
  return queryOne(`
    SELECT id, owner_user_id, name, thumbnail_asset_id, snapshot_json, version, created_at, updated_at
    FROM ai_studio.canvas_projects
    WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL
  `, [projectId, userId]);
}

export async function createCanvasProject(userId, { name, snapshot, migrationId = null }) {
  const id = migrationId ? migratedProjectId(userId, migrationId) : newProjectId();
  return withTransaction(async (tx) => {
    const project = await tx.queryOne(`
      INSERT INTO ai_studio.canvas_projects
        (id, owner_user_id, name, snapshot_json, version, created_at, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, 1, now(), now())
      ON CONFLICT (id) DO NOTHING
      RETURNING id, owner_user_id, name, thumbnail_asset_id, snapshot_json, version, created_at, updated_at
    `, [id, userId, name, JSON.stringify(snapshot)]);
    if (!project && migrationId) {
      const existing = await tx.queryOne(`
        SELECT id, owner_user_id, name, thumbnail_asset_id, snapshot_json, version, created_at, updated_at
        FROM ai_studio.canvas_projects
        WHERE id = $1 AND owner_user_id = $2 AND name = $3
          AND snapshot_json = $4::jsonb AND deleted_at IS NULL
        FOR UPDATE
      `, [id, userId, name, JSON.stringify(snapshot)]);
      if (existing) return { project: existing, idempotent: true };
      throw Object.assign(new Error('该迁移标识已用于不同画布内容'), { code: 'PROJECT_CREATE_IDEMPOTENCY_CONFLICT' });
    }
    if (!project) {
      throw Object.assign(new Error('创建画布时发生 ID 冲突，请重试'), { code: 'PROJECT_CREATE_CONFLICT' });
    }
    await tx.execute(`
      INSERT INTO ai_studio.canvas_project_versions (project_id, version, snapshot_json, created_by, created_at)
      VALUES ($1, 1, $2::jsonb, $3, now())
    `, [id, JSON.stringify(snapshot), userId]);
    return { project, idempotent: false };
  });
}

export async function saveCanvasProject(userId, projectId, { name, snapshot, expectedVersion }) {
  return withTransaction(async (tx) => {
    const current = await tx.queryOne(`
      SELECT id, owner_user_id, name, thumbnail_asset_id, snapshot_json, version, created_at, updated_at
      FROM ai_studio.canvas_projects
      WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL
      FOR UPDATE
    `, [projectId, userId]);
    if (!current) return null;
    if (Number(expectedVersion) !== Number(current.version)) {
      const error = new Error('项目已在其他位置更新，请重新加载后再保存');
      error.code = 'PROJECT_VERSION_CONFLICT';
      error.currentVersion = Number(current.version);
      throw error;
    }
    const currentSnapshot = typeof current.snapshot_json === 'string' ? JSON.parse(current.snapshot_json) : current.snapshot_json;
    const sameSnapshot = JSON.stringify(currentSnapshot) === JSON.stringify(snapshot);
    if (sameSnapshot && (!name || name.trim() === current.name)) return current;
    const version = Number(current.version) + 1;
    const updated = await tx.queryOne(`
      UPDATE ai_studio.canvas_projects
      SET name = $3, snapshot_json = $4::jsonb, version = $5, updated_at = now()
      WHERE id = $1 AND owner_user_id = $2
      RETURNING id, owner_user_id, name, thumbnail_asset_id, snapshot_json, version, created_at, updated_at
    `, [projectId, userId, name?.trim() || current.name, JSON.stringify(snapshot), version]);
    await tx.execute(`
      INSERT INTO ai_studio.canvas_project_versions (project_id, version, snapshot_json, created_by, created_at)
      VALUES ($1, $2, $3::jsonb, $4, now())
    `, [projectId, version, JSON.stringify(snapshot), userId]);
    await tx.execute(`
      DELETE FROM ai_studio.canvas_project_versions
      WHERE project_id = $1
        AND version NOT IN (
          SELECT version
          FROM ai_studio.canvas_project_versions
          WHERE project_id = $1
          ORDER BY version DESC
          LIMIT 20
        )
    `, [projectId]);
    return updated;
  });
}

export async function deleteCanvasProject(userId, projectId) {
  const result = await queryOne(`
    UPDATE ai_studio.canvas_projects
    SET deleted_at = now(), updated_at = now()
    WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL
    RETURNING id
  `, [projectId, userId]);
  return Boolean(result);
}

export async function linkCanvasProjectJob(userId, { projectId, nodeId, jobId, modelId, idempotencyKey }, { transaction = null } = {}) {
  const db = transaction || { queryOne, queryMany };
  const values = [projectId, userId, nodeId, jobId, modelId, idempotencyKey];
  const inserted = await db.queryOne(`
    INSERT INTO ai_studio.canvas_project_jobs
      (project_id, owner_user_id, node_id, job_id, model_id, idempotency_key, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'queued', now(), now())
    ON CONFLICT DO NOTHING
    RETURNING project_id, owner_user_id, node_id, job_id, model_id, status, result_asset_id, credits_used, created_at, updated_at
  `, values);
  if (inserted) return inserted;
  const conflicts = await db.queryMany(`
    SELECT project_id, owner_user_id, node_id, job_id, model_id, idempotency_key, status, result_asset_id, credits_used, created_at, updated_at
    FROM ai_studio.canvas_project_jobs
    WHERE (job_id = $4 AND owner_user_id = $2 AND model_id = $5)
       OR (project_id = $1 AND owner_user_id = $2 AND node_id = $3
           AND model_id = $5 AND idempotency_key = $6)
    FOR UPDATE
  `, values);
  return conflicts.find((row) => row.project_id === projectId
    && row.owner_user_id === userId
    && row.node_id === nodeId
    && row.job_id === jobId
    && row.model_id === modelId
    && row.idempotency_key === idempotencyKey) || null;
}

export async function getCanvasProjectJob(userId, jobId) {
  return queryOne(`
    SELECT j.project_id, j.owner_user_id, j.node_id, j.job_id, j.model_id, j.status,
      j.result_asset_id, j.credits_used, j.created_at, j.updated_at,
      c.quote_id, c.provider_request_id
    FROM ai_studio.canvas_project_jobs j
    JOIN ai_studio.creations c
      ON c.id = j.job_id AND c.user_id = j.owner_user_id AND c.deleted_at IS NULL
    WHERE j.job_id = $1 AND j.owner_user_id = $2
  `, [jobId, userId]);
}

export async function listCanvasProjectJobs(userId, { projectId = null, idempotencyKeys = [], limit = 50, offset = 0 } = {}) {
  return queryMany(`
    SELECT j.project_id, p.name AS project_name, j.node_id, j.job_id, j.model_id, j.idempotency_key, j.created_at,
           c.quote_id, c.provider_request_id, c.status AS task_status, c.credit_cost, c.result_text, c.result_object_key, c.updated_at AS task_updated_at,
           c.storage_mime_type, c.actual_cost_usd, c.error_code,
           failure_event.metadata_json AS error_metadata_json,
           a.id AS asset_id, a.mime_type AS asset_mime_type, a.object_key AS asset_object_key
    FROM ai_studio.canvas_project_jobs j
    JOIN ai_studio.canvas_projects p
      ON p.id = j.project_id AND p.owner_user_id = j.owner_user_id
    JOIN ai_studio.creations c
      ON c.id = j.job_id AND c.user_id = j.owner_user_id AND c.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT id, mime_type, object_key FROM ai_studio.user_assets
      WHERE creation_id = c.id AND user_id = j.owner_user_id
        AND status = 'ready' AND storage_status = 'ready' AND object_key IS NOT NULL AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC LIMIT 1
    ) a ON TRUE
    LEFT JOIN LATERAL (
      SELECT metadata_json FROM ai_studio.generation_events
      WHERE creation_id = c.id AND event_type = 'TASK_FAILED'
      ORDER BY created_at DESC, id DESC LIMIT 1
    ) failure_event ON TRUE
    WHERE j.owner_user_id = $1 AND ($2::varchar IS NULL OR j.project_id = $2)
      AND (cardinality($3::varchar[]) = 0 OR j.idempotency_key = ANY($3::varchar[]))
    ORDER BY j.created_at DESC, j.job_id DESC
    LIMIT $4 OFFSET $5
  `, [userId, projectId, idempotencyKeys, limit, offset]);
}

export async function updateCanvasProjectJob(userId, jobId, { status, assetId = null, creditsUsed = null }) {
  return queryOne(`
    UPDATE ai_studio.canvas_project_jobs
    SET status = $3,
        result_asset_id = COALESCE($4, result_asset_id),
        credits_used = COALESCE($5, credits_used),
        updated_at = now()
    WHERE job_id = $1 AND owner_user_id = $2
    RETURNING project_id, node_id, job_id, model_id, status, result_asset_id, credits_used, updated_at
  `, [jobId, userId, status, assetId, creditsUsed]);
}
