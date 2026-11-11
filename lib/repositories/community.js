import crypto from 'node:crypto';
import { query, queryOne, withTransaction } from '../db/pg.js';
import { BUILTIN_COMMUNITY_CASES } from '../community/builtinCases.js';

export async function getPostCoinStatus(postId, userId = null) {
  let post = await queryOne(
    'SELECT id, coins_count, user_id, status FROM ai_studio.community_posts WHERE id = $1',
    [postId],
  );
  if (post && post.status !== 'published') return null;
  if (!post) {
    const builtin = BUILTIN_COMMUNITY_CASES.find((c) => String(c.id) === String(postId));
    if (builtin) {
      post = { id: builtin.id, coins_count: builtin.coins_count, user_id: builtin.user_id };
    }
  }
  if (!post) return null;
  const history = userId
    ? await queryOne(`
      SELECT COALESCE(SUM(amount), 0) AS total_tipped
      FROM ops_bill.currency_journal_entries
      WHERE user_id = $1 AND biz_type = 'POST_COIN_TIP' AND biz_id = $2
    `, [userId, String(postId)])
    : null;
  return { post, userTipped: Number(history?.total_tipped || 0) };
}

function generateId(prefix = 'post') {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

export async function listCommunityPosts({
  category = 'all',
  sort = 'trending',
  tag = '',
  q = '',
  userId = '',
  featuredOnly = false,
  viewerId = null,
  limit = 24,
  offset = 0,
} = {}) {
  const params = [];
  let whereClauses = ["p.status = 'published'"];
  if (featuredOnly) whereClauses.push('p.is_featured = TRUE');
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 24)));
  const safeOffset = Math.min(10000, Math.max(0, Math.trunc(Number(offset) || 0)));

  if (category && category !== 'all') {
    params.push(category);
    whereClauses.push(`p.media_type = $${params.length}`);
  }

  if (tag) {
    params.push(tag);
    whereClauses.push(`$${params.length} = ANY(p.tags)`);
  }

  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    whereClauses.push(`(p.title ILIKE $${params.length} OR p.prompt ILIKE $${params.length} OR p.model_name ILIKE $${params.length})`);
  }

  if (userId) {
    params.push(userId);
    whereClauses.push(`p.user_id = $${params.length}`);
  }

  let orderBy = 'p.created_at DESC';
  if (sort === 'trending') {
    orderBy = '(p.likes_count * 4 + p.remix_count * 3 + p.views_count + EXTRACT(EPOCH FROM p.created_at)/86400) DESC';
  } else if (sort === 'likes') {
    orderBy = 'p.likes_count DESC, p.created_at DESC';
  } else if (sort === 'newest') {
    orderBy = 'p.created_at DESC';
  }

  let viewerSelect = 'FALSE AS is_liked';
  if (viewerId) {
    params.push(viewerId);
    viewerSelect = `EXISTS(SELECT 1 FROM ai_studio.community_likes l WHERE l.post_id = p.id AND l.user_id = $${params.length}) AS is_liked`;
  }

  params.push(safeOffset + safeLimit);
  const limitPlaceholder = `$${params.length}`;

  const sql = `
    SELECT
      p.id,
      p.creation_id,
      p.user_id,
      p.title,
      p.description,
      p.media_type,
      p.media_url,
      p.cover_url,
      p.prompt,
      p.negative_prompt,
      p.model_name,
      p.parameters,
      p.tags,
      p.likes_count,
      p.coins_count,
      p.views_count,
      p.remix_count,
      p.comments_count,
      p.is_featured,
      p.created_at,
      u.display_name AS author_name,
      u.avatar_url AS author_avatar,
      u.username AS author_username,
      u.id AS author_id,
      ${viewerSelect}
    FROM ai_studio.community_posts p
    LEFT JOIN auth_usr.users u ON p.user_id = u.id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY ${orderBy}, p.id DESC
    LIMIT ${limitPlaceholder}
  `;

  const result = await query(sql, params);
  const rows = result.rows || [];

  // 融合精选案例集（去重），保证灵感广场有高质量作品
  const storedBuiltinIds = (await query('SELECT id FROM ai_studio.community_posts WHERE id=ANY($1::text[])',
    [BUILTIN_COMMUNITY_CASES.map((item) => String(item.id))])).rows;
  const storedIds = new Set(storedBuiltinIds.map((item) => String(item.id)));
  const matchedBuiltins = BUILTIN_COMMUNITY_CASES.filter((c) => {
    if (storedIds.has(String(c.id))) return false;
    if (featuredOnly && !c.is_featured) return false;
    if (category && category !== 'all' && c.media_type !== category) return false;
    if (tag && !c.tags?.includes(tag)) return false;
    if (userId && c.user_id !== userId) return false;
    if (q && q.trim()) {
      const queryLower = q.trim().toLowerCase();
      const match =
        (c.title || '').toLowerCase().includes(queryLower) ||
        (c.prompt || '').toLowerCase().includes(queryLower) ||
        (c.model_name || '').toLowerCase().includes(queryLower);
      if (!match) return false;
    }
    return true;
  });

  const seenIds = new Set(rows.map((r) => String(r.id)));
  const merged = [...rows];
  for (const b of matchedBuiltins) {
    if (!seenIds.has(String(b.id))) {
      merged.push({
        ...b,
        is_liked: false,
      });
      seenIds.add(String(b.id));
    }
  }

  if (sort === 'trending') {
    const score = (item) => (item.likes_count || 0) * 4 + (item.remix_count || 0) * 3 + (item.views_count || 0) + new Date(item.created_at).getTime() / 86400000;
    merged.sort((a, b) => score(b) - score(a) || String(b.id).localeCompare(String(a.id)));
  } else if (sort === 'likes') {
    merged.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0) || new Date(b.created_at) - new Date(a.created_at) || String(b.id).localeCompare(String(a.id)));
  } else if (sort === 'newest') {
    merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || String(b.id).localeCompare(String(a.id)));
  }

  return merged.slice(safeOffset, safeOffset + safeLimit);
}

