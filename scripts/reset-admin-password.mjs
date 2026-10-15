import crypto from 'node:crypto';
import { closePgPool, withTransaction } from '../lib/db/index.js';

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

const password = process.env.ADMIN_RESET_PASSWORD;
const email = String(process.env.ADMIN_EMAIL || process.argv[2] || '').trim().toLowerCase();
if (!password || password.length < 8 || password.length > 200 || !email) {
  console.error('用法：ADMIN_EMAIL=admin@example.com ADMIN_RESET_PASSWORD=<临时密码> node scripts/reset-admin-password.mjs');
  process.exitCode = 2;
} else {
  try {
    const result = await withTransaction(async (tx) => {
      const existing = await tx.queryOne('SELECT id FROM users WHERE LOWER(email) = $1 FOR UPDATE', [email]);
      if (!existing) throw new Error('未找到用户: ' + email);
      const { salt, hash } = passwordHash(password);
      const updatedAt = new Date().toISOString();
      const userCount = await tx.execute("UPDATE users SET password_hash = $1, password_salt = $2, role = 'super_admin', status = 'active', is_active = TRUE, is_banned = FALSE, updated_at = $3 WHERE id = $4", [hash, salt, updatedAt, existing.id]);
      const accountCount = await tx.execute("UPDATE auth_accounts SET password_hash = $1, password_salt = $2, updated_at = $3 WHERE user_id = $4 AND provider = 'email'", [hash, salt, updatedAt, existing.id]);
      const sessionsRevoked = await tx.execute('DELETE FROM sessions WHERE user_id = $1', [existing.id]);
      return { userCount, accountCount, sessionsRevoked };
    });
    console.log('[成功] 已在 PostgreSQL 中重置管理员密码、同步邮箱凭据并作废旧会话。', result);
  } catch (error) {
    console.error('[reset-admin-password] failed:', error.message);
    process.exitCode = 1;
  } finally {
    await closePgPool();
  }
}
