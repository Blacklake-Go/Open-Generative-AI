import 'server-only';

import { readFile } from 'node:fs/promises';
import { randomBytes, createHash, timingSafeEqual, scryptSync } from 'node:crypto';
import { queryOne, queryMany, withTransaction, randomId } from '../db/index.js';
import { findUserPasswordCredential } from '../repositories/auth.js';
import { federationError, signTicket, verifyTicket } from './ticket.js';
import { legacyCreditValueRemains } from './transactionAuthority.js';

export const tokenHash = (value) => createHash('sha256').update(String(value)).digest('hex');

export function federationUserAllowed(userId) {
  return process.env.SUPDANCE_FEDERATION_ENABLED === 'true'
    && String(process.env.SUPDANCE_FEDERATION_ONE_USER_IDS || '').split(',').map((id) => id.trim()).includes(String(userId));
}

async function requireAllowed(user) {
  if (!user?.id) throw federationError('UNAUTHORIZED', '请先登录', 401);
  if (federationUserAllowed(user.id)) return;
  if (process.env.SUPDANCE_FEDERATION_ENABLED === 'true') {
    const link = await queryOne("SELECT main_user_id FROM supdance_federation.identity_links WHERE one_user_id=$1 AND state='active'", [user.id]);
    if (link && String(process.env.SUPDANCE_FEDERATION_MAIN_USER_IDS || '').split(',').map((id) => id.trim()).includes(link.main_user_id)) return;
  }
  throw federationError('FEDERATION_NOT_ENABLED', '账户连接尚未向此账户开放', 403);
}

export async function requireOneOwnership(userId, password) {
  if (typeof password !== 'string' || password.length > 200) throw federationError('REAUTH_REQUIRED', '请验证当前 ONE 账户密码', 401);
  const row = await findUserPasswordCredential(userId);
  if (!row?.password_salt || !row.password_hash) throw federationError('REAUTH_REQUIRED', '此账户尚无可用于连接的密码，请先完成账户安全设置', 401);
  const expected = Buffer.from(row.password_hash, 'hex');
  const actual = scryptSync(password, row.password_salt, 64);
  if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) throw federationError('REAUTH_REQUIRED', '当前账户密码不正确', 401);
}

export async function beginAccountLink(user, sessionToken, password) {
  await requireAllowed(user);
  if (!sessionToken) throw federationError('UNAUTHORIZED', '请重新登录', 401);
  await requireOneOwnership(user.id, password);
  const existing = await queryOne('SELECT main_user_id,state FROM supdance_federation.identity_links WHERE one_user_id=$1', [user.id]);
  if (existing) throw federationError('IDENTITY_ALREADY_LINKED', '此账户已有连接，请先通过安全审核处理变更', 409);
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(32).toString('base64url');
  const request = signTicket({ version: 1, issuer: 'one', audience: 'main', purpose: 'link-request', nonce, oneUserId: user.id, issuedAt: now, expiresAt: now + 300 },
    await readFile(process.env.SUPDANCE_FEDERATION_PRIVATE_KEY_FILE));
  await queryOne(`INSERT INTO supdance_federation.link_challenges(nonce,one_user_id,session_hash,request_hash,expires_at)
    VALUES($1,$2,$3,$4,$5) RETURNING nonce`, [nonce, user.id, tokenHash(sessionToken), tokenHash(request), new Date((now + 300) * 1000).toISOString()]);
  return { request, authorizeUrl: `https://www.supdance.com/connect-one#request=${encodeURIComponent(request)}`, expiresAt: new Date((now + 300) * 1000).toISOString() };
}

