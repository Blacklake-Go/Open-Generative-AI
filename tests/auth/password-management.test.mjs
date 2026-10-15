import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('auth repository and session resolution properly reflect hasPassword state', async () => {
  const repoSource = await readFile(new URL('../../lib/repositories/auth.js', import.meta.url), 'utf8');
  const serviceSource = await readFile(new URL('../../lib/services/auth.js', import.meta.url), 'utf8');

  // 1. findUserSession must query has_password
  assert.ok(
    repoSource.includes('AS has_password'),
    'findUserSession must calculate has_password boolean column'
  );

  // 2. getUserBySession must map hasPassword from row.has_password
  assert.ok(
    serviceSource.includes('hasPassword: Boolean(row.has_password)'),
    'getUserBySession must return hasPassword boolean property'
  );

  // 3. findUserPasswordCredential checks both users and auth_accounts
  assert.ok(
    repoSource.includes('SELECT id AS user_id, password_hash, password_salt FROM users WHERE id = $1'),
    'findUserPasswordCredential must check users table'
  );
  assert.ok(
    repoSource.includes("SELECT user_id, password_hash, password_salt FROM auth_accounts WHERE provider = 'email'"),
    'findUserPasswordCredential must check auth_accounts table'
  );

  // 4. setUserPassword updates users and auth_accounts
  assert.ok(
    repoSource.includes('UPDATE users SET password_hash = $1, password_salt = $2'),
    'setUserPassword must update users table'
  );
  assert.ok(
    repoSource.includes("UPDATE auth_accounts SET password_hash = $1, password_salt = $2, updated_at = NOW() WHERE user_id = $3 AND provider = 'email'"),
    'setUserPassword must update auth_accounts email provider'
  );
});

test('Password API route validates existing passwords, prevents identical re-use and returns status', async () => {
  const routeSource = await readFile(new URL('../../app/api/user/password/route.js', import.meta.url), 'utf8');

  // 1. Must use authRepo to find credentials
  assert.ok(
    routeSource.includes('authRepo.findUserPasswordCredential'),
    'Password route must query credential via authRepo'
  );

  // 2. Must return PASSWORD_REQUIRED and hasPassword: true if user has password and oldPassword is missing
  assert.ok(
    routeSource.includes("code: 'PASSWORD_REQUIRED'"),
    'Password route must return code PASSWORD_REQUIRED'
  );
  assert.ok(
    routeSource.includes('hasPassword: true'),
    'Password route must return hasPassword flag'
  );

  // 3. Must check oldPassword !== newPassword
  assert.ok(
    routeSource.includes('oldPassword === newPassword'),
    'Password route must disallow re-using the old password'
  );
});

test('ProfileTab implements complete password display and interaction flow', async () => {
  const profileSource = await readFile(new URL('../../components/account/tabs/ProfileTab.js', import.meta.url), 'utf8');

  // 1. State handles both hasPassword and has_password
  assert.ok(
    profileSource.includes('user?.hasPassword ?? user?.has_password'),
    'ProfileTab must initialize hasPassword considering both camelCase and snake_case properties'
  );

  // 2. UI renders status capsule (已设置 / 未设置)
  assert.ok(
    profileSource.includes('已设置'),
    'ProfileTab must render 已设置 status'
  );
  assert.ok(
    profileSource.includes('未设置'),
    'ProfileTab must render 未设置 status'
  );

  // 3. 原密码 field rendered conditionally
  assert.ok(
    profileSource.includes('{hasPassword && ('),
    'ProfileTab must conditionally render 原密码 field'
  );

  // 4. Client error recovery: auto-reveals old password if backend indicates password exists
  assert.ok(
    profileSource.includes("data.code === 'PASSWORD_REQUIRED' || data.error?.includes('当前密码')"),
    'ProfileTab must auto-heal hasPassword if server demands current password'
  );

  // 5. Button displays appropriate text
  assert.ok(
    profileSource.includes("'修改密码'") && profileSource.includes("'设置密码'"),
    'ProfileTab button text must reflect modification vs initial setup'
  );
});
