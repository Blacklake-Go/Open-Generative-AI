import { execute, nowIso, query, queryOne, randomId } from '../db/index.js';

export async function recordAuthEvent({ eventType, target = null, requestIp = null, metadata = {}, transaction = null }) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return await run(`
    INSERT INTO auth_events (id, event_type, target, request_ip, metadata_json, created_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6)
  `, [randomId('auth'), eventType, target, requestIp, JSON.stringify(metadata || {}), nowIso()]);
}

function one(transaction) {
  return transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
}

function many(transaction) {
  return transaction?.queryMany
    ? transaction.queryMany.bind(transaction)
    : async (...args) => (await query(...args)).rows;
}

function write(transaction) {
  return transaction?.execute ? transaction.execute.bind(transaction) : execute;
}

export async function findPhoneAccount(providerUserId, transaction = null) {
  return one(transaction)("SELECT user_id FROM auth_accounts WHERE provider = 'phone' AND provider_user_id = $1 FOR UPDATE", [providerUserId]);
}

export async function findUserForUpdate(userId, transaction = null) {
  return one(transaction)(`SELECT id, email, phone, phone_country_code, display_name, avatar_url, role, credits, status, deletion_requested_at, deletion_due_at
    FROM users WHERE id = $1 FOR UPDATE`, [userId]);
}

export async function findUserByPhoneForUpdate(phone, transaction = null) {
  return one(transaction)(`SELECT id, email, phone, phone_country_code, display_name, avatar_url, role, credits, status, deletion_requested_at, deletion_due_at
    FROM users WHERE phone = $1 FOR UPDATE`, [phone]);
}

export async function findEmailCredential(email) {
  return queryOne(`SELECT user_id, password_hash, password_salt FROM auth_accounts
    WHERE provider = 'email' AND LOWER(provider_user_id) = $1`, [email]);
}

export async function findEmailAccountForUpdate(email, transaction = null) {
  return one(transaction)("SELECT user_id FROM auth_accounts WHERE provider = 'email' AND LOWER(provider_user_id) = $1 FOR UPDATE", [email]);
}

export async function findLegacyEmailCredential(email) {
  return queryOne(`SELECT id AS user_id, password_hash, password_salt FROM users WHERE LOWER(email) = $1`, [email]);
}

export async function findUserByIdBasic(userId) {
  return queryOne(`SELECT id, email, phone, display_name, role, status, credits, deletion_requested_at, deletion_due_at,
    ((password_hash IS NOT NULL AND password_hash != '') OR EXISTS (SELECT 1 FROM auth_accounts aa WHERE aa.user_id = users.id AND aa.password_hash IS NOT NULL AND aa.password_hash != '')) AS has_password
    FROM users WHERE id = $1`, [userId]);
}

export async function findUserByEmailForUpdate(email, transaction = null) {
  return one(transaction)(`SELECT id, email, phone, phone_country_code, display_name, avatar_url, role, credits, status, deletion_requested_at, deletion_due_at
    FROM users WHERE LOWER(email) = $1`, [email]);
}

export async function findOAuthAccount(provider, providerUserId, transaction = null) {
  return one(transaction)('SELECT user_id FROM auth_accounts WHERE provider = $1 AND provider_user_id = $2', [provider, providerUserId]);
}

export async function findOAuthBindingForUpdate(provider, providerUserId, transaction = null) {
  return one(transaction)('SELECT user_id FROM auth_accounts WHERE provider = $1 AND provider_user_id = $2 FOR UPDATE', [provider, providerUserId]);
}

export async function checkUserNumberExists(userNumber, transaction = null) {
  const row = await one(transaction)('SELECT 1 FROM users WHERE user_number = $1', [userNumber]);
  return Boolean(row);
}

export async function findUserByNumberForUpdate(userNumber, transaction = null) {
  return one(transaction)(`SELECT id, user_number, email, phone, phone_country_code, display_name, avatar_url, role, credits, status
    FROM users WHERE user_number = $1 FOR UPDATE`, [userNumber]);
}

