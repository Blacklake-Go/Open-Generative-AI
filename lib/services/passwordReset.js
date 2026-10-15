import 'server-only';

import crypto from 'node:crypto';
import { nowIso, randomId, withTransaction } from '../db/index.js';
import * as authRepo from '../repositories/auth.js';
import * as resetRepo from '../repositories/passwordReset.js';
import { consumeRateLimit } from '../security/requestGuard.js';
import { normalizeEmail, passwordHash } from './auth.js';
import { sendPasswordResetEmail, sendUsernameRecoveryEmail } from '../emailService.js';
import { verifyPhoneOtp } from '../smsService.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function validEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function validateNewPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return { error: 'PASSWORD_INVALID', message: '新密码长度需为 8–200 个字符' };
  }
  return null;
}

function codeDigest(challengeId, code) {
  const secret = String(process.env.AUTH_VERIFICATION_CODE_SECRET || '');
  if (secret.length < 32) {
    throw Object.assign(new Error('Password reset is not configured'), { code: 'RESET_NOT_CONFIGURED' });
  }
  return crypto.createHmac('sha256', secret).update(challengeId + ':' + code).digest('hex');
}

function digestMatches(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(String(left || '')) || !/^[a-f0-9]{64}$/i.test(String(right || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function hashSubject(value) {
  return crypto.createHash('sha256').update(String(value || 'unknown')).digest('hex');
}

async function emailResetRateAllowed(email, ip) {
  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit({ scope: 'auth_password_reset_email_ip', subject: hashSubject(ip), limit: 10, windowMs: 60 * 60 * 1000 }),
    consumeRateLimit({ scope: 'auth_password_reset_email_target', subject: hashSubject(email), limit: 3, windowMs: 60 * 60 * 1000 }),
  ]);
  return byIp.allowed && byEmail.allowed;
}

export async function requestEmailPasswordReset({
  email: rawEmail,
  ip = null,
  locale = 'zh-CN',
  sendResetEmail = sendPasswordResetEmail,
}) {
  const email = validEmail(rawEmail);
  if (!email) return { error: 'EMAIL_INVALID', message: '请输入有效的邮箱地址' };
  if (!await emailResetRateAllowed(email, ip)) return { success: true };
  const user = await resetRepo.findResetUserByEmail(email);
  if (!user || user.status !== 'active') return { success: true };

  const challengeId = randomId('pwreset');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const codeHash = codeDigest(challengeId, code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await withTransaction(async (tx) => {
    await resetRepo.pruneEmailResetCodes(email, tx);
    await resetRepo.replaceEmailResetCode({ id: challengeId, email, codeHash, expiresAt, requestIp: ip }, tx);
  });

  try {
    await sendResetEmail({ to: email, code, userId: user.id, locale });
  } catch (error) {
    await resetRepo.markEmailResetCodeUsed(challengeId).catch(() => {});
    console.error('[auth/password-reset/email-send]', { code: error?.code || 'EMAIL_DELIVERY_FAILED' });
  }
  return { success: true };
}

export async function requestUsernameRecovery({ email: rawEmail, ip = null, locale = 'zh-CN' }) {
  const email = validEmail(rawEmail);
  if (!email) return { error: 'EMAIL_INVALID', message: '请输入有效的邮箱地址' };
  if (!await emailResetRateAllowed(email, ip)) return { success: true };
  const user = await resetRepo.findResetUserByEmail(email);
  if (!user || user.status !== 'active') return { success: true };

  const challengeId = randomId('acctlookup');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const codeHash = codeDigest(challengeId, code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await withTransaction(async (tx) => {
    await resetRepo.pruneEmailResetCodes(email, tx, 'username_recovery_email');
    await resetRepo.replaceEmailResetCode({ id: challengeId, email, codeHash, expiresAt, requestIp: ip, type: 'username_recovery_email' }, tx);
  });

  try {
    await sendUsernameRecoveryEmail({ to: email, code, userId: user.id, locale });
  } catch (error) {
    await resetRepo.markEmailResetCodeUsed(challengeId).catch(() => {});
    console.error('[auth/username-recovery/email-send]', { code: error?.code || 'EMAIL_DELIVERY_FAILED' });
  }
  return { success: true };
}

export async function verifyUsernameRecovery({ email: rawEmail, code: rawCode, ip = null }) {
  const email = validEmail(rawEmail);
  const code = String(rawCode || '').trim();
  if (!email) return { error: 'EMAIL_INVALID', message: '请输入有效的邮箱地址' };
  if (!/^\d{6}$/.test(code)) return { error: 'EMAIL_CODE_INVALID', message: '请输入 6 位邮箱验证码' };

  return withTransaction(async (tx) => {
    const challenge = await resetRepo.findLatestEmailResetCodeForUpdate(email, tx, 'username_recovery_email');
    if (!challenge || challenge.used_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
      return { error: 'EMAIL_CODE_EXPIRED', message: '验证码已失效，请重新发送' };
    }
    if (Number(challenge.attempts || 0) >= MAX_CODE_ATTEMPTS) {
      return { error: 'EMAIL_CODE_ATTEMPTS_EXCEEDED', message: '验证码尝试次数过多，请重新发送' };
    }
    if (!digestMatches(challenge.code, codeDigest(challenge.id, code))) {
      await resetRepo.incrementEmailResetAttempts(challenge.id, tx);
      return { error: 'EMAIL_CODE_INVALID', message: '邮箱验证码错误' };
    }
    const user = await resetRepo.findResetUserByEmail(email, tx, true);
    if (!user || user.status !== 'active') return { error: 'EMAIL_CODE_EXPIRED', message: '验证码已失效，请重新发送' };
    await resetRepo.markEmailResetCodeUsed(challenge.id, tx);
    await authRepo.recordAuthEvent({
      eventType: 'USERNAME_RECOVERY', target: user.id, requestIp: ip,
      metadata: { method: 'email' }, transaction: tx,
    });
    return { success: true, username: user.username || null, userNumber: user.user_number || null };
  });
}

export async function resetPasswordByEmail({ email: rawEmail, code: rawCode, newPassword, ip = null }) {
  const email = validEmail(rawEmail);
  const code = String(rawCode || '').trim();
  const passwordError = validateNewPassword(newPassword);
  if (!email) return { error: 'EMAIL_INVALID', message: '请输入有效的邮箱地址' };
  if (!/^\d{6}$/.test(code)) return { error: 'EMAIL_CODE_INVALID', message: '请输入 6 位邮箱验证码' };
  if (passwordError) return passwordError;

  const pair = passwordHash(newPassword);
  try {
    return await withTransaction(async (tx) => {
      const challenge = await resetRepo.findLatestEmailResetCodeForUpdate(email, tx);
      if (!challenge || challenge.used_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
        return { error: 'EMAIL_CODE_EXPIRED', message: '验证码已失效，请重新发送' };
      }
      if (Number(challenge.attempts || 0) >= MAX_CODE_ATTEMPTS) {
        return { error: 'EMAIL_CODE_ATTEMPTS_EXCEEDED', message: '验证码尝试次数过多，请重新发送' };
      }
      if (!digestMatches(challenge.code, codeDigest(challenge.id, code))) {
        await resetRepo.incrementEmailResetAttempts(challenge.id, tx);
        return { error: 'EMAIL_CODE_INVALID', message: '邮箱验证码错误' };
      }
      const user = await resetRepo.findResetUserByEmail(email, tx, true);
      if (!user || user.status !== 'active') return { error: 'EMAIL_CODE_EXPIRED', message: '验证码已失效，请重新发送' };

      const timestamp = nowIso();
      await authRepo.setUserPassword({ userId: user.id, passwordHash: pair.hash, passwordSalt: pair.salt }, tx);
      await authRepo.revokeAllUserSessions(user.id, timestamp, tx);
      await resetRepo.markEmailResetCodeUsed(challenge.id, tx);
      await authRepo.recordAuthEvent({
        eventType: 'PASSWORD_RESET',
        target: user.id,
        requestIp: ip,
        metadata: { method: 'email' },
        transaction: tx,
      });
      return { success: true };
    });
  } catch (error) {
    console.error('[auth/password-reset/email]', { code: error?.code || 'PASSWORD_RESET_FAILED' });
    throw error;
  }
}

export async function resetPasswordByPhone({
  phone, countryCode = '+86', code, challengeId, newPassword,
  sessionToken = null, ip = null, deviceToken = null,
}) {
  const passwordError = validateNewPassword(newPassword);
  if (passwordError) return passwordError;
  const verified = await verifyPhoneOtp({
    phone, countryCode, code, challengeId, purpose: 'password_reset', sessionToken, ip, deviceToken,
  });
  if (!verified.success) return verified;

  const pair = passwordHash(newPassword);
  return withTransaction(async (tx) => {
    const user = await resetRepo.findResetUserByPhone(verified.phone, tx);
    if (!user || user.status !== 'active') return { error: 'OTP_MISSING', message: '验证码已失效，请重新获取' };
    const timestamp = nowIso();
    await authRepo.setUserPassword({ userId: user.id, passwordHash: pair.hash, passwordSalt: pair.salt }, tx);
    await authRepo.revokeAllUserSessions(user.id, timestamp, tx);
    await authRepo.recordAuthEvent({
      eventType: 'PASSWORD_RESET',
      target: user.id,
      requestIp: ip,
      metadata: { method: 'phone' },
      transaction: tx,
    });
    return { success: true };
  });
}
