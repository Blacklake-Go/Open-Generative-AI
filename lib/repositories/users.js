import { query, queryOne, execute, nowIso } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

export async function findUserById(id, transaction = null) {
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const many = transaction?.queryMany
    ? transaction.queryMany.bind(transaction)
    : async (...args) => (await query(...args)).rows;
  const user = await one(`
    SELECT id, user_number, email, phone, phone_country_code, display_name, avatar_url, role, credits, status,
           is_activity_public, privacy_settings,
           is_active, is_banned, registration_source, last_login_ip, last_login_at, updated_at, created_at
    FROM users WHERE id = $1
  `, [id]);

  if (!user) return null;

  // 查询已绑定的登录账号
  const accounts = await many(`
    SELECT id, provider, provider_user_id, provider_email, provider_username, created_at, last_login_at
    FROM auth_accounts WHERE user_id = $1
    ORDER BY created_at ASC
  `, [id]);
  user.authAccounts = accounts;
  user.loginProviders = [...new Set(accounts.map(a => a.provider))];

  // 查询运营标签
  const tags = await many(`
    SELECT t.id, t.name, t.slug, t.color, ut.created_at AS tagged_at, ut.created_by
    FROM user_tags ut
    JOIN tags t ON t.id = ut.tag_id
    WHERE ut.user_id = $1
    ORDER BY ut.created_at ASC
  `, [id]);
  user.tags = tags;

  return user;
}

export async function findUserByIdOrNumber(identifier) {
  const clean = String(identifier || '').trim();
  if (!clean) return null;
  if (/^\d{6,64}$/.test(clean)) {
    return await queryOne(`
      SELECT id, user_number, email, phone, display_name, avatar_url, role, credits, status,
             bio, website, social_links, followers_count, following_count, is_activity_public, privacy_settings, created_at
      FROM users WHERE id = $1 OR user_number = $1
    `, [clean]);
  }
  return await queryOne(`
    SELECT id, user_number, email, phone, display_name, avatar_url, role, credits, status,
           bio, website, social_links, followers_count, following_count, is_activity_public, privacy_settings, created_at
    FROM users WHERE id = $1
  `, [clean]);
}

export async function findUserByEmail(email) {
  return await queryOne(`
    SELECT id, user_number, email, phone, display_name, role, credits, status, last_login_at, updated_at, created_at
    FROM users WHERE LOWER(email) = $1
  `, [String(email).trim().toLowerCase()]);
}

export async function findUserByPhone(phone, countryCode = '+86') {
  const cleanPhone = String(phone || '').replace(/[^\d+]/g, '').trim();
  return await queryOne(`
    SELECT id, user_number, email, phone, display_name, role, credits, status, last_login_at, updated_at, created_at
    FROM users WHERE phone = $1
  `, [cleanPhone]);
}

export async function getLegacyCredits(userId) {
  const row = await queryOne('SELECT credits FROM users WHERE id = $1', [userId]);
  return Number(row?.credits || 0);
}

export async function getUserProfile(userId) {
  const clean = String(userId || '').trim();
  if (!clean) return null;
  const isNumeric = /^\d{6,64}$/.test(clean);
  const profile = await queryOne(`
    SELECT id, user_number, username, email, phone, phone_country_code, locale, display_name, avatar_url,
           role, credits, bio, website, social_links, country, gender, occupation_code, style_codes, creator_persona_code,
           followers_count, following_count, is_activity_public, privacy_settings, created_at, last_login_at,
           ((password_hash IS NOT NULL AND password_hash != '') OR EXISTS (SELECT 1 FROM auth_accounts aa WHERE aa.user_id = users.id AND aa.password_hash IS NOT NULL AND aa.password_hash != '')) AS has_password
    FROM users
    WHERE ${isNumeric ? '(id = $1 OR user_number = $1)' : 'id = $1'}
  `, [clean]);
  if (!profile) return null;

  const resolvedId = profile.id;
  const [creationsCount, communityStats] = await Promise.all([
    queryOne('SELECT COUNT(*)::int AS count FROM creations WHERE user_id = $1', [resolvedId]),
    queryOne(`
      SELECT COUNT(*)::int AS posts_count, COALESCE(SUM(likes_count), 0)::int AS total_likes
      FROM community_posts
      WHERE user_id = $1 AND status = 'published'
    `, [resolvedId]),
  ]);

  return {
    ...profile,
    hasPassword: Boolean(profile.has_password),
    stats: {
      totalCreations: Number(creationsCount?.count || 0),
      publishedPosts: Number(communityStats?.posts_count || 0),
      totalLikes: Number(communityStats?.total_likes || 0),
    },
  };
}

