import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEmailDeliveryReadiness } from '../lib/services/dependencyHealth.js';

const config = { enabled: true, username: 'mailer@example.test' };
const verificationSecret = 'x'.repeat(32);

test('email readiness degrades when the auth verification secret is missing', async () => {
  let smtpCalls = 0;
  const result = await assessEmailDeliveryReadiness({
    config,
    passwordConfigured: true,
    verificationSecret: '',
    verifySmtp: async () => { smtpCalls += 1; return { status: 'healthy' }; },
  });

  assert.equal(result.status, 'degraded');
  assert.equal(result.errorCode, 'AUTH_VERIFICATION_SECRET_NOT_CONFIGURED');
  assert.equal(smtpCalls, 0);
});

test('email readiness requires configured SMTP as well as the auth verification secret', async () => {
  const result = await assessEmailDeliveryReadiness({
    config: { ...config, enabled: false },
    passwordConfigured: true,
    verificationSecret,
    verifySmtp: async () => ({ status: 'healthy' }),
  });

  assert.equal(result.status, 'degraded');
  assert.equal(result.errorCode, 'SMTP_DISABLED');
});

test('email readiness reports healthy only after verification secret and SMTP handshake succeed', async () => {
  const result = await assessEmailDeliveryReadiness({
    config,
    passwordConfigured: true,
    verificationSecret,
    verifySmtp: async () => ({ status: 'healthy', latencyMs: 12 }),
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.provider, 'smtp');
  assert.equal(result.latencyMs, 12);
});
