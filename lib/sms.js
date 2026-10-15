import crypto from 'node:crypto';
import { nowIso, queryOne, execute, withTransaction } from './db/index.js';
import { recordAuthEvent } from './repositories/auth.js';

const SMS_PROVIDER = String(process.env.SMS_PROVIDER || '').trim().toLowerCase();

function isMockSmsAllowed() {
  return process.env.NODE_ENV !== 'production' && process.env.AUTH_ALLOW_MOCK_SMS === 'true';
}

function getSmsProviderReadinessError() {
  if (!SMS_PROVIDER || (SMS_PROVIDER === 'mock' && !isMockSmsAllowed())) {
    return '短信登录通道尚未配置，请改用邮箱登录或联系管理员';
  }
  if (!['mock', 'aliyun', 'tencent', 'twilio'].includes(SMS_PROVIDER)) {
    return '短信登录通道配置无效';
  }
  if (SMS_PROVIDER === 'aliyun' && (!process.env.ALIYUN_SMS_ACCESS_KEY_ID || !process.env.ALIYUN_SMS_ACCESS_KEY_SECRET)) {
    return '短信服务尚未完成配置，请稍后重试';
  }
  if (SMS_PROVIDER === 'tencent' && (!process.env.TENCENT_SMS_SECRET_ID || !process.env.TENCENT_SMS_SECRET_KEY)) {
    return '短信服务尚未完成配置，请稍后重试';
  }
  if (SMS_PROVIDER === 'twilio' && (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || (!process.env.TWILIO_FROM_NUMBER && !process.env.TWILIO_MESSAGING_SERVICE_SID))) {
    return '短信服务尚未完成配置，请稍后重试';
  }
  if (SMS_PROVIDER === 'aliyun' || SMS_PROVIDER === 'tencent') {
    return '当前短信服务适配器尚未启用，请改用邮箱登录';
  }
  return null;
}

function hashVerificationCode(code) {
  const secret = String(process.env.AUTH_VERIFICATION_CODE_SECRET || process.env.BILLING_SESSION_SECRET || '').trim();
  if (!secret) throw Object.assign(new Error('验证码安全密钥未配置'), { code: 'SMS_SECRET_NOT_CONFIGURED' });
  return crypto.createHmac('sha256', secret).update(String(code)).digest('hex');
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * 生成 6 位纯数字安全验证码
 */
export function generateVerificationCode() {
  return String(crypto.randomInt(100000, 999999));
}

/**
 * 规范化中国大陆及国际手机号
 */
export function normalizePhoneNumber(phone, countryCode = '+86') {
  const cleanPhone = String(phone || '').replace(/[^\d+]/g, '').trim();
  const cleanCode = String(countryCode || '+86').trim();
  return {
    rawPhone: cleanPhone,
    countryCode: cleanCode.startsWith('+') ? cleanCode : `+${cleanCode}`,
    fullPhone: cleanPhone.startsWith('+') ? cleanPhone : `${cleanCode}${cleanPhone}`
  };
}

/**
 * 验证手机号格式
 */
export function validatePhoneNumber(phone, countryCode = '+86') {
  const { rawPhone } = normalizePhoneNumber(phone, countryCode);
  if (!rawPhone) return '手机号不能为空';
  if (countryCode === '+86' || countryCode === '86') {
    if (!/^1[3-9]\d{9}$/.test(rawPhone)) {
      return '请输入有效的 11 位手机号码';
    }
  } else {
    if (rawPhone.length < 5 || rawPhone.length > 20) {
      return '请输入有效的国际手机号码';
    }
  }
  return null;
}

/**
 * 发送短信验证码核心函数（带 60 秒限频与防刷）
 */
export async function sendSmsVerificationCode({ phone, countryCode = '+86', type = 'login', ip = null }) {
  const readinessError = getSmsProviderReadinessError();
  if (readinessError) return { error: readinessError };

  const formatError = validatePhoneNumber(phone, countryCode);
  if (formatError) return { error: formatError };

  const { fullPhone, rawPhone } = normalizePhoneNumber(phone, countryCode);
  const now = new Date();

  // 1. 检查 60 秒内是否已经发送过（防刷保护）
  const recent = await queryOne(`
    SELECT created_at FROM auth_verification_codes
    WHERE target = $1 AND type = $2 AND created_at > $3
    ORDER BY created_at DESC LIMIT 1
  `, [fullPhone, type, new Date(now.getTime() - 60000).toISOString()]);

  if (recent) {
    await recordAuthEvent({ eventType: 'verification_rate_limited', target: fullPhone, requestIp: ip, metadata: { type } });
    return { error: '请求过于频繁，请在 60 秒后重试' };
  }

  const recentIp = ip ? await queryOne(`
    SELECT created_at FROM auth_verification_codes
    WHERE request_ip = $1 AND created_at > $2
    ORDER BY created_at DESC LIMIT 1
  `, [ip, new Date(now.getTime() - 10000).toISOString()]) : null;
  if (recentIp) {
    await recordAuthEvent({ eventType: 'verification_ip_rate_limited', target: fullPhone, requestIp: ip, metadata: { type } });
    return { error: '请求过于频繁，请稍后重试' };
  }

  // 2. 生成 6 位随机验证码，10 分钟有效
  const code = generateVerificationCode();
  let codeHash;
  try {
    codeHash = hashVerificationCode(code);
  } catch (error) {
    await recordAuthEvent({ eventType: 'verification_config_error', target: fullPhone, requestIp: ip, metadata: { code: error.code || 'SMS_SECRET_NOT_CONFIGURED' } });
    return { error: '短信登录通道暂不可用，请稍后重试' };
  }
  const expiresAt = new Date(now.getTime() + 10 * 60000).toISOString();
  const id = `cod_${crypto.randomBytes(12).toString('hex')}`;

  await execute(`
    INSERT INTO auth_verification_codes (id, target, code, type, attempts, expires_at, request_ip, created_at)
    VALUES ($1, $2, $3, $4, 0, $5, $6, $7)
  `, [id, fullPhone, codeHash, type, expiresAt, ip, nowIso()]);
  await recordAuthEvent({ eventType: 'verification_sent', target: fullPhone, requestIp: ip, metadata: { type, expiresInSeconds: 600 } });

  // 3. 按照 SMS Provider 发送短信
  let devNotice = null;

  if (SMS_PROVIDER === 'aliyun') {
    return { error: '当前短信服务适配器尚未启用，请改用邮箱登录' };
  } else if (SMS_PROVIDER === 'tencent') {
    return { error: '当前短信服务适配器尚未启用，请改用邮箱登录' };
  } else if (SMS_PROVIDER === 'twilio') {
    const params = new URLSearchParams({ To: fullPhone, Body: `Your verification code is ${code}. It expires in 10 minutes.` });
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) params.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
    else params.set('From', process.env.TWILIO_FROM_NUMBER);
    const basic = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    let response;
    try {
      response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    } catch (error) {
      await execute('UPDATE auth_verification_codes SET used_at = $1 WHERE id = $2', [nowIso(), id]).catch((cleanupError) => {
        console.error('[sms] failed to invalidate undelivered verification code', { code: cleanupError.code || 'SMS_CODE_INVALIDATION_FAILED' });
      });
      await recordAuthEvent({ eventType: 'verification_delivery_failed', target: fullPhone, requestIp: ip, metadata: { provider: SMS_PROVIDER, code: error.code || 'SMS_PROVIDER_REQUEST_FAILED' } });
      return { error: '短信发送失败，请稍后重试' };
    }
    if (!response.ok) {
      await execute('UPDATE auth_verification_codes SET used_at = $1 WHERE id = $2', [nowIso(), id]).catch((error) => {
        console.error('[sms] failed to invalidate undelivered verification code', { code: error.code || 'SMS_CODE_INVALIDATION_FAILED' });
      });
      await recordAuthEvent({ eventType: 'verification_delivery_failed', target: fullPhone, requestIp: ip, metadata: { provider: SMS_PROVIDER, status: response.status } });
      return { error: '短信发送失败，请稍后重试' };
    }
    await recordAuthEvent({ eventType: 'verification_delivered', target: fullPhone, requestIp: ip, metadata: { provider: SMS_PROVIDER } });
  } else {
    // Mock is test-only and must be explicitly enabled. Never enable this in
    // production, and never return the code for a real provider.
    devNotice = `开发测试体验码：${code}`;
  }

  return {
    success: true,
    target: fullPhone,
    expiresInSeconds: 600,
    devCode: SMS_PROVIDER === 'mock' && isMockSmsAllowed() ? code : undefined,
    notice: devNotice || '验证码已发送'
  };
}