export async function completeAccountLink(user, sessionToken, assertion) {
  await requireAllowed(user);
  const ticket = verifyTicket(assertion, await readFile(process.env.SUPDANCE_FEDERATION_MAIN_PUBLIC_KEY_FILE), {
    issuer: 'main', audience: 'one', purpose: 'identity-assertion',
  });
  if (ticket.oneUserId !== user.id || !sessionToken) throw federationError('IDENTITY_OWNER_MISMATCH', '请使用发起连接的 ONE 账户和浏览器完成验证', 403);
  try {
    return await withTransaction(async (tx) => {
      const challenge = await tx.queryOne('SELECT * FROM supdance_federation.link_challenges WHERE nonce=$1 FOR UPDATE', [ticket.nonce]);
      if (!challenge || challenge.purpose !== 'link' || challenge.one_user_id !== user.id || challenge.session_hash !== tokenHash(sessionToken)
        || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
        throw federationError('LINK_CHALLENGE_INVALID', '连接已使用、过期或浏览器会话发生变化，请重新发起', 409);
      }
      const proofHash = tokenHash(assertion);
      const linked = await tx.queryOne(`INSERT INTO supdance_federation.identity_links(one_user_id,main_user_id,proof_hash)
        VALUES($1,$2,$3) RETURNING one_user_id,main_user_id,state,linked_at`, [user.id, ticket.mainUserId, proofHash]);
      await tx.execute('UPDATE supdance_federation.link_challenges SET consumed_at=now() WHERE nonce=$1', [ticket.nonce]);
      await tx.execute(`INSERT INTO supdance_federation.identity_events(id,one_user_id,main_user_id,event_type,proof_hash)
        VALUES($1,$2,$3,'linked',$4)`, [randomId(), user.id, ticket.mainUserId, proofHash]);
      return linked;
    });
  } catch (error) {
    if (error.code === '23505') throw federationError('IDENTITY_ALREADY_LINKED', '任一账户已存在连接，未更改现有关系', 409);
    throw error;
  }
}

export async function readConnectedWallet(user) {
  await requireAllowed(user);
  const link = await queryOne("SELECT main_user_id FROM supdance_federation.identity_links WHERE one_user_id=$1 AND state='active'", [user.id]);
  if (!link) return { linked: false, oneUserId: user.id };
  const now = Math.floor(Date.now() / 1000);
  const proof = signTicket({ version: 1, issuer: 'one', audience: 'main', purpose: 'wallet-read', nonce: randomBytes(32).toString('base64url'),
    oneUserId: user.id, mainUserId: link.main_user_id, issuedAt: now, expiresAt: now + 30 }, await readFile(process.env.SUPDANCE_FEDERATION_PRIVATE_KEY_FILE));
  const base = new URL(process.env.SUPDANCE_MAIN_INTERNAL_URL || 'https://www.supdance.com');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw federationError('FEDERATION_CONFIG_INVALID', '账户服务地址配置无效', 503);
  }
  const response = await fetch(new URL('/api/supdance/federation/wallet', base), { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proof }), signal: AbortSignal.timeout(8000), cache: 'no-store', redirect: 'error' });
  const result = await response.json();
  if (!response.ok || result.code !== 0 || result.data?.account?.userId !== link.main_user_id) {
    throw federationError('FEDERATION_WALLET_UNAVAILABLE', '主站钱包暂时不可用，请稍后重试', 503);
  }
  const legacy = await queryOne(`SELECT daily_free_credits,daily_expires_at,subscription_credits,subscription_expires_at,
    perpetual_credits,frozen_credits,version FROM ops_bill.credit_wallets WHERE user_id=$1`, [user.id]);
  const returnedLots = await queryMany(`SELECT id,bucket_type,initial_credits,remaining_credits,expires_at,reservation_id
    FROM ops_bill.credit_returned_lots WHERE user_id=$1 ORDER BY created_at,id`, [user.id]);
  const legacyValueRemains = await legacyCreditValueRemains(user.id);
  return { linked: true, oneUserId: user.id, mainUserId: link.main_user_id, canonical: result.data, legacy: { wallet: legacy, returnedLots, conversionApplied: false },
    createUrl: 'https://www.supdance.com/', rechargeUrl: 'https://www.supdance.com/settings?section=profile',
    legacyCreateUrl: legacyValueRemains ? '/studio' : null,
    transactionAuthority: process.env.SUPDANCE_FEDERATION_TRANSACTIONS_ON_MAIN === 'true' && !legacyValueRemains ? 'main' : 'legacy_compatible' };
}
