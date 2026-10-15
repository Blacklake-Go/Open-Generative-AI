import test from 'node:test';
import assert from 'node:assert/strict';
import { findSecretFindings } from '../../scripts/secret-scan-rules.mjs';

test('secret scanner detects a PostgreSQL URL without returning the credential value', () => {
  const password = 'db-pass-with-visible-contents';
  const findings = findSecretFindings(`const DATABASE_URL = 'postgresql://app:${password}@db.internal:5432/supdance';`);

  assert.ok(findings.includes('postgres-connection-string'));
  assert.ok(!findings.join(' ').includes(password));
});

test('secret scanner detects common provider key formats and private keys', () => {
  const source = [
    'AKIA1234567890ABCDEF',
    'LTAI1234567890abcdef',
    'AKID1234567890abcdef1234567890abcdef',
    'AIza1234567890abcdefghij1234567890ABCDE',
    '-----BEGIN PRIVATE KEY-----',
  ].join('\n');
  const findings = findSecretFindings(source);

  assert.ok(findings.includes('aws-access-key-id'));
  assert.ok(findings.includes('aliyun-access-key-id'));
  assert.ok(findings.includes('tencent-secret-id'));
  assert.ok(findings.includes('google-api-key'));
  assert.ok(findings.includes('private-key'));
  assert.ok(!findings.join(' ').includes('1234567890'));
});

test('secret scanner flags high-entropy values assigned to credential-like names', () => {
  const secret = 'K8m2R4v9Q1x7B3n6P0w5Z2a8D4h1L9s7';
  const findings = findSecretFindings(`storage_secret_key: '${secret}'`);

  assert.ok(findings.includes('high-entropy-credential-assignment'));
  assert.ok(!findings.join(' ').includes(secret));
});

test('secret scanner ignores environment lookups and low-entropy placeholders', () => {
  const findings = findSecretFindings([
    'const secret = process.env.PROVIDER_SECRET;',
    "const api_key = 'replace_me_with_a_real_key';",
    "const password = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';",
  ].join('\n'));

  assert.deepEqual(findings, []);
});