export async function updateUserPrivacySettings(userId, { isActivityPublic, privacySettings }) {
  const updates = [];
  const values = [userId];
  if (isActivityPublic !== undefined) {
    values.push(Boolean(isActivityPublic));
    updates.push(`is_activity_public = $${values.length}`);
  }
  if (privacySettings !== undefined && typeof privacySettings === 'object') {
    values.push(JSON.stringify(privacySettings));
    updates.push(`privacy_settings = $${values.length}::jsonb`);
  }
  if (!updates.length) return null;
  updates.push('updated_at = NOW()');
  return await queryOne(`
    UPDATE users
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING id, user_number, is_activity_public, privacy_settings
  `, values);
}

export async function listUserAuditLogs(userId, limit = 20) {
  return query(`
    SELECT id, actor_email, action, target_type, target_id, risk_level, created_at
    FROM admin_audit_logs
    WHERE target_id = $1
    ORDER BY created_at DESC LIMIT $2
  `, [userId, limit]).then((result) => result.rows);
}

export async function updateUserProfile(userId, fields) {
  const updates = [];
  const values = [userId];
  const add = (column, value, cast = '') => {
    values.push(value);
    updates.push(`${column} = $${values.length}${cast}`);
  };

  if (fields.displayName !== undefined) add('display_name', String(fields.displayName).trim().slice(0, 50));
  if (fields.bio !== undefined) add('bio', String(fields.bio).trim().slice(0, 300));
  if (fields.website !== undefined) add('website', String(fields.website).trim().slice(0, 200));
  if (fields.avatarUrl !== undefined) add('avatar_url', String(fields.avatarUrl).trim().slice(0, 500));
  if (fields.locale !== undefined) add('locale', String(fields.locale).trim().slice(0, 16));
  if (fields.zodiac !== undefined) add('zodiac', fields.zodiac ? String(fields.zodiac).trim().slice(0, 32) : null);
  if (fields.industry !== undefined) add('industry', fields.industry ? String(fields.industry).trim().slice(0, 64) : null);
  if (fields.occupation !== undefined) add('occupation', fields.occupation ? String(fields.occupation).trim().slice(0, 64) : null);
  if (fields.occupationCode !== undefined) add('occupation_code', fields.occupationCode ? String(fields.occupationCode).trim().slice(0, 24) : null);
  if (fields.country !== undefined) add('country', fields.country ? String(fields.country).trim().slice(0, 2).toUpperCase() : null);
  if (fields.gender !== undefined) {
    const validGenders = ['female', 'male', 'non_binary', 'prefer_not_to_say'];
    add('gender', validGenders.includes(fields.gender) ? fields.gender : null);
  }
  if (fields.styleCodes !== undefined) {
    const styles = Array.isArray(fields.styleCodes) ? fields.styleCodes.map((s) => String(s).trim()).filter(Boolean) : [];
    values.push(styles);
    updates.push(`style_codes = $${values.length}::text[]`);
  }
  if (fields.socialLinks !== undefined && fields.socialLinks !== null && typeof fields.socialLinks === 'object' && !Array.isArray(fields.socialLinks)) {
    add('social_links', JSON.stringify(fields.socialLinks), '::jsonb');
  }
  if (!updates.length) return null;

  updates.push('updated_at = NOW()');
  return await queryOne(`
    UPDATE users
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING id, username, email, locale, display_name, avatar_url, bio, website, social_links, zodiac, industry, occupation, country, gender, occupation_code, style_codes, creator_persona_code, preferences_json, onboarding_completed
  `, values);
}

