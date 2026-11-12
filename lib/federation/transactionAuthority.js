import 'server-only';
import { queryOne } from '../db/index.js';

// Only new transactions move to the main wallet. Previously accepted jobs,
// reservations and payment callbacks continue in their original ledger.
export async function legacyCreditValueRemains(userId, transaction = null) {
  const read = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const result = await read(`SELECT EXISTS(SELECT 1 FROM ops_bill.credit_wallets WHERE user_id=$1 AND
    (daily_free_credits>0 OR subscription_credits>0 OR perpetual_credits>0 OR frozen_credits>0))
    OR EXISTS(SELECT 1 FROM ops_bill.credit_returned_lots WHERE user_id=$1 AND remaining_credits>0
      AND (expires_at IS NULL OR expires_at>now())) AS has_value`, [userId]);
  return result?.has_value === true;
}

export async function requireLegacyTransactionAuthority(userId, transaction = null, { purpose = 'generation' } = {}) {
  if (process.env.SUPDANCE_FEDERATION_ENABLED !== 'true' || !userId) return;
  const read = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const link = await read("SELECT main_user_id,state FROM supdance_federation.identity_links WHERE one_user_id=$1", [userId]);
  if (!link) return;
  // Linking identity must never strand prepaid historical credits. Checkout
  // moves first; legacy generation drains its original buckets under the old
  // reservation/expiry rules until an explicitly enabled, zero-value cutover.
  if (link.state === 'active' && purpose === 'generation'
    && (process.env.SUPDANCE_FEDERATION_TRANSACTIONS_ON_MAIN !== 'true' || await legacyCreditValueRemains(userId, transaction))) return;
  throw Object.assign(new Error('请返回主站创作或充值；历史余额、已受理任务和交易仍按原规则处理'), { code: 'MAIN_WALLET_REQUIRED', status: 409 });
}
