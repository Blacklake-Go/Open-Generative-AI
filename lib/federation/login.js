import 'server-only';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { queryOne, withTransaction, randomId } from '../db/index.js';
import { allocateUserId } from '../auth/user-id.js';
import * as authRepo from '../repositories/auth.js';
import { tokenHash } from './accounts.js';
import { federationError, signTicket, verifyTicket } from './ticket.js';

export async function beginMainLogin() {
  if (process.env.SUPDANCE_FEDERATION_ENABLED !== 'true') throw federationError('FEDERATION_NOT_ENABLED', '主站登录尚未开放', 403);
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(32).toString('base64url');
  const browserToken = randomBytes(32).toString('base64url');
  const request = signTicket({ version: 1, issuer: 'one', audience: 'main', purpose: 'login-request', nonce, oneUserId: '', issuedAt: now, expiresAt: now + 300 },
    await readFile(process.env.SUPDANCE_FEDERATION_PRIVATE_KEY_FILE));
  await queryOne(`INSERT INTO supdance_federation.link_challenges(nonce,one_user_id,purpose,session_hash,request_hash,expires_at)
    VALUES($1,NULL,'login',$2,$3,$4) RETURNING nonce`, [nonce, tokenHash(browserToken), tokenHash(request), new Date((now + 300) * 1000).toISOString()]);
  return { browserToken, authorizeUrl: `https://www.supdance.com/connect-one#request=${encodeURIComponent(request)}` };
}

export async function completeMainLogin(browserToken, assertion) {
  if (process.env.SUPDANCE_FEDERATION_ENABLED !== 'true') throw federationError('FEDERATION_NOT_ENABLED', '主站登录尚未开放', 403);
  const ticket = verifyTicket(assertion, await readFile(process.env.SUPDANCE_FEDERATION_MAIN_PUBLIC_KEY_FILE), { issuer: 'main', audience: 'one', purpose: 'login-assertion' });
  if (!browserToken || !String(process.env.SUPDANCE_FEDERATION_MAIN_USER_IDS || '').split(',').map((id) => id.trim()).includes(ticket.mainUserId)) {
    throw federationError('FEDERATION_NOT_ENABLED', '主站登录尚未向此账户开放', 403);
  }
  return withTransaction(async (tx) => {
    const challenge = await tx.queryOne('SELECT * FROM supdance_federation.link_challenges WHERE nonce=$1 FOR UPDATE', [ticket.nonce]);
    if (!challenge || challenge.purpose !== 'login' || challenge.session_hash !== tokenHash(browserToken)
      || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
      throw federationError('LINK_CHALLENGE_INVALID', '登录请求已失效，请重新开始', 409);
    }
    await tx.queryOne("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`supdance-login:${ticket.mainUserId}`]);
    let link = await tx.queryOne('SELECT one_user_id,state FROM supdance_federation.identity_links WHERE main_user_id=$1', [ticket.mainUserId]);
    if (link && link.state !== 'active') throw federationError('FEDERATION_NOT_ENABLED', '账户连接已暂停', 403);
    if (!link) {
      const userId = await allocateUserId({ reserve: (id, digits) => authRepo.reserveUserId(id, digits, tx),
        findFirstAvailable: (digits) => authRepo.findFirstAvailableUserId(digits, tx), isExhausted: (digits) => authRepo.isUserIdPoolExhausted(digits, tx) });
      await tx.execute(`INSERT INTO auth_usr.users(id,display_name,role,credits,status,registration_source,onboarding_completed,created_at,updated_at)
        VALUES($1,$2,'user',0,'active','supdance_main',TRUE,now(),now())`, [userId, ticket.mainDisplayName || `Creator ${userId}`]);
      await tx.execute(`INSERT INTO auth_usr.auth_accounts(id,user_id,provider,provider_user_id,created_at,updated_at)
        VALUES($1,$2,'supdance_main',$3,now(),now())`, [randomId('acc'), userId, ticket.mainUserId]);
      await tx.execute(`INSERT INTO supdance_federation.identity_links(one_user_id,main_user_id,proof_hash) VALUES($1,$2,$3)`, [userId, ticket.mainUserId, tokenHash(assertion)]);
      await tx.execute(`INSERT INTO supdance_federation.identity_events(id,one_user_id,main_user_id,event_type,proof_hash)
        VALUES($1,$2,$3,'linked',$4)`, [randomId(), userId, ticket.mainUserId, tokenHash(assertion)]);
      link = { one_user_id: userId, state: 'active' };
    }
    const user = await tx.queryOne("SELECT id FROM auth_usr.users WHERE id=$1 AND status='active' FOR SHARE", [link.one_user_id]);
    if (!user) throw federationError('UNAUTHORIZED', '账户当前不可用', 403);
    await tx.execute('UPDATE supdance_federation.link_challenges SET consumed_at=now() WHERE nonce=$1', [ticket.nonce]);
    return user.id;
  });
}
