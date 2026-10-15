import { execute, queryOne } from '../db/index.js';

function one(transaction) {
  return transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
}

function write(transaction) {
  return transaction?.execute ? transaction.execute.bind(transaction) : execute;
}

export async function findResetUserByEmail(email, transaction = null, forUpdate = false) {
  const lock = forUpdate ? 'FOR UPDATE OF u' : '';
  return one(transaction)(`SELECT u.id, u.email, u.username, u.id AS user_number, u.status
    FROM auth_usr.users u
    WHERE LOWER(u.email) = $1
       OR EXISTS (
         SELECT 1 FROM auth_usr.auth_accounts a
         WHERE a.user_id = u.id AND a.provider = 'email' AND LOWER(a.provider_user_id) = $1
       )
    ORDER BY (LOWER(u.email) = $1) DESC
    LIMIT 1 ` + lock, [email]);
}

export async function findResetUserByPhone(phone, transaction = null) {
  const lock = transaction ? 'FOR UPDATE' : '';
  return one(transaction)(`SELECT id, phone, status
    FROM auth_usr.users
    WHERE phone = $1 AND phone_verified_at IS NOT NULL
    LIMIT 1 ` + lock, [phone]);
}

const EMAIL_RECOVERY_CODE_TYPES = new Set(['password_reset_email', 'username_recovery_email']);

function recoveryType(value) {
  return EMAIL_RECOVERY_CODE_TYPES.has(value) ? value : 'password_reset_email';
}

export async function replaceEmailResetCode({ id, email, codeHash, expiresAt, requestIp, type = 'password_reset_email' }, transaction = null) {
  const run = write(transaction);
  const codeType = recoveryType(type);
  await run(`UPDATE sys_core.auth_verification_codes
    SET used_at = NOW()
    WHERE target = $1 AND type = $2 AND used_at IS NULL`, [email, codeType]);
  return one(transaction)(`INSERT INTO sys_core.auth_verification_codes
      (id, target, code, type, attempts, expires_at, used_at, created_at, request_ip)
    VALUES ($1, $2, $3, $4, 0, $5, NULL, NOW(), $6)
    RETURNING id, target, expires_at`, [id, email, codeHash, codeType, expiresAt, requestIp || null]);
}

export async function pruneEmailResetCodes(email, transaction = null, type = 'password_reset_email') {
  return write(transaction)(`DELETE FROM sys_core.auth_verification_codes
    WHERE target = $1 AND type = $2
      AND (expires_at <= NOW() OR used_at IS NOT NULL)`, [email, recoveryType(type)]);
}

export async function findLatestEmailResetCodeForUpdate(email, transaction, type = 'password_reset_email') {
  return one(transaction)(`SELECT id, target, code, attempts, expires_at, used_at
    FROM sys_core.auth_verification_codes
    WHERE target = $1 AND type = $2
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE`, [email, recoveryType(type)]);
}

export async function incrementEmailResetAttempts(id, transaction) {
  return write(transaction)(`UPDATE sys_core.auth_verification_codes
    SET attempts = attempts + 1
    WHERE id = $1 AND used_at IS NULL`, [id]);
}

export async function markEmailResetCodeUsed(id, transaction = null) {
  return write(transaction)(`UPDATE sys_core.auth_verification_codes
    SET used_at = NOW()
    WHERE id = $1 AND used_at IS NULL`, [id]);
}
