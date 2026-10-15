import 'server-only';

import { query, queryOne, queryMany, execute, nowIso, randomId } from '../db/index.js';

export async function findInviteCodeByCode(code, transaction = null) {
  const norm = String(code || '').trim().toUpperCase();
  if (!norm) return null;
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return one(`
    SELECT * FROM ai_studio.invite_codes
    WHERE UPPER(code) = $1
  `, [norm]);
}

export async function findInviteCodeForUpdate(code, transaction) {
  const norm = String(code || '').trim().toUpperCase();
  if (!norm || !transaction?.queryOne) return null;
  return transaction.queryOne(`
    SELECT * FROM ai_studio.invite_codes
    WHERE UPPER(code) = $1
    FOR UPDATE
  `, [norm]);
}

export async function claimInviteCode(code, userId, ip = null, transaction = null) {
  const norm = String(code || '').trim().toUpperCase();
  if (!norm) throw Object.assign(new Error('邀请码不能为空'), { code: 'INVITE_CODE_REQUIRED' });

  const record = transaction
    ? await findInviteCodeForUpdate(norm, transaction)
    : await findInviteCodeByCode(norm);

  if (!record) {
    throw Object.assign(new Error('邀请码不存在'), { code: 'INVALID_INVITE_CODE' });
  }

  if (record.status !== 'active') {
    throw Object.assign(new Error('邀请码已被禁用或已用尽'), { code: 'INVITE_CODE_EXHAUSTED' });
  }

  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) {
    throw Object.assign(new Error('邀请码已过期'), { code: 'INVITE_CODE_EXPIRED' });
  }

  if (record.used_count >= record.max_uses) {
    throw Object.assign(new Error('邀请码使用次数已达上限'), { code: 'INVITE_CODE_EXHAUSTED' });
  }

  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const newUsedCount = record.used_count + 1;
  const newStatus = newUsedCount >= record.max_uses ? 'exhausted' : 'active';
  const redemptionId = `red_${randomId()}`;

  await run(`
    UPDATE ai_studio.invite_codes
    SET used_count = $1, status = $2, updated_at = NOW()
    WHERE id = $3
  `, [newUsedCount, newStatus, record.id]);

  await run(`
    INSERT INTO ai_studio.invite_code_redemptions
      (id, invite_code_id, user_id, redeemed_at, ip)
    VALUES ($1, $2, $3, NOW(), $4)
  `, [redemptionId, record.id, userId, ip]);

  return {
    success: true,
    inviteCodeId: record.id,
    code: record.code,
    remainingUses: Math.max(0, record.max_uses - newUsedCount),
  };
}

export async function createInviteCode({
  id = null,
  code,
  maxUses = 1,
  notes = '',
  createdBy = 'admin',
  expiresAt = null,
  transaction = null,
} = {}) {
  const norm = String(code || '').trim().toUpperCase();
  if (!norm) throw Object.assign(new Error('邀请码不能为空'), { code: 'INVITE_CODE_REQUIRED' });
  const rowId = id || `inv_${randomId()}`;
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;

  await run(`
    INSERT INTO ai_studio.invite_codes
      (id, code, max_uses, used_count, status, notes, created_by, expires_at, created_at, updated_at)
    VALUES ($1, $2, $3, 0, 'active', $4, $5, $6, NOW(), NOW())
  `, [rowId, norm, maxUses, notes, createdBy, expiresAt]);

  return {
    id: rowId,
    code: norm,
    max_uses: maxUses,
    used_count: 0,
    status: 'active',
    notes,
    created_by: createdBy,
    expires_at: expiresAt,
  };
}

