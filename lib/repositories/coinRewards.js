import 'server-only';

import { nowIso, query, queryOne, withTransaction, randomId } from '../db/index.js';
import { ACCOUNT_CODES } from '../financial/constants.js';

function serializeReward(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    rewardType: row.reward_type,
    name: row.name,
    description: row.description,
    costCoins: Number(row.cost_coins || 0),
    durationDays: row.duration_days ? Number(row.duration_days) : null,
    assetConfig: row.asset_config || {},
    owned: Boolean(row.user_reward_id),
    equipped: Boolean(row.equipped_at),
    redeemedAt: row.redeemed_at || null,
    expiresAt: row.expires_at || null,
  };
}

export async function listCoinRewards(userId = null) {
  const rows = await query(`
    SELECT item.id, item.slug, item.reward_type, item.name, item.description,
           item.cost_coins, item.duration_days, item.asset_config,
           reward.id AS user_reward_id, reward.redeemed_at, reward.expires_at, reward.equipped_at
    FROM ai_studio.coin_reward_items item
    LEFT JOIN ai_studio.user_coin_rewards reward
      ON reward.reward_item_id = item.id AND reward.user_id = $1
     AND reward.status = 'active' AND (reward.expires_at IS NULL OR reward.expires_at > now())
    WHERE item.is_active = TRUE
    ORDER BY item.sort_order ASC, item.created_at ASC
  `, [userId]);
  return rows.rows.map(serializeReward);
}

export async function getEquippedCoinReward(userId) {
  if (!userId) return null;
  const row = await queryOne(`
    SELECT item.id, item.slug, item.reward_type, item.name, item.description,
           item.cost_coins, item.duration_days, item.asset_config,
           reward.id AS user_reward_id, reward.redeemed_at, reward.expires_at, reward.equipped_at
    FROM ai_studio.user_coin_rewards reward
    JOIN ai_studio.coin_reward_items item ON item.id = reward.reward_item_id
    WHERE reward.user_id = $1 AND reward.status = 'active' AND reward.equipped_at IS NOT NULL
      AND (reward.expires_at IS NULL OR reward.expires_at > now()) AND item.is_active = TRUE
    LIMIT 1
  `, [userId]);
  return serializeReward(row);
}

