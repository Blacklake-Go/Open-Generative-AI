import 'server-only';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { queryOne } from '../db/index.js';
import { federationUserAllowed } from './accounts.js';
import { signTicket, federationError } from './ticket.js';

export async function mappedMainIdentity(userId) {
  if (process.env.SUPDANCE_FEDERATION_ENABLED !== 'true') return null;
  const link = await queryOne("SELECT main_user_id FROM supdance_federation.identity_links WHERE one_user_id=$1 AND state='active'", [userId]);
  if (!link) return null;
  if (!federationUserAllowed(userId) && !String(process.env.SUPDANCE_FEDERATION_MAIN_USER_IDS || '').split(',').map((id) => id.trim()).includes(link.main_user_id)) return null;
  return link.main_user_id;
}

async function requestMainAssets(userId, assetId, { bytes = false, range = '' } = {}) {
  const mainUserId = await mappedMainIdentity(userId);
  if (!mainUserId) throw federationError('COMMUNITY_IDENTITY_REQUIRED', '请先连接主站账户', 409);
  const now = Math.floor(Date.now() / 1000);
  const proof = signTicket({ version: 1, issuer: 'one', audience: 'main', purpose: assetId ? 'asset-read' : 'asset-list',
    nonce: randomBytes(32).toString('base64url'), oneUserId: userId, mainUserId, ...(assetId ? { assetId } : {}), issuedAt: now, expiresAt: now + 30 },
  await readFile(process.env.SUPDANCE_FEDERATION_PRIVATE_KEY_FILE));
  const base = new URL(process.env.SUPDANCE_MAIN_INTERNAL_URL || 'https://www.supdance.com');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw federationError('FEDERATION_CONFIG_INVALID', '主站连接配置无效', 503);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(new URL(`/api/supdance/federation/${assetId ? 'asset' : 'assets'}`, base), {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(range ? { Range: range } : {}) },
      body: JSON.stringify({ proof, describe: !bytes }), signal: controller.signal, cache: 'no-store', redirect: 'error',
    });
  } finally { clearTimeout(timeout); }
  if (!response.ok) { await response.body?.cancel(); throw federationError('COMMUNITY_MAIN_ASSET_UNAVAILABLE', '主站作品暂时不可用', 503); }
  if (bytes) return response;
  const result = await response.json();
  const items = assetId ? [result.data] : result.data;
  if (result.code !== 0 || !Array.isArray(items) || items.some((item) => item?.mainUserId !== mainUserId || !['image', 'video', 'audio'].includes(item.kind))
    || (assetId && result.data?.id !== assetId)) throw federationError('COMMUNITY_MAIN_ASSET_UNAVAILABLE', '主站作品校验失败', 503);
  return result.data;
}
export const listMainAssets = (userId) => requestMainAssets(userId, null);
export const describeMainAsset = (userId, assetId) => requestMainAssets(userId, assetId);
export const streamMainAsset = (userId, assetId, range) => requestMainAssets(userId, assetId, { bytes: true, range });
