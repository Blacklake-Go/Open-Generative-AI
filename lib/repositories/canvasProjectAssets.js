import 'server-only';

import crypto from 'node:crypto';
import { queryOne } from '../db/index.js';

// 资产行 ID 与迁移 078 的回填口径保持一致：'ast_cvs_' || md5(project_id)
export function canvasProjectAssetId(projectId) {
  return `ast_cvs_${crypto.createHash('md5').update(String(projectId)).digest('hex')}`;
}

export async function upsertCanvasProjectAsset(project, { transaction = null } = {}) {
  const projectId = project?.id;
  const userId = project?.owner_user_id || project?.ownerUserId;
  if (!projectId || !userId) return null;

  const title = String(project.name || '').trim().slice(0, 255) || '未命名画布';
  const assetData = JSON.stringify({
    canvasProjectId: projectId,
    version: Number(project.version || 1),
    url: `/canvas/${projectId}`,
  });

  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    INSERT INTO ai_studio.user_assets (
      id, user_id, asset_type, studio_id, title, mime_type, prompt,
      kind, category, source, asset_data, status, created_at, updated_at
    ) VALUES (
      $1, $2, 'other', 'canvas', $3, 'application/json', '',
      'canvas', 'other', '画布项目', $4::jsonb, 'ready', now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      asset_data = EXCLUDED.asset_data,
      status = 'ready',
      trashed_at = NULL,
      deleted_at = NULL,
      updated_at = now()
      WHERE ai_studio.user_assets.user_id = $2
    RETURNING *
  `, [canvasProjectAssetId(projectId), userId, title, assetData]);
}

export async function removeCanvasProjectAsset(userId, projectId, { transaction = null } = {}) {
  if (!userId || !projectId) return null;
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    DELETE FROM ai_studio.user_assets
    WHERE id = $1 AND user_id = $2 AND kind = 'canvas'
    RETURNING id
  `, [canvasProjectAssetId(projectId), userId]);
}
