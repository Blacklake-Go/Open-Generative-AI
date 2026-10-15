import 'server-only';

import { getServerProviderApiKey } from '../services/providerSecrets.js';

export function isByokEnabled() {
  return process.env.ALLOW_BYOK === 'true' && process.env.BYOK_SECURITY_REVIEWED === 'true';
}

export async function resolveProviderApiKey(request, serverKey, provider = 'muapi') {
  const clientKey = request?.headers?.get?.('x-api-key')?.trim() || '';
  if (clientKey && clientKey !== 'supdance-account-session') {
    // 客户端 key 不是平台会话标记时，默认拒绝；即使未来开启 BYOK，也必须单独实现审查后的用户身份与配额链路。
    if (!isByokEnabled()) return { ok: false, key: null, code: 'BYOK_DISABLED' };
    return { ok: false, key: null, code: 'BYOK_NOT_IMPLEMENTED' };
  }

  const configuredKey = serverKey === undefined
    ? await getServerProviderApiKey({ provider })
    : String(serverKey || '').trim() || null;
  return { ok: Boolean(configuredKey), key: configuredKey, byok: false };
}
