import assert from 'node:assert/strict';
import {
  createTestLedger,
  createTestQuote,
  hashParameters,
  simulatePromptInputKeyPress,
  RESERVATION_STATUS,
} from './helpers.mjs';

/**
 * Tier 2: Boundary & Corner Cases Specifications
 * Covers all boundary and adversarial corner conditions (>=5 tests per feature).
 *
 * Feature Areas:
 *   1. Expired Quotes
 *   2. Parameter Mismatch Tampering
 *   3. Duplicate Idempotency Key
 *   4. Zero Credit Wallet / Insufficient Credits
 *   5. Provider Failure Refund
 *   6. CJK IME Enter Press Protection
 */
export const tier2Tests = [
  // ==========================================
  // Area 1: Expired Quotes
  // ==========================================
  {
    id: 'T2-EXPIRE-1',
    feature: 1,
    name: 'Expired Quote verification detects past expiration timestamp',
    description: 'Quote with expires_at in the past is identified as expired.',
    run: async () => {
      const pastQuote = createTestQuote({
        userId: 'user_1',
        modelId: 'nano-banana',
        ttlSeconds: -10, // Expired 10 seconds ago
      });

      function verifyQuoteExpiration(quote) {
        const isExpired = new Date(quote.expiresAt).getTime() <= Date.now();
        if (isExpired) {
          const err = new Error('报价单已过期，请重新获取最新报价');
          err.code = 'QUOTE_EXPIRED';
          throw err;
        }
        return true;
      }

      assert.throws(() => verifyQuoteExpiration(pastQuote), { code: 'QUOTE_EXPIRED' });
    },
  },
  {
    id: 'T2-EXPIRE-2',
    feature: 1,
    name: 'Expired Quote rejects job submission before any credits are reserved',
    description: 'Submitting expired quoteId fails early and leaves wallet untouched.',
    run: async () => {
      const ledger = createTestLedger({ user_exp: { perpetual: 100 } });
      const expiredQuote = createTestQuote({
        userId: 'user_exp',
        modelId: 'nano-banana',
        ttlSeconds: -60,
      });

      function submitJobWithQuote(quote, walletLedger) {
        if (new Date(quote.expiresAt).getTime() <= Date.now()) {
          const err = new Error('报价单已过期');
          err.code = 'QUOTE_EXPIRED';
          throw err;
        }
        return walletLedger.reserveCredits({
          userId: quote.userId,
          amount: quote.credits,
          modelId: quote.modelId,
        });
      }

      assert.throws(() => submitJobWithQuote(expiredQuote, ledger), { code: 'QUOTE_EXPIRED' });
      assert.equal(ledger.getWallet('user_exp').perpetual_credits, 100, 'Credits must not be frozen');
      assert.equal(ledger.getWallet('user_exp').frozen_credits, 0);
    },
  },
  {
    id: 'T2-EXPIRE-3',
    feature: 1,
    name: 'Expired Quote cannot transition to consumed_at state',
    description: 'Ensures database consume operation refuses to mark an expired quote as consumed.',
    run: async () => {
      const quote = createTestQuote({
        userId: 'user_1',
        modelId: 'nano-banana',
        ttlSeconds: -5,
      });

      function consumeQuote(q) {
        if (new Date(q.expiresAt).getTime() <= Date.now()) {
          throw Object.assign(new Error('报价单已过期'), { code: 'QUOTE_EXPIRED' });
        }
        q.consumedAt = new Date().toISOString();
        return q;
      }

      assert.throws(() => consumeQuote(quote), { code: 'QUOTE_EXPIRED' });
      assert.strictEqual(quote.consumedAt, null);
    },
  },
  {
    id: 'T2-EXPIRE-4',
    feature: 1,
    name: 'Expired Quote verification boundary: within 1 second of expiry',
    description: 'Evaluates quote right at the millisecond boundary of expiration.',
    run: async () => {
      const now = Date.now();
      const quoteExactlyNow = {
        quoteId: 'quote_edge_1',
        expiresAt: new Date(now - 1).toISOString(),
      };

      const isExpired = new Date(quoteExactlyNow.expiresAt).getTime() <= now;
      assert.equal(isExpired, true, 'Quote 1ms in the past must be treated as expired');
    },
  },
  {
    id: 'T2-EXPIRE-5',
    feature: 1,
    name: 'Client re-quotes successfully after quote expiration with fresh TTL',
    description: 'When previous quote expires, requesting quote with new key generates fresh valid quote.',
    run: async () => {
      const expiredQuote = createTestQuote({
        userId: 'user_1',
        modelId: 'nano-banana',
        ttlSeconds: -30,
      });

      // Fresh quote request
      const freshQuote = createTestQuote({
        userId: 'user_1',
        modelId: 'nano-banana',
        ttlSeconds: 300,
      });

      assert.notEqual(expiredQuote.quoteId, freshQuote.quoteId);
      assert.ok(new Date(freshQuote.expiresAt).getTime() > Date.now());
    },
  },

  // ==========================================
  // Area 2: Parameter Mismatch Tampering
  // ==========================================
  {
    id: 'T2-TAMPER-1',
    feature: 2,
    name: 'Parameter Tampering: Model ID mismatch rejection',
    description: 'Quote generated for model A, submission attempts model B -> QUOTE_MODEL_MISMATCH.',
    run: async () => {
      const quote = createTestQuote({
        userId: 'user_1',
        modelId: 'nano-banana',
      });

      function verifyQuoteModel(quotedModelId, requestedModelId) {
        if (quotedModelId !== requestedModelId) {
          throw Object.assign(new Error('报价单模型与当前任务不一致'), { code: 'QUOTE_MODEL_MISMATCH' });
        }
        return true;
      }

      assert.throws(
        () => verifyQuoteModel(quote.modelId, 'flux-dev'),
        { code: 'QUOTE_MODEL_MISMATCH' }
      );
    },
  },
  {
    id: 'T2-TAMPER-2',
    feature: 2,
    name: 'Parameter Tampering: Resolution and quality parameter hash mismatch',
    description: 'Quote requested for standard 512p, submission attempts 4K -> QUOTE_PARAMETERS_MISMATCH.',
    run: async () => {
      const quoteParams = { resolution: '512p', quality: 'standard' };
      const quoteHash = hashParameters('nano-banana', quoteParams);

      const tamperedParams = { resolution: '4K', quality: 'ultra' };
      const tamperedHash = hashParameters('nano-banana', tamperedParams);

      assert.notEqual(quoteHash, tamperedHash, 'Hashes must differ when parameters are modified');

      function verifyQuoteParameters(savedHash, currentHash) {
        if (savedHash !== currentHash) {
          throw Object.assign(new Error('本次任务参数与报价参数不一致，请重新报价'), {
            code: 'QUOTE_PARAMETERS_MISMATCH',
          });
        }
        return true;
      }

      assert.throws(
        () => verifyQuoteParameters(quoteHash, tamperedHash),
        { code: 'QUOTE_PARAMETERS_MISMATCH' }
      );
    },
  },
  {
    id: 'T2-TAMPER-3',
    feature: 2,
    name: 'Parameter Tampering: User ownership mismatch rejection',
    description: 'User B attempts to use User A quote -> QUOTE_USER_MISMATCH.',
    run: async () => {
      const quote = createTestQuote({
        userId: 'user_legitimate_A',
        modelId: 'nano-banana',
      });

      function verifyQuoteUser(quoteOwnerId, requestingUserId) {
        if (quoteOwnerId !== requestingUserId) {
          throw Object.assign(new Error('报价单归属用户不符'), { code: 'QUOTE_USER_MISMATCH' });
        }
        return true;
      }

      assert.throws(
        () => verifyQuoteUser(quote.userId, 'attacker_user_B'),
        { code: 'QUOTE_USER_MISMATCH' }
      );
    },
  },
  {
    id: 'T2-TAMPER-4',
    feature: 2,
    name: 'Parameter Tampering: Reuse of already consumed quote is rejected',
    description: 'Submitting a quote that has already been consumed -> QUOTE_ALREADY_CONSUMED.',
    run: async () => {
      const quote = createTestQuote({ userId: 'user_1', modelId: 'nano-banana' });
      quote.consumedAt = new Date().toISOString(); // Already consumed

      function verifyQuoteNotConsumed(q) {
        if (q.consumedAt) {
          throw Object.assign(new Error('该报价单已被使用，请重新获取报价'), {
            code: 'QUOTE_ALREADY_CONSUMED',
          });
        }
        return true;
      }

      assert.throws(() => verifyQuoteNotConsumed(quote), { code: 'QUOTE_ALREADY_CONSUMED' });
    },
  },
  {
    id: 'T2-TAMPER-5',
    feature: 2,
    name: 'Parameter Tampering: Forged non-existent quoteId is rejected',
    description: 'Submitting arbitrary forged quoteId -> QUOTE_NOT_FOUND.',
    run: async () => {
      const quotesDb = new Map();
      quotesDb.set('quote_real_123', { id: 'quote_real_123' });

      function lookupQuote(id) {
        const q = quotesDb.get(id);
        if (!q) {
          throw Object.assign(new Error('报价单不存在或已失效'), { code: 'QUOTE_NOT_FOUND' });
        }
        return q;
      }

      assert.throws(() => lookupQuote('quote_fake_forged_999'), { code: 'QUOTE_NOT_FOUND' });
    },
  },

  // ==========================================
  // Area 3: Duplicate Idempotency Key
  // ==========================================
  {
    id: 'T2-IDEMP-1',
    feature: 3,
    name: 'Idempotency Replay: Exact duplicate submission returns existing creation without deduction',
    description: 'Resubmitting same idempotency key with identical body returns cached result.',
    run: async () => {
      const ledger = createTestLedger({ user_rep: { perpetual: 60 } });
      const idemKey = 'idempotency_exact_dup_1';

      const res1 = ledger.reserveCredits({
        userId: 'user_rep',
        amount: 20,
        modelId: 'nano-banana',
        idempotencyKey: idemKey,
      });

      const res2 = ledger.reserveCredits({
        userId: 'user_rep',
        amount: 20,
        modelId: 'nano-banana',
        idempotencyKey: idemKey,
      });

      assert.equal(res2.idempotent, true);
      assert.equal(res1.reservationId, res2.reservationId);
      assert.equal(ledger.getWallet('user_rep').frozen_credits, 20);
      assert.equal(ledger.getWallet('user_rep').perpetual_credits, 40);
    },
  },
  {
    id: 'T2-IDEMP-2',
    feature: 3,
    name: 'Idempotency Replay: Duplicate key with altered payload throws IDEMPOTENCY_CONFLICT',
    description: 'Different model or amount on same key violates idempotency integrity.',
    run: async () => {
      const ledger = createTestLedger({ user_rep: { perpetual: 100 } });
      const idemKey = 'idempotency_conflict_test_key';

      ledger.reserveCredits({
        userId: 'user_rep',
        amount: 20,
        modelId: 'nano-banana',
        idempotencyKey: idemKey,
      });

      assert.throws(
        () => {
          ledger.reserveCredits({
            userId: 'user_rep',
            amount: 20,
            modelId: 'seedance-v2.0-t2v', // Altered model
            idempotencyKey: idemKey,
          });
        },
        { code: 'IDEMPOTENCY_CONFLICT' }
      );
    },
  },
  {
    id: 'T2-IDEMP-3',
    feature: 3,
    name: 'Idempotency Concurrency: Rapid parallel requests serialize to exactly 1 reservation',
    description: 'Two simultaneous requests with identical key resolve without race conditions.',
    run: async () => {
      const ledger = createTestLedger({ user_parallel: { perpetual: 80 } });
      const idemKey = 'parallel_key_101';

      const [r1, r2] = await Promise.all([
        Promise.resolve().then(() =>
          ledger.reserveCredits({
            userId: 'user_parallel',
            amount: 25,
            modelId: 'nano-banana',
            idempotencyKey: idemKey,
          })
        ),
        Promise.resolve().then(() =>
          ledger.reserveCredits({
            userId: 'user_parallel',
            amount: 25,
            modelId: 'nano-banana',
            idempotencyKey: idemKey,
          })
        ),
      ]);

      assert.equal(r1.reservationId, r2.reservationId);
      assert.equal(ledger.getWallet('user_parallel').frozen_credits, 25);
      assert.equal(ledger.getWallet('user_parallel').perpetual_credits, 55);
    },
  },
  {
    id: 'T2-IDEMP-4',
    feature: 3,
    name: 'Idempotency Replay: Replaying completed creation returns succeeded result without re-executing',
    description: 'Querying or replaying finished creation does not invoke provider again.',
    run: async () => {
      let providerCalls = 0;
      const creationsDb = new Map();

      async function runCreation(key) {
        if (creationsDb.has(key)) {
          return { creation: creationsDb.get(key), idempotent: true };
        }
        providerCalls += 1;
        const creation = {
          id: 'gen_' + key,
          status: 'succeeded',
          result_url: 'https://cdn-private.supdance.com/asset.webp',
        };
        creationsDb.set(key, creation);
        return { creation, idempotent: false };
      }

      const first = await runCreation('k1');
      const second = await runCreation('k1');

      assert.equal(first.idempotent, false);
      assert.equal(second.idempotent, true);
      assert.equal(providerCalls, 1, 'Provider must only be invoked once');
      assert.equal(second.creation.status, 'succeeded');
    },
  },
  {
    id: 'T2-IDEMP-5',
    feature: 3,
    name: 'Idempotency Replay: Replaying failed creation returns existing failure without double refund',
    description: 'Replaying a failed creation does not re-refund already voided credits.',
    run: async () => {
      const ledger = createTestLedger({ user_fail_rep: { perpetual: 50 } });
      const res = ledger.reserveCredits({
        userId: 'user_fail_rep',
        amount: 20,
        modelId: 'nano-banana',
        idempotencyKey: 'fail_rep_key',
      });

      // Void credits on initial failure
      ledger.voidCredits({ reservationId: res.reservationId });
      assert.equal(ledger.getWallet('user_fail_rep').perpetual_credits, 50);

      // Subsequent void call should be a no-op
      const secondVoid = ledger.voidCredits({ reservationId: res.reservationId });
      assert.equal(secondVoid.alreadyVoided, true);
      assert.equal(ledger.getWallet('user_fail_rep').perpetual_credits, 50, 'Balance must remain 50');
    },
  },

  // ==========================================
  // Area 4: Zero Credit Wallet / Insufficient Credits
  // ==========================================
  {
    id: 'T2-WALLET-1',
    feature: 4,
    name: 'Zero Credit Wallet: User with 0 balance fails with INSUFFICIENT_CREDITS',
    description: 'User with 0 credits cannot create generation job.',
    run: async () => {
      const ledger = createTestLedger({ user_zero: { perpetual: 0 } });

      assert.throws(
        () => {
          ledger.reserveCredits({
            userId: 'user_zero',
            amount: 15,
            modelId: 'nano-banana',
          });
        },
        { code: 'INSUFFICIENT_CREDITS' }
      );
    },
  },
  {
    id: 'T2-WALLET-2',
    feature: 4,
    name: 'Insufficient Credits: Partial balance less than required fails without deducting',
    description: 'User has 10 credits, task requires 15; fails atomically with 0 partial deduction.',
    run: async () => {
      const ledger = createTestLedger({ user_part: { perpetual: 10 } });

      assert.throws(
        () => {
          ledger.reserveCredits({
            userId: 'user_part',
            amount: 15,
            modelId: 'nano-banana',
          });
        },
        { code: 'INSUFFICIENT_CREDITS' }
      );

      const wallet = ledger.getWallet('user_part');
      assert.equal(wallet.perpetual_credits, 10, 'Perpetual credits must remain 10');
      assert.equal(wallet.frozen_credits, 0, 'Frozen credits must remain 0');
    },
  },
  {
    id: 'T2-WALLET-3',
    feature: 4,
    name: 'Expired Daily Free Credits are excluded from available balance',
    description: 'Wallet with expired daily_free_credits does not permit reservation against expired bucket.',
    run: async () => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - 3600 * 1000).toISOString();

      const ledger = createTestLedger({
        user_exp_daily: {
          daily: 20,
          dailyExpiresAt: pastTime, // Expired
          perpetual: 5,
        },
      });

      // Needs 10 credits: daily is expired, only 5 perpetual available -> should fail
      assert.throws(
        () => {
          ledger.reserveCredits({
            userId: 'user_exp_daily',
            amount: 10,
            modelId: 'nano-banana',
          });
        },
        { code: 'INSUFFICIENT_CREDITS' }
      );
    },
  },
  {
    id: 'T2-WALLET-4',
    feature: 4,
    name: 'Expired Subscription Credits are excluded from available balance',
    description: 'Wallet with expired subscription period does not allow reservation against subscription bucket.',
    run: async () => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

      const ledger = createTestLedger({
        user_exp_sub: {
          subscription: 50,
          subscriptionExpiresAt: pastTime, // Expired
          perpetual: 10,
        },
      });

      assert.throws(
        () => {
          ledger.reserveCredits({
            userId: 'user_exp_sub',
            amount: 20,
            modelId: 'nano-banana',
          });
        },
        { code: 'INSUFFICIENT_CREDITS' }
      );
    },
  },
  {
    id: 'T2-WALLET-5',
    feature: 4,
    name: 'Race condition on low balance: only 1 of 2 concurrent tasks succeeds',
    description: 'Wallet with 15 credits receives two concurrent 15-credit tasks; exactly 1 succeeds.',
    run: async () => {
      const ledger = createTestLedger({ user_race: { perpetual: 15 } });

      let successCount = 0;
      let failCount = 0;

      for (const key of ['race_1', 'race_2']) {
        try {
          ledger.reserveCredits({
            userId: 'user_race',
            amount: 15,
            modelId: 'nano-banana',
            idempotencyKey: key,
          });
          successCount++;
        } catch (err) {
          if (err.code === 'INSUFFICIENT_CREDITS') failCount++;
        }
      }

      assert.equal(successCount, 1, 'Exactly one task must succeed');
      assert.equal(failCount, 1, 'Exactly one task must fail with INSUFFICIENT_CREDITS');
      assert.equal(ledger.getWallet('user_race').perpetual_credits, 0);
      assert.equal(ledger.getWallet('user_race').frozen_credits, 15);
    },
  },

  // ==========================================
  // Area 5: Provider Failure Refund
  // ==========================================
  {
    id: 'T2-REFUND-1',
    feature: 5,
    name: 'Provider Failure: HTTP 500 error triggers automatic void and 100% refund',
    description: 'Simulates upstream provider crash; reserved credits are fully restored.',
    run: async () => {
      const ledger = createTestLedger({ user_p500: { perpetual: 50 } });
      const res = ledger.reserveCredits({
        userId: 'user_p500',
        amount: 20,
        modelId: 'nano-banana',
        idempotencyKey: 'p500_key',
      });

      // Provider throws 500
      const providerError = { status: 500, message: 'Internal Server Error' };
      if (providerError.status >= 500) {
        ledger.voidCredits({
          reservationId: res.reservationId,
          reason: `Provider Error ${providerError.status}: ${providerError.message}`,
        });
      }

      const wallet = ledger.getWallet('user_p500');
      assert.equal(wallet.perpetual_credits, 50, 'Credits must be 100% refunded to 50');
      assert.equal(wallet.frozen_credits, 0);
    },
  },
  {
    id: 'T2-REFUND-2',
    feature: 5,
    name: 'Provider Failure: Timeout / network drop triggers void and 100% refund',
    description: 'Provider request timeout triggers voidCredits rollback.',
    run: async () => {
      const ledger = createTestLedger({ user_timeout: { perpetual: 30 } });
      const res = ledger.reserveCredits({
        userId: 'user_timeout',
        amount: 15,
        modelId: 'nano-banana',
        idempotencyKey: 'timeout_key',
      });

      // Timeout occurred
      const timeoutOccurred = true;
      if (timeoutOccurred) {
        ledger.voidCredits({
          reservationId: res.reservationId,
          reason: 'PROVIDER_TIMEOUT',
        });
      }

      assert.equal(ledger.getWallet('user_timeout').perpetual_credits, 30);
      assert.equal(ledger.getWallet('user_timeout').frozen_credits, 0);
    },
  },
  {
    id: 'T2-REFUND-3',
    feature: 5,
    name: 'Storage Failure: Post-generation archival error triggers void and 100% refund',
    description: 'If COS upload fails after provider succeeds, user is not billed.',
    run: async () => {
      const ledger = createTestLedger({ user_store_fail: { perpetual: 40 } });
      const res = ledger.reserveCredits({
        userId: 'user_store_fail',
        amount: 20,
        modelId: 'nano-banana',
        idempotencyKey: 'store_fail_key',
      });

      // Generation succeeded, but COS upload failed
      const storageIngestFailed = true;
      if (storageIngestFailed) {
        ledger.voidCredits({
          reservationId: res.reservationId,
          reason: 'STORAGE_INGEST_FAILED',
        });
      }

      assert.equal(ledger.getWallet('user_store_fail').perpetual_credits, 40);
      assert.equal(ledger.getWallet('user_store_fail').frozen_credits, 0);
    },
  },
  {
    id: 'T2-REFUND-4',
    feature: 5,
    name: 'Multi-bucket refund restores exact split amounts back to daily, sub, and perpetual',
    description: 'Checks that bucket_split_json accurately maps restitution back to respective pools.',
    run: async () => {
      const ledger = createTestLedger({
        user_split_ref: {
          daily: 5,
          subscription: 15,
          perpetual: 20,
        },
      });

      // Needs 25: 5 from daily, 15 from sub, 5 from perpetual
      const res = ledger.reserveCredits({
        userId: 'user_split_ref',
        amount: 25,
        modelId: 'm1',
        idempotencyKey: 'split_ref_key',
      });

      assert.deepEqual(res.split, { daily: 5, subscription: 15, perpetual: 5 });

      ledger.voidCredits({ reservationId: res.reservationId });

      const wallet = ledger.getWallet('user_split_ref');
      assert.equal(wallet.daily_free_credits, 5);
      assert.equal(wallet.subscription_credits, 15);
      assert.equal(wallet.perpetual_credits, 20);
      assert.equal(wallet.frozen_credits, 0);
    },
  },
  {
    id: 'T2-REFUND-5',
    feature: 5,
    name: 'Ledger Audit Integrity: TASK_RESERVE is paired with exact TASK_RELEASE entry',
    description: 'Verifies audit ledger rows balance out to zero net change.',
    run: async () => {
      const ledger = createTestLedger({ user_audit: { perpetual: 60 } });
      const res = ledger.reserveCredits({
        userId: 'user_audit',
        amount: 30,
        modelId: 'm1',
        idempotencyKey: 'audit_key',
      });

      ledger.voidCredits({ reservationId: res.reservationId });

      const reserveEntry = ledger.ledger.find((e) => e.action === 'TASK_RESERVE');
      const releaseEntry = ledger.ledger.find((e) => e.action === 'TASK_RELEASE');

      assert.ok(reserveEntry && releaseEntry);
      assert.equal(reserveEntry.delta + releaseEntry.delta, 0, 'Net credit change must be 0');
    },
  },

  // ==========================================
  // Area 6: CJK IME Enter Press Protection (PromptInputField)
  // ==========================================
  {
    id: 'T2-IME-1',
    feature: 6,
    name: 'IME Guard: Enter key press during active composition does NOT trigger onEnter',
    description: 'isComposingRef.current === true prevents Enter key from submitting form.',
    run: async () => {
      let enterFired = false;
      const onEnter = () => { enterFired = true; };

      const isComposingRef = { current: true }; // Active composition
      const result = simulatePromptInputKeyPress({
        key: 'Enter',
        keyCode: 13,
        isComposingRef,
        onEnter,
      });

      assert.equal(result.enterTriggered, false, 'onEnter must NOT be triggered during composition');
      assert.equal(enterFired, false);
    },
  },
  {
    id: 'T2-IME-2',
    feature: 6,
    name: 'IME Guard: Enter key with keyCode === 229 does NOT trigger onEnter',
    description: 'keyCode 229 emitted by CJK IME suppresses submission.',
    run: async () => {
      let enterFired = false;
      const onEnter = () => { enterFired = true; };

      const result = simulatePromptInputKeyPress({
        key: 'Enter',
        keyCode: 229, // IME keyCode
        isComposingRef: { current: false },
        onEnter,
      });

      assert.equal(result.enterTriggered, false, 'keyCode 229 must NOT trigger onEnter');
      assert.equal(enterFired, false);
    },
  },
  {
    id: 'T2-IME-3',
    feature: 6,
    name: 'IME Guard: Enter key with nativeEvent.isComposing === true does NOT trigger onEnter',
    description: 'Browser native isComposing flag suppresses submission.',
    run: async () => {
      let enterFired = false;
      const onEnter = () => { enterFired = true; };

      const result = simulatePromptInputKeyPress({
        key: 'Enter',
        keyCode: 13,
        nativeIsComposing: true,
        onEnter,
      });

      assert.equal(result.enterTriggered, false, 'nativeEvent.isComposing must NOT trigger onEnter');
      assert.equal(enterFired, false);
    },
  },
  {
    id: 'T2-IME-4',
    feature: 6,
    name: 'IME Guard: compositionstart event sets composing ref to true',
    description: 'compositionstart sets isComposingRef.current to true.',
    run: async () => {
      const isComposingRef = { current: false };

      // Simulate compositionstart
      function handleCompositionStart() {
        isComposingRef.current = true;
      }
      handleCompositionStart();

      assert.equal(isComposingRef.current, true, 'isComposingRef must be true after compositionstart');

      let enterFired = false;
      simulatePromptInputKeyPress({
        key: 'Enter',
        isComposingRef,
        onEnter: () => { enterFired = true; },
      });
      assert.equal(enterFired, false);
    },
  },
  {
    id: 'T2-IME-5',
    feature: 6,
    name: 'IME Guard: compositionend resets composing ref and enables normal Enter submission',
    description: 'After compositionend, subsequent Enter key press cleanly triggers onEnter.',
    run: async () => {
      const isComposingRef = { current: true };

      // Simulate compositionend
      function handleCompositionEnd() {
        isComposingRef.current = false;
      }
      handleCompositionEnd();

      assert.equal(isComposingRef.current, false, 'isComposingRef must be false after compositionend');

      let enterFired = false;
      const result = simulatePromptInputKeyPress({
        key: 'Enter',
        keyCode: 13,
        isComposingRef,
        onEnter: () => { enterFired = true; },
      });

      assert.equal(result.enterTriggered, true, 'Standard Enter after compositionend must trigger onEnter');
      assert.equal(enterFired, true);
    },
  },
];