export async function findCredentialByAccount(identifier) {
  const clean = String(identifier || '').trim().toLowerCase();
  // 1. 尝试以纯数字 user_id / user_number 查找用户
  if (/^\d{6,64}$/.test(clean)) {
    const byNumber = await queryOne(`
      SELECT u.id AS user_id, u.user_number, u.password_hash, u.password_salt
      FROM users u WHERE u.id = $1 OR u.user_number = $1
    `, [clean]);
    if (byNumber?.password_hash) return byNumber;
  }
  // 2. 尝试从 auth_accounts 查找 email
  const acc = await queryOne(`
    SELECT user_id, password_hash, password_salt FROM auth_accounts
    WHERE provider = 'email' AND LOWER(provider_user_id) = $1
  `, [clean]);
  if (acc?.password_hash) return acc;
  // 3. 从 users 表 email 查找
  return queryOne(`SELECT id AS user_id, user_number, password_hash, password_salt FROM users WHERE LOWER(email) = $1`, [clean]);
}

// Canonical user_id allocator adapters. `reserve` is the atomic uniqueness gate
// (the ledger PK + the users.id FK to it are the final DB-level guards against
// duplicate or reused IDs under concurrent registration). `findFirstAvailable`
// is a genuine gap scan, so a digit-length pool is only escalated once it is
// truly exhausted — never because random sampling collided.
export async function reserveUserId(userId, digits, transaction = null) {
  const row = await one(transaction)(`INSERT INTO user_id_allocations (user_id, digit_length)
    VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING RETURNING user_id`, [userId, digits]);
  return Boolean(row);
}

export async function findFirstAvailableUserId(digits, transaction = null) {
  const start = 10n ** BigInt(digits - 1);
  const end = 10n ** BigInt(digits) - 1n;
  const row = await one(transaction)(`
    SELECT n::text AS user_id
    FROM generate_series($1::bigint, $2::bigint) AS n
    WHERE NOT EXISTS (
      SELECT 1 FROM user_id_allocations a WHERE a.user_id = n::text AND a.digit_length = $3
    )
    ORDER BY n ASC LIMIT 1
  `, [String(start), String(end), digits]);
  return row ? row.user_id : null;
}

export async function isUserIdPoolExhausted(digits, transaction = null) {
  const row = await one(transaction)(`SELECT COUNT(*)::bigint AS allocated FROM user_id_allocations WHERE digit_length = $1`, [digits]);
  const allocated = BigInt(row?.allocated ?? 0);
  return allocated >= 9n * (10n ** BigInt(digits - 1));
}

export async function insertUser({ id, email = null, phone = null, phoneCountryCode = null, passwordHash = null, passwordSalt = null, displayName, avatarUrl = null, role = 'user', credits = 0, status = 'active', registrationSource, lastLoginAt, lastLoginIp, createdAt, updatedAt }, transaction = null) {
  return one(transaction)(`INSERT INTO users (
      id, email, phone, phone_country_code, password_hash, password_salt, display_name, avatar_url, role, credits, status,
      registration_source, last_login_at, last_login_ip, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING id, user_number, email, phone, phone_country_code, display_name, avatar_url, role, credits, status, is_activity_public, privacy_settings`,
  [id, email, phone, phoneCountryCode, passwordHash, passwordSalt, displayName, avatarUrl, role, credits, status, registrationSource, lastLoginAt, lastLoginIp, createdAt, updatedAt]);
}

export async function insertEmailAccount({ id, userId, email, passwordHash, passwordSalt, timestamp }, transaction = null) {
  return write(transaction)(`INSERT INTO auth_accounts (
      id, user_id, provider, provider_user_id, provider_email, password_hash, password_salt, created_at, updated_at, last_login_at
    ) VALUES ($1, $2, 'email', $3, $4, $5, $6, $7, $8, $9)`, [id, userId, email, email, passwordHash, passwordSalt, timestamp, timestamp, timestamp]);
}

export async function insertOAuthAccount({ id, userId, provider, providerUserId, providerEmail, providerUsername = null, displayName, profile, timestamp }, transaction = null) {
  return one(transaction)(`INSERT INTO auth_accounts (id, user_id, provider, provider_user_id, provider_email, provider_username, profile_json, created_at, updated_at, last_login_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (provider, provider_user_id) DO NOTHING
    RETURNING user_id`, [id, userId, provider, providerUserId, providerEmail, providerUsername || displayName || null, profile ? JSON.stringify(profile) : null, timestamp, timestamp, timestamp]);
}

