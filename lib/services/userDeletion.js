import 'server-only';

import { withTransaction, execute, query, queryMany, queryOne, nowIso } from '../db/index.js';
import { logAudit } from '../admin/audit.js';

export const DELETION_GRACE_PERIOD_DAYS = 3;

/**
 * 申请注销账户：进入 3 天后悔保护期（冷静期）
 */
export async function requestUserDeletion({ userId, reason = 'user_requested', ip = null }) {
  if (!userId) throw new Error('缺少用户标识');

  return await withTransaction(async (tx) => {
    const user = await tx.queryOne(
      'SELECT id, status, email, phone FROM auth_usr.users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (!user) {
      throw Object.assign(new Error('用户不存在'), { code: 'USER_NOT_FOUND' });
    }

    const now = new Date();
    const dueAt = new Date(now.getTime() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    await tx.execute(
      `UPDATE auth_usr.users
       SET status = 'deletion_pending',
           is_active = false,
           deletion_requested_at = $1,
           deletion_due_at = $2,
           updated_at = $1
       WHERE id = $3`,
      [now.toISOString(), dueAt.toISOString(), userId]
    );

    // 吊销并清除用户所有登录会话
    await tx.execute('DELETE FROM auth_usr.sessions WHERE user_id = $1', [userId]);

    // 记录安全审计事件
    await tx.execute(
      `INSERT INTO sys_core.auth_events (id, event_type, target, request_ip, metadata_json, created_at)
       VALUES ($1, 'ACCOUNT_DELETION_REQUESTED', $2, $3, $4, $5)`,
      [
        `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        ip,
        JSON.stringify({ reason, dueAt: dueAt.toISOString(), gracePeriodDays: DELETION_GRACE_PERIOD_DAYS }),
        now.toISOString(),
      ]
    );

    return {
      success: true,
      userId,
      status: 'deletion_pending',
      deletionRequestedAt: now.toISOString(),
      deletionDueAt: dueAt.toISOString(),
      remainingDays: DELETION_GRACE_PERIOD_DAYS,
      remainingHours: DELETION_GRACE_PERIOD_DAYS * 24,
    };
  });
}

/**
 * 撤销注销申请：在 3 天后悔期内恢复账户正常使用
 */
export async function cancelUserDeletion({ userId, ip = null }) {
  if (!userId) throw new Error('缺少用户标识');

  return await withTransaction(async (tx) => {
    const user = await tx.queryOne(
      'SELECT id, status, deletion_due_at FROM auth_usr.users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (!user) {
      throw Object.assign(new Error('用户不存在'), { code: 'USER_NOT_FOUND' });
    }

    if (user.status !== 'deletion_pending') {
      return { success: true, userId, message: '账户当前未处于注销申请状态' };
    }

    const now = Date.now();
    const dueTime = user.deletion_due_at ? new Date(user.deletion_due_at).getTime() : 0;
    if (dueTime && dueTime <= now) {
      // 已经超期，触发自动清理
      await purgeUserCascade(userId, tx);
      throw Object.assign(new Error('注销后悔期已过，账户数据已清理完毕，请重新注册'), {
        code: 'DELETION_ALREADY_EXPIRED',
      });
    }

    const nowIsoStr = nowIso();
    await tx.execute(
      `UPDATE auth_usr.users
       SET status = 'active',
           is_active = true,
           deletion_requested_at = NULL,
           deletion_due_at = NULL,
           updated_at = $1
       WHERE id = $2`,
      [nowIsoStr, userId]
    );

    // 记录安全审计事件
    await tx.execute(
      `INSERT INTO sys_core.auth_events (id, event_type, target, request_ip, metadata_json, created_at)
       VALUES ($1, 'ACCOUNT_DELETION_CANCELLED', $2, $3, $4, $5)`,
      [
        `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        ip,
        JSON.stringify({ restoredAt: nowIsoStr }),
        nowIsoStr,
      ]
    );

    return {
      success: true,
      userId,
      status: 'active',
      message: '账户注销申请已撤销，欢迎回来！所有资产与记录已完整恢复',
    };
  });
}

/**
 * 彻底级联物理清理指定用户的所有数据（不可逆）
 * 清除完毕后释放手机、邮箱与三方授权绑定，用户可随时重新注册
 */
export async function purgeUserCascade(userId, parentTx = null) {
  if (!userId) throw new Error('缺少待清理的用户标识');

  const executePurge = async (tx) => {
    // 1. 画布与创作业务数据
    await tx.execute('DELETE FROM ai_studio.canvas_projects WHERE owner_user_id = $1', [userId]);
    await tx.execute('DELETE FROM ai_studio.creations WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ai_studio.user_assets WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ai_studio.asset_folders WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ai_studio.community_comments WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ai_studio.community_likes WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ai_studio.community_posts WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ai_studio.generation_events WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ai_studio.generation_quotes WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ai_studio.storage_operation_logs WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ai_studio.user_coin_rewards WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ai_studio.invite_code_redemptions WHERE user_id = $1', [userId]);

    // 2. 积分财务与账本数据
    await tx.execute('DELETE FROM ops_bill.credit_ledger_v2 WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ops_bill.credit_reservations WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ops_bill.credit_wallets WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ops_bill.credit_refund_obligations WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ops_bill.currency_journal_entries WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ops_bill.currency_wallets WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ops_bill.orders WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ops_bill.subscriptions WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ops_bill.user_tags WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ops_bill.feedback_reports WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ops_bill.coupon_redemptions WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ops_bill.banner_events WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM ops_bill.admin_notes WHERE user_id = $1', [userId]);

    // 3. 系统核心审计、通知与安全日志
    await tx.execute('DELETE FROM sys_core.admin_export_jobs WHERE requested_by = $1', [userId]);
    await tx.execute('DELETE FROM sys_core.user_activity_logs WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM sys_core.user_notifications WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM sys_core.auth_events WHERE target = $1', [userId]);

    // 4. 财务支付底账（防外键约束阻断）
    await tx.execute('DELETE FROM ops_bill.payment_ledger WHERE user_id = $1', [userId]);

    // 5. 认证凭据与会话（解绑手机/邮箱/三方OAuth核心关键）
    await tx.execute('DELETE FROM auth_usr.sessions WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM auth_usr.otp_challenges WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM auth_usr.moderation_cases WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM auth_usr.email_send_logs WHERE user_id = $1 OR actor_id = $1', [userId]);
    await tx.execute('DELETE FROM auth_usr.auth_accounts WHERE user_id = $1', [userId]);
    await tx.execute('DELETE FROM auth_usr.oauth_accounts WHERE user_id = $1', [userId]);

    // 5. 用户主体与编号分配器
    await tx.execute('DELETE FROM auth_usr.users WHERE id = $1', [userId]);
    await tx.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id = $1', [userId]);

    return { success: true, userId, purgedAt: nowIso() };
  };

  if (parentTx) {
    return await executePurge(parentTx);
  }
  return await withTransaction(executePurge);
}

/**
 * 自动巡检并清理已超过 3 天后悔期的注销申请用户
 */
export async function processExpiredDeletions() {
  const expiredUsers = await queryMany(
    `SELECT id, deletion_due_at
     FROM auth_usr.users
     WHERE status = 'deletion_pending' AND deletion_due_at <= NOW()`
  );

  const purgedIds = [];
  for (const user of expiredUsers) {
    try {
      await purgeUserCascade(user.id);
      purgedIds.push(user.id);
      console.log(`[userDeletion] 用户 #${user.id} 注销后悔期已到期，已自动物理清理所有数据`);
    } catch (err) {
      console.error(`[userDeletion] 自动清理用户 #${user.id} 异常:`, err);
    }
  }

  return {
    scanned: expiredUsers.length,
    purged: purgedIds.length,
    purgedIds,
  };
}