export async function redeemCoinReward({ userId, rewardSlug, idempotencyKey }) {
  if (!userId) throw new Error('请先登录');
  const cleanSlug = String(rewardSlug || '').trim();
  if (!cleanSlug) throw new Error('请选择要兑换的头像框');
  const cleanIdempotencyKey = String(idempotencyKey || '').trim();
  if (cleanIdempotencyKey.length < 8) throw new Error('兑换请求缺少有效的幂等键');

  return withTransaction(async (tx) => {
    const previous = await tx.queryOne(`
      SELECT transaction_id, description FROM ops_bill.currency_journal_entries
      WHERE idempotency_key = $1 AND user_id = $2 AND biz_type = 'COIN_REWARD_REDEEM' LIMIT 1
    `, [cleanIdempotencyKey, userId]);
    if (previous) {
      const item = await tx.queryOne(`
        SELECT item.id, item.slug, item.reward_type, item.name, item.description,
               item.cost_coins, item.duration_days, item.asset_config,
               reward.id AS user_reward_id, reward.redeemed_at, reward.expires_at, reward.equipped_at
        FROM ai_studio.user_coin_rewards reward
        JOIN ai_studio.coin_reward_items item ON item.id = reward.reward_item_id
        WHERE reward.user_id = $1 AND item.slug = $2 LIMIT 1
      `, [userId, cleanSlug]);
      const wallet = await tx.queryOne('SELECT available_balance FROM ops_bill.currency_wallets WHERE user_id = $1', [userId]);
      return { success: true, idempotent: true, reward: serializeReward(item), balanceAfter: Number(wallet?.available_balance || 0), transactionId: previous.transaction_id };
    }

    const item = await tx.queryOne(`SELECT * FROM ai_studio.coin_reward_items WHERE slug = $1 AND is_active = TRUE FOR UPDATE`, [cleanSlug]);
    if (!item) throw new Error('头像框不存在或已下架');
    const existing = await tx.queryOne(`
      SELECT id, status, expires_at, equipped_at, redeemed_at
      FROM ai_studio.user_coin_rewards WHERE user_id = $1 AND reward_item_id = $2 FOR UPDATE
    `, [userId, item.id]);
    if (existing?.status === 'active' && (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now())) {
      const wallet = await tx.queryOne('SELECT available_balance FROM ops_bill.currency_wallets WHERE user_id = $1', [userId]);
      return { success: true, alreadyOwned: true, reward: serializeReward({ ...item, user_reward_id: existing.id, ...existing }), balanceAfter: Number(wallet?.available_balance || 0) };
    }
    if (item.stock !== null && Number(item.stock) < 1) throw new Error('该头像框已兑换完');

    const wallet = await tx.queryOne('SELECT * FROM ops_bill.currency_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!wallet || wallet.is_locked) throw new Error('钱包不可用，请稍后重试');
    const cost = Number(item.cost_coins || 0);
    const available = Number(wallet.available_balance || 0);
    if (available < cost) throw new Error(`K 币余额不足，需要 ${cost} 枚，当前可用 ${available.toFixed(0)} 枚`);

    const now = nowIso();
    const newBalance = Number((available - cost).toFixed(4));
    const transactionId = `tx_reward_${randomId()}`;
    const expiresAt = item.duration_days ? new Date(Date.now() + Number(item.duration_days) * 24 * 60 * 60 * 1000).toISOString() : null;
    await tx.execute(`
      INSERT INTO ops_bill.currency_journal_entries
        (id, transaction_id, user_id, account_code, direction, amount, balance_after,
         biz_type, biz_id, idempotency_key, description, created_at)
      VALUES ($1, $2, $3, $4, 'DEBIT', $5, $6, 'COIN_REWARD_REDEEM', $7, $8, $9, $10)
    `, [`cje_${randomId()}`, transactionId, userId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, cost, newBalance, item.id, cleanIdempotencyKey, `兑换头像框「${item.name}」消耗 ${cost} 枚 K 币`, now]);
    await tx.execute(`UPDATE ops_bill.currency_wallets SET available_balance = $1, version = version + 1, updated_at = $2 WHERE user_id = $3`, [newBalance, now, userId]);
    if (item.stock !== null) await tx.execute(`UPDATE ai_studio.coin_reward_items SET stock = stock - 1, updated_at = $1 WHERE id = $2 AND stock > 0`, [now, item.id]);

    const userReward = existing
      ? await tx.queryOne(`
          UPDATE ai_studio.user_coin_rewards SET status = 'active', redeemed_at = $1, expires_at = $2, equipped_at = NULL
          WHERE id = $3 RETURNING id, redeemed_at, expires_at, equipped_at
        `, [now, expiresAt, existing.id])
      : await tx.queryOne(`
          INSERT INTO ai_studio.user_coin_rewards (id, user_id, reward_item_id, status, redeemed_at, expires_at)
          VALUES ($1, $2, $3, 'active', $4, $5) RETURNING id, redeemed_at, expires_at, equipped_at
        `, [`ucr_${randomId()}`, userId, item.id, now, expiresAt]);
    return { success: true, reward: serializeReward({ ...item, user_reward_id: userReward.id, ...userReward }), balanceAfter: newBalance, spentCoins: cost, transactionId };
  });
}

export async function equipCoinReward({ userId, rewardSlug }) {
  if (!userId) throw new Error('请先登录');
  const cleanSlug = String(rewardSlug || '').trim();
  return withTransaction(async (tx) => {
    const reward = await tx.queryOne(`
      SELECT reward.id AS user_reward_id, reward.redeemed_at, reward.expires_at,
             item.id, item.slug, item.reward_type, item.name, item.description,
             item.cost_coins, item.duration_days, item.asset_config
      FROM ai_studio.user_coin_rewards reward
      JOIN ai_studio.coin_reward_items item ON item.id = reward.reward_item_id
      WHERE reward.user_id = $1 AND item.slug = $2 AND reward.status = 'active' AND item.is_active = TRUE
        AND (reward.expires_at IS NULL OR reward.expires_at > now()) FOR UPDATE
    `, [userId, cleanSlug]);
    if (!reward) throw new Error('请先兑换该头像框');
    await tx.execute(`
      UPDATE ai_studio.user_coin_rewards SET equipped_at = NULL
      WHERE user_id = $1 AND status = 'active' AND equipped_at IS NOT NULL
    `, [userId]);
    const equipped = await tx.queryOne(`
      UPDATE ai_studio.user_coin_rewards SET equipped_at = $1 WHERE id = $2 RETURNING equipped_at
    `, [nowIso(), reward.user_reward_id]);
    return { success: true, reward: serializeReward({ ...reward, equipped_at: equipped.equipped_at }) };
  });
}
