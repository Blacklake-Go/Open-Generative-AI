import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardSameOrigin } from '../../lib/security/requestGuard.js';
import { resolveProviderApiKey } from '../../lib/security/byok.js';
import {
  authorizeScopedProxyPath,
  authorizeCreativeAgentProxyPath,
  classifyProxyRequest,
  isCreativeAgentInferenceRequest,
  POLICY,
  PROXY_SCOPE,
} from '../../lib/security/legacyProxyPolicy.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function source(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function sourceFilesUnder(relativeDirectory) {
  const root = path.join(repoRoot, relativeDirectory);
  const files = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) files.push(absolute);
    }
  }
  await walk(root);
  return Promise.all(files.map(async (absolute) => ({ absolute, content: await fs.readFile(absolute, 'utf8') })));
}

test('P0 closes the legacy direct succeeded-creation write path', async () => {
  const route = await source('app/api/creations/route.js');
  assert.match(route, /status:\s*410/);
  assert.doesNotMatch(route, /recordCreation/);
});

test('P0 exposes liveness/readiness and durable rate limiting', async () => {
  assert.match(await source('app/api/live/route.js'), /status:\s*['"]live['"]/);
  assert.match(await source('app/api/ready/route.js'), /status:\s*result\.ready\s*\?\s*200\s*:\s*503/);
  assert.match(await source('app/api/health/route.js'), /\[result\.worker, result\.storage, result\.email, result\.modelProviders\]\.every/);
  assert.match(await source('app/api/ready/route.js'), /storage:\s*result\.storage/);
  assert.match(await source('app/api/ready/route.js'), /email:\s*result\.email/);
  assert.match(await source('app/api/ready/route.js'), /providers:\s*result\.providers/);
  assert.match(await source('lib/services/systemHealth.js'), /worker\.status\s*===\s*'healthy'/);
  assert.match(await source('lib/db/migrations/010_security_baseline.sql'), /rate_limit_buckets/);
  assert.match(await source('lib/security/requestGuard.js'), /consumeRateLimit/);
});

test('P1 rate limits sensitive user writes by authenticated account', async () => {
  const contracts = [
    ['app/api/community/posts/[id]/comments/route.js', 'community_comment_user', 30],
    ['app/api/community/posts/[id]/like/route.js', 'community_like_user', 120],
    ['app/api/community/posts/[id]/remix/route.js', 'community_remix_user', 60],
    ['app/api/creations/report/route.js', 'creation_report_user', 10],
    ['app/api/user/follow/route.js', 'user_follow_user', 120],
    ['app/api/user/password/route.js', 'user_password_change', 10],
    ['app/api/generation/quote/route.js', 'generation_quote_user', 60],
    ['app/api/user/profile/route.js', 'user_profile_update', 60],
    ['app/api/user/deactivate/route.js', 'user_deactivate', 3],
    ['app/api/user/preferences/route.js', 'user_preferences_update', 120],
    ['app/api/user/privacy/route.js', 'user_privacy_update', 60],
    ['app/api/user/avatar-frame/route.js', 'user_avatar_frame', 60],
    ['app/api/financial/credits/checkin/route.js', 'credit_checkin_user', 10],
    ['app/api/financial/currency/password/route.js', 'currency_pay_password_update', 10],
    ['app/api/financial/currency/transfer/route.js', 'currency_transfer_user', 10],
    ['app/api/financial/currency/rewards/route.js', 'currency_reward_user', 30],
    ['app/api/creations/route.js', 'creation_delete_user', 60],
    ['app/api/community/posts/[id]/route.js', 'community_post_delete_user', 30],
    ['app/api/user/email/route.js', 'user_email_binding', 10],
    ['app/api/user/phone/route.js', 'user_phone_binding', 10],
    ['app/api/user/oauth/[provider]/route.js', 'user_oauth_unbind', 10],
  ];
  for (const [relativePath, scope, limit] of contracts) {
    const route = await source(relativePath);
    assert.match(route, /consumeRateLimit/);
    assert.match(route, /rateLimitResponse/);
    assert.match(route, new RegExp(`scope:\\s*['"]${scope}['"]`));
    assert.match(route, /subject:\s*user\.id/);
    assert.match(route, new RegExp(`limit:\\s*${limit}\\b`));
  }
});

test('P0 verifies the existing payment password before replacing it', async () => {
  const route = await source('app/api/financial/currency/password/route.js');
  const service = await source('lib/financial/currencyService.js');
  assert.match(route, /setPayPassword\(user\.id,\s*password,\s*String\(body\.currentPassword/);
  assert.match(route, /error\?\.code === 'RATE_LIMITED'[\s\S]*rateLimitResponse/);
  assert.match(service, /PAY_PASSWORD_CURRENT_REQUIRED/);
  assert.match(service, /verifyPayPasswordHash\(currentPassword, wallet\.pay_password_hash, wallet\.pay_password_salt\)/);
  assert.match(service, /PAY_PASSWORD_INVALID/);
  assert.match(service, /payPasswordFailureScope\(userId\)/);
});

test('P0 keeps detailed health diagnostics behind the admin endpoint', async () => {
  const publicHealth = await source('app/api/health/route.js');
  const publicReady = await source('app/api/ready/route.js');
  const adminHealth = await source('app/api/admin/health/route.js');
  assert.doesNotMatch(publicHealth, /pool|pending|drifted|providerId|apiKey/);
  assert.doesNotMatch(publicReady, /pending|drifted|latest/);
  assert.doesNotMatch(publicReady, /liveWorkers|queuedCount|staleProcessingCount/);
  assert.doesNotMatch(publicReady, /errorCode|latencyMs|providerId|apiKey/);
  assert.doesNotMatch(publicHealth, /errorCode|latencyMs|providerId|apiKey/);
  assert.doesNotMatch(publicReady, /@\/lib\/db/);
  assert.match(adminHealth, /requirePermission/);
  assert.match(adminHealth, /getSystemHealth/);
});

test('P1 keeps app and component code behind the application-service boundary', async () => {
  const files = [...await sourceFilesUnder('app'), ...await sourceFilesUnder('components')];
  // Each entry is a reviewed, narrow repository read (no raw lib/db import) that still
  // needs an application-service facade. Do not grow this list without the same review.
  const reviewedRouteExceptions = new Set([
    'app/admin/cost-center/page.js',
    'app/admin/health/page.js',
    'app/admin/models/frontend/page.js',
    'app/admin/models/page.js',
    'app/admin/models/pricing/page.js',
    'app/admin/models/registry/page.js',
    'app/admin/models/routing/page.js',
    'app/admin/profit-center/page.js',
    'app/api/admin/cost-center/route.js',
    'app/api/admin/models/control/route.js',
    'app/api/admin/profit-center/route.js',
    'app/api/admin/routing/[modelId]/channels/route.js',
    'app/api/admin/routing/route.js',
    'app/api/admin/seo/push/route.js',
    'app/admin/models/providers/page.js',
    'app/api/admin/models/providers/route.js',
    'app/api/admin/security/sessions/[hash]/route.js',
    'app/api/user/password/route.js',
    'app/api/admin/models/frontend/route.js',
    'app/api/canvas/jobs/[id]/route.js',
    'app/api/canvas/jobs/route.js',
    'app/api/canvas/projects/[id]/route.js',
    'app/api/canvas/projects/[id]/share/route.js',
    'app/api/canvas/projects/route.js',
    'app/api/canvas/shares/[token]/assets/[id]/content/route.js',
    'app/api/canvas/shares/[token]/route.js',
    'app/api/generations/route.js',
  ]);
  const violations = files
    .filter(({ content }) => /@\/lib\/(repositories|db)|lib\/(repositories|db)/.test(content))
    .map(({ absolute }) => path.relative(repoRoot, absolute))
    .filter((file) => !reviewedRouteExceptions.has(file));
  assert.deepEqual(violations, []);
});

test('P1 confines legacy pricing-control SQL to the reviewed service allowlist', async () => {
  const files = await sourceFilesUnder('lib/services');
  const violations = files
    .filter(({ content }) => /\b(?:query|queryOne|queryMany|execute)\s*\(/.test(content)
      || /tx\.(?:query|queryOne|queryMany|execute)\s*\(/.test(content)
      || /import\s*\{[^}]*\b(?:query|queryOne|queryMany|execute)\b[^}]*\}\s*from\s*['"][^'"]*\/db/.test(content))
    .map(({ absolute }) => path.relative(repoRoot, absolute));
  // These established service workflows currently own multi-step DB transactions or
  // direct catalog reads. Keep the exception narrow and visible until repository
  // extraction can move them atomically; do not add a file without that review.
  assert.deepEqual(violations.sort(), [
    'lib/services/channelSync.js',
    'lib/services/exchangeRates.js',
    'lib/services/generationCore.js',
    'lib/services/generationReconciliation.js',
    'lib/services/modelBrands.js',
    'lib/services/modelHygiene.js',
    'lib/services/modelPriceImport.js',
    'lib/services/modelPricingControl.js',
    'lib/services/modelPublication.js',
    'lib/services/modelTelemetry.js',
    'lib/services/settings.js',
    'lib/services/storageAdmin.js',
    'lib/services/storageMigration.js',
    'lib/services/userDashboard.js',
    'lib/services/userDeletion.js',
  ].sort());
});

test('P1 keeps routes on explicit application-service imports', async () => {
  const files = await sourceFilesUnder('app');
  const violations = files
    .filter(({ content }) => /lib\/billing(?:['"]|[./])/.test(content))
    .map(({ absolute }) => path.relative(repoRoot, absolute));
  assert.deepEqual(violations, []);
  const authService = await source('lib/services/auth.js');
  const authRepository = await source('lib/repositories/auth.js');
  assert.match(authService, /from ['"]\.\.\/repositories\/auth\.js['"]/);
  assert.match(authService, /withTransaction\(async \(tx\) =>/);
  assert.match(authRepository, /FROM users WHERE/);
  assert.match(authRepository, /WHERE s\.token_hash = \$1 AND s\.revoked_at IS NULL/);
});

test('P0 does not expose raw exception text or upstream error bodies from API routes', async () => {
  const allowedExceptions = new Set([
    'app/api/canvas/projects/[id]/route.js',
    'app/api/canvas/projects/route.js',
    'app/api/user/cancel-deletion/route.js',
    'app/api/user/deactivate/route.js',
  ]);
  const files = await sourceFilesUnder('app/api');
  const violations = files
    .filter(({ content }) => /error\.message|details:\s*error|new Response\(errorText|return .*errorText/.test(content))
    .map(({ absolute }) => path.relative(repoRoot, absolute))
    .filter((file) => !allowedExceptions.has(file));
  assert.deepEqual(violations, []);
});

test('P0 public error mapping only permits bounded, known business errors', async () => {
  const { publicErrorMessage } = await import('../../lib/security/publicError.js');
  assert.equal(publicErrorMessage(Object.assign(new Error('额度不足'), { code: 'INSUFFICIENT_CREDITS' }), 'fallback'), '额度不足');
  assert.equal(publicErrorMessage(Object.assign(new Error('postgres://user:secret@db/app'), { code: 'INSUFFICIENT_CREDITS' }), 'fallback'), 'fallback');
  assert.equal(publicErrorMessage(Object.assign(new Error('provider internals'), { code: 'UNKNOWN_PROVIDER_ERROR' }), 'fallback'), 'fallback');
});

test('P0 removes startup dotenv fallback and gates production mocks', async () => {
  const startup = await source('scripts/require-database-url.mjs');
  assert.doesNotMatch(startup, /\.env\.local|readFileSync|process\.cwd/);
  assert.match(await source('lib/services/generationProviders.js'), /MOCK_PROVIDER_DISABLED/);
  assert.match(await source('lib/sms.js'), /SMS_SECRET_NOT_CONFIGURED/);
  const providerRepository = await source('lib/repositories/providers.js');
  assert.match(providerRepository, /PROVIDER_SECRETS_ENCRYPTION_KEY/);
  assert.match(providerRepository, /PROVIDER_SECRET_KEY_REQUIRED/);
  assert.doesNotMatch(providerRepository, /supdance_secret_session_production_key/);
});

test('P0 closes hardcoded database fallbacks in operational scripts', async () => {
  for (const relativePath of [
    'scripts/run-prod-migration-safe.mjs',
    'scripts/test-worker-cycle.mjs',
    'scripts/release-safety-check.mjs',
  ]) {
    const script = await source(relativePath);
    assert.doesNotMatch(script, /process\.env\.DATABASE_URL\s*\|\|\s*['"`]postgres(?:ql)?:\/\//, `${relativePath} must not contain a hardcoded database fallback`);
  }
  const migration = await source('scripts/run-prod-migration-safe.mjs');
  assert.match(migration, /DATABASE_URL is required for production migration/);
  assert.match(migration, /checksum drift is deliberately not repaired/i);
});

test('P0 rejects a supplied cross-origin mutation', () => {
  const response = guardSameOrigin(new Request('https://app.example/api/auth/login', {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
  }));
  assert.equal(response?.status, 403);

  const canvasResponse = guardSameOrigin(new Request('https://www.supdance.com/api/auth/login', {
    method: 'POST',
    headers: { Origin: 'https://canvas.supdance.com' },
  }));
  assert.equal(canvasResponse, null);
});

test('P0 health rendering degrades instead of assuming database fields exist', async () => {
  const dashboard = await source('app/admin/health/SystemHealthDashboard.jsx');
  const health = await source('lib/services/systemHealth.js');
  assert.match(dashboard, /pool\.idle \?\? 0/);
  assert.match(health, /healthCheck\(\)\.catch/);
  assert.match(health, /getMigrationStatus\(\)\.catch/);
});

test('P0 keeps generation work durable and provider credentials server-side', async () => {
  const worker = await source('scripts/generation-worker.mjs');
  const workerService = await source('lib/services/taskWorker.js');
  const workerRepo = await source('lib/repositories/creations.js');
  const generation = await source('app/api/generations/route.js');
  const legacyProxy = await source('app/api/api/v1/[[...path]]/route.js');
  assert.match(worker, /runGenerationWorkerOnce/);
  assert.match(worker, /closePgPool/);
  assert.match(workerService, /listQueuedGenerationIds/);
  assert.match(workerRepo, /WHERE status = 'queued'/);
  assert.match(generation, /GENERATION_ASYNC/);
  assert.match(legacyProxy, /findCreationById/);
  assert.doesNotMatch(legacyProxy, /getApiKey\(request\)/);
});

test('P0 applies mutation body and origin guards to legacy upstream proxies', async () => {
  for (const relativePath of [
    'app/api/agents/[[...path]]/route.js',
    'app/api/app/[[...path]]/route.js',
    'app/api/workflow/[[...path]]/route.js',
    'app/api/v1/creative-agent/[[...path]]/route.js',
  ]) {
    const route = await source(relativePath);
    assert.match(route, /guardMutation/);
    assert.match(route, /maxBytes/);
  }
});

test('P0 denies unmetered legacy provider inference and arbitrary proxy paths', async () => {
  for (const [scope, segments, method] of [
    [PROXY_SCOPE.AGENTS, ['by-slug', 'demo', 'chat'], 'POST'],
    [PROXY_SCOPE.AGENTS, ['suggest'], 'POST'],
    [PROXY_SCOPE.AGENTS, [], 'POST'],
    [PROXY_SCOPE.WORKFLOW, ['demo', 'run'], 'POST'],
    [PROXY_SCOPE.WORKFLOW, ['demo', 'node', 'n1', 'run'], 'POST'],
    [PROXY_SCOPE.WORKFLOW, ['demo', 'api-execute'], 'POST'],
  ]) {
    const verdict = authorizeScopedProxyPath(scope, segments, method);
    assert.equal(verdict.allow, false, `${scope}/${segments.join('/')} must remain closed`);
    assert.equal(verdict.decision, POLICY.DENY_BILLING_REQUIRED);
  }

  assert.equal(authorizeScopedProxyPath(PROXY_SCOPE.APP, ['interests'], 'GET').allow, true);
  assert.equal(authorizeScopedProxyPath(PROXY_SCOPE.WORKFLOW, ['get-published-workflows'], 'GET').allow, true);
  for (const [segments, method] of [
    [['get-workflow-def', 'w1'], 'GET'],
    [['run', 'r1', 'api-outputs'], 'GET'],
    [['w1', 'run'], 'POST'],
    [['w1', 'node', 'n1', 'run'], 'POST'],
    [['update-name', 'w1'], 'POST'],
    [['update-category', 'w1'], 'POST'],
    [['workflow', 'w1', 'publish'], 'POST'],
    [['workflow', 'w1', 'template'], 'POST'],
    [['delete-workflow-def', 'w1'], 'DELETE'],
  ]) {
    assert.equal(authorizeScopedProxyPath(PROXY_SCOPE.WORKFLOW, segments, method).allow, false);
  }
  assert.equal(authorizeScopedProxyPath(PROXY_SCOPE.AGENTS, ['by-slug', 'public-agent'], 'GET').allow, true);
  assert.equal(authorizeScopedProxyPath(PROXY_SCOPE.AGENTS, ['by-slug', 'public-agent', 'conversation-id'], 'GET').allow, false);
  assert.equal(authorizeScopedProxyPath(PROXY_SCOPE.AGENTS, ['by-slug', 'public-agent'], 'DELETE').allow, false);
  assert.equal(classifyProxyRequest(['models', 'demo', 'estimate-cost'], 'GET').allow, true);
  assert.equal(classifyProxyRequest(['models', 'demo', 'predict'], 'POST').allow, false);
  assert.equal(classifyProxyRequest(['admin', 'users'], 'GET').decision, POLICY.DENY_ACCOUNT);
  assert.equal(isCreativeAgentInferenceRequest(['sessions', 's1', 'chat'], 'POST'), true);
  assert.equal(isCreativeAgentInferenceRequest(['jobs', 'j1', 'approve'], 'POST'), true);
  assert.equal(isCreativeAgentInferenceRequest(['jobs', 'j1', 'cancel'], 'POST'), false);
  assert.equal(authorizeCreativeAgentProxyPath(['agent-skills'], 'GET').allow, true);
  assert.equal(authorizeCreativeAgentProxyPath(['account', 'balance'], 'GET').allow, false);
  assert.equal(authorizeCreativeAgentProxyPath(['sessions'], 'GET').allow, false);
  assert.equal(authorizeCreativeAgentProxyPath(['sessions', 's1', 'messages'], 'GET').allow, false);
  assert.equal(authorizeCreativeAgentProxyPath(['sessions', 's1'], 'DELETE').allow, false);
  assert.equal(authorizeCreativeAgentProxyPath(['sessions', 's1', 'chat'], 'POST').decision,
    POLICY.DENY_BILLING_REQUIRED);

  for (const relativePath of [
    'app/api/agents/[[...path]]/route.js',
    'app/api/app/[[...path]]/route.js',
    'app/api/workflow/[[...path]]/route.js',
  ]) {
    assert.match(await source(relativePath), /guardScopedProxyRequest/);
  }
  assert.match(await source('app/api/v1/creative-agent/[[...path]]/route.js'), /authorizeCreativeAgentProxyPath/);
  assert.match(await source('app/api/api/v1/[[...path]]/route.js'), /classifyProxyRequest/);
});

test('P0 rate limits legacy credit reservation and settlement mutations by account', async () => {
  for (const [relativePath, scope, limit] of [
    ['app/api/financial/credits/reserve/route.js', 'credit_reserve_user', 30],
    ['app/api/financial/credits/commit/route.js', 'credit_commit_user', 120],
    ['app/api/financial/credits/void/route.js', 'credit_void_user', 120],
  ]) {
    const route = await source(relativePath);
    assert.match(route, /consumeRateLimit/);
    assert.match(route, /rateLimitResponse/);
    assert.match(route, /subject:\s*user\.id/);
    assert.match(route, new RegExp(`scope:\\s*'${scope}'`));
    assert.match(route, new RegExp(`limit:\\s*${limit}`));
  }
});

test('P0 fail-closes client provider keys behind the explicit BYOK gate', async () => {
  const byok = await source('lib/security/byok.js');
  assert.match(byok, /ALLOW_BYOK === 'true'/);
  assert.match(byok, /BYOK_SECURITY_REVIEWED === 'true'/);
  assert.match(byok, /supdance-account-session/);
  for (const relativePath of [
    'app/api/agents/[[...path]]/route.js',
    'app/api/workflow/[[...path]]/route.js',
    'app/api/app/[[...path]]/route.js',
    'app/api/v1/creative-agent/[[...path]]/route.js',
    'app/api/v1/[[...path]]/route.js',
    'app/api/v1/get_upload_url/route.js',
    'app/api/upload-binary/route.js',
    'app/api/v1/upload-binary/route.js',
  ]) {
    const route = await source(relativePath);
    assert.match(route, /getUserFromRequest/);
    if (relativePath.includes('upload-binary')) {
      assert.doesNotMatch(route, /getApiKeyFromRequest/);
    } else {
      assert.match(route, /resolveProviderApiKey/);
      assert.match(route, /!apiKey\.ok/);
      assert.match(route, /headers\.delete\('x-api-key'\)/);
  }
  const avatarRoute = await source('app/api/user/avatar/route.js');
  assert.match(avatarRoute, /guardMutation\(request, \{ maxBytes: 1024 \}\)/);
  assert.match(avatarRoute, /scope:\s*'user_avatar_upload'[\s\S]*subject:\s*user\.id[\s\S]*limit:\s*10/);
  assert.match(avatarRoute, /scope:\s*'user_avatar_delete'[\s\S]*subject:\s*user\.id[\s\S]*limit:\s*20/);
  for (const [relativePath, scopes] of [
    ['app/api/user/email/route.js', ['user_email_binding', 'user_email_unbind']],
    ['app/api/user/phone/route.js', ['user_phone_binding', 'user_phone_unbind']],
  ]) {
    const route = await source(relativePath);
    for (const scope of scopes) {
      assert.match(route, new RegExp(`scope:\\s*'${scope}'[\\s\\S]*subject:\\s*user\\.id`));
    }
  }
}
  const legacyApiProxy = await source('app/api/api/v1/[[...path]]/route.js');
  assert.match(legacyApiProxy, /getUserFromRequest/);
  assert.match(legacyApiProxy, /headers\.delete\('x-api-key'\)/);
  assert.match(legacyApiProxy, /getServerProviderApiKey/);
  assert.match(legacyApiProxy, /headers\.set\('x-api-key', apiKey\)/);
});

test('P0 uses the server key for the platform session marker and rejects real client keys by default', async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    allowByok: process.env.ALLOW_BYOK,
    reviewed: process.env.BYOK_SECURITY_REVIEWED,
  };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_BYOK;
    delete process.env.BYOK_SECURITY_REVIEWED;
    const marker = await resolveProviderApiKey(new Request('https://app.example/api/v1', {
      headers: { 'x-api-key': 'supdance-account-session' },
    }), 'server-key');
    assert.deepEqual(marker, { ok: true, key: 'server-key', byok: false });
    const rejected = await resolveProviderApiKey(new Request('https://app.example/api/v1', {
      headers: { 'x-api-key': 'user-supplied-key' },
    }), 'server-key');
    assert.deepEqual(rejected, { ok: false, key: null, code: 'BYOK_DISABLED' });
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.allowByok === undefined) delete process.env.ALLOW_BYOK;
    else process.env.ALLOW_BYOK = previous.allowByok;
    if (previous.reviewed === undefined) delete process.env.BYOK_SECURITY_REVIEWED;
    else process.env.BYOK_SECURITY_REVIEWED = previous.reviewed;
  }
});

test('P0 does not auto-link OAuth accounts using an unverified email', async () => {
  const oauth = await source('lib/oauth.js');
  const authService = await source('lib/services/auth.js');
  // 边界实现位于回调服务，路由只是转发器：两侧都要盯住。
  const callback = await source('lib/services/oauthCallback.js');
  const route = await source('app/api/auth/oauth/[provider]/callback/route.js');
  assert.match(oauth, /emailVerified: data\.email_verified === true/);
  assert.match(authService, /const trustedEmail = emailVerified === true \? normalizedEmail : null/);
  assert.match(authService, /if \(targetUser\)/);
  assert.match(callback, /emailVerified: profile\.emailVerified === true/);
  assert.match(route, /handleOAuthCallback\(request, provider\)/);
});
