import { NextResponse } from 'next/server.js';
import { guardBodySize } from '../security/requestGuard.js';

export function federationMutationGuard(request, { fromMain = false } = {}) {
  const expected = fromMain ? 'https://www.supdance.com' : (process.env.SUPDANCE_ONE_ORIGIN || 'https://one.supdance.com');
  if (request.headers.get('origin') !== expected) {
    return NextResponse.json({ error: '请求来源无效', code: 'ORIGIN_INVALID' }, { status: 403 });
  }
  return guardBodySize(request, 16 * 1024);
}

const ERRORS = {
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
