import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;
process.env.AUTH_VERIFICATION_CODE_SECRET = 'isolated-auth-e2e-secret-at-least-32-bytes';
process.env.PUBLIC_APP_URL = 'http://127.0.0.1:3100';

const db = await import('../../lib/db/index.js');
const requestGuard = await import('../../lib/security/requestGuard.js');
const { requestEmailRegisterCode } = await import('../../lib/services/emailVerification.js');
const { requestEmailPasswordReset } = await import('../../lib/services/passwordReset.js');
const authService = await import('../../lib/services/auth.js');
const registerRoute = await import('../../app/api/auth/register/route.js');
const loginRoute = await import('../../app/api/auth/login/route.js');
const logoutRoute = await import('../../app/api/auth/logout/route.js');
const resetPasswordRoute = await import('../../app/api/auth/password/reset/email/route.js');

const origin = 'http://127.0.0.1:3100';
const clientIp = `198.51.100.${crypto.randomInt(1, 250)}`;

function nextRequest(path, method, body, token = null) {
  const headers = new Headers({
    Origin: origin,
    'X-Forwarded-For': clientIp,
    'Content-Type': 'application/json',
  });
  if (token) headers.set('Cookie', `ko_session=${token}`);
  return new NextRequest(new URL(path, origin), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function userFromToken(token) {
  return authService.getUserFromRequest(nextRequest('/api/auth/me', 'GET', undefined, token));
}

test('isolated email registration, login, password recovery, and logout complete through API handlers', { skip: !testUrl }, async () => {
  const email = `auth-flow-${crypto.randomUUID()}@example.test`;
  const password = 'Koyo-flow-original-123';
  const newPassword = 'Koyo-flow-recovered-456';
  let registrationCode = '';
  let resetCode = '';
  let userId = null;
  const inviteCodeId = `auth_flow_invite_${crypto.randomUUID()}`;
  const inviteCode = `AUTH-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;

  try {
    await db.execute(`INSERT INTO ai_studio.invite_codes
      (id,code,max_uses,used_count,status,notes,created_by)
      VALUES ($1,$2,1,0,'active','isolated auth flow test','test')`, [inviteCodeId, inviteCode]);
    const codeRequest = await requestEmailRegisterCode({
      email,
      requestIp: clientIp,
      locale: 'en',
      sendCode: async ({ to, code, locale }) => {
        assert.equal(to, email);
        assert.equal(locale, 'en');
        registrationCode = code;
      },
    });
    assert.equal(codeRequest.success, true);
    assert.match(registrationCode, /^\d{6}$/);

    const wrongCode = registrationCode === '000000' ? '111111' : '000000';
    const rejected = await registerRoute.POST(nextRequest('/api/auth/register', 'POST', {
      email,
      password,
      code: wrongCode,
      inviteCode,
    }));
    assert.equal(rejected.status, 400, JSON.stringify(await rejected.json()));
    assert.equal(rejected.cookies.get('ko_session')?.value || '', '');

    const registered = await registerRoute.POST(nextRequest('/api/auth/register', 'POST', {
      email,
      password,
      code: registrationCode,
      inviteCode,
    }));
    assert.equal(registered.status, 200);
    const registeredBody = await registered.json();
    userId = registeredBody.user?.id;
    assert.ok(userId);
    assert.equal(registeredBody.user.email, email);
    const registrationToken = registered.cookies.get('ko_session')?.value;
    assert.ok(registrationToken);
    assert.equal((await userFromToken(registrationToken))?.id, userId);

    const wrongLogin = await loginRoute.POST(nextRequest('/api/auth/login', 'POST', {
      identifier: email,
      password: 'Koyo-flow-wrong-password',
    }));
    assert.equal(wrongLogin.status, 401);

    const loggedIn = await loginRoute.POST(nextRequest('/api/auth/login', 'POST', {
      identifier: email,
      password,
    }));
    assert.equal(loggedIn.status, 200);
    const loginToken = loggedIn.cookies.get('ko_session')?.value;
    assert.ok(loginToken);
    assert.equal((await userFromToken(loginToken))?.id, userId);

    const resetRequest = await requestEmailPasswordReset({
      email,
      ip: clientIp,
      locale: 'en',
      sendResetEmail: async ({ to, code, userId: mailUserId, locale }) => {
        assert.equal(to, email);
        assert.equal(mailUserId, userId);
        assert.equal(locale, 'en');
        resetCode = code;
      },
    });
    assert.equal(resetRequest.success, true);
    assert.match(resetCode, /^\d{6}$/);

    const reset = await resetPasswordRoute.POST(nextRequest('/api/auth/password/reset/email', 'POST', {
      email,
      code: resetCode,
      newPassword,
    }));
    assert.equal(reset.status, 200);
    assert.equal((await userFromToken(registrationToken)), null);
    assert.equal((await userFromToken(loginToken)), null);

    const oldPasswordLogin = await loginRoute.POST(nextRequest('/api/auth/login', 'POST', {
      identifier: email,
      password,
    }));
    assert.equal(oldPasswordLogin.status, 401);

    const recoveredLogin = await loginRoute.POST(nextRequest('/api/auth/login', 'POST', {
      identifier: email,
      password: newPassword,
    }));
    assert.equal(recoveredLogin.status, 200);
    const recoveredToken = recoveredLogin.cookies.get('ko_session')?.value;
    assert.ok(recoveredToken);
    assert.equal((await userFromToken(recoveredToken))?.id, userId);

    const logout = await logoutRoute.POST(nextRequest('/api/auth/logout', 'POST', undefined, recoveredToken));
    assert.equal(logout.status, 200);
    assert.equal((await userFromToken(recoveredToken)), null);
  } finally {
    if (userId) {
      await db.execute('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
      await db.execute('DELETE FROM user_id_allocations WHERE user_id = $1', [userId]).catch(() => {});
    }
    await db.execute('DELETE FROM ai_studio.invite_codes WHERE id = $1', [inviteCodeId]).catch(() => {});
    await db.execute('DELETE FROM sys_core.auth_verification_codes WHERE target = $1', [email]).catch(() => {});
    await requestGuard.resetRateLimitBucket({ scope: 'auth_register_ip', subject: clientIp }).catch(() => {});
    await requestGuard.resetRateLimitBucket({ scope: 'auth_login_ip', subject: clientIp }).catch(() => {});
  }
});

test.after(async () => {
  await db.closePgPool();
});
