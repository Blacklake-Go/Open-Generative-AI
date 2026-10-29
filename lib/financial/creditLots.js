import 'server-only';

import { queryMany, randomId } from '../db/index.js';

export const CREDIT_BUCKET_NAMES = { daily: 'DAILY_FREE', subscription: 'SUBSCRIPTION', perpetual: 'PERPETUAL' };

// The wallet lock serializes expiry with reserve/grant/release. Frozen funds
// belong to reservations and are never expired by this balance housekeeping.
export async function expireAvailableCreditFunding(userId, transaction, now) {
  const wallet = await transaction.queryOne('SELECT * FROM credit_wallets WHERE user_id=$1 FOR UPDATE',[userId]);
  if (!wallet) return null;
  const events=[];
  for (const [bucket,column,expiry] of [
    ['daily','daily_free_credits','daily_expires_at'],
    ['subscription','subscription_credits','subscription_expires_at'],
  ]) {
    const amount=Number(wallet[column] || 0);
    if (amount>0 && wallet[expiry] && new Date(wallet[expiry]).getTime()<=new Date(now).getTime()) {
      events.push({bucket,amount,id:`wallet:${userId}:${bucket}:${wallet.version}`});
      wallet[column]=0;
    }
  }
  const expiredLots=await transaction.queryMany(`SELECT id,bucket_type,remaining_credits FROM ops_bill.credit_returned_lots
    WHERE user_id=$1 AND remaining_credits>0 AND expires_at<=$2 FOR UPDATE`,[userId,now]);
  for (const lot of expiredLots) {
    const bucket=Object.keys(CREDIT_BUCKET_NAMES).find(key=>CREDIT_BUCKET_NAMES[key]===lot.bucket_type);
    events.push({bucket,amount:Number(lot.remaining_credits),id:`returned:${lot.id}`});
    await transaction.execute('UPDATE ops_bill.credit_returned_lots SET remaining_credits=0 WHERE id=$1',[lot.id]);
  }
  if (!events.length) return {wallet,returnedLots:await readReturnedCreditLots(userId,{transaction,now:new Date(now)})};
  await transaction.execute(`UPDATE ops_bill.credit_wallets SET daily_free_credits=$2,subscription_credits=$3,
    version=version+1,updated_at=$4 WHERE user_id=$1`,[userId,wallet.daily_free_credits,wallet.subscription_credits,now]);
  const availableLots=await readReturnedCreditLots(userId,{transaction,now:new Date(now)});
  for (const event of events) {
    const type=CREDIT_BUCKET_NAMES[event.bucket];
    const column=event.bucket==='daily'?'daily_free_credits':'subscription_credits';
    const balance=Number(wallet[column] || 0)+availableLots.filter(lot=>lot.bucket_type===type).reduce((sum,lot)=>sum+Number(lot.remaining_credits),0);
    await transaction.execute(`INSERT INTO ops_bill.credit_ledger_v2
      (id,user_id,bucket_type,delta,balance_after,action_type,reference_id,description,idempotency_key,created_at)
      VALUES($1,$2,$3,$4,$5,'CREDIT_EXPIRE',$6,'积分按原有效期到期',$7,$8)`,
    [`cl2_${randomId()}`,userId,type,-event.amount,balance,event.id,`expire:${event.id}`,now]);
  }
  await syncLegacyCreditBalance(userId,transaction,now);
  return {wallet:{...wallet,updated_at:now,version:Number(wallet.version || 0)+1},returnedLots:availableLots};
}

export async function readReturnedCreditLots(userId, { transaction = null, now = new Date(), lock = false } = {}) {
  const read = transaction ? transaction.queryMany.bind(transaction) : queryMany;
  return read(`SELECT id, bucket_type, remaining_credits, expires_at
    FROM ops_bill.credit_returned_lots
    WHERE user_id=$1 AND remaining_credits > 0 AND (expires_at IS NULL OR expires_at > $2)
    ORDER BY expires_at ASC NULLS LAST, created_at, id ${lock ? 'FOR UPDATE' : ''}`, [userId, now.toISOString()]);
}