export async function listUsers(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const sqlParams = [];
  let paramIndex = 0;
  const nextParam = () => `$${++paramIndex}`;

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(email ILIKE ${nextParam()} OR id ILIKE ${nextParam()} OR display_name ILIKE ${nextParam()} OR phone ILIKE ${nextParam()} OR user_number::text ILIKE ${nextParam()})`);
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const role = String(params.get('role') || '').trim();
  if (role) {
    clauses.push(`role = ${nextParam()}`);
    sqlParams.push(role);
  }

  const status = String(params.get('status') || '').trim();
  if (status) {
    clauses.push(`status = ${nextParam()}`);
    sqlParams.push(status);
  }

  const provider = String(params.get('provider') || '').trim();
  if (provider) {
    clauses.push(`id IN (SELECT user_id FROM auth_accounts WHERE provider = ${nextParam()})`);
    sqlParams.push(provider);
  }

  const tagId = String(params.get('tag') || '').trim();
  if (tagId) {
    clauses.push(`id IN (SELECT user_id FROM user_tags WHERE tag_id = ${nextParam()})`);
    sqlParams.push(tagId);
  }

  const timeRange = String(params.get('timeRange') || '').trim();
  if (timeRange === 'today') {
    clauses.push("created_at >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date");
  } else if (timeRange === '7d') {
    clauses.push("created_at >= NOW() - INTERVAL '7 days'");
  } else if (timeRange === '30d') {
    clauses.push("created_at >= NOW() - INTERVAL '30 days'");
  }

  const commercial = String(params.get('commercial') || '').trim();
  if (commercial === 'paid') {
    clauses.push("(id IN (SELECT user_id FROM ops_bill.orders WHERE status IN ('paid', 'completed')) OR id IN (SELECT user_id FROM ops_bill.subscriptions WHERE status IN ('active', 'trialing')))");
  } else if (commercial === 'free') {
    clauses.push("(id NOT IN (SELECT user_id FROM ops_bill.orders WHERE status IN ('paid', 'completed')) AND id NOT IN (SELECT user_id FROM ops_bill.subscriptions WHERE status IN ('active', 'trialing')))");
  }

  const orderByParam = String(params.get('order') || '').trim();
  let orderClause = 'created_at DESC, id DESC';
  if (orderByParam === 'login_desc') {
    orderClause = 'last_login_at DESC NULLS LAST, id DESC';
  } else if (orderByParam === 'credits_desc') {
    orderClause = 'credits DESC, id DESC';
  } else if (orderByParam === 'created_asc') {
    orderClause = 'created_at ASC, id ASC';
  }

  const baseSql = `
    SELECT id, email, phone, phone_country_code, display_name, avatar_url, role, credits, status,
           registration_source, last_login_ip, last_login_at, created_at
    FROM users
    WHERE ${clauses.join(' AND ')}
  `;

  const pagedResult = await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    order: orderClause,
  });

  // 为当前页的用户补充其绑定平台 (loginProviders)、运营标签 (tags) 与创作偏好 (modality)
  if (pagedResult.rows && pagedResult.rows.length > 0) {
    const userIds = pagedResult.rows.map(u => u.id);
    const inClause = userIds.map((_, index) => `$${index + 1}`).join(',');

    const [accRes, tagRes, creationStatsRes] = await Promise.all([
      query(`SELECT user_id, provider FROM auth_accounts WHERE user_id IN (${inClause})`, userIds),
      query(`
        SELECT ut.user_id, t.id, t.name, t.slug, t.color
        FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
        WHERE ut.user_id IN (${inClause})
      `, userIds),
      query(`
        SELECT user_id, 
               COUNT(*)::int as total_creations,
               COUNT(*) FILTER (WHERE studio_id LIKE '%video%' OR model LIKE '%kling%' OR model LIKE '%veo%' OR model LIKE '%hailuo%' OR model LIKE '%sora%' OR model LIKE '%wan%')::int as video_creations,
               COUNT(*) FILTER (WHERE studio_id LIKE '%audio%' OR model LIKE '%suno%' OR model LIKE '%minimax%' OR model LIKE '%udio%')::int as audio_creations
        FROM ai_studio.creations
        WHERE user_id IN (${inClause})
        GROUP BY user_id
      `, userIds)
    ]);

    const accMap = new Map();
    accRes.rows.forEach(a => {
      if (!accMap.has(a.user_id)) accMap.set(a.user_id, new Set());
      accMap.get(a.user_id).add(a.provider);
    });

    const tagMap = new Map();
    tagRes.rows.forEach(t => {
      if (!tagMap.has(t.user_id)) tagMap.set(t.user_id, []);
      tagMap.get(t.user_id).push({ id: t.id, name: t.name, slug: t.slug, color: t.color });
    });

    const creationStatsMap = new Map();
    creationStatsRes.rows.forEach(c => {
      creationStatsMap.set(c.user_id, c);
    });

    pagedResult.rows.forEach(u => {
      u.loginProviders = accMap.has(u.id) ? Array.from(accMap.get(u.id)) : (u.phone ? ['phone'] : ['email']);
      u.tags = tagMap.get(u.id) || [];
      const stats = creationStatsMap.get(u.id) || { total_creations: 0, video_creations: 0, audio_creations: 0 };
      u.creationsCount = stats.total_creations;
      u.preferredModality = stats.video_creations > 0 ? 'video' : stats.audio_creations > 0 ? 'audio' : stats.total_creations > 0 ? 'image' : null;
    });
  }

  return pagedResult;
}

export async function getUserSummaryMetrics() {
  const [usersRes, todayRes, sessionsRes, paidRes, suspendedRes] = await Promise.all([
    queryOne('SELECT count(*) as n FROM auth_usr.users'),
    queryOne("SELECT count(*) as n FROM auth_usr.users WHERE created_at >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date"),
    queryOne("SELECT count(distinct user_id) as n FROM auth_usr.sessions WHERE expires_at > NOW() AND revoked_at IS NULL"),
    queryOne("SELECT count(distinct user_id) as n FROM ops_bill.orders WHERE status IN ('paid', 'completed')"),
    queryOne("SELECT count(*) as n FROM auth_usr.users WHERE status = 'suspended'"),
  ]);
  return {
    totalUsers: Number(usersRes?.n || 0),
    todayNewUsers: Number(todayRes?.n || 0),
    activeSessions: Number(sessionsRes?.n || 0),
    payingUsers: Number(paidRes?.n || 0),
    suspendedUsers: Number(suspendedRes?.n || 0),
  };
}

export async function listAdmins() {
  const res = await query(`
    SELECT id, email, display_name, role, status, last_login_at, created_at
    FROM users
    WHERE role != 'user'
    ORDER BY created_at ASC
  `);
  return res.rows;
}

export async function listAllTags() {
  const res = await query(`
    SELECT id, name, slug, color, description, created_at
    FROM tags
    ORDER BY created_at ASC
  `);
  return res.rows;
}

export async function addUserTag(userId, tagId, operator = 'admin', transaction = null) {
  const now = nowIso();
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  await run(`
    INSERT INTO user_tags (user_id, tag_id, created_at, created_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, tag_id) DO NOTHING
  `, [userId, tagId, now, operator]);
  return true;
}

export async function removeUserTag(userId, tagId, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  await run(`
    DELETE FROM user_tags WHERE user_id = $1 AND tag_id = $2
  `, [userId, tagId]);
  return true;
}

export async function updateUserStatus(userId, status, transaction = null) {
  const timestamp = nowIso();
  const isBanned = status === 'suspended';
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  await run(`
    UPDATE users SET status = $1, is_banned = $2, updated_at = $3 WHERE id = $4
    RETURNING id
  `, [status, isBanned, timestamp, userId]);
  return await findUserById(userId, transaction);
}

export async function updateUserRole(userId, role, transaction = null) {
  const timestamp = nowIso();
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  await run(`
    UPDATE users SET role = $1, updated_at = $2 WHERE id = $3
    RETURNING id
  `, [role, timestamp, userId]);
  return await findUserById(userId, transaction);
}

export async function updateUserCredits(dbOrNull, userId, newCredits) {
  const executor = dbOrNull && typeof dbOrNull.execute === 'function' ? dbOrNull.execute.bind(dbOrNull) : execute;
  await executor('UPDATE users SET credits = $1, updated_at = $2 WHERE id = $3', [newCredits, nowIso(), userId]);
}
