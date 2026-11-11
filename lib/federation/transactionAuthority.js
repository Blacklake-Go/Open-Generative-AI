import 'server-only';
import { queryOne } from '../db/index.js';

// Only new transactions move to the main wallet. Previously accepted jobs,
// reservations and payment callbacks continue in their original ledger.
export async function requireLegacyTransactionAuthority(userId, transaction = null) {
  if (process.env.SUPDANCE_FEDERATION_ENABLED !== 'true' || !userId) return;
  const read = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const link = await read("SELECT main_user_id FROM supdance_federation.identity_links WHERE one_user_id=$1", [userId]);
  if (link) throw Object.assign(new Error('账户已连接主站，请返回主站创作或充值；原有任务和交易继续按原规则处理'), { code: 'MAIN_WALLET_REQUIRED', status: 409 });
}
