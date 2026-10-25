import 'server-only';

import { queryOne, withTransaction } from '../db/index.js';

export async function issueCanvasProjectShare(ownerUserId, projectId, tokenHash) {
  return withTransaction(async (tx) => {
    const project = await tx.queryOne(`
      SELECT id FROM ai_studio.canvas_projects
      WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL
      FOR UPDATE
    `, [projectId, ownerUserId]);
    if (!project) return null;
    await tx.execute(`
      UPDATE ai_studio.canvas_project_shares
      SET revoked_at = now()
      WHERE project_id = $1 AND owner_user_id = $2 AND revoked_at IS NULL
    `, [projectId, ownerUserId]);
    return tx.queryOne(`
      INSERT INTO ai_studio.canvas_project_shares (project_id, owner_user_id, token_hash)
      VALUES ($1, $2, $3)
      RETURNING created_at
    `, [projectId, ownerUserId, tokenHash]);
  });
}

export async function getCanvasProjectShareStatus(ownerUserId, projectId) {
  return queryOne(`
    SELECT s.created_at, s.revoked_at
    FROM ai_studio.canvas_project_shares s
    JOIN ai_studio.canvas_projects p
      ON p.id = s.project_id AND p.owner_user_id = s.owner_user_id AND p.deleted_at IS NULL
    WHERE s.project_id = $1 AND s.owner_user_id = $2 AND s.revoked_at IS NULL
    LIMIT 1
  `, [projectId, ownerUserId]);
}

export async function revokeCanvasProjectShare(ownerUserId, projectId) {
  const result = await queryOne(`
    UPDATE ai_studio.canvas_project_shares s
    SET revoked_at = now()
    FROM ai_studio.canvas_projects p
    WHERE s.project_id = $1 AND s.owner_user_id = $2 AND s.revoked_at IS NULL
      AND p.id = s.project_id AND p.owner_user_id = s.owner_user_id AND p.deleted_at IS NULL
    RETURNING s.project_id, s.revoked_at
  `, [projectId, ownerUserId]);
  return result;
}

export async function getCanvasProjectShareByHash(tokenHash) {
  return queryOne(`
    SELECT s.project_id, s.owner_user_id, s.created_at,
      p.name, p.snapshot_json, p.version
    FROM ai_studio.canvas_project_shares s
    JOIN ai_studio.canvas_projects p
      ON p.id = s.project_id AND p.owner_user_id = s.owner_user_id AND p.deleted_at IS NULL
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL
    LIMIT 1
  `, [tokenHash]);
}
