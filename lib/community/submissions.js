import 'server-only';
import { queryMany, withTransaction, randomId } from '../db/index.js';
import { hasPermission, PERMISSIONS } from '../admin/permissions.js';
import * as posts from '../repositories/community.js';
import { listMainAssets, mappedMainIdentity, describeMainAsset } from '../federation/mainAssets.js';

export function communityError(code, message, status = 400) { return Object.assign(new Error(message), { code, status }); }
const ALLOWED_MEDIA = new Set(['image', 'video', 'audio']);

export async function submitCommunityWork(input) {
  const { userId, assetId, creationId, mainAssetId } = input;
  if (!userId) throw communityError('UNAUTHORIZED', '请先登录', 401);
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  const tags = Array.isArray(input.tags) ? [...new Set(input.tags.map((value) => String(value).trim()).filter(Boolean))] : [];
  if (!title || title.length > 255 || description.length > 5000 || tags.length > 10 || tags.some((tag) => tag.length > 40)) {
    throw communityError('COMMUNITY_INPUT_INVALID', '请检查标题、描述与标签长度');
  }
  if ((!assetId && !creationId && !mainAssetId) || (mainAssetId && (assetId || creationId))) throw communityError('COMMUNITY_ASSET_REQUIRED', '请选择你拥有且已归档的作品');
  const mainAsset = mainAssetId ? await describeMainAsset(userId, mainAssetId) : null;
  return withTransaction(async (tx) => {
    const owner = await tx.queryOne("SELECT id FROM auth_usr.users WHERE id=$1 AND status='active' FOR UPDATE", [userId]);
    if (!owner) throw communityError('UNAUTHORIZED', '账户不可用', 403);
    if (mainAsset) {
      const link = await tx.queryOne("SELECT main_user_id FROM supdance_federation.identity_links WHERE one_user_id=$1 AND state='active' FOR SHARE", [userId]);
      if (link?.main_user_id !== mainAsset.mainUserId) throw communityError('COMMUNITY_IDENTITY_REQUIRED', '主站连接已变化', 409);
      const existing = await tx.queryOne("SELECT * FROM ai_studio.community_posts WHERE source_main_user_id=$1 AND source_main_asset_id=$2 AND status IN ('pending','published')", [mainAsset.mainUserId, mainAsset.id]);
      if (existing) return { ...existing, duplicate: true };
      const id = randomId('post'); const mediaUrl = `/api/community/posts/${encodeURIComponent(id)}/media`;
      const post = await tx.queryOne(`INSERT INTO ai_studio.community_posts(id,user_id,source_main_user_id,source_main_asset_id,title,description,media_type,media_url,cover_url,tags,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending') RETURNING *`,
      [id,userId,mainAsset.mainUserId,mainAsset.id,title,description,mainAsset.kind,mediaUrl,mainAsset.kind === 'image' ? mediaUrl : null,tags]);
      await tx.execute(`INSERT INTO ai_studio.community_moderation_events(id,post_id,actor_user_id,previous_status,next_status,version)
        VALUES($1,$2,$3,NULL,'pending',1)`, [randomId('review'),id,userId]);
      return post;
    }
    const asset = await tx.queryOne(`SELECT * FROM ai_studio.user_assets WHERE user_id=$1 AND ${assetId ? 'id' : 'creation_id'}=$2
      AND status='ready' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR SHARE`, [userId, assetId || creationId]);
    if (!asset || (creationId && asset.creation_id !== creationId)) throw communityError('COMMUNITY_ASSET_NOT_OWNED', '作品不存在或不属于当前账户', 403);
    if (!asset.object_key || !ALLOWED_MEDIA.has(asset.kind || asset.asset_type)) throw communityError('COMMUNITY_ASSET_NOT_ARCHIVED', '作品尚未完成媒体归档，暂时无法投稿', 409);
    const existing = await tx.queryOne("SELECT * FROM ai_studio.community_posts WHERE source_asset_id=$1 AND status IN ('pending','published')", [asset.id]);
    if (existing) return { ...existing, duplicate: true };
    const id = randomId('post');
    const mediaUrl = `/api/community/posts/${encodeURIComponent(id)}/media`;
    const post = await tx.queryOne(`INSERT INTO ai_studio.community_posts
      (id,user_id,source_asset_id,creation_id,title,description,media_type,media_url,cover_url,prompt,negative_prompt,model_name,parameters,tags,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,'pending') RETURNING *`,
    [id, userId, asset.id, asset.creation_id, title, description, asset.kind || asset.asset_type, mediaUrl,
      (asset.kind || asset.asset_type) === 'image' ? mediaUrl : null, String(asset.prompt || ''), '', String(asset.model_name || ''),
      JSON.stringify(asset.parameters || {}), tags]);
    await tx.execute(`INSERT INTO ai_studio.community_moderation_events(id,post_id,actor_user_id,previous_status,next_status,version)
      VALUES($1,$2,$3,NULL,'pending',1)`, [randomId('review'), id, userId]);
    return post;
  });
}