export async function insertPhoneAccount({ id, userId, providerUserId, timestamp, ignoreConflict = false }, transaction = null) {
  const suffix = ignoreConflict ? ' ON CONFLICT (provider, provider_user_id) DO NOTHING' : '';
  return write(transaction)(`INSERT INTO auth_accounts (id, user_id, provider, provider_user_id, created_at, updated_at, last_login_at)
    VALUES ($1, $2, 'phone', $3, $4, $5, $6)${suffix}`, [id, userId, providerUserId, timestamp, timestamp, timestamp]);
}

export async function addNewUserTag(userId, timestamp, transaction = null) {
  return write(transaction)(`INSERT INTO user_tags (user_id, tag_id, created_at, created_by)
    VALUES ($1, 'tag_new', $2, 'system') ON CONFLICT (user_id, tag_id) DO NOTHING`, [userId, timestamp]);
}

export async function updateLoginMetadata({ userId, provider = null, providerUserId = null, timestamp, ip = null }, transaction = null) {
  const run = write(transaction);
  await run('UPDATE users SET last_login_at = $1, last_login_ip = $2 WHERE id = $3', [timestamp, ip, userId]);
  if (provider && providerUserId) {
    await run('UPDATE auth_accounts SET last_login_at = $1, updated_at = $1 WHERE provider = $2 AND provider_user_id = $3', [timestamp, provider, providerUserId]);
  }
}

export async function findUserSession(tokenHash) {
  return queryOne(`SELECT u.id, u.user_number, u.email, u.phone, u.phone_country_code, u.display_name, u.avatar_url, u.role, u.credits, u.status, u.is_activity_public, u.privacy_settings, u.locale, u.zodiac, u.industry, u.occupation, u.country, u.gender, u.occupation_code, u.style_codes, u.bio, u.website, u.creator_persona_code, u.preferences_json, u.onboarding_completed, u.onboarding_step, u.onboarding_schema_version, u.deletion_requested_at, u.deletion_due_at, u.created_at, s.expires_at,
    ((u.password_hash IS NOT NULL AND u.password_hash != '') OR EXISTS (SELECT 1 FROM auth_accounts aa WHERE aa.user_id = u.id AND aa.password_hash IS NOT NULL AND aa.password_hash != '')) AS has_password
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL`, [tokenHash]);
}

export async function updateUserOnboarding({
  userId,
  displayName = null,
  avatarUrl = null,
  zodiac = null,
  industry = null,
  occupation = null,
  occupationCode = null,
  purposeCodes = null,
  commitment = null,
  styleCodes = null,
  usageIntent = null,
  personaCode = null,
  answers = null,
  preferences = null,
  step = null,
  completed = null,
  schemaVersion = null,
}, transaction = null) {
  const run = write(transaction);
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const now = nowIso();
  const fields = ['updated_at = $2'];
  const values = [userId, now];
  let idx = 3;

  if (completed === true || (completed === null && typeof step === 'number' && step >= 2)) {
    fields.push('onboarding_completed = true');
    fields.push(`onboarded_at = COALESCE(onboarded_at, $2)`);
  } else if (completed === false) {
    fields.push('onboarding_completed = false');
  }

  if (typeof step === 'number') {
    fields.push(`onboarding_step = $${idx++}`);
    values.push(step);
  }
  if (typeof schemaVersion === 'number') {
    fields.push(`onboarding_schema_version = $${idx++}`);
    values.push(schemaVersion);
  }
  if (displayName) {
    fields.push(`display_name = $${idx++}`);
    values.push(displayName);
  }
  if (avatarUrl) {
    fields.push(`avatar_url = $${idx++}`);
    values.push(avatarUrl);
  }
  if (zodiac) {
    fields.push(`zodiac = $${idx++}`);
    values.push(zodiac);
  }
  if (industry) {
    fields.push(`industry = $${idx++}`);
    values.push(industry);
  }
  if (occupation) {
    fields.push(`occupation = $${idx++}`);
    values.push(occupation);
  }
  if (occupationCode) {
    fields.push(`occupation_code = $${idx++}`);
    values.push(occupationCode);
  }
  if (Array.isArray(purposeCodes)) {
    fields.push(`purpose_codes = $${idx++}`);
    values.push(purposeCodes);
  }
  if (commitment) {
    fields.push(`commitment = $${idx++}`);
    values.push(commitment);
  }
  if (Array.isArray(styleCodes)) {
    fields.push(`style_codes = $${idx++}`);
    values.push(styleCodes);
  }
  if (usageIntent) {
    fields.push(`usage_intent = $${idx++}`);
    values.push(usageIntent);
  }
  if (personaCode) {
    fields.push(`creator_persona_code = $${idx++}`);
    values.push(personaCode);
  }
  if (answers && typeof answers === 'object') {
    fields.push(`onboarding_answers_json = $${idx++}::jsonb`);
    values.push(JSON.stringify(answers));
  }
  if (preferences && typeof preferences === 'object') {
    fields.push(`preferences_json = $${idx++}::jsonb`);
    values.push(JSON.stringify(preferences));
  }

  await run(`UPDATE users SET ${fields.join(', ')} WHERE id = $1`, values);
  return await one('SELECT * FROM users WHERE id = $1', [userId]);
}

