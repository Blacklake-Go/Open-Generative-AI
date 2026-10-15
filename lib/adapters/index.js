import 'server-only';

import { getServerProviderApiKey } from '../services/providerSecrets.js';
import { BaseAdapter, PROVIDER_ERROR_CODES, NON_RETRYABLE_ERROR_CODES, shouldTripProviderCircuitBreaker } from './BaseAdapter.js';
import { MuAPIAdapter } from './MuAPIAdapter.js';
import { KlingAdapter } from './KlingAdapter.js';
import { MiniMaxAdapter } from './MiniMaxAdapter.js';
import { AlibabaAdapter } from './AlibabaAdapter.js';
import { OpenAIAdapter } from './OpenAIAdapter.js';
import { GoogleAdapter } from './GoogleAdapter.js';
import { RunwayAdapter } from './RunwayAdapter.js';
import { LumaAdapter } from './LumaAdapter.js';
import { RunningHubAdapter } from './RunningHubAdapter.js';
import { BytePlusAdapter } from './BytePlusAdapter.js';
import { VolcengineAdapter } from './VolcengineAdapter.js';

export {
  BaseAdapter,
  PROVIDER_ERROR_CODES,
  NON_RETRYABLE_ERROR_CODES,
  shouldTripProviderCircuitBreaker,
  MuAPIAdapter,
  KlingAdapter,
  MiniMaxAdapter,
  AlibabaAdapter,
  OpenAIAdapter,
  GoogleAdapter,
  RunwayAdapter,
  LumaAdapter,
  RunningHubAdapter,
  BytePlusAdapter,
  VolcengineAdapter,
};

const ADAPTER_CLASSES = {
  muapi: MuAPIAdapter,
  kling: KlingAdapter,
  minimax: MiniMaxAdapter,
  alibaba: AlibabaAdapter,
  dashscope: AlibabaAdapter,
  openai: OpenAIAdapter,
  google: GoogleAdapter,
  runway: RunwayAdapter,
  luma: LumaAdapter,
  runninghub: RunningHubAdapter,
  byteplus: BytePlusAdapter,
  volcengine: VolcengineAdapter,
  bytedance: VolcengineAdapter,
};

/**
 * 供应商适配器工厂函数
 * 自动从安全的服务器端密钥库中读取凭据，绝不泄露给前端或日志
 */
export async function getProviderAdapter(providerId, options = {}) {
  const normId = String(providerId || 'runninghub').toLowerCase().trim();
  const AdapterClass = ADAPTER_CLASSES[normId];
  if (!AdapterClass) {
    throw Object.assign(new Error(`未知的供应商标识: ${normId}`), { code: 'PROVIDER_ADAPTER_NOT_FOUND' });
  }

  let apiKey = options.apiKey;
  if (!apiKey) {
    apiKey = await getServerProviderApiKey({ provider: normId });
  }

  // Fail closed: a vendor-direct adapter must carry its OWN credential.
  // The router already excludes credential-less channels (smartRouter hard filter),
  // so this branch only guards direct (non-routed) callers. Never swap a MuAPI key
  // onto a vendor adapter — that would send MuAPI's key to the vendor's host.

  return new AdapterClass({
    providerId: normId,
    apiKey,
    baseUrl: options.baseUrl,
    config: options.config || {},
  });
}

/**
 * 该供应商标识是否有专属适配器实现。
 *
 * getProviderAdapter 对未知 id 会静默落到 MuAPIAdapter，所以「能不能构造」不能
 * 当作「有没有实现」：路由器必须用本函数把没有适配器的渠道挡在候选集之外，
 * 否则一次点击设成默认供应商后，运行时会拿着别家的 key 去敲未知主机。
 */
export function hasProviderAdapter(providerId) {
  const normId = String(providerId || '').toLowerCase().trim();
  return Boolean(normId) && Object.prototype.hasOwnProperty.call(ADAPTER_CLASSES, normId);
}