export async function listAdminCommunityPosts({
  status = '',
  mediaType = '',
  featured = '',
  q = '',
  limit = 100,
} = {}) {
  const params = [];
  const where = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (status) where.push(`p.status = ${add(String(status))}`);
  if (mediaType) where.push(`p.media_type = ${add(String(mediaType))}`);
  if (featured === 'true' || featured === 'false') {
    where.push(`p.is_featured = ${add(featured === 'true')}`);
  }
  if (String(q).trim()) {
    const pattern = add(`%${String(q).trim()}%`);
    where.push(`(p.title ILIKE ${pattern} OR p.description ILIKE ${pattern} OR p.prompt ILIKE ${pattern} OR p.model_name ILIKE ${pattern})`);
  }

  const predicate = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rowsParams = [...params, Math.min(500, Math.max(1, Number(limit) || 100))];
  const [rows, summary] = await Promise.all([
    query(`
      SELECT p.*, u.display_name AS author_name, u.username AS author_username
      FROM ai_studio.community_posts p
      LEFT JOIN auth_usr.users u ON u.id = p.user_id
      ${predicate}
      ORDER BY p.updated_at DESC, p.created_at DESC
      LIMIT $${rowsParams.length}
    `, rowsParams),
    queryOne(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'published')::int AS published,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'hidden')::int AS hidden,
        COUNT(*) FILTER (WHERE is_featured)::int AS featured
      FROM ai_studio.community_posts
    `),
  ]);
  return { rows: rows.rows, summary };
}

export async function updateCommunityPostForAdmin(id, input = {}, transaction = null) {
  const read = transaction ? transaction.queryOne.bind(transaction) : queryOne;
  const assignments = [];
  const values = [];
  const set = (column, value) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };

  if (input.title !== undefined) {
    const title = String(input.title).trim();
    if (!title || title.length > 255) throw new Error('作品标题必须为 1–255 个字符');
    set('title', title);
  }
  if (input.description !== undefined) {
    const description = String(input.description);
    if (description.length > 5000) throw new Error('作品描述不能超过 5000 个字符');
    set('description', description);
  }
  if (input.modelName !== undefined) {
    const modelName = String(input.modelName).trim();
    if (modelName.length > 120) throw new Error('模型名称不能超过 120 个字符');
    set('model_name', modelName);
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.length > 10) throw new Error('标签最多 10 个');
    const tags = input.tags.map((tag) => String(tag).trim()).filter(Boolean);
    if (tags.some((tag) => tag.length > 40)) throw new Error('单个标签不能超过 40 个字符');
    set('tags', tags);
  }
  if (input.status !== undefined) {
    if (!['pending', 'published', 'hidden', 'banned', 'rejected'].includes(input.status)) throw new Error('作品状态无效');
    set('status', input.status);
  }
  if (input.isFeatured !== undefined) {
    if (typeof input.isFeatured !== 'boolean') throw new Error('精选状态格式无效');
    set('is_featured', input.isFeatured);
  }

  if (assignments.length === 0) return await read('SELECT * FROM ai_studio.community_posts WHERE id = $1', [id]);
  values.push(id);
  return await read(`
    UPDATE ai_studio.community_posts
    SET ${assignments.join(', ')}, updated_at = now()
    WHERE id = $${values.length}
    RETURNING *
  `, values);
}

export async function getCommunityPostById(id, viewerId = null) {
  if (!id) return null;

  const params = [id];
  let viewerSelect = 'FALSE AS is_liked';
  if (viewerId) {
    params.push(viewerId);
    viewerSelect = `EXISTS(SELECT 1 FROM ai_studio.community_likes l WHERE l.post_id = p.id AND l.user_id = $2) AS is_liked`;
  }

  const sql = `
    SELECT
      p.*,
      u.display_name AS author_name,
      u.avatar_url AS author_avatar,
      u.username AS author_username,
      u.id AS author_id,
      u.bio AS author_bio,
      ${viewerSelect}
    FROM ai_studio.community_posts p
    LEFT JOIN auth_usr.users u ON p.user_id = u.id
    WHERE p.id = $1
  `;

  const dbPost = await queryOne(sql, params);
  if (dbPost) {
    if (dbPost.status !== 'published') return null;
    await query("UPDATE ai_studio.community_posts SET views_count=views_count+1 WHERE id=$1 AND status='published'", [id]);
    return dbPost;
  }

  // 内置精选案例兜底
  const builtin = BUILTIN_COMMUNITY_CASES.find((c) => String(c.id) === String(id));
  if (!builtin) return null;

  let isLiked = false;
  if (viewerId) {
    const likeCheck = await queryOne(
      'SELECT 1 FROM ai_studio.community_likes WHERE post_id = $1 AND user_id = $2',
      [String(id), viewerId]
    ).catch(() => null);
    isLiked = Boolean(likeCheck);
  }

  return {
    ...builtin,
    is_liked: isLiked,
  };
}

// Only the authenticated curation workflow imports external cases. User
// submissions pass through owned-asset validation in community/submissions.
export async function createImportedCommunityCase({
  userId,
  creationId = null,
  title,
  description = '',
  mediaType = 'image',
  mediaUrl,
  coverUrl = null,
  prompt = '',
  negativePrompt = '',
  modelName = '',
  parameters = {},
  tags = [],
}) {
  const id = generateId('post');
  const cleanTitle = (title || 'AI 创作分享').slice(0, 255);
  const cleanMediaUrl = String(mediaUrl || '').trim();
  const cleanCover = coverUrl ? String(coverUrl).trim() : cleanMediaUrl;
  const cleanTags = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean).slice(0, 10) : [];

  const sql = `
    INSERT INTO ai_studio.community_posts (
      id, creation_id, user_id, title, description,
      media_type, media_url, cover_url, prompt, negative_prompt,
      model_name, parameters, tags, status, created_at, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, 'pending', now(), now()
    )
    RETURNING *
  `;

  const values = [
    id,
    creationId || null,
    userId,
    cleanTitle,
    description || '',
    mediaType || 'image',
    cleanMediaUrl,
    cleanCover,
    prompt || '',
    negativePrompt || '',
    modelName || '',
    JSON.stringify(parameters || {}),
    cleanTags,
  ];

  return await queryOne(sql, values);
}

export async function deleteCommunityPost(id, userId, isAdmin = false) {
  return withTransaction(async (tx) => {
    const post = await tx.queryOne('SELECT id,user_id,status,moderation_version FROM ai_studio.community_posts WHERE id=$1 FOR UPDATE', [id]);
    if (!post || (!isAdmin && post.user_id !== userId)) return false;
    if (post.status === 'withdrawn') return true;
    const version = post.moderation_version + 1;
    await tx.execute("UPDATE ai_studio.community_posts SET status='withdrawn',moderation_version=$2,updated_at=now() WHERE id=$1", [id, version]);
    await tx.execute(`INSERT INTO ai_studio.community_moderation_events(id,post_id,actor_user_id,previous_status,next_status,reason,version)
      VALUES($1,$2,$3,$4,'withdrawn','账户主动下架作品',$5)`, [generateId('review'), id, userId, post.status, version]);
    return true;
  });
}

export async function toggleCommunityLike(postId, userId) {
  return await withTransaction(async (transaction) => {
    const visible = await transaction.queryOne("SELECT id FROM ai_studio.community_posts WHERE id=$1 AND status='published' FOR UPDATE", [postId]);
    if (!visible) throw Object.assign(new Error('作品不存在或尚未公开'), {code:'COMMUNITY_NOT_FOUND'});
    // 检查是否已点赞
    const check = await transaction.query(
      'SELECT id FROM ai_studio.community_likes WHERE post_id = $1 AND user_id = $2',
      [postId, userId]
    );

    let isLiked = false;
    if (check.rows.length > 0) {
      // 取消点赞
      await transaction.execute(
        'DELETE FROM ai_studio.community_likes WHERE post_id = $1 AND user_id = $2',
        [postId, userId]
      );
      await transaction.execute(
        'UPDATE ai_studio.community_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1',
        [postId]
      );
      isLiked = false;
    } else {
      // 新增点赞
      const likeId = generateId('like');
      await transaction.execute(
        'INSERT INTO ai_studio.community_likes (id, post_id, user_id, created_at) VALUES ($1, $2, $3, now())',
        [likeId, postId, userId]
      );
      await transaction.execute(
        'UPDATE ai_studio.community_posts SET likes_count = likes_count + 1 WHERE id = $1',
        [postId]
      );
      isLiked = true;
    }

    const postRow = await transaction.queryOne('SELECT likes_count FROM ai_studio.community_posts WHERE id = $1', [postId]);
    const likesCount = postRow?.likes_count || 0;

    return { isLiked, likesCount };
  });
}

export async function addCommunityComment({ postId, userId, content }) {
  const cleanContent = String(content || '').trim();
  if (!cleanContent) {
    throw new Error('评论内容不能为空');
  }

  const commentId = generateId('cmt');
  return await withTransaction(async (transaction) => {
    const visible = await transaction.queryOne("SELECT id FROM ai_studio.community_posts WHERE id=$1 AND status='published' FOR UPDATE", [postId]);
    if (!visible) throw Object.assign(new Error('作品不存在或尚未公开'), {code:'COMMUNITY_NOT_FOUND'});
    const comment = await transaction.queryOne(
      `INSERT INTO ai_studio.community_comments (id, post_id, user_id, content, created_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING *`,
      [commentId, postId, userId, cleanContent.slice(0, 1000)]
    );

    await transaction.execute(
      'UPDATE ai_studio.community_posts SET comments_count = comments_count + 1 WHERE id = $1',
      [postId]
    );

    const user = await transaction.queryOne(
      'SELECT id, display_name, avatar_url, username FROM auth_usr.users WHERE id = $1',
      [userId]
    );

    return {
      ...comment,
      author_name: user?.display_name || user?.username || '匿名用户',
      author_avatar: user?.avatar_url || null,
      author_id: user?.id || null,
    };
  });
}

export async function listCommunityComments(postId, limit = 50) {
  const sql = `
    SELECT
      c.*,
      u.display_name AS author_name,
      u.avatar_url AS author_avatar,
      u.username AS author_username,
      u.id AS author_id
    FROM ai_studio.community_comments c
    LEFT JOIN auth_usr.users u ON c.user_id = u.id
    WHERE c.post_id = $1 AND EXISTS(SELECT 1 FROM ai_studio.community_posts p WHERE p.id=c.post_id AND p.status='published')
    ORDER BY c.created_at ASC
    LIMIT $2
  `;
  const res = await query(sql, [postId, Math.min(100, Number(limit) || 50)]);
  return res.rows;
}

export async function recordRemixCount(postId) {
  const result = await query("UPDATE ai_studio.community_posts SET remix_count=remix_count+1 WHERE id=$1 AND status='published' RETURNING id,prompt", [postId]);
  if (!result.rowCount) throw Object.assign(new Error('作品不存在或尚未公开'), {code:'COMMUNITY_NOT_FOUND'});
  const fragment = new URLSearchParams({communityPrompt:String(result.rows[0].prompt || '').slice(0,8000)});
  return { createUrl: `https://www.supdance.com/?communityPost=${encodeURIComponent(postId)}#${fragment}` };
}