export async function updateUserEmailIfEmpty(userId, email, transaction = null) {
  const run = write(transaction);
  return await run("UPDATE users SET email = $2, updated_at = $3 WHERE id = $1 AND (email IS NULL OR email = '')", [userId, email, nowIso()]);
}

export async function updateUserAvatarIfEmpty(userId, avatarUrl, transaction = null) {
  const run = write(transaction);
  return await run("UPDATE users SET avatar_url = $2, updated_at = $3 WHERE id = $1 AND (avatar_url IS NULL OR avatar_url = '')", [userId, avatarUrl, nowIso()]);
}

export async function getOnboardingState(userId) {
  const user = await queryOne("SELECT onboarding_completed, onboarded_at, preferences_json FROM users WHERE id = $1", [userId]);
  return user ? { completed: Boolean(user.onboarding_completed), onboardedAt: user.onboarded_at, preferences: user.preferences_json } : null;
}

export async function lockPhoneIdentity(phone, transaction = null) {
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await one("SELECT id FROM users WHERE phone = $1 FOR UPDATE", [phone]);
}

export async function updateUserPhoneIdentity(userId, phone, countryCode = '+86', transaction = null) {
  const run = write(transaction);
  return await run("UPDATE users SET phone = $2, phone_country_code = $3, updated_at = $4 WHERE id = $1", [userId, phone, countryCode, nowIso()]);
}

export async function updateUserEmailVerifiedAt(userId, verifiedAt, transaction = null) {
  const run = write(transaction);
  return await run("UPDATE users SET email_verified_at = $2, updated_at = NOW() WHERE id = $1", [userId, verifiedAt]);
}

export async function findUserPasswordCredential(userId) {
  const user = await queryOne("SELECT id AS user_id, password_hash, password_salt FROM users WHERE id = $1", [userId]);
  if (user?.password_hash) return user;
  return await queryOne("SELECT user_id, password_hash, password_salt FROM auth_accounts WHERE provider = 'email' AND user_id = $1 AND password_hash IS NOT NULL", [userId]);
}

export async function addUserTag(userId, tagId, transaction = null) {
  const run = write(transaction);
  const now = nowIso();
  return run(`INSERT INTO user_tags (user_id, tag_id, created_at, created_by)
    VALUES ($1, $2, $3, 'system') ON CONFLICT (user_id, tag_id) DO NOTHING`, [userId, tagId, now]);
}

export async function findSessionOwnerForUpdate(tokenHash, transaction = null) {
  return one(transaction)('SELECT user_id FROM sessions WHERE token_hash = $1 FOR UPDATE', [tokenHash]);
}

export async function listLoginProviders(userId) {
  return many()("SELECT provider FROM auth_accounts WHERE user_id = $1", [userId]);
}

export async function listLoginAccounts(userId) {
  return many()(`SELECT provider, provider_email, provider_username
    FROM auth_accounts WHERE user_id = $1 ORDER BY created_at ASC`, [userId]);
}

export async function listUserTags(userId) {
  return many()(`SELECT t.id, t.name, t.slug, t.color FROM user_tags ut JOIN tags t ON t.id = ut.tag_id WHERE ut.user_id = $1`, [userId]);
}

