import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createMockGenerationProvider } from '../../lib/services/generationProviders.js';
import { assertGenerationTransition, canTransitionGeneration } from '../../lib/services/generationState.js';

test('generation state machine only permits the core lifecycle', () => {
  assert.equal(canTransitionGeneration('queued', 'processing'), true);
  assert.equal(canTransitionGeneration('processing', 'succeeded'), true);
  assert.equal(canTransitionGeneration('processing', 'failed'), true);
  assert.equal(canTransitionGeneration('succeeded', 'processing'), false);
  assert.throws(() => assertGenerationTransition('succeeded', 'processing'), { code: 'INVALID_GENERATION_TRANSITION' });
});

test('mock provider exposes deterministic success and failure seams', async () => {
  const creation = { id: 'gen_test', model: 'mock-image' };
  const success = await createMockGenerationProvider({ resultUrl: 'https://mock.invalid/result.png' }).generate({ creation });
  assert.equal(success.resultUrl, 'https://mock.invalid/result.png');
  assert.match(success.providerRequestId, /^mock_/);

  await assert.rejects(
    () => createMockGenerationProvider({ outcome: 'failed' }).generate({ creation }),
    { code: 'MOCK_PROVIDER_FAILED' },
  );
});

test('generation create and settlement keep credits, task state, events, and audit in transaction boundaries', () => {
  const core = fs.readFileSync(new URL('../../lib/services/generationCore.js', import.meta.url), 'utf8');
  const credits = fs.readFileSync(new URL('../../lib/financial/creditService.js', import.meta.url), 'utf8');
  const repositories = fs.readFileSync(new URL('../../lib/repositories/creations.js', import.meta.url), 'utf8');

  assert.match(core, /return withTransaction\(async \(tx\) => \{/);
  assert.match(core, /commitCredits\(\{[\s\S]*?transaction: tx/);
  assert.match(core, /voidCredits\(\{[\s\S]*?transaction: tx/);
  assert.match(core, /logAudit\(\{[\s\S]*?transaction: tx/);
  assert.match(core, /claimQueuedGeneration\(creationId, tx\)/);
  assert.match(credits, /commitCredits\(\{[^}]*transaction = null/);
  assert.match(credits, /voidCredits\(\{[^}]*transaction = null/);
  assert.match(repositories, /claimQueuedGeneration\(creationId, transaction = null\)/);
  assert.match(repositories, /updateGenerationOutcome\(creationId, \{[\s\S]*?transaction = null/);
});

test('Canvas generation resolves provider asset references with the creation owner before provider calls', () => {
  const core = fs.readFileSync(new URL('../../lib/services/generationCore.js', import.meta.url), 'utf8');
  assert.match(core, /resolveCanvasOwnedAssetReferences\(parameters,\s*\{\s*userId: creation\.user_id,/);
  assert.match(core, /const providerParameters = await resolveCanvasProviderParameters\(claimed, parameters\);[\s\S]*?parameters: providerParameters,/);
});

test('storage-ingestion failure releases reserved credits and cannot report an unavailable result as success', () => {
  const core = fs.readFileSync(new URL('../../lib/services/generationCore.js', import.meta.url), 'utf8');
  const start = core.indexOf('async function finalizeStorageFailure(');
  const end = core.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start, 'storage failure finalizer must exist');
  const finalizer = core.slice(start, end);

  assert.match(finalizer, /await voidCredits\(/);
  assert.doesNotMatch(finalizer, /commitCredits\(/);
  assert.match(finalizer, /status: 'failed'/);
  assert.match(finalizer, /resultUrl: null/);
  assert.match(finalizer, /storageStatus: 'failed'/);
  assert.match(finalizer, /errorReason/);
  assert.match(finalizer, /toStatus: 'failed'/);
  assert.doesNotMatch(core, /生成已完成，但结果归档待重试|系统会继续重试/);
});

test('legacy billing creation writes cannot bypass the generation service', async () => {
  const billing = await import('../../lib/billing.js');
  await assert.rejects(
    () => billing.recordCreation({ userId: 'legacy', studioId: 'studio' }),
    (error) => error.code === 'LEGACY_CREATION_WRITE_DISABLED' && error.status === 410,
  );
});

test('account creation and session event writes use PostgreSQL transaction boundaries', async () => {
  const authServiceSource = fs.readFileSync(new URL('../../lib/services/auth.js', import.meta.url), 'utf8');
  const authSource = fs.readFileSync(new URL('../../lib/repositories/auth.js', import.meta.url), 'utf8');
  assert.match(authServiceSource, /export async function createUser[\s\S]*?return withTransaction\(async \(tx\) => \{/);
  assert.match(authServiceSource, /export async function findOrCreateUserByPhone[\s\S]*?return withTransaction\(async \(tx\) => \{/);
  assert.match(authServiceSource, /export async function createOAuthUser[\s\S]*?return withTransaction\(async \(tx\) => \{/);
  assert.match(authServiceSource, /export async function createSession[\s\S]*?recordAuthEvent\(\{[\s\S]*?transaction: tx/);
  assert.match(authSource, /recordAuthEvent\(\{[\s\S]*?transaction = null/);
});

test('financial wallet mutations lock the balance snapshot before calculating a new balance', () => {
  const currency = fs.readFileSync(new URL('../../lib/financial/currencyService.js', import.meta.url), 'utf8');
  const exchange = fs.readFileSync(new URL('../../lib/financial/exchangeService.js', import.meta.url), 'utf8');
  const credits = fs.readFileSync(new URL('../../lib/financial/creditService.js', import.meta.url), 'utf8');

  assert.match(currency, /return await withTransaction\(async \(tx\) => \{[\s\S]*?currency_wallets WHERE user_id = \$1 FOR UPDATE/);
  assert.match(currency, /SELECT \* FROM currency_wallets WHERE user_id IN \(\$1, \$2\) ORDER BY user_id FOR UPDATE/);
  assert.match(exchange, /currency_wallets WHERE user_id = \$1 FOR UPDATE/);
  assert.match(exchange, /UPDATE users[\s\S]*?daily_free_credits \+ subscription_credits \+ perpetual_credits/);
  assert.match(exchange, /subscriptionBalanceAfter/);
  assert.match(credits, /SELECT \* FROM credit_wallets WHERE user_id = \$1 FOR UPDATE/);
});

test('financial reconciliation keeps database queries behind its repository interface', () => {
  const service = fs.readFileSync(new URL('../../lib/financial/reconciliation.js', import.meta.url), 'utf8');
  const repository = fs.readFileSync(new URL('../../lib/repositories/reconciliation.js', import.meta.url), 'utf8');

  assert.match(service, /from ['"]\.\.\/repositories\/reconciliation\.js['"]/);
  assert.doesNotMatch(service, /queryOne\(|query\(|SELECT |INSERT |UPDATE |DELETE /);
  assert.match(repository, /getDoubleEntryTotals/);
  assert.match(repository, /getUserPerpetualCreditLedgerTotal/);
});

test('generation contract enforces server pre-quote and removes silent client quote fallback', () => {
  const core = fs.readFileSync(new URL('../../lib/services/generationCore.js', import.meta.url), 'utf8');
  const route = fs.readFileSync(new URL('../../app/api/generations/route.js', import.meta.url), 'utf8');
  const muapi = fs.readFileSync(new URL('../../packages/studio/src/muapi.js', import.meta.url), 'utf8');
  const platformClient = fs.readFileSync(new URL('../../packages/studio/src/platformClient.js', import.meta.url), 'utf8');

  assert.match(core, /if \(chargeCredits && !effectiveQuoteId\)[\s\S]*?QUOTE_REQUIRED/);
  assert.match(route, /if \(!quoteId\)[\s\S]*?QUOTE_REQUIRED[\s\S]*?status:\s*422/);
  assert.match(route, /exposeCreationResult\(/);
  assert.match(muapi, /export async function requestGenerationQuote\(/);
  assert.match(platformClient, /export async function requestGenerationQuote\(/);
  assert.doesNotMatch(muapi, /报价失败不阻塞生成/);
  assert.doesNotMatch(platformClient, /报价失败不阻塞生成/);
});