export async function listOwnCommunitySubmissions(userId) {
  if (!userId) throw communityError('UNAUTHORIZED', '请先登录', 401);
  const [submissions, assets] = await Promise.all([
    queryMany('SELECT id,title,description,media_type,media_url,cover_url,status,moderation_version,moderation_reason,created_at FROM ai_studio.community_posts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [userId]),
    queryMany(`SELECT id,title,kind,asset_type,creation_id FROM ai_studio.user_assets WHERE user_id=$1 AND status='ready'
      AND deleted_at IS NULL AND object_key IS NOT NULL AND COALESCE(kind,asset_type) IN ('image','video','audio') ORDER BY created_at DESC LIMIT 100`, [userId]),
  ]);
  let mainAssets = []; let mainAssetsUnavailable = false;
  if (await mappedMainIdentity(userId)) {
    try { mainAssets = await listMainAssets(userId); } catch { mainAssetsUnavailable = true; }
  }
  return { submissions, assets, mainAssets, mainAssetsUnavailable, userId };
}

export async function moderateCommunityWork(id, input, actor, expectedVersion) {
  if (!hasPermission(actor, PERMISSIONS.contentWrite)) throw communityError('FORBIDDEN', '没有社区审核权限', 403);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw communityError('COMMUNITY_VERSION_REQUIRED', '请刷新作品后再审核', 409);
  const reason = String(input.moderationReason || '').trim();
  if (reason.length > 1000 || (['hidden', 'banned', 'rejected'].includes(input.status) && reason.length < 3)) throw communityError('COMMUNITY_REASON_REQUIRED', '请填写审核原因');
  return withTransaction(async (tx) => {
    const currentActor = await tx.queryOne("SELECT id,role,status FROM auth_usr.users WHERE id=$1 FOR SHARE", [actor.id]);
    if (currentActor?.status !== 'active' || !hasPermission(currentActor, PERMISSIONS.contentWrite)) throw communityError('FORBIDDEN', '审核权限已变化', 403);
    const before = await tx.queryOne('SELECT * FROM ai_studio.community_posts WHERE id=$1 FOR UPDATE', [id]);
    if (!before) return null;
    if (before.status === 'withdrawn' || before.moderation_version !== expectedVersion) throw communityError('COMMUNITY_VERSION_CONFLICT', '作品已变化或已撤回，请刷新后再操作', 409);
    if (input.status === 'published' && before.source_asset_id) {
      const asset = await tx.queryOne("SELECT id FROM ai_studio.user_assets WHERE id=$1 AND user_id=$2 AND status='ready' AND deleted_at IS NULL AND object_key IS NOT NULL FOR SHARE", [before.source_asset_id, before.user_id]);
      if (!asset) throw communityError('COMMUNITY_ASSET_NOT_ARCHIVED', '原作品已不可用，不能发布', 409);
    }
    if (input.status === 'published' && before.source_main_asset_id) {
      const source = await describeMainAsset(before.user_id, before.source_main_asset_id);
      if (source.mainUserId !== before.source_main_user_id) throw communityError('COMMUNITY_IDENTITY_REQUIRED', '主站连接已变化', 409);
    }
    await posts.updateCommunityPostForAdmin(id, input, tx);
    const post = await tx.queryOne(`UPDATE ai_studio.community_posts SET moderation_version=moderation_version+1,moderation_reason=$2
      WHERE id=$1 RETURNING *`, [id, reason]);
    await tx.execute(`INSERT INTO ai_studio.community_moderation_events(id,post_id,actor_user_id,previous_status,next_status,reason,version)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomId('review'), id, actor.id, before.status, post.status, reason, post.moderation_version]);
    return post;
  });
}