export async function getUserCredentialSummary(userId, transaction = null) {
  const user = await one(transaction)('SELECT password_hash, email, phone FROM users WHERE id = $1', [userId]);
  const accounts = await (transaction?.queryMany ? transaction.queryMany.bind(transaction) : async (...args) => (await query(...args)).rows)(
    'SELECT provider, provider_user_id FROM auth_accounts WHERE user_id = $1', [userId]
  );
  const hasPassword = Boolean(user?.password_hash);
  const hasEmail = Boolean(user?.email || accounts.some(a => a.provider === 'email'));
  const hasPhone = Boolean(user?.phone || accounts.some(a => a.provider === 'phone'));
  const oauthProviders = accounts.filter(a => a.provider !== 'email' && a.provider !== 'phone').map(a => a.provider);
  
  let validCredentialCount = 0;
  if (hasPassword && hasEmail) validCredentialCount += 1;
  if (hasPhone) validCredentialCount += 1;
  validCredentialCount += oauthProviders.length;
  if (hasPassword && !hasEmail && !hasPhone) validCredentialCount += 1; // 仅有账号密码

  return {
    hasPassword,
    hasEmail,
    hasPhone,
    oauthProviders: [...new Set(oauthProviders)],
    validCredentialCount,
  };
}

export async function removePhoneAccount(userId, transaction = null) {
  const run = write(transaction);
  await run("DELETE FROM auth_accounts WHERE user_id = $1 AND provider = 'phone'", [userId]);
  await run("UPDATE users SET phone = NULL, phone_verified_at = NULL, updated_at = NOW() WHERE id = $1", [userId]);
  return true;
}

export async function removeEmailAccount(userId, transaction = null) {
  const run = write(transaction);
  await run("DELETE FROM auth_accounts WHERE user_id = $1 AND provider = 'email'", [userId]);
  await run("UPDATE users SET email = NULL, email_verified_at = NULL, updated_at = NOW() WHERE id = $1", [userId]);
  return true;
}

export async function removeOAuthAccount(userId, provider, transaction = null) {
  const run = write(transaction);
  await run("DELETE FROM auth_accounts WHERE user_id = $1 AND provider = $2", [userId, provider]);
  return true;
}

export async function insertSession({ tokenHash, userId, expiresAt, timestamp }, transaction = null) {
  return write(transaction)('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)', [tokenHash, userId, expiresAt, timestamp]);
}

export async function lockSessionUser(tokenHash, transaction = null) {
  return one(transaction)(`SELECT s.user_id, s.expires_at, u.status FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL FOR UPDATE`, [tokenHash]);
}

export async function revokeSession(tokenHash, timestamp, transaction = null) {
  return write(transaction)('UPDATE sessions SET revoked_at = $1, last_seen_at = $1 WHERE token_hash = $2', [timestamp, tokenHash]);
}

export async function deleteSessionByHash(tokenHash, transaction = null) {
  return write(transaction)('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

export async function rotateSession({ oldTokenHash, nextTokenHash, userId, expiresAt, timestamp }, transaction = null) {
  await revokeSession(oldTokenHash, timestamp, transaction);
  return insertSession({ tokenHash: nextTokenHash, userId, expiresAt, timestamp }, transaction);
}

/**
 * 密码重置的落库处。users 与 auth_accounts(provider='email') 两份哈希必须同步：
 * 登录时 findCredentialByAccount 会按 users.user_number → auth_accounts.email →
 * users.email 三级回退，只写一边会让另一条登录路径继续接受旧密码。
 */
export async function setUserPassword({ userId, passwordHash, passwordSalt }, transaction = null) {
  const run = write(transaction);
  await run(
    'UPDATE users SET password_hash = $1, password_salt = $2, updated_at = NOW() WHERE id = $3',
    [passwordHash, passwordSalt, userId]
  );
  await run(
    "UPDATE auth_accounts SET password_hash = $1, password_salt = $2, updated_at = NOW() WHERE user_id = $3 AND provider = 'email'",
    [passwordHash, passwordSalt, userId]
  );
  return true;
}

/** 撤销某用户全部会话（找回密码成功后必须让旧 token 立刻失效）。 */
export async function revokeAllUserSessions(userId, timestamp = null, transaction = null) {
  const run = write(transaction);
  return run('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

/**
 * 手机号是否已被某个正常账号验证占用（E.164）。
 *
 * 找回密码验证码发送前的存在性检查：查不到时调用方返回与查到完全相同的响应，
 * 否则这个接口就变成一份「哪些手机号注册过」的名册。
 */
export async function findActiveVerifiedPhoneOwner(phone) {
  return queryOne(`
    SELECT id, email, phone, display_name, role, status, credits
    FROM users
    WHERE phone = $1 AND phone_verified_at IS NOT NULL AND status = 'active'
  `, [phone]);
}
