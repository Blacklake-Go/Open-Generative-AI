import { NextResponse } from 'next/server.js';
import { guardBodySize } from '../security/requestGuard.js';
import { federationError } from './ticket.js';

// App Router bodies can be streamed without Content-Length. Bound the actual
// bytes before parsing credentials or a signed assertion as well as the header.
export async function readFederationBody(request, { form = false } = {}) {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== (form ? 'application/x-www-form-urlencoded' : 'application/json')) {
    throw federationError('FEDERATION_REQUEST_INVALID', '请求格式无效');
  }
  const reader = request.body?.getReader();
  const chunks = []; let length = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 16 * 1024) { await reader.cancel(); throw federationError('FEDERATION_BODY_TOO_LARGE', '请求内容过大', 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const buffer = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (form) return new URLSearchParams(text);
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch { throw federationError('FEDERATION_REQUEST_INVALID', '请求格式无效'); }
}

export function federationMutationGuard(request, { fromMain = false } = {}) {
  const expected = fromMain ? 'https://www.supdance.com' : (process.env.SUPDANCE_ONE_ORIGIN || 'https://one.supdance.com');
  if (request.headers.get('origin') !== expected) {
    return NextResponse.json({ error: '请求来源无效', code: 'ORIGIN_INVALID' }, { status: 403 });
  }
  return guardBodySize(request, 16 * 1024);
}

const ERRORS = {
  FEDERATION_REQUEST_INVALID: [400, '请求格式无效'],
  FEDERATION_BODY_TOO_LARGE: [413, '请求内容过大'],
  UNAUTHORIZED: [401, '请先登录'],
  REAUTH_REQUIRED: [401, '请重新验证当前 ONE 账户密码；无密码账户需先完成账户安全设置'],
  FEDERATION_NOT_ENABLED: [403, '账户连接尚未向此账户开放'],
  IDENTITY_OWNER_MISMATCH: [403, '请使用发起连接的 ONE 账户和浏览器完成验证'],
  IDENTITY_ALREADY_LINKED: [409, '任一账户已存在连接，未更改现有关系'],
  LINK_CHALLENGE_INVALID: [409, '连接请求已使用或已过期，请重新发起'],
  FEDERATION_TICKET_INVALID: [400, '账户连接签名无效或已过期'],
  FEDERATION_WALLET_UNAVAILABLE: [503, '主站钱包暂时不可用，请稍后重试'],
};
export function federationErrorResponse(error) {
  const known = Object.hasOwn(ERRORS, error?.code);
  const [status, message] = known ? ERRORS[error.code] : [503, '账户连接服务暂时不可用'];
  return NextResponse.json({ error: message, code: known ? error.code : 'FEDERATION_UNAVAILABLE' },
    { status, headers: { 'Cache-Control': 'no-store' } });
}