/**
 * 校验手机验证码
 */
export async function verifySmsCode({ phone, countryCode = '+86', code, type = 'login', ip = null }) {
  const { fullPhone } = normalizePhoneNumber(phone, countryCode);
  const cleanCode = String(code || '').trim();

  if (!cleanCode || cleanCode.length !== 6) {
    return { error: '请输入 6 位有效验证码' };
  }

  const result = await withTransaction(async (tx) => {
    const record = await tx.queryOne(`
      SELECT id, code, attempts, expires_at, used_at FROM auth_verification_codes
      WHERE target = $1 AND type = $2 AND used_at IS NULL
      ORDER BY created_at DESC LIMIT 1
      FOR UPDATE
    `, [fullPhone, type]);

    if (!record) return { error: '未找到有效验证码，请重新获取', eventType: 'verification_missing' };
    if (new Date(record.expires_at).getTime() < Date.now()) return { error: '验证码已过期，请重新获取', eventType: 'verification_expired' };
    if (record.attempts >= 5) return { error: '验证码尝试次数过多，请重新获取', eventType: 'verification_locked' };
    let submittedHash;
    try {
      submittedHash = hashVerificationCode(cleanCode);
    } catch {
      return { error: '验证码校验暂不可用，请稍后重试', eventType: 'verification_config_error' };
    }
    if (!timingSafeEqualText(record.code, submittedHash)) {
      await tx.execute('UPDATE auth_verification_codes SET attempts = attempts + 1 WHERE id = $1', [record.id]);
      return { error: '验证码不正确，请重新输入', eventType: 'verification_failed' };
    }

    await tx.execute('UPDATE auth_verification_codes SET used_at = $1 WHERE id = $2', [nowIso(), record.id]);
    return { success: true, target: fullPhone, eventType: 'verification_succeeded' };
  });

  await recordAuthEvent({ eventType: result.eventType, target: fullPhone, requestIp: ip, metadata: { type } });
  delete result.eventType;
  return result;
}
