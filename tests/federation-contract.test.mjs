import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { signTicket, verifyTicket } from '../lib/federation/ticket.js';
import { auditIntegerPrice } from '../lib/federation/integerPricing.js';

const keys = generateKeyPairSync('ed25519');
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
const now = 1800000000000;
const ticket = { version: 1, issuer: 'one', audience: 'main', purpose: 'link-request', nonce: 'n'.repeat(43), oneUserId: 'one-owned', issuedAt: now / 1000, expiresAt: now / 1000 + 300 };

test('link proof is issuer-, audience-, purpose- and expiry-bound', () => {
  const value = signTicket(ticket, privateKey, now);
  assert.equal(verifyTicket(value, publicKey, { issuer: 'one', audience: 'main', purpose: 'link-request', now }).oneUserId, 'one-owned');
  for (const expected of [
    { issuer: 'main', audience: 'main', purpose: 'link-request', now },
    { issuer: 'one', audience: 'one', purpose: 'link-request', now },
    { issuer: 'one', audience: 'main', purpose: 'wallet-read', now },
    { issuer: 'one', audience: 'main', purpose: 'link-request', now: now + 300000 },
  ]) assert.throws(() => verifyTicket(value, publicKey, expected));
  assert.throws(() => verifyTicket(value + 'x', publicKey, { issuer: 'one', audience: 'main', purpose: 'link-request', now }));
  assert.throws(() => signTicket({ ...ticket, mainUserId: 'client-chosen' }, privateKey, now));
  const impostor = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  assert.throws(() => verifyTicket(value, impostor, { issuer: 'one', audience: 'main', purpose: 'link-request', now }));
});

const packs = [
  { id: 'starter', currency: 'USD', usdMicros: '10000000', totalMicrocredits: '1000000000' },
  { id: 'bonus24', currency: 'USD', usdMicros: '3000000000', totalMicrocredits: '372000000000' },
];
test('integer pricing includes bonuses and fees and never rounds a proposed price down', () => {
  const result = auditIntegerPrice({ saleMicrocredits: '8200000', costUsdMicros: '35000', costEvidence: 'isolated-cost-fixture', packs,
    fee: { rateBps: '300', fixedUsdMicros: '300000', evidence: 'test-fixture-only' } });
  assert.equal(result.proposedIntegerCredits, '9');
  assert.equal(result.minimumNonLossIntegerCredits, '5');
  assert.equal(result.noLossVerified, true);
  assert.equal(result.limitingPack, 'bonus24');
  assert.equal(result.revenueNotReduced, true);
  assert.equal(auditIntegerPrice({ saleMicrocredits: '1', costUsdMicros: '35000', costEvidence: 'fixture', packs,
    fee: { rateBps: '300', fixedUsdMicros: '300000', evidence: 'fixture' } }).noLossVerified, false);
});

test('missing fee/cost evidence fails closed and large amounts remain exact', () => {
  const result = auditIntegerPrice({ saleMicrocredits: '9007199254740993000001', packs });
  assert.equal(result.proposedIntegerCredits, '9007199254740994');
  assert.equal(result.noLossVerified, false);
  assert.deepEqual(result.blockers, ['COST_EVIDENCE_REQUIRED', 'PAYMENT_FEE_EVIDENCE_REQUIRED']);
  assert.throws(() => auditIntegerPrice({ saleMicrocredits: '-1', packs }));
  assert.throws(() => auditIntegerPrice({ saleMicrocredits: 0.1, packs }));
});