export async function listInviteCodes({ status = null, limit = 50, offset = 0, transaction = null } = {}) {
  const many = transaction?.queryMany ? transaction.queryMany.bind(transaction) : queryMany;
  if (status) {
    return many(`
      SELECT * FROM ai_studio.invite_codes
      WHERE status = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [status, limit, offset]);
  }
  return many(`
    SELECT * FROM ai_studio.invite_codes
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);
}

export async function countInviteCodes({ status = null, transaction = null } = {}) {
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  if (status) {
    const res = await one(`SELECT COUNT(*)::int AS total FROM ai_studio.invite_codes WHERE status = $1`, [status]);
    return res?.total || 0;
  }
  const res = await one(`SELECT COUNT(*)::int AS total FROM ai_studio.invite_codes`);
  return res?.total || 0;
}

export async function updateInviteCodeStatus(id, status, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return run(`
    UPDATE ai_studio.invite_codes
    SET status = $1, updated_at = NOW()
    WHERE id = $2
  `, [status, id]);
}

export async function getInviteGlobalStats(transaction = null) {
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  try {
    const stats = await one(`
      WITH code_stats AS (
        SELECT
          COUNT(*)::int AS total_codes,
          COUNT(*) FILTER (WHERE status = 'active' AND (expires_at IS NULL OR expires_at > NOW()) AND used_count < max_uses)::int AS active_codes,
          COUNT(*) FILTER (WHERE status = 'exhausted' OR used_count >= max_uses)::int AS exhausted_codes,
          COUNT(*) FILTER (WHERE status = 'disabled')::int AS disabled_codes,
          COALESCE(SUM(used_count), 0)::int AS total_redemptions
        FROM ai_studio.invite_codes
      ),
      invited_users AS (
        SELECT DISTINCT user_id FROM ai_studio.invite_code_redemptions
      ),
      user_counts AS (
        SELECT
          COUNT(*)::int AS total_invited_users,
          COUNT(*) FILTER (WHERE u.last_login_at > NOW() - INTERVAL '7 days')::int AS active_users_7d
        FROM invited_users iu
        JOIN auth_usr.users u ON u.id = iu.user_id
      ),
      creation_counts AS (
        SELECT COUNT(*)::int AS total_creations
        FROM ai_studio.creations c
        WHERE c.user_id IN (SELECT user_id FROM invited_users)
      ),
      order_counts AS (
        SELECT COALESCE(SUM(amount_minor), 0)::numeric / 100.0 AS total_revenue_cny
        FROM ops_bill.orders o
        WHERE o.status = 'paid' AND o.user_id IN (SELECT user_id FROM invited_users)
      )
      SELECT
        cs.total_codes,
        cs.active_codes,
        cs.exhausted_codes,
        cs.disabled_codes,
        cs.total_redemptions,
        COALESCE(uc.total_invited_users, 0) AS total_invited_users,
        COALESCE(uc.active_users_7d, 0) AS active_users_7d,
        COALESCE(cc.total_creations, 0) AS total_creations,
        COALESCE(oc.total_revenue_cny, 0) AS total_revenue_cny
      FROM code_stats cs
      CROSS JOIN user_counts uc
      CROSS JOIN creation_counts cc
      CROSS JOIN order_counts oc
    `);
    return stats || {
      total_codes: 0,
      active_codes: 0,
      exhausted_codes: 0,
      disabled_codes: 0,
      total_redemptions: 0,
      total_invited_users: 0,
      active_users_7d: 0,
      total_creations: 0,
      total_revenue_cny: 0,
    };
  } catch (err) {
    console.error('[inviteCodes] getInviteGlobalStats query failed:', err.message);
    return {
      total_codes: 0,
      active_codes: 0,
      exhausted_codes: 0,
      disabled_codes: 0,
      total_redemptions: 0,
      total_invited_users: 0,
      active_users_7d: 0,
      total_creations: 0,
      total_revenue_cny: 0,
    };
  }
}

export async function listInviteCodesWithHabits({ status = null, search = '', limit = 50, offset = 0, transaction = null } = {}) {
  const many = transaction?.queryMany ? transaction.queryMany.bind(transaction) : queryMany;
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (status) {
    if (status === 'active') {
      conditions.push(`ic.status = 'active' AND (ic.expires_at IS NULL OR ic.expires_at > NOW()) AND ic.used_count < ic.max_uses`);
    } else if (status === 'exhausted') {
      conditions.push(`(ic.status = 'exhausted' OR ic.used_count >= ic.max_uses)`);
    } else if (status === 'disabled') {
      conditions.push(`ic.status = 'disabled'`);
    } else if (status === 'expired') {
      conditions.push(`ic.expires_at IS NOT NULL AND ic.expires_at <= NOW()`);
    }
  }

  if (search && search.trim()) {
    conditions.push(`(UPPER(ic.code) LIKE $${paramIdx} OR UPPER(COALESCE(ic.notes, '')) LIKE $${paramIdx})`);
    params.push(`%${search.trim().toUpperCase()}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  const limitIdx = paramIdx++;
  params.push(offset);
  const offsetIdx = paramIdx++;

  return many(`
    SELECT
      ic.id,
      ic.code,
      ic.max_uses,
      ic.used_count,
      ic.status,
      ic.notes,
      ic.created_by,
      ic.expires_at,
      ic.created_at,
      ic.updated_at,
      COALESCE(r_stat.redeemed_count, 0)::int AS redeemed_count,
      r_stat.latest_redeemed_at,
      COALESCE(c_stat.total_creations, 0)::int AS total_creations,
      c_stat.favorite_model,
      COALESCE(o_stat.total_revenue_cny, 0)::numeric AS total_revenue_cny
    FROM ai_studio.invite_codes ic
    LEFT JOIN (
      SELECT
        invite_code_id,
        COUNT(DISTINCT user_id) AS redeemed_count,
        MAX(redeemed_at) AS latest_redeemed_at
      FROM ai_studio.invite_code_redemptions
      GROUP BY invite_code_id
    ) r_stat ON r_stat.invite_code_id = ic.id
    LEFT JOIN (
      SELECT
        r.invite_code_id,
        COUNT(c.id) AS total_creations,
        MODE() WITHIN GROUP (ORDER BY c.model) AS favorite_model
      FROM ai_studio.invite_code_redemptions r
      JOIN ai_studio.creations c ON c.user_id = r.user_id
      GROUP BY r.invite_code_id
    ) c_stat ON c_stat.invite_code_id = ic.id
    LEFT JOIN (
      SELECT
        r.invite_code_id,
        COALESCE(SUM(o.amount_minor), 0)::numeric / 100.0 AS total_revenue_cny
      FROM ai_studio.invite_code_redemptions r
      JOIN ops_bill.orders o ON o.user_id = r.user_id AND o.status = 'paid'
      GROUP BY r.invite_code_id
    ) o_stat ON o_stat.invite_code_id = ic.id
    ${whereClause}
    ORDER BY ic.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);
}

export async function countInviteCodesFiltered({ status = null, search = '', transaction = null } = {}) {
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (status) {
    if (status === 'active') {
      conditions.push(`status = 'active' AND (expires_at IS NULL OR expires_at > NOW()) AND used_count < max_uses`);
    } else if (status === 'exhausted') {
      conditions.push(`(status = 'exhausted' OR used_count >= max_uses)`);
    } else if (status === 'disabled') {
      conditions.push(`status = 'disabled'`);
    } else if (status === 'expired') {
      conditions.push(`expires_at IS NOT NULL AND expires_at <= NOW()`);
    }
  }

  if (search && search.trim()) {
    conditions.push(`(UPPER(code) LIKE $${paramIdx} OR UPPER(COALESCE(notes, '')) LIKE $${paramIdx})`);
    params.push(`%${search.trim().toUpperCase()}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await one(`SELECT COUNT(*)::int AS total FROM ai_studio.invite_codes ${whereClause}`, params);
  return res?.total || 0;
}

export async function getInviteCodeUserHabits(inviteCodeId, transaction = null) {
  const many = transaction?.queryMany ? transaction.queryMany.bind(transaction) : queryMany;
  return many(`
    SELECT
      r.id AS redemption_id,
      r.redeemed_at,
      r.ip AS redemption_ip,
      u.id AS user_id,
      u.email,
      u.display_name,
      u.avatar_url,
      u.credits,
      u.created_at AS user_created_at,
      u.last_login_at,
      COALESCE(c_stat.creation_count, 0)::int AS creation_count,
      c_stat.favorite_studio,
      c_stat.favorite_model,
      COALESCE(o_stat.paid_amount_cny, 0)::numeric AS paid_amount_cny,
      sub.plan_id AS active_subscription_plan
    FROM ai_studio.invite_code_redemptions r
    JOIN auth_usr.users u ON u.id = r.user_id
    LEFT JOIN (
      SELECT
        user_id,
        COUNT(*) AS creation_count,
        MODE() WITHIN GROUP (ORDER BY studio_id) AS favorite_studio,
        MODE() WITHIN GROUP (ORDER BY model) AS favorite_model
      FROM ai_studio.creations
      GROUP BY user_id
    ) c_stat ON c_stat.user_id = u.id
    LEFT JOIN (
      SELECT
        user_id,
        COALESCE(SUM(amount_minor), 0)::numeric / 100.0 AS paid_amount_cny
      FROM ops_bill.orders
      WHERE status = 'paid'
      GROUP BY user_id
    ) o_stat ON o_stat.user_id = u.id
    LEFT JOIN (
      SELECT DISTINCT ON (user_id)
        user_id, plan_id
      FROM ops_bill.subscriptions
      WHERE status IN ('active', 'trialing')
      ORDER BY user_id, updated_at DESC
    ) sub ON sub.user_id = u.id
    WHERE r.invite_code_id = $1
    ORDER BY r.redeemed_at DESC
  `, [inviteCodeId]);
}
