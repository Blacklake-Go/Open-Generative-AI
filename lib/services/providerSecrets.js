import 'server-only';

import { readProviderSecret, getProviderKeyEnv } from '../repositories/providers.js';

const PROVIDER_ENV_KEYS = Object.freeze({
  muapi: { envNames: ['MUAPI_API_KEY', 'MUAPI_KEY'], secretName: 'api_key' },
  // The canonical provider catalog uses `alibaba`, while the public API is
  // branded as DashScope/Alibaba Cloud. Keep all three IDs on the same
  // credential path so routing cannot reject a valid DashScope key merely
  // because the channel was seeded with the `alibaba` ID.
  aliyun: { envNames: ['DASHSCOPE_API_KEY', 'ALIYUN_API_KEY', 'BAILIAN_API_KEY'], secretName: 'api_key' },
  dashscope: { envNames: ['DASHSCOPE_API_KEY', 'ALIYUN_API_KEY', 'BAILIAN_API_KEY'], secretName: 'api_key' },
  alibaba: { envNames: ['DASHSCOPE_API_KEY', 'ALIYUN_API_KEY', 'BAILIAN_API_KEY'], secretName: 'api_key' },
  minimax: { envNames: ['MINIMAX_API_KEY', 'MINIMAX_KEY'], secretName: 'api_key' },
  kling: { envNames: ['KLING_API_KEY', 'KLING_KEY', 'KLING_ACCESS_KEY'], secretName: 'api_key' },
  openai: { envNames: ['OPENAI_API_KEY', 'OPENAI_KEY'], secretName: 'api_key' },
  volcengine: { envNames: ['VOLCENGINE_API_KEY', 'ARK_API_KEY', 'VOLC_API_KEY'], secretName: 'api_key' },
  runninghub: { envNames: ['RUNNINGHUB_API_KEY', 'RUNNING_HUB_API_KEY', 'RUNNINGHUB_KEY'], secretName: 'api_key' },
  google: { envNames: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], secretName: 'api_key' },
  stripe: { envNames: ['STRIPE_SECRET_KEY'], secretName: 'secret_key' },
  paypal: { envNames: ['PAYPAL_CLIENT_SECRET'], secretName: 'client_secret' },
  deepseek: { envNames: ['DEEPSEEK_API_KEY', 'DEEPSEEK_KEY'], secretName: 'api_key' },
});

// MuAPI supports a sandbox key and a production key side by side. The active
// environment is chosen via the admin rotate toggle and persisted in
// system_settings (key 'provider_active_env'). Flipping it takes effect on the
// next request without restarting any service.
const MUAPI_SANDBOX_SECRET = 'api_key_sandbox';

/**
 * Resolve a provider credential without ever accepting a browser-supplied
 * value. Environment secrets take precedence; encrypted PostgreSQL secrets
 * are the controlled fallback used by the admin rotation workflow.
 */
async function resolveServerCredential({ provider = 'muapi', env = process.env, readSecret = readProviderSecret, keyEnvironment = getProviderKeyEnv } = {}) {
  const norm = String(provider || 'muapi').toLowerCase();
  const config = PROVIDER_ENV_KEYS[norm] || { envNames: [norm.toUpperCase() + '_API_KEY'], secretName: 'api_key' };

  for (const envName of config.envNames || []) {
    const val = String(env[envName] || '').trim();
    if (val) return { value: val, source: 'environment', status: 'configured', selectedEnvironment: null };
  }

  // MuAPI dual-key: production ('api_key') vs sandbox ('api_key_sandbox').
  let secretName = config.secretName;
  try {
    if (norm === 'muapi') {
      const activeEnv = await keyEnvironment('muapi');
      if (activeEnv === 'sandbox') secretName = MUAPI_SANDBOX_SECRET;
    }

    let stored = await readSecret(norm, secretName);
    if (stored.status === 'missing' && (norm === 'dashscope' || norm === 'aliyun')) {
      stored = await readSecret('alibaba', secretName);
    }
    if (stored.status === 'missing' && (norm === 'ark' || norm === 'bytedance')) {
      stored = await readSecret('volcengine', secretName);
    }
    const value = typeof stored.value === 'string' ? stored.value.trim() || null : null;
    return { value, source: value ? 'encrypted_database' : null, status: value ? 'configured' : stored.status === 'error' ? 'error' : 'missing', selectedEnvironment: norm === 'muapi' ? secretName === MUAPI_SANDBOX_SECRET ? 'sandbox' : 'production' : null };
  } catch {
    return { value: null, source: null, status: 'error', selectedEnvironment: null };
  }
}

export async function getServerProviderApiKey(options = {}) {
  return (await resolveServerCredential(options)).value;
}

export async function getServerProviderCredentialStatus(options = {}) {
  const { value, ...metadata } = await resolveServerCredential(options);
  return { ...metadata, configured: Boolean(value), upstreamValidation: 'not_checked' };
}
