import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

const FIELDS = new Set(['version', 'issuer', 'audience', 'purpose', 'nonce', 'oneUserId', 'mainUserId', 'mainDisplayName', 'assetId', 'issuedAt', 'expiresAt']);
export function federationError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function validateTicket(ticket, { issuer, audience, purpose, now = Date.now() }) {
  const fail = () => { throw federationError('FEDERATION_TICKET_INVALID', '账户连接请求无效或已过期'); };
  const maxLifetime = ['wallet-read', 'asset-list', 'asset-read'].includes(purpose) ? 30 : 300;
  if (purpose === 'asset-read' ? typeof ticket?.assetId !== 'string' || !ticket.assetId.trim() || ticket.assetId.length > 80 : ticket?.assetId !== undefined && ticket.assetId !== '') fail();
  if (!ticket || Object.keys(ticket).some((key) => !FIELDS.has(key)) || ticket.version !== 1
    || ticket.issuer !== issuer || ticket.audience !== audience || ticket.purpose !== purpose
    || !['link-request', 'identity-assertion', 'wallet-read', 'login-request', 'login-assertion', 'asset-list', 'asset-read'].includes(purpose)
    || typeof ticket.nonce !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(ticket.nonce)
    || typeof ticket.oneUserId !== 'string' || ticket.oneUserId.length > 120
    || !Number.isSafeInteger(ticket.issuedAt) || !Number.isSafeInteger(ticket.expiresAt)
    || ticket.issuedAt > Math.floor(now / 1000) + 5 || ticket.expiresAt <= Math.floor(now / 1000)
    || ticket.expiresAt <= ticket.issuedAt || ticket.expiresAt - ticket.issuedAt > maxLifetime) fail();
  if (purpose === 'login-request') {
    if (ticket.oneUserId || ticket.mainUserId || ticket.mainDisplayName) fail();
  } else if (purpose === 'link-request') {
    if (!ticket.oneUserId.trim()) fail();
    if (ticket.mainUserId || ticket.mainDisplayName) fail();
  } else {
    if ((purpose === 'login-assertion' ? ticket.oneUserId !== '' : !ticket.oneUserId.trim())
      || typeof ticket.mainUserId !== 'string' || !ticket.mainUserId || ticket.mainUserId.length > 120
      || (ticket.mainDisplayName !== undefined && (typeof ticket.mainDisplayName !== 'string' || Buffer.byteLength(ticket.mainDisplayName) > 256))) fail();
  }
  return ticket;
}

export function signTicket(ticket, privateKey, now = Date.now()) {
  validateTicket(ticket, { ...ticket, now });
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw federationError('FEDERATION_KEY_INVALID', '账户连接服务配置无效', 503);
  const encoded = `SD1.${Buffer.from(JSON.stringify(ticket)).toString('base64url')}`;
  return `${encoded}.${sign(null, Buffer.from(encoded), key).toString('base64url')}`;
}

export function verifyTicket(value, publicKey, expected) {
  if (typeof value !== 'string' || value.length > 4096) throw federationError('FEDERATION_TICKET_INVALID', '账户连接请求无效');
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'SD1' || !parts.slice(1).every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
    throw federationError('FEDERATION_TICKET_INVALID', '账户连接请求无效');
  }
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))) {
    throw federationError('FEDERATION_TICKET_INVALID', '账户连接签名无效');
  }
  let ticket;
  try { ticket = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); }
  catch { throw federationError('FEDERATION_TICKET_INVALID', '账户连接请求无效'); }
  return validateTicket(ticket, expected);
}
