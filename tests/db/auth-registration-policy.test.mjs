import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const auth = await import('../../lib/services/auth.js');
const settingsRepo = await import('../../lib/repositories/settings.js');

test('registration pause blocks new phone and OAuth accounts but preserves existing sign-in', { skip: !testUrl }, async () => {
  const originalSetting = await settingsRepo.getSettingByKey('registration_enabled');
  const originalValue = originalSetting?.value ?? { enabled: true, allow_oauth: true };
  const phone = '+12025550123'; // Reserved fictional NANP number; random exchanges may be invalid.
  const provider = 'test-oauth-registration-policy';
  const newProviderUserId = crypto.randomUUID();
  const existingProviderUserId = crypto.randomUUID();
  const createdUserIds = new Set();

  async function saveRegistrationSetting(value) {
    await db.execute(
      `UPDATE ops_bill.system_settings SET value_json = $1::jsonb, updated_at = now() WHERE key = 'registration_enabled'`,
      [JSON.stringify(value)],
    );
  }

  try {
    const existingPhoneUser = await auth.findOrCreateUserByPhone({ phone, countryCode: '+1', ip: '198.51.100.20' });
    assert.ok(existingPhoneUser.user?.id);
    createdUserIds.add(existingPhoneUser.user.id);
    assert.equal(existingPhoneUser.isNew, true);

    const existingOAuthUser = await auth.createOAuthUser({
      provider,
      providerUserId: existingProviderUserId,
      email: `${crypto.randomUUID()}@example.test`,
      emailVerified: true,
      displayName: 'Existing OAuth Test User',
      ip: '198.51.100.21',
    });
    assert.ok(existingOAuthUser.id);
    createdUserIds.add(existingOAuthUser.id);

    await saveRegistrationSetting({ ...originalValue, enabled: false });

    const blockedPhoneRegistration = await auth.findOrCreateUserByPhone({
      phone: '+12025550124',
      countryCode: '+1',
      ip: '198.51.100.22',
    });
    assert.equal(blockedPhoneRegistration.error, 'REGISTRATION_DISABLED');

    const blockedOAuthRegistration = await auth.createOAuthUser({
      provider,
      providerUserId: newProviderUserId,
      email: `${crypto.randomUUID()}@example.test`,
      emailVerified: true,
      displayName: 'Blocked OAuth Test User',
      ip: '198.51.100.23',
    });
    assert.equal(blockedOAuthRegistration.error, 'REGISTRATION_DISABLED');

    const existingPhoneLogin = await auth.findOrCreateUserByPhone({ phone, countryCode: '+1', ip: '198.51.100.24' });
    assert.equal(existingPhoneLogin.user?.id, existingPhoneUser.user.id);
    assert.equal(existingPhoneLogin.isNew, false);

    const existingOAuthLogin = await auth.createOAuthUser({
      provider,
      providerUserId: existingProviderUserId,
      ip: '198.51.100.25',
    });
    assert.equal(existingOAuthLogin.id, existingOAuthUser.id);
  } finally {
    await saveRegistrationSetting(originalValue).catch(() => {});
    for (const userId of createdUserIds) {
      await db.execute('DELETE FROM auth_usr.users WHERE id = $1', [userId]).catch(() => {});
      await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id = $1', [userId]).catch(() => {});
    }
  }
});

test.after(async () => {
  await db.closePgPool();
});
