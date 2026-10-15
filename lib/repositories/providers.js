import 'server-only';

import crypto from 'node:crypto';
import { execute, nowIso, queryMany, queryOne, randomId } from '../db/index.js';

const ENCRYPTION_ALGO = 'aes-256-gcm';

function getWrappingKey() {
  const secret = process.env.PROVIDER_SECRETS_ENCRYPTION_KEY
    || process.env.ADMIN_SECRET_KEY
    || process.env.BILLING_SESSION_SECRET
    || process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw Object.assign(new Error('未配置 provider secret 加密密钥'), { code: 'PROVIDER_SECRET_KEY_REQUIRED' });
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export async function saveProviderSecret({ provider, name, secretValue, transaction = null }) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, getWrappingKey(), iv);
  let ciphertext = cipher.update(secretValue, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const now = nowIso();
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  await run(`
    INSERT INTO ops_bill.provider_secrets (provider, name, ciphertext, nonce, auth_tag, key_version, updated_at)
    VALUES ($1, $2, $3, $4, $5, 1, $6)
    ON CONFLICT (provider, name) DO UPDATE SET ciphertext = EXCLUDED.ciphertext,
      nonce = EXCLUDED.nonce, auth_tag = EXCLUDED.auth_tag, updated_at = EXCLUDED.updated_at
  `, [provider, name, ciphertext, iv.toString('hex'), cipher.getAuthTag().toString('hex'), now]);
  return { provider, name, updatedAt: now };
}

export async function hasProviderSecret(provider, name) {
  try {
    return Boolean(await queryOne('SELECT updated_at FROM ops_bill.provider_secrets WHERE provider = $1 AND name = $2', [provider, name]));
  } catch {
    return false;
  }
}

/**
 * 读密钥库并把「没有这条记录」与「读不出来」分开返回。
 *
 * 支付渠道可用性判定必须能区分这两者：商户根本没配是 unavailable（引导去配置），
 * 而解密失败/数据库抖动是 unknown（可重试的 503），把后者说成前者会让人去查
 * 一个本来就配好的渠道。
 */
export async function readProviderSecret(provider, name) {
  try {
    const row = await queryOne('SELECT ciphertext, nonce, auth_tag FROM ops_bill.provider_secrets WHERE provider = $1 AND name = $2', [provider, name]);
    if (!row) return { value: null, status: 'missing' };
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, getWrappingKey(), Buffer.from(row.nonce, 'hex'));
    decipher.setAuthTag(Buffer.from(row.auth_tag, 'hex'));
    const value = decipher.update(row.ciphertext, 'hex', 'utf8') + decipher.final('utf8');
    return { value, status: 'ok' };
  } catch (err) {
    console.error(`[provider_secrets] 读取 ${provider}:${name} 失败:`, err.code || err.message);
    return { value: null, status: 'error' };
  }
}

export async function getProviderSecret(provider, name) {
  return (await readProviderSecret(provider, name)).value;
}

export async function listProviderConfigs() {
  return queryMany('SELECT provider, kind, name, enabled, config_json, updated_at FROM ops_bill.provider_configs ORDER BY provider');
}

// --- Dual-key active environment (e.g. MuAPI sandbox vs production) ---------
// Stored as a single json map under system_settings key 'provider_active_env':
//   { "muapi": "production" | "sandbox" }
// The key name avoids "key/secret/password/token" so the settings service
// sensitive-key blocklist does not reject it (it holds no secret value).
const ACTIVE_ENV_SETTING_KEY = 'provider_active_env';

export async function getProviderKeyEnv(provider) {
  try {
    const row = await queryOne('SELECT value_json FROM system_settings WHERE key = $1', [ACTIVE_ENV_SETTING_KEY]);
    if (!row) return 'production';
    const parsed = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : (row.value_json || {});
    const env = parsed && typeof parsed === 'object' ? parsed[provider] : undefined;
    return env === 'sandbox' ? 'sandbox' : 'production';
  } catch {
    return 'production';
  }
}

export async function setProviderKeyEnv(provider, env) {
  const now = nowIso();
  const row = await queryOne('SELECT value_json FROM system_settings WHERE key = $1', [ACTIVE_ENV_SETTING_KEY]);
  let map = {};
  if (row) {
    try {
      const parsed = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) map = { ...parsed };
    } catch { /* ignore corrupt row, rebuild */ }
  }
  map[provider] = env === 'sandbox' ? 'sandbox' : 'production';
  const sql = 'INSERT INTO system_settings (key, value_json, updated_by, updated_at) ' +
    'VALUES ($1, $2::jsonb, $3, $4) ' +
    'ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at';
  await execute(sql, [ACTIVE_ENV_SETTING_KEY, JSON.stringify(map), 'system', now]);
  return map[provider];
}

export async function recordHealthCheck({ provider, status, latencyMs, errorCode = null, details = {} }) {
  const id = randomId('health');
  const now = nowIso();
  await execute(`
    INSERT INTO ops_bill.provider_health_checks (id, provider, status, latency_ms, error_code, details_json, checked_at)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
  `, [id, provider, status, latencyMs, errorCode, JSON.stringify(details), now]);
  return { id, provider, status, latencyMs, checkedAt: now };
}

export async function recordProviderCall({ provider, action, orderId = null, requestId = null, status, latencyMs = null, errorCode = null, usage = {} }) {
  const id = randomId('pcl');
  await execute(`
    INSERT INTO provider_call_logs
      (id, provider, action, order_id, request_id, status, latency_ms, error_code, usage_json, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
  `, [id, provider, action, orderId, requestId, status, latencyMs || null, errorCode || null, JSON.stringify(usage || {}), nowIso()]);
  return id;
}

export async function getProviderSecretsMetadata(provider) {
  try {
    const rows = await queryMany(
      'SELECT name, updated_at FROM ops_bill.provider_secrets WHERE provider = $1',
      [provider]
    );
    return rows.map((r) => ({
      name: r.name,
      updatedAt: r.updated_at instanceof Date
        ? r.updated_at.toISOString()
        : (r.updated_at ? String(r.updated_at) : null),
    }));
  } catch {
    return [];
  }
}

export async function getLatestHealthChecks() {
  return queryMany(`
    SELECT DISTINCT ON (provider) * FROM ops_bill.provider_health_checks
    ORDER BY provider, checked_at DESC
  `);
}


export async function getProviderEnabled(provider) {
  try {
    const row = await queryOne('SELECT enabled FROM ops_bill.provider_configs WHERE provider = $1', [provider]);
    return row ? row.enabled !== false : true;
  } catch (error) {
    console.error('[providers] read enabled state failed:', error.code || error.message);
    return false;
  }
}

export async function setProviderEnabled({ actor, provider, enabled }) {
  const names = { alipay: '支付宝', wechat: '微信支付', stripe: 'Stripe 国际支付' };
  if (!names[provider]) throw new Error('不支持的支付渠道');
  const now = nowIso();
  await execute(`
    INSERT INTO ops_bill.provider_configs (provider, kind, name, enabled, updated_by, updated_at)
    VALUES ($1, 'payment', $2, $3, $4, $5)
    ON CONFLICT (provider) DO UPDATE SET kind = 'payment', name = EXCLUDED.name,
      enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
  `, [provider, names[provider], Boolean(enabled), actor?.id || null, now]);
  return { provider, enabled: Boolean(enabled), updatedAt: now };
}