export function addReturnedCreditBalances(normalized, lots) {
  const balances = { ...normalized };
  for (const [bucket, type] of Object.entries(CREDIT_BUCKET_NAMES)) {
    const amount = lots.filter((lot) => lot.bucket_type === type).reduce((sum, lot) => sum + Number(lot.remaining_credits), 0);
    balances[bucket] += amount;
    balances.totalAvailable += amount;
  }
  return balances;
}

export function allocateCreditFunding(wallet, normalized, lots, amount) {
  let needed = amount;
  const split = { daily: 0, subscription: 0, perpetual: 0 };
  const walletSplit = { ...split };
  const allocations = [];
  for (const [bucket, type] of Object.entries(CREDIT_BUCKET_NAMES)) {
    const expiry = bucket === 'daily' ? wallet.daily_expires_at : bucket === 'subscription' ? wallet.subscription_expires_at : null;
    const sources = [
      { source: 'wallet', amount: normalized[bucket], expiresAt: expiry ? new Date(expiry).toISOString() : null },
      ...lots.filter((lot) => lot.bucket_type === type).map((lot) => ({ source: 'returned', lotId: lot.id, amount: Number(lot.remaining_credits), expiresAt: lot.expires_at ? new Date(lot.expires_at).toISOString() : null })),
    ].sort((a, b) => (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) - (b.expiresAt ? Date.parse(b.expiresAt) : Infinity));
    for (const source of sources) {
      const take = Math.min(needed, source.amount);
      if (take <= 0) continue;
      split[bucket] += take;
      if (source.source === 'wallet') walletSplit[bucket] += take;
      allocations.push({ bucket, source: source.source, ...(source.lotId ? { lotId: source.lotId } : {}), amount: take, expiresAt: source.expiresAt });
      needed -= take;
    }
  }
  return { isSufficient: needed === 0, split, walletSplit, allocations };
}

export function validateCreditAllocations(raw, split) {
  if (!raw) {
    if (split.daily || split.subscription) {
      throw Object.assign(new Error('旧预扣缺少原始积分有效期，保留冻结额度并等待凭据核对'), { code: 'CREDIT_RELEASE_CONTEXT_REQUIRED' });
    }
    return [{ bucket: 'perpetual', source: 'wallet', amount: split.perpetual, expiresAt: null }];
  }
  const allocations = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const totals = { daily: 0, subscription: 0, perpetual: 0 };
  const invalid = () => { throw Object.assign(new Error('预扣资金来源快照不一致，已停止释放'), { code: 'CREDIT_RESERVATION_BALANCE_MISMATCH' }); };
  if (!Array.isArray(allocations) || !allocations.length) invalid();
  for (const entry of allocations) {
    if (!Object.hasOwn(totals, entry.bucket) || !['wallet', 'returned'].includes(entry.source)
      || !Number.isSafeInteger(entry.amount) || entry.amount <= 0
      || (entry.expiresAt !== null && (typeof entry.expiresAt !== 'string' || !Number.isFinite(Date.parse(entry.expiresAt))))
      || (entry.bucket === 'perpetual' && entry.expiresAt !== null)
      || (entry.source === 'returned' && (typeof entry.lotId !== 'string' || !entry.lotId))) invalid();
    totals[entry.bucket] += entry.amount;
  }
  if (Object.keys(totals).some((key) => totals[key] !== split[key])) invalid();
  return allocations;
}

export async function syncLegacyCreditBalance(userId, transaction, now) {
  const row = await transaction.queryOne(`SELECT
    (CASE WHEN daily_expires_at IS NULL OR daily_expires_at > $2 THEN daily_free_credits ELSE 0 END)
    + (CASE WHEN subscription_expires_at IS NULL OR subscription_expires_at > $2 THEN subscription_credits ELSE 0 END)
    + perpetual_credits + COALESCE((SELECT SUM(remaining_credits) FROM ops_bill.credit_returned_lots
      WHERE user_id=$1 AND (expires_at IS NULL OR expires_at > $2)),0) AS total
    FROM ops_bill.credit_wallets WHERE user_id=$1`, [userId, now]);
  const total = Number(row?.total || 0);
  await transaction.execute('UPDATE users SET credits=$1,updated_at=$2 WHERE id=$3', [total, now, userId]);
  return total;
}
