import 'server-only';

import { resetProviderCircuit } from './providerRuntime.js';

/**
 * 同一份凭据可能被多个渠道 ID 读取（解析链里 dashscope/aliyun 会回落到
 * alibaba 的存盘，ark/bytedance 会回落到 volcengine 的存盘）。变更其中一个
 * 渠道的密钥，必须把同族渠道的派生状态一起作废，否则没改名的那个渠道
 * 还带着旧密钥的结论。
 */
const CREDENTIAL_FAMILIES = Object.freeze({
  alibaba: ['alibaba', 'dashscope', 'aliyun'],
  dashscope: ['alibaba', 'dashscope', 'aliyun'],
  aliyun: ['alibaba', 'dashscope', 'aliyun'],
  volcengine: ['volcengine', 'bytedance', 'ark'],
  bytedance: ['volcengine', 'bytedance', 'ark'],
  ark: ['volcengine', 'bytedance', 'ark'],
});

export function providerCredentialFamily(provider) {
  const norm = String(provider || '').trim().toLowerCase();
  if (!norm) return [];
  return [...(CREDENTIAL_FAMILIES[norm] || [norm])];
}

async function defaultInvalidateActiveModels() {
  try {
    const mod = await import('../../app/api/models/active/route.js');
    if (typeof mod?.invalidateActiveModelsCache !== 'function') return false;
    mod.invalidateActiveModelsCache();
    return true;
  } catch {
    return false;
  }
}

/**
 * 密钥保存、轮换、撤销或切换生效环境后调用，让界面结论与真实执行一致。
 *
 * 适配器本身没有实例缓存：getProviderAdapter 每次调用都从服务端密钥链现取，
 * 所以不存在“适配器里握着旧 key”的问题。但有两份进程内派生状态会带着旧密钥
 * 的结论继续运行：
 *   1. 渠道熔断计数——旧密钥失败打开的熔断会拦住新密钥的第一次调用；
 *   2. /api/models/active 的模型目录缓存——hasWorkingRoute 由凭据是否配置决定。
 *
 * 两者都只是缓存，清理失败不应让保存密钥的写操作失败，因此这里吞掉异常并
 * 如实返回每一项是否成功。其他进程（另一 Next 实例、独立 Worker）的进程内
 * 状态无法由此处直接清理，依赖熔断窗口与目录 TTL 自然收敛。
 */
export async function invalidateProviderCredentialConsumers(provider, deps = {}) {
  const family = providerCredentialFamily(provider);
  const resetCircuit = deps.resetCircuit || resetProviderCircuit;
  const invalidateCatalog = deps.invalidateCatalog || defaultInvalidateActiveModels;

  const result = {
    provider: String(provider || '').trim().toLowerCase(),
    providerFamily: family,
    circuitsReset: false,
    catalogInvalidated: false,
  };

  try {
    for (const id of family) resetCircuit(id);
    result.circuitsReset = true;
  } catch {}

  try {
    result.catalogInvalidated = Boolean(await invalidateCatalog());
  } catch {}

  return result;
}
