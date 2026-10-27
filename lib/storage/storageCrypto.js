import 'server-only';

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const VERSION = 1;

function wrappingKey() {
  const secret = process.env.STORAGE_SECRETS_ENCRYPTION_KEY
    || process.env.PROVIDER_SECRETS_ENCRYPTION_KEY
    || process.env.ADMIN_SECRET_KEY
    || process.env.AUTH_VERIFICATION_CODE_SECRET
    || process.env.BILLING_SESSION_SECRET
    || process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw Object.assign(new Error('未配置对象存储密钥加密密钥（STORAGE_SECRETS_ENCRYPTION_KEY）'), {
      code: 'STORAGE_ENCRYPTION_KEY_REQUIRED',
    });
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
}

export function isEncryptedSecret(value) {
  return Boolean(value && typeof value === 'object' && value.v === VERSION && value.data && value.iv && value.tag);
}

export function encryptSecret(plain) {
  const value = String(plain ?? '');
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, wrappingKey(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    v: VERSION,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: data.toString('hex'),
  };
}

export function decryptSecret(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (!isEncryptedSecret(payload)) return '';
  try {
    const decipher = crypto.createDecipheriv(ALGO, wrappingKey(), Buffer.from(payload.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
    return decipher.update(payload.data, 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    throw Object.assign(new Error('对象存储密钥解密失败，请重新填写访问密钥'), {
      code: 'STORAGE_SECRET_DECRYPT_FAILED',
    });
  }
}

export function maskSecret(value) {
  const raw = String(value || '');
  if (!raw) return '';
  if (raw.length <= 8) return `${raw.slice(0, 2)}****`;
  return `${raw.slice(0, 4)}****${raw.slice(-4)}`;
}
