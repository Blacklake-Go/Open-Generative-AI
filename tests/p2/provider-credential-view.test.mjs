import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildCredentialView,
  buildExecutionView,
  buildVerificationView,
} from '../../lib/services/providerCredentialView.js';

function readRepoFile(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('环境变量来源不编造环境与变更时间，只暴露清洗后的变量名', () => {
  const view = buildCredentialView({
    snapshot: {
      configured: true,
      source: 'environment',
      secretName: 'OPENAI_API_KEY',
      // 明文即便被误传进来，展示层也不得带出去
      value: 'sk-should-never-render',
    },
    storedSecrets: [],
    envNames: ['OPENAI_API_KEY', 'lower-case', 'BROKEN-NAME', '', null, 'DASHSCOPE_API_KEY'],
  });

  assert.equal(view.source, 'environment');
  assert.equal(view.sourceLabel, '服务器环境变量');
  assert.equal(view.configured, true);
  assert.equal(view.environment, null);
  assert.equal(view.environmentLabel, '环境变量（不区分环境）');
  assert.equal(view.updatedAt, null);
  assert.equal(view.decryptStatus, 'missing');
  assert.equal(view.configState, 'configured');
  assert.deepEqual(view.envNames, ['OPENAI_API_KEY', 'DASHSCOPE_API_KEY']);
  assert.equal(view.overrideNote, null);
  assert.equal(view.readErrorNote, null);
  assert.doesNotMatch(JSON.stringify(view), /sk-should-never-render/);
});

test('加密数据库来源带上当前环境与生效密钥的变更时间', () => {
  const view = buildCredentialView({
    snapshot: {
      configured: true,
      source: 'encrypted_database',
      selectedEnvironment: 'sandbox',
      secretName: 'api_key_sandbox',
    },
    storedSecrets: [
      { name: 'api_key', updatedAt: '2026-10-01T00:00:00.000Z' },
      { name: 'api_key_sandbox', updatedAt: '2026-10-20T08:30:00.000Z' },
    ],
  });

  assert.equal(view.source, 'encrypted_database');
  assert.equal(view.sourceLabel, '加密数据库');
  assert.equal(view.environment, 'sandbox');
  assert.equal(view.environmentLabel, '沙盒');
  assert.equal(view.activeSecretName, 'api_key_sandbox');
  assert.equal(view.updatedAt, '2026-10-20T08:30:00.000Z');
  assert.equal(view.decryptStatus, 'ok');
  assert.equal(view.decryptStatusLabel, '读取正常');
  assert.equal(view.configState, 'configured');
  assert.deepEqual(view.storedSecretNames, ['api_key', 'api_key_sandbox']);
});

test('解密失败时不得沿用旧配置标志显示已配置', () => {
  const view = buildCredentialView({
    snapshot: { configured: true, source: 'environment', status: 'error' },
    storedSecrets: [{ name: 'api_key', updatedAt: '2026-10-01T00:00:00.000Z' }],
  });

  assert.equal(view.configured, false);
  assert.equal(view.readError, true);
  assert.equal(view.source, 'none');
  assert.equal(view.sourceLabel, '读取异常');
  assert.equal(view.configState, 'read_error');
  assert.equal(view.decryptStatus, 'error');
  assert.equal(view.decryptStatusLabel, '解密 / 读取失败');
  assert.ok(view.readErrorNote);
  assert.equal(view.overrideNote, null);
});

test('环境变量生效且库内另有存盘时给出覆盖提示', () => {
  const view = buildCredentialView({
    snapshot: { configured: true, source: 'environment' },
    storedSecrets: [{ name: 'api_key', updatedAt: '2026-09-30T12:00:00.000Z' }],
  });

  assert.equal(view.source, 'environment');
  assert.equal(view.hasStoredSecret, true);
  assert.equal(view.decryptStatus, 'unknown');
  assert.equal(view.updatedAt, null);
  assert.ok(view.overrideNote);
  assert.match(view.overrideNote, /保存新密钥不会切换执行凭据/);
});

test('未配置与读取失败是两种状态，不能合并成同一个「不可用」', () => {
  const missing = buildCredentialView({ snapshot: { configured: false, status: 'missing' } });
  assert.equal(missing.configured, false);
  assert.equal(missing.readError, false);
  assert.equal(missing.sourceLabel, '未配置');
  assert.equal(missing.configState, 'unconfigured');
  assert.equal(missing.readErrorNote, null);
});

test('仅校验凭据的探针只能给出配置级状态，不能升级为鉴权已验证', () => {
  const verification = buildVerificationView({
    credential: {
      configured: true,
      configState: 'configured',
      updatedAt: '2026-10-20T08:30:00.000Z',
      readError: false,
    },
    probe: {
      probeKind: 'credential',
      checkedAt: '2026-10-28T02:00:00.000Z',
      // 即使历史字段为 healthy，credential 探针没有网络往返，也不能算鉴权通过
      healthStatus: 'healthy',
      status: 'healthy',
    },
  });

  assert.equal(verification.auth.state, 'credential_only');
  assert.equal(verification.auth.stateLabel, '仅凭据校验');
  assert.notEqual(verification.auth.state, 'verified');
  assert.equal(verification.auth.tone, 'warning');
  assert.match(verification.auth.note, /未请求上游鉴权/);
});

test('HTTP 探针与生成记录按各自证据独立定级', () => {
  const healthy = buildVerificationView({
    credential: { configured: true, configState: 'configured', readError: false },
    probe: { probeKind: 'http', checkedAt: '2026-10-28T02:00:00.000Z', healthStatus: 'healthy' },
    generation: { lastSuccessAt: '2026-10-27T10:00:00.000Z' },
  });
  assert.equal(healthy.auth.state, 'verified');
  assert.equal(healthy.generation.state, 'verified');
  assert.equal(healthy.generation.at, '2026-10-27T10:00:00.000Z');

  const failed = buildVerificationView({
    credential: { configured: true, configState: 'configured', readError: false },
    probe: { probeKind: 'http', checkedAt: '2026-10-28T02:00:00.000Z', healthStatus: 'degraded' },
    generation: { lastAttemptAt: '2026-10-27T10:00:00.000Z' },
  });
  assert.equal(failed.auth.state, 'failed');
  assert.equal(failed.generation.state, 'failed');
  assert.equal(failed.generation.stateLabel, '未通过');

  const untouched = buildVerificationView({
    credential: { configured: true, configState: 'configured', readError: false },
  });
  assert.equal(untouched.auth.state, 'unverified');
  assert.equal(untouched.generation.state, 'unverified');
  assert.equal(untouched.auth.at, null);
});

test('模型权限没有持久化证据时保持未知，而不是默认通过', () => {
  const verification = buildVerificationView({
    credential: { configured: true, configState: 'configured', readError: false },
  });

  assert.equal(verification.modelAccess.state, 'unknown');
  assert.equal(verification.modelAccess.stateLabel, '未知');
  assert.equal(verification.modelAccess.tone, 'neutral');
  assert.equal(verification.modelAccess.at, null);
});

test('后台页面、刷新接口与保存接口都把来源、存盘记录和环境变量名交给客户端', () => {
  const page = readRepoFile('app/admin/models/providers/page.js');
  const route = readRepoFile('app/api/admin/models/providers/route.js');
  const client = readRepoFile('app/admin/models/providers/ProvidersManagerClient.jsx');

  for (const source of [page, route]) {
    assert.match(source, /credential/);
    assert.match(source, /storedSecrets:\s*secrets/);
    assert.match(source, /envNames:/);
    assert.match(source, /hasApiKey:\s*credential\.configured/);
  }

  // 页面仍需保留掩码计算，避免把明文交给客户端
  assert.match(page, /maskSecretKey/);
  assert.doesNotMatch(page, /apiKey:\s*(?:getServerProviderApiKey|process\.env)/);

  assert.match(client, /<CredentialVerificationPanel channel=\{c\} \/>/);
  assert.match(client, /<CredentialSourceHint provider=\{editingProvider\} \/>/);
  assert.match(client, /buildVerificationView/);
});

test('最近一次执行与当前生效密钥一致时才算已用于实际执行', () => {
  const applied = buildExecutionView({
    credential: {
      source: 'encrypted_database',
      configured: true,
      activeSecretName: 'api_key',
      updatedAt: '2026-10-20T08:30:00.000Z',
    },
    lastAttemptAt: '2026-10-28T02:00:00.000Z',
    lastAttemptCredentialSource: 'encrypted_database',
    lastAttemptSecretName: 'api_key',
  });

  assert.equal(applied.state, 'applied');
  assert.equal(applied.label, '已用于实际执行');
  assert.equal(applied.tone, 'success');
  assert.equal(applied.secretMatches, true);
  assert.equal(applied.attemptedSource, 'encrypted_database');
  assert.equal(applied.attemptedSourceLabel, '加密数据库');
  assert.equal(applied.at, '2026-10-28T02:00:00.000Z');
});

test('执行记录指向的密钥与当前生效密钥不同时标记为仍在用旧配置', () => {
  const stale = buildExecutionView({
    credential: {
      source: 'encrypted_database',
      configured: true,
      activeSecretName: 'api_key_sandbox',
      updatedAt: '2026-10-20T08:30:00.000Z',
    },
    lastAttemptAt: '2026-10-28T02:00:00.000Z',
    lastAttemptCredentialSource: 'encrypted_database',
    lastAttemptSecretName: 'api_key',
  });

  assert.equal(stale.state, 'stale');
  assert.equal(stale.tone, 'warning');
  assert.equal(stale.secretMatches, false);
  assert.match(stale.note, /api_key_sandbox/);
});

test('执行早于密钥变更时间且没有可比密钥名时保持未生效', () => {
  const pending = buildExecutionView({
    credential: {
      source: 'encrypted_database',
      configured: true,
      activeSecretName: 'api_key',
      updatedAt: '2026-10-28T09:00:00.000Z',
    },
    lastAttemptAt: '2026-10-28T02:00:00.000Z',
    lastAttemptCredentialSource: 'encrypted_database',
  });

  assert.equal(pending.state, 'pending');
  assert.equal(pending.tone, 'warning');
  assert.equal(pending.secretMatches, null);
  assert.match(pending.note, /新配置尚未被执行使用/);
});

test('环境变量覆盖数据库后，仍按数据库来源执行的记录不能算已生效', () => {
  const stale = buildExecutionView({
    credential: {
      source: 'environment',
      configured: true,
      activeSecretName: null,
      updatedAt: null,
    },
    lastAttemptAt: '2026-10-27T02:00:00.000Z',
    lastAttemptCredentialSource: 'encrypted_database',
    lastAttemptSecretName: 'api_key',
  });

  assert.equal(stale.state, 'stale');
  assert.equal(stale.attemptedSourceLabel, '加密数据库');
  assert.match(stale.note, /当前生效来源是服务器环境变量/);

  const sameSource = buildExecutionView({
    credential: { source: 'environment', configured: true },
    lastAttemptAt: '2026-10-27T02:00:00.000Z',
    lastAttemptCredentialSource: 'environment',
  });
  // 环境变量的变更时间不落库，只能证明来源一致，不能再升级成版本已验证
  assert.equal(sameSource.state, 'applied');
  assert.match(sameSource.note, /无法比较具体版本/);
});

test('历史执行没有来源留痕时保持未记录，不默认已生效', () => {
  const view = buildExecutionView({
    credential: { source: 'encrypted_database', configured: true, activeSecretName: 'api_key' },
    lastAttemptAt: '2026-10-01T00:00:00.000Z',
  });

  assert.equal(view.state, 'unknown');
  assert.equal(view.tone, 'neutral');
  assert.equal(view.attemptedSource, null);
  assert.equal(view.attemptedSourceLabel, null);
  assert.match(view.note, /来源留痕/);
});

test('从未执行、无凭据与凭据读错是三种不同的执行状态', () => {
  const unexecuted = buildExecutionView({
    credential: { source: 'encrypted_database', configured: true, activeSecretName: 'api_key' },
  });
  assert.equal(unexecuted.state, 'unexecuted');
  assert.equal(unexecuted.tone, 'neutral');
  assert.equal(unexecuted.at, null);

  const none = buildExecutionView({
    credential: { source: 'none', configured: false },
    lastAttemptAt: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(none.state, 'none');
  assert.equal(none.tone, 'warning');
  assert.equal(none.attemptedSource, null);

  const readError = buildExecutionView({
    credential: { source: 'none', configured: false, readError: true },
    lastAttemptAt: '2026-10-01T00:00:00.000Z',
    lastAttemptCredentialSource: 'encrypted_database',
  });
  assert.equal(readError.state, 'unknown');
  assert.equal(readError.tone, 'danger');
  assert.match(readError.note, /读取失败/);
});

test('执行留痕由 attempt 元数据承载，后台面板消费同一份 buildExecutionView', () => {
  const generation = readRepoFile('lib/services/generationCore.js');
  const providers = readRepoFile('lib/repositories/providers.js');
  const breaker = readRepoFile('lib/services/circuitBreaker.js');
  const client = readRepoFile('app/admin/models/providers/ProvidersManagerClient.jsx');

  // 写入端只记录来源与密钥名，不得把密钥值写进 attempt 元数据
  assert.match(generation, /getServerProviderCredentialStatus/);
  assert.match(generation, /credentialSource:\s*attemptCredential\.source/);
  assert.match(generation, /credentialSecretName:\s*attemptCredential\.secretName/);
  assert.doesNotMatch(generation, /credentialValue|apiKeyValue/);

  // 读取端取最新一条 attempt 的留痕，不能跨行取最大值冒充
  assert.match(providers, /metadata_json->>'credentialSource'/);
  assert.match(providers, /metadata_json->>'credentialSecretName'/);
  assert.match(providers, /ORDER BY created_at DESC/);
  assert.match(breaker, /lastAttemptCredentialSource/);
  assert.match(breaker, /lastAttemptCredentialSecretName/);

  assert.match(client, /buildExecutionView/);
  assert.match(client, /lastAttemptCredentialSource: channel\.lastAttemptCredentialSource/);
  assert.match(client, /实际执行/);
});
