import test from 'node:test';
import assert from 'node:assert/strict';
import { getServerProviderApiKey, getServerProviderCredentialStatus } from '../lib/services/providerSecrets.js';

test('credential execution and status share the same environment precedence without returning secret fragments', async () => {
  const options = { provider: 'runninghub', env: { RUNNINGHUB_API_KEY: 'isolated-test-value' }, readSecret: () => { throw new Error('database must not override environment'); } };
  assert.equal(await getServerProviderApiKey(options), 'isolated-test-value');
  const status = await getServerProviderCredentialStatus(options);
  assert.equal(status.source, 'environment');
  assert.equal(status.configured, true);
  assert.equal(status.upstreamValidation, 'not_checked');
  assert.doesNotMatch(JSON.stringify(status), /isolated|test-value|value/);
});

test('sandbox selection, missing secrets and unreadable secrets remain distinguishable', async () => {
  const common = { provider: 'muapi', env: {}, keyEnvironment: async () => 'sandbox' };
  const status = await getServerProviderCredentialStatus({ ...common, readSecret: async (provider, name) => {
    assert.equal(name, 'api_key_sandbox');
    return { value: 'fixture-only', status: 'ok' };
  } });
  assert.equal((await getServerProviderCredentialStatus({ ...common, keyEnvironment: async () => { throw new Error('database unavailable'); } })).status, 'error');
  assert.equal(status.source, 'encrypted_database');
  assert.equal(status.selectedEnvironment, 'sandbox');
  assert.equal((await getServerProviderCredentialStatus({ ...common, readSecret: async () => ({ value: null, status: 'error' }) })).status, 'error');
  assert.equal((await getServerProviderCredentialStatus({ ...common, readSecret: async () => ({ value: null, status: 'missing' }) })).status, 'missing');
});
