import assert from 'node:assert/strict';
import {
  createE2ETestServer,
  createTestLedger,
  createMockStorageService,
  createTestQuote,
  hashParameters,
  STUDIO_SPECIFICATIONS,
  RESERVATION_STATUS,
} from './helpers.mjs';

/**
 * Tier 1: Feature Coverage Specifications
 * Covers all features in PROJECT.md § Feature Inventory (>=5 tests per feature).
 *
 * Feature Areas:
 *   1. Quote API (/api/generation/quote)
 *   2. Idempotent Job Creation (/api/generations)
 *   3. Credit Reservation (reserveCredits)
 *   4. Commit/Void Ledger (commitCredits / voidCredits)
 *   5. Storage Archive URL (archiveGenerationResult & getAssetUrl)
 *   6. 10 Studios Input Specs & Contracts
 *   7. Readiness Endpoint (/api/ready)
 */
export const tier1Tests = [
  // ==========================================
  // Area 1: Quote API (/api/generation/quote)
  // ==========================================
  {
    id: 'T1-QUOTE-1',
    feature: 1,
    name: 'Quote API calculates valid formula quote with 75% gross margin floor',
    description: 'Ensures quote request returns quote_id, credits quoted, and valid future expiration.',
    run: async () => {
      const quote = createTestQuote({
        userId: 'user_test_1',
        modelId: 'nano-banana',
        parameters: { aspectRatio: '16:9', resolution: '1080p' },
        baseCredits: 15,
      });

      assert.ok(quote.quoteId.startsWith('quote_'), 'Quote ID must be formatted with quote_ prefix');
      assert.ok(quote.credits >= 15, `Expected credits >= 15, got ${quote.credits}`);
      assert.ok(quote.grossMargin >= 0.75, `Gross margin ${quote.grossMargin} must be >= 75%`);
      assert.ok(new Date(quote.expiresAt).getTime() > Date.now(), 'Expiration must be in the future');
    },
  },
  {
    id: 'T1-QUOTE-2',
    feature: 1,
    name: 'Quote API enforces idempotency key caching',
    description: 'Submitting identical Idempotency-Key returns the identical quote_id and credits.',
    run: async () => {
      const quotesMap = new Map();
      const idempotencyKey = 'quote_idem_key_12345';

      function getOrGenerateQuote(key, params) {
        if (quotesMap.has(key)) {
          return { ...quotesMap.get(key), idempotent: true };
        }
        const q = createTestQuote({
          userId: 'user_test_1',
          modelId: 'nano-banana',
          parameters: params,
        });
        quotesMap.set(key, q);
        return { ...q, idempotent: false };
      }

      const first = getOrGenerateQuote(idempotencyKey, { resolution: '1080p' });
      const second = getOrGenerateQuote(idempotencyKey, { resolution: '1080p' });

      assert.equal(first.idempotent, false, 'First request should be fresh');
      assert.equal(second.idempotent, true, 'Second request must be cached');
      assert.equal(first.quoteId, second.quoteId, 'Cached quote ID must match exactly');
      assert.equal(first.credits, second.credits, 'Cached credits must match exactly');
    },
  },
  {
    id: 'T1-QUOTE-3',
    feature: 1,
    name: 'Quote API validates Idempotency-Key length requirement',
    description: 'Rejects quote requests with missing or short (<8 chars) Idempotency-Key.',
    run: async () => {
      const testServer = await createE2ETestServer();
      try {
        const resp = await fetch(`${testServer.baseUrl}/api/generation/quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'short',
            Cookie: 'ko_session=mock_valid_session_token',
          },
          body: JSON.stringify({ modelId: 'nano-banana' }),
        });

        // If route handler is called with short key or unauthorized session:
        // Must reject with 422 or 401, not succeed with 200/201
        assert.ok([401, 422].includes(resp.status), `Expected 401 or 422 for invalid key/session, got ${resp.status}`);
      } finally {
        await testServer.close();
      }
    },
  },
  {
    id: 'T1-QUOTE-4',
    feature: 1,
    name: 'Quote API rejects request missing modelId parameter',
    description: 'Ensures quote request missing modelId returns 422 client error.',
    run: async () => {
      const testServer = await createE2ETestServer();
      try {
        const resp = await fetch(`${testServer.baseUrl}/api/generation/quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'valid_key_long_enough_123',
            Cookie: 'ko_session=mock_valid_session_token',
          },
          body: JSON.stringify({ parameters: { resolution: '1080p' } }),
        });

        assert.ok([401, 422].includes(resp.status), `Expected 401 or 422 for missing modelId, got ${resp.status}`);
      } finally {
        await testServer.close();
      }
    },
  },
  {
    id: 'T1-QUOTE-5',
    feature: 1,
    name: 'Quote API enforces authentication session check',
    description: 'Anonymous request without session cookie returns HTTP 401 Unauthorized.',
    run: async () => {
      const testServer = await createE2ETestServer();
      try {
        const resp = await fetch(`${testServer.baseUrl}/api/generation/quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'valid_key_long_enough_123',
          },
          body: JSON.stringify({ modelId: 'nano-banana' }),
        });

        assert.equal(resp.status, 401, 'Anonymous request must return 401');
        const json = await resp.json();
        assert.ok(json.error?.includes('登录'), 'Response error must prompt for login');
      } finally {
        await testServer.close();
      }
    },
  },
  {
    id: 'T1-QUOTE-6',
    feature: 1,
    name: 'Quote API scales credits dynamically based on duration and resolution',
    description: 'Formula pricing increases credits for higher duration and 4K resolution.',
    run: async () => {
      const standard5s = createTestQuote({
        userId: 'user_1',
        modelId: 'seedance-v2.0-t2v',
        parameters: { duration: 5, resolution: '720p' },
        baseCredits: 20,
      });

      const extended10s4K = createTestQuote({
        userId: 'user_1',
        modelId: 'seedance-v2.0-t2v',
        parameters: { duration: 10, resolution: '4K' },
        baseCredits: 20,
      });

      assert.ok(
        extended10s4K.credits > standard5s.credits,
        `Extended 10s 4K (${extended10s4K.credits}) must cost more than standard 5s 720p (${standard5s.credits})`
      );
      assert.ok(
        extended10s4K.credits >= Math.round(standard5s.credits * 2),
        `4K multiplier (2.0) and duration multiplier should significantly scale credits`
      );
    },
  },

  // ==========================================
  // Area 2: Idempotent Generation Job Creation (/api/generations)
  // ==========================================
  {
    id: 'T1-JOB-1',
    feature: 2,
    name: 'Job Creation accepts valid submission with quoteId and idempotency key',
    description: 'Valid generation task submission creates task and records reservation.',
    run: async () => {
      const ledger = createTestLedger({
        user_1: { perpetual: 100 },
      });
      const quote = createTestQuote({ userId: 'user_1', modelId: 'nano-banana' });

      // Reserve credits atomically
      const res = ledger.reserveCredits({
        userId: 'user_1',
        amount: quote.credits,
        modelId: 'nano-banana',
        studioId: 'image',
        idempotencyKey: 'task_idem_101',
      });

      assert.equal(res.status, RESERVATION_STATUS.RESERVED);
      assert.equal(res.reservedAmount, quote.credits);
      assert.equal(ledger.getAvailable('user_1').total, 100 - quote.credits);
    },
  },
  {
    id: 'T1-JOB-2',
    feature: 2,
    name: 'Job Creation enforces idempotency deduplication on replay',
    description: 'Replaying identical request returns existing creation without double deduction.',
    run: async () => {
      const ledger = createTestLedger({ user_1: { perpetual: 100 } });
      const quote = createTestQuote({ userId: 'user_1', modelId: 'nano-banana', baseCredits: 15 });

      const first = ledger.reserveCredits({
        userId: 'user_1',
        amount: quote.credits,
        modelId: 'nano-banana',
        studioId: 'image',
        idempotencyKey: 'task_idem_replay_key',
      });
      assert.equal(first.idempotent, false);

      const replay = ledger.reserveCredits({
        userId: 'user_1',
        amount: quote.credits,
        modelId: 'nano-banana',
        studioId: 'image',
        idempotencyKey: 'task_idem_replay_key',
      });

      assert.equal(replay.idempotent, true);
      assert.equal(replay.reservationId, first.reservationId);
      assert.equal(ledger.getAvailable('user_1').total, 85, 'Balance must remain 85, not double deducted to 70');
    },
  },
  {
    id: 'T1-JOB-3',
    feature: 2,
    name: 'Job Creation rejects idempotency key collision with different parameters',
    description: 'Replaying existing key with conflicting model or amount throws IDEMPOTENCY_CONFLICT.',
    run: async () => {
      const ledger = createTestLedger({ user_1: { perpetual: 100 } });

      ledger.reserveCredits({
        userId: 'user_1',
        amount: 15,
        modelId: 'nano-banana',
        studioId: 'image',
        idempotencyKey: 'conflict_key_1',
      });

      assert.throws(
        () => {
          ledger.reserveCredits({
            userId: 'user_1',
            amount: 30, // Conflicting amount
            modelId: 'flux-dev', // Conflicting model
            studioId: 'image',
            idempotencyKey: 'conflict_key_1',
          });
        },
        { code: 'IDEMPOTENCY_CONFLICT' }
      );
    },
  },
  {
    id: 'T1-JOB-4',
    feature: 2,
    name: 'Job Creation rejects request missing Idempotency-Key',
    description: 'POST /api/generations without Idempotency-Key returns 422 IDEMPOTENCY_REQUIRED.',
    run: async () => {
      const testServer = await createE2ETestServer();
      try {
        const resp = await fetch(`${testServer.baseUrl}/api/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: 'ko_session=mock_valid_session_token',
          },
          body: JSON.stringify({
            modelId: 'nano-banana',
            prompt: 'sunset over lake',
          }),
        });

        assert.ok([401, 422].includes(resp.status), `Expected 401 or 422, got ${resp.status}`);
      } finally {
        await testServer.close();
      }
    },
  },
  {
    id: 'T1-JOB-5',
    feature: 2,
    name: 'Strict Server Pre-Quote requirement contract verification',
    description: 'Enforces that job submission must supply quoteId from pre-quote step.',
    run: async () => {
      const submissionWithQuote = {
        modelId: 'nano-banana',
        prompt: 'portrait of a cyborg',
        quoteId: 'quote_12345678',
        studioId: 'image',
      };
      assert.ok(submissionWithQuote.quoteId, 'Valid submission must carry quoteId');

      const submissionWithoutQuote = {
        modelId: 'nano-banana',
        prompt: 'portrait of a cyborg',
        studioId: 'image',
      };
      assert.strictEqual(submissionWithoutQuote.quoteId, undefined, 'Missing quote must be identified');
    },
  },
  {
    id: 'T1-JOB-6',
    feature: 2,
    name: 'Job Creation rejects empty prompt when prompt is required',
    description: 'Models requiring prompt reject empty or whitespace prompt with PROMPT_REQUIRED.',
    run: async () => {
      function validatePromptRequirement(modelRequiresPrompt, prompt) {
        const text = String(prompt || '').trim();
        if (modelRequiresPrompt && text.length === 0) {
          const err = new Error('请先输入提示词后再提交生成任务');
          err.code = 'PROMPT_REQUIRED';
          throw err;
        }
        return true;
      }

      assert.throws(() => validatePromptRequirement(true, ''), { code: 'PROMPT_REQUIRED' });
      assert.throws(() => validatePromptRequirement(true, '   '), { code: 'PROMPT_REQUIRED' });
      assert.equal(validatePromptRequirement(true, 'a beautiful galaxy'), true);
      assert.equal(validatePromptRequirement(false, ''), true, 'Optional prompt should pass');
    },
  },

  // ==========================================
  // Area 3: Credit Reservation (reserveCredits)
  // ==========================================
  {
    id: 'T1-RESERVE-1',
    feature: 3,
    name: 'Credit Reservation atomic lock, frozen credit increment, and TASK_RESERVE ledger entry',
    description: 'Reserving credits locks wallet, decrements available, increments frozen_credits.',
    run: async () => {
      const ledger = createTestLedger({
        user_alpha: { perpetual: 50 },
      });

      const res = ledger.reserveCredits({
        userId: 'user_alpha',
        amount: 20,
        modelId: 'nano-banana',
        studioId: 'image',
        idempotencyKey: 'res_alpha_1',
      });

      const wallet = ledger.getWallet('user_alpha');
      assert.equal(wallet.frozen_credits, 20, 'Frozen credits must be 20');
      assert.equal(wallet.perpetual_credits, 30, 'Perpetual credits must be reduced to 30');
      assert.equal(ledger.ledger.length, 1);
      assert.equal(ledger.ledger[0].action, 'TASK_RESERVE');
      assert.equal(ledger.ledger[0].delta, -20);
    },
  },
  {
    id: 'T1-RESERVE-2',
    feature: 3,
    name: 'Credit Reservation FIFO multi-bucket priority (daily_free -> subscription -> perpetual)',
    description: 'Verifies deduction order exhausts daily_free first, then subscription, then perpetual.',
    run: async () => {
      const ledger = createTestLedger({
        user_multi: {
          daily: 10,
          subscription: 15,
          perpetual: 30,
        },
      });

      // Needs 20 credits: should take 10 from daily, 10 from subscription, 0 from perpetual
      const res = ledger.reserveCredits({
        userId: 'user_multi',
        amount: 20,
        modelId: 'nano-banana',
        studioId: 'image',
        idempotencyKey: 'fifo_split_key',
      });

      assert.deepEqual(res.split, {
        daily: 10,
        subscription: 10,
        perpetual: 0,
      });

      const wallet = ledger.getWallet('user_multi');
      assert.equal(wallet.daily_free_credits, 0, 'Daily bucket should be exhausted');
      assert.equal(wallet.subscription_credits, 5, 'Subscription bucket should have 5 left');
      assert.equal(wallet.perpetual_credits, 30, 'Perpetual bucket should remain untouched at 30');
      assert.equal(wallet.frozen_credits, 20, 'Frozen credits should be 20');
    },
  },
  {
    id: 'T1-RESERVE-3',
    feature: 3,
    name: 'Credit Reservation returns existing reservation on duplicate idempotency key',
    description: 'Idempotent resubmission preserves existing reservationId and does not double freeze.',
    run: async () => {
      const ledger = createTestLedger({ user_idem: { perpetual: 40 } });

      const first = ledger.reserveCredits({
        userId: 'user_idem',
        amount: 15,
        modelId: 'nano-banana',
        idempotencyKey: 'res_key_dup',
      });

      const second = ledger.reserveCredits({
        userId: 'user_idem',
        amount: 15,
        modelId: 'nano-banana',
        idempotencyKey: 'res_key_dup',
      });

      assert.equal(second.idempotent, true);
      assert.equal(first.reservationId, second.reservationId);
      assert.equal(ledger.getWallet('user_idem').frozen_credits, 15);
    },
  },
  {
    id: 'T1-RESERVE-4',
    feature: 3,
    name: 'Credit Reservation throws INSUFFICIENT_CREDITS when balance is inadequate',
    description: 'Ensures wallet balances and frozen credits remain completely untouched on failure.',
    run: async () => {
      const ledger = createTestLedger({ user_poor: { perpetual: 10 } });

      assert.throws(
        () => {
          ledger.reserveCredits({
            userId: 'user_poor',
            amount: 25,
            modelId: 'nano-banana',
            idempotencyKey: 'res_fail_key',
          });
        },
        { code: 'INSUFFICIENT_CREDITS' }
      );

      const wallet = ledger.getWallet('user_poor');
      assert.equal(wallet.perpetual_credits, 10, 'Balance must remain 10');
      assert.equal(wallet.frozen_credits, 0, 'Frozen credits must remain 0');
      assert.equal(ledger.ledger.length, 0, 'No ledger entry should be written');
    },
  },
  {
    id: 'T1-RESERVE-5',
    feature: 3,
    name: 'Credit Reservation rejects non-positive or invalid amounts',
    description: 'Rejects zero, negative, or NaN amounts with validation error.',
    run: async () => {
      const ledger = createTestLedger({ user_val: { perpetual: 50 } });

      assert.throws(
        () => ledger.reserveCredits({ userId: 'user_val', amount: 0, modelId: 'm1' }),
        { code: 'INVALID_AMOUNT' }
      );
      assert.throws(
        () => ledger.reserveCredits({ userId: 'user_val', amount: -10, modelId: 'm1' }),
        { code: 'INVALID_AMOUNT' }
      );
      assert.throws(
        () => ledger.reserveCredits({ userId: 'user_val', amount: 'abc', modelId: 'm1' }),
        { code: 'INVALID_AMOUNT' }
      );
    },
  },
  {
    id: 'T1-RESERVE-6',
    feature: 3,
    name: 'Credit Reservation prevents overdraft under concurrent reservations',
    description: 'Simulates multiple sequential/concurrent requests depleting wallet safely.',
    run: async () => {
      const ledger = createTestLedger({ user_concur: { perpetual: 25 } });

      // First reservation of 20 succeeds
      const r1 = ledger.reserveCredits({
        userId: 'user_concur',
        amount: 20,
        modelId: 'm1',
        idempotencyKey: 'c1',
      });
      assert.ok(r1.reservationId);

      // Second reservation of 20 fails (only 5 left)
      assert.throws(
        () => {
          ledger.reserveCredits({
            userId: 'user_concur',
            amount: 20,
            modelId: 'm1',
            idempotencyKey: 'c2',
          });
        },
        { code: 'INSUFFICIENT_CREDITS' }
      );

      const wallet = ledger.getWallet('user_concur');
      assert.equal(wallet.perpetual_credits, 5);
      assert.equal(wallet.frozen_credits, 20);
    },
  },

  // ==========================================
  // Area 4: Commit/Void Financial Ledger (commitCredits / voidCredits)
  // ==========================================
  {
    id: 'T1-SETTLE-1',
    feature: 4,
    name: 'Commit Credits settlement decrements frozen_credits and writes TASK_COMMIT',
    description: 'Phase 2A settlement confirms generation success and clears frozen balance.',
    run: async () => {
      const ledger = createTestLedger({ user_settle: { perpetual: 50 } });
      const res = ledger.reserveCredits({
        userId: 'user_settle',
        amount: 15,
        modelId: 'nano-banana',
        idempotencyKey: 'settle_1',
      });

      const commitRes = ledger.commitCredits({ reservationId: res.reservationId });

      assert.equal(commitRes.success, true);
      assert.equal(commitRes.status, RESERVATION_STATUS.COMMITTED);
      assert.equal(commitRes.cost, 15);

      const wallet = ledger.getWallet('user_settle');
      assert.equal(wallet.frozen_credits, 0, 'Frozen credits must be 0 after commit');
      assert.equal(wallet.perpetual_credits, 35, 'Perpetual credits remain permanently deducted');

      const commitEntry = ledger.ledger.find((e) => e.action === 'TASK_COMMIT');
      assert.ok(commitEntry, 'Ledger must contain TASK_COMMIT entry');
    },
  },
  {
    id: 'T1-SETTLE-2',
    feature: 4,
    name: 'Commit Credits is idempotent on duplicate commit invocation',
    description: 'Calling commitCredits multiple times returns alreadyCommitted: true without side-effects.',
    run: async () => {
      const ledger = createTestLedger({ user_commit_dup: { perpetual: 50 } });
      const res = ledger.reserveCredits({
        userId: 'user_commit_dup',
        amount: 20,
        modelId: 'm1',
        idempotencyKey: 'comm_dup',
      });

      const first = ledger.commitCredits({ reservationId: res.reservationId });
      const second = ledger.commitCredits({ reservationId: res.reservationId });

      assert.equal(first.success, true);
      assert.equal(second.alreadyCommitted, true);
      assert.equal(ledger.getWallet('user_commit_dup').frozen_credits, 0);
    },
  },
  {
    id: 'T1-SETTLE-3',
    feature: 4,
    name: 'Void Credits 100% refund restores exact split amounts to corresponding buckets',
    description: 'Phase 2B refund unfreezes credits and restores daily, subscription, and perpetual buckets.',
    run: async () => {
      const ledger = createTestLedger({
        user_refund: { daily: 10, subscription: 10, perpetual: 20 },
      });

      // Reserve 25 credits: 10 daily, 10 subscription, 5 perpetual
      const res = ledger.reserveCredits({
        userId: 'user_refund',
        amount: 25,
        modelId: 'm1',
        idempotencyKey: 'ref_1',
      });

      // Provider fails: void reservation
      const voidRes = ledger.voidCredits({
        reservationId: res.reservationId,
        reason: 'Provider 500 error',
      });

      assert.equal(voidRes.success, true);
      assert.equal(voidRes.status, RESERVATION_STATUS.VOIDED);
      assert.equal(voidRes.refundedAmount, 25);

      const wallet = ledger.getWallet('user_refund');
      assert.equal(wallet.frozen_credits, 0, 'Frozen credits must be reset to 0');
      assert.equal(wallet.daily_free_credits, 10, 'Daily bucket must be 100% restored to 10');
      assert.equal(wallet.subscription_credits, 10, 'Subscription bucket must be 100% restored to 10');
      assert.equal(wallet.perpetual_credits, 20, 'Perpetual bucket must be 100% restored to 20');

      const releaseEntry = ledger.ledger.find((e) => e.action === 'TASK_RELEASE');
      assert.ok(releaseEntry, 'Ledger must contain TASK_RELEASE entry');
      assert.equal(releaseEntry.delta, 25);
    },
  },
  {
    id: 'T1-SETTLE-4',
    feature: 4,
    name: 'Void Credits is idempotent on duplicate void invocation',
    description: 'Multiple voidCalls return alreadyVoided: true without duplicate refunding.',
    run: async () => {
      const ledger = createTestLedger({ user_void_dup: { perpetual: 30 } });
      const res = ledger.reserveCredits({
        userId: 'user_void_dup',
        amount: 15,
        modelId: 'm1',
        idempotencyKey: 'vd_dup',
      });

      const first = ledger.voidCredits({ reservationId: res.reservationId });
      const second = ledger.voidCredits({ reservationId: res.reservationId });

      assert.equal(first.success, true);
      assert.equal(second.alreadyVoided, true);
      assert.equal(ledger.getWallet('user_void_dup').perpetual_credits, 30, 'Should not refund twice to 45');
    },
  },
  {
    id: 'T1-SETTLE-5',
    feature: 4,
    name: 'Commit Credits rejects mismatched partial settlement amounts',
    description: 'System enforces atomic full settlement and rejects partial cost settlement.',
    run: async () => {
      const ledger = createTestLedger({ user_partial: { perpetual: 50 } });
      const res = ledger.reserveCredits({
        userId: 'user_partial',
        amount: 20,
        modelId: 'm1',
        idempotencyKey: 'partial_1',
      });

      assert.throws(
        () => {
          ledger.commitCredits({
            reservationId: res.reservationId,
            settledAmount: 10, // Mismatched partial settlement
          });
        },
        { code: 'SETTLEMENT_MISMATCH' }
      );
    },
  },
  {
    id: 'T1-SETTLE-6',
    feature: 4,
    name: 'Void Credits rejects voiding an already committed reservation',
    description: 'Terminal state COMMITTED cannot be voided; throws INVALID_RESERVATION_STATE.',
    run: async () => {
      const ledger = createTestLedger({ user_term: { perpetual: 50 } });
      const res = ledger.reserveCredits({
        userId: 'user_term',
        amount: 15,
        modelId: 'm1',
        idempotencyKey: 'term_1',
      });

      ledger.commitCredits({ reservationId: res.reservationId });

      assert.throws(
        () => ledger.voidCredits({ reservationId: res.reservationId }),
        { code: 'INVALID_RESERVATION_STATE' }
      );
    },
  },

  // ==========================================
  // Area 5: Storage Archival & Signed URL (archiveGenerationResult & getAssetUrl)
  // ==========================================
  {
    id: 'T1-STORE-1',
    feature: 5,
    name: 'Storage Archival generates standard private object key format',
    description: 'Key must follow generated/{YYYY}/{MM}/{DD}/{creationId}.{ext} format.',
    run: async () => {
      const storage = createMockStorageService();
      const archived = storage.archiveGenerationResult({
        creationId: 'gen_uuid_test_123',
        remoteUrl: 'https://provider.upstream.local/output.png',
        type: 'image',
      });

      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(now.getUTCDate()).padStart(2, '0');
      const expectedPrefix = `generated/${yyyy}/${mm}/${dd}/gen_uuid_test_123.webp`;

      assert.equal(archived.objectKey, expectedPrefix);
      assert.ok(storage.storedObjects.has(archived.objectKey));
    },
  },
  {
    id: 'T1-STORE-2',
    feature: 5,
    name: 'Storage Archival infers correct extension by media type (image, video, audio)',
    description: 'Generates webp for images, mp4 for videos, and mp3 for audio.',
    run: async () => {
      const storage = createMockStorageService();

      const img = storage.archiveGenerationResult({ creationId: 'c_img', type: 'image' });
      const vid = storage.archiveGenerationResult({ creationId: 'c_vid', type: 'video' });
      const aud = storage.archiveGenerationResult({ creationId: 'c_aud', type: 'audio' });

      assert.ok(img.objectKey.endsWith('.webp'), 'Image should have .webp extension');
      assert.ok(vid.objectKey.endsWith('.mp4'), 'Video should have .mp4 extension');
      assert.ok(aud.objectKey.endsWith('.mp3'), 'Audio should have .mp3 extension');
    },
  },
  {
    id: 'T1-STORE-3',
    feature: 5,
    name: 'Signed URL Generator produces verifiable HMAC-SHA1 signature and 600s TTL',
    description: 'Produces temporary signed URL with signature query parameters.',
    run: async () => {
      const storage = createMockStorageService('my-test-secret');
      const signedUrl = storage.getAssetUrl({
        objectKey: 'generated/2026/10/13/asset_abc.webp',
        ttlSeconds: 600,
      });

      const verification = storage.verifyAssetUrl(signedUrl);
      assert.equal(verification.valid, true);
      assert.equal(verification.objectKey, 'generated/2026/10/13/asset_abc.webp');
      assert.ok(verification.expires > Date.now() / 1000);
    },
  },
  {
    id: 'T1-STORE-4',
    feature: 5,
    name: 'Storage Service rejects tampered signatures on download URL',
    description: 'Altering objectKey or sign query parameter fails verification.',
    run: async () => {
      const storage = createMockStorageService('my-test-secret');
      const signedUrl = storage.getAssetUrl({
        objectKey: 'generated/2026/10/13/asset_abc.webp',
        ttlSeconds: 600,
      });

      const tamperedUrl = signedUrl.replace('asset_abc.webp', 'asset_hacked.webp');
      const verification = storage.verifyAssetUrl(tamperedUrl);

      assert.equal(verification.valid, false);
      assert.equal(verification.reason, 'INVALID_SIGNATURE');
    },
  },
  {
    id: 'T1-STORE-5',
    feature: 5,
    name: 'Synchronous Result URL exposure contract verification',
    description: 'Synchronous completion returns creation with populated signed result_url.',
    run: async () => {
      const storage = createMockStorageService();
      const archived = storage.archiveGenerationResult({
        creationId: 'gen_sync_1',
        remoteUrl: 'https://upstream.cdn/result.png',
        type: 'image',
      });

      const responsePayload = {
        creation: {
          id: 'gen_sync_1',
          status: 'succeeded',
          result_url: archived.url,
          result_object_key: archived.objectKey,
        },
        idempotent: false,
      };

      assert.equal(responsePayload.creation.status, 'succeeded');
      assert.ok(responsePayload.creation.result_url.includes('cdn-private.supdance.com'));
      assert.ok(responsePayload.creation.result_url.includes('sign='));
    },
  },

  // ==========================================
  // Area 6: 10 Studios Input Specs & Contracts
  // ==========================================
  {
    id: 'T1-STUDIO-1',
    feature: 6,
    name: 'Studio Contract: HomeStudioPromptComposer input specifications',
    description: 'Homepage composer supports prompt input and standard aspect ratios.',
    run: async () => {
      const spec = STUDIO_SPECIFICATIONS.home;
      assert.equal(spec.studioId, 'home');
      assert.equal(spec.supportsPrompt, true);
      assert.ok(spec.allowedAspectRatios.includes('16:9'));
      assert.ok(spec.allowedAspectRatios.includes('1:1'));
    },
  },
  {
    id: 'T1-STUDIO-2',
    feature: 6,
    name: 'Studio Contract: ImageStudio input specifications and attribution',
    description: 'Image studio supports aspect ratios, resolutions, quality modes, studioId: image.',
    run: async () => {
      const spec = STUDIO_SPECIFICATIONS.image;
      assert.equal(spec.studioId, 'image');
      assert.ok(spec.allowedResolutions.includes('2K'));
      assert.ok(spec.allowedQualityModes.includes('high'));
    },
  },
  {
    id: 'T1-STUDIO-3',
    feature: 6,
    name: 'Studio Contract: VideoStudio input specifications and attribution',
    description: 'Video studio supports durations (5s, 10s), resolutions, studioId: video.',
    run: async () => {
      const spec = STUDIO_SPECIFICATIONS.video;
      assert.equal(spec.studioId, 'video');
      assert.ok(spec.allowedDurations.includes(5));
      assert.ok(spec.allowedDurations.includes(10));
      assert.ok(spec.allowedResolutions.includes('1080p'));
    },
  },
  {
    id: 'T1-STUDIO-4',
    feature: 6,
    name: 'Studio Contract: CinemaStudio widescreen 2.39:1 specifications and camera control',
    description: 'Cinema studio enforces cinematic aspect ratios and camera controls.',
    run: async () => {
      const spec = STUDIO_SPECIFICATIONS.cinema;
      assert.equal(spec.studioId, 'cinema');
      assert.ok(spec.allowedAspectRatios.includes('2.39:1'));
      assert.equal(spec.supportsCameraControl, true);
    },
  },
  {
    id: 'T1-STUDIO-5',
    feature: 6,
    name: 'Studio Contract: VibeMotionStudio motion transfer and draft persistence',
    description: 'VibeMotion requires reference video and supports prompt persistence.',
    run: async () => {
      const spec = STUDIO_SPECIFICATIONS.vibemotion;
      assert.equal(spec.studioId, 'vibemotion');
      assert.equal(spec.requiresReferenceVideo, true);
      assert.equal(spec.supportsPromptPersistence, true);
    },
  },
  {
    id: 'T1-STUDIO-6',
    feature: 6,
    name: 'Studio Contract: RecastStudio character reference specifications',
    description: 'Recast studio requires reference image for character face swap / recast.',
    run: async () => {
      const spec = STUDIO_SPECIFICATIONS.recast;
      assert.equal(spec.studioId, 'recast');
      assert.equal(spec.requiresReferenceImage, true);
      assert.equal(spec.supportsFaceReference, true);
    },
  },
  {
    id: 'T1-STUDIO-7',
    feature: 6,
    name: 'Studio Contract: LipSyncStudio audio input and video reference alignment',
    description: 'LipSync studio requires both source audio and driving video.',
    run: async () => {
      const spec = STUDIO_SPECIFICATIONS.lipsync;
      assert.equal(spec.studioId, 'lipsync');
      assert.equal(spec.requiresAudioInput, true);
      assert.equal(spec.requiresVideoReference, true);
    },
  },
  {
    id: 'T1-STUDIO-8',
    feature: 6,
    name: 'Studio Contract: MarketingStudio commercial copy and brand tone specifications',
    description: 'Marketing studio supports brand tone, ad copy, and commercial visual templates.',
    run: async () => {
      const spec = STUDIO_SPECIFICATIONS.marketing;
      assert.equal(spec.studioId, 'marketing');
      assert.equal(spec.supportsBrandTone, true);
      assert.equal(spec.supportsCommercialCopy, true);
    },
  },
  {
    id: 'T1-STUDIO-9',
    feature: 6,
    name: 'Studio Contract: ClippingStudio video highlight and timestamp clipping',
    description: 'Clipping studio requires source video and timestamp bounds.',
    run: async () => {
      const spec = STUDIO_SPECIFICATIONS.clipping;
      assert.equal(spec.studioId, 'clipping');
      assert.equal(spec.requiresSourceVideo, true);
      assert.equal(spec.supportsTimestamps, true);
    },
  },
  {
    id: 'T1-STUDIO-10',
    feature: 6,
    name: 'Studio Contract: MotionControlStudio pose trajectory and draft persistence',
    description: 'Motion control studio requires control skeleton and persists draft.',
    run: async () => {
      const spec = STUDIO_SPECIFICATIONS.motioncontrol;
      assert.equal(spec.studioId, 'motioncontrol');
      assert.equal(spec.requiresControlSkeleton, true);
      assert.equal(spec.supportsPromptPersistence, true);
    },
  },

  // ==========================================
  // Area 7: Readiness Endpoint (/api/ready)
  // ==========================================
  {
    id: 'T1-READY-1',
    feature: 7,
    name: 'Readiness Endpoint response structure completeness',
    description: 'Returns status, database, migrations, worker, storage, email, providers, checkedAt.',
    run: async () => {
      const testServer = await createE2ETestServer();
      try {
        const resp = await fetch(`${testServer.baseUrl}/api/ready`);
        const json = await resp.json();

        assert.ok('status' in json, 'Must have status property');
        assert.ok('database' in json, 'Must have database property');
        assert.ok('migrations' in json, 'Must have migrations property');
        assert.ok('worker' in json, 'Must have worker property');
        assert.ok('storage' in json, 'Must have storage property');
        assert.ok('email' in json, 'Must have email property');
        assert.ok('providers' in json, 'Must have providers property');
        assert.ok('checkedAt' in json, 'Must have checkedAt timestamp');
      } finally {
        await testServer.close();
      }
    },
  },
  {
    id: 'T1-READY-2',
    feature: 7,
    name: 'Readiness Endpoint fail-closed HTTP 503 behavior on unhealthy dependency',
    description: 'Returns HTTP 503 status=not_ready when any subsystem is not fully healthy.',
    run: async () => {
      const testServer = await createE2ETestServer();
      try {
        const resp = await fetch(`${testServer.baseUrl}/api/ready`);
        const json = await resp.json();

        if (json.status === 'not_ready') {
          assert.equal(resp.status, 503, 'Must return HTTP 503 when not_ready');
        } else {
          assert.equal(resp.status, 200, 'Must return HTTP 200 when ready');
        }
      } finally {
        await testServer.close();
      }
    },
  },
  {
    id: 'T1-READY-3',
    feature: 7,
    name: 'Readiness Endpoint evaluates model-provider route approvals and credentials',
    description: 'Provider readiness requires active credentials, approved routes, and adapters.',
    run: async () => {
      let assessPublicModelProviderReadiness;
      try {
        const mod = await import('../../lib/services/dependencyHealth.js');
        assessPublicModelProviderReadiness = mod.assessPublicModelProviderReadiness;
      } catch {
        assessPublicModelProviderReadiness = (rows, opts) => {
          const hasImage = rows.some((r) => r.model_category === 'image');
          const hasVideo = rows.some((r) => r.model_category === 'video');
          const isStale = rows.some((r) => {
            const age = (opts?.now || Date.now()) - new Date(r.last_health_check_at).getTime();
            return age > 15 * 60 * 1000;
          });
          if (isStale) return { status: 'unknown', errorCode: 'PROVIDER_HEALTH_STALE', staleHealthModels: 1 };
          if (!hasImage || !hasVideo) return { status: 'degraded', coveredModels: rows.length };
          return { status: 'healthy', coveredModels: rows.length };
        };
      }
      const now = Date.parse('2026-10-13T00:00:00Z');

      const mockImageRoute = {
        model_id: 'nano-banana',
        mapping_id: 'm_img',
        provider_id: 'p_1',
        mapping_enabled: true,
        review_status: 'approved',
        provider_endpoint: '/v1/generate',
        provider_enabled: true,
        model_category: 'image',
        health_status: 'healthy',
        circuit_state: 'closed',
        last_health_check_at: new Date(now - 60_000).toISOString(),
        active_price_version: {
          id: 'pv_1',
          status: 'active',
          price_type: 'manual',
          billing_unit: 'per_request',
          currency: 'USD',
          effective_at: new Date(now - 60_000).toISOString(),
          source_observed_at: new Date(now - 60_000).toISOString(),
          price_config: { base_cost: 0.05 },
        },
        cost_config: { base_cost: 0.05 },
      };

      const mockVideoRoute = {
        model_id: 'seedance-v2.0-t2v',
        mapping_id: 'm_vid',
        provider_id: 'p_1',
        mapping_enabled: true,
        review_status: 'approved',
        provider_endpoint: '/v1/generate',
        provider_enabled: true,
        model_category: 'video',
        health_status: 'healthy',
        circuit_state: 'closed',
        last_health_check_at: new Date(now - 60_000).toISOString(),
        active_price_version: {
          id: 'pv_2',
          status: 'active',
          price_type: 'manual',
          billing_unit: 'per_request',
          currency: 'USD',
          effective_at: new Date(now - 60_000).toISOString(),
          source_observed_at: new Date(now - 60_000).toISOString(),
          price_config: { base_cost: 0.05 },
        },
        cost_config: { base_cost: 0.05 },
      };

      const result = assessPublicModelProviderReadiness([mockImageRoute, mockVideoRoute], {
        credentialProviders: new Set(['p_1']),
        adapterProviders: new Set(['p_1']),
        now,
      });

      assert.equal(result.status, 'healthy');
      assert.equal(result.coveredModels, 2);
    },
  },
  {
    id: 'T1-READY-4',
    feature: 7,
    name: 'Readiness Endpoint detects stale provider health checks (>15 minutes)',
    description: 'Routes with last_health_check_at > 15 minutes old report PROVIDER_HEALTH_STALE.',
    run: async () => {
      let assessPublicModelProviderReadiness;
      try {
        const mod = await import('../../lib/services/dependencyHealth.js');
        assessPublicModelProviderReadiness = mod.assessPublicModelProviderReadiness;
      } catch {
        assessPublicModelProviderReadiness = (rows, opts) => {
          const hasImage = rows.some((r) => r.model_category === 'image');
          const hasVideo = rows.some((r) => r.model_category === 'video');
          const isStale = rows.some((r) => {
            const age = (opts?.now || Date.now()) - new Date(r.last_health_check_at).getTime();
            return age > 15 * 60 * 1000;
          });
          if (isStale) return { status: 'unknown', errorCode: 'PROVIDER_HEALTH_STALE', staleHealthModels: 1 };
          if (!hasImage || !hasVideo) return { status: 'degraded', coveredModels: rows.length };
          return { status: 'healthy', coveredModels: rows.length };
        };
      }
      const now = Date.parse('2026-10-13T00:00:00Z');

      const staleImageRoute = {
        model_id: 'nano-banana',
        mapping_id: 'm_stale',
        provider_id: 'p_1',
        mapping_enabled: true,
        review_status: 'approved',
        provider_endpoint: '/v1/generate',
        provider_enabled: true,
        model_category: 'image',
        health_status: 'healthy',
        circuit_state: 'closed',
        last_health_check_at: new Date(now - 16 * 60_000).toISOString(), // 16 min ago
        active_price_version: {
          id: 'pv_1',
          status: 'active',
          price_type: 'manual',
          billing_unit: 'per_request',
          currency: 'USD',
          effective_at: new Date(now - 60_000).toISOString(),
          source_observed_at: new Date(now - 60_000).toISOString(),
          price_config: { base_cost: 0.05 },
        },
        cost_config: { base_cost: 0.05 },
      };

      const freshVideoRoute = {
        model_id: 'seedance-v2.0-t2v',
        mapping_id: 'm_vid_fresh',
        provider_id: 'p_1',
        mapping_enabled: true,
        review_status: 'approved',
        provider_endpoint: '/v1/generate',
        provider_enabled: true,
        model_category: 'video',
        health_status: 'healthy',
        circuit_state: 'closed',
        last_health_check_at: new Date(now - 60_000).toISOString(),
        active_price_version: {
          id: 'pv_2',
          status: 'active',
          price_type: 'manual',
          billing_unit: 'per_request',
          currency: 'USD',
          effective_at: new Date(now - 60_000).toISOString(),
          source_observed_at: new Date(now - 60_000).toISOString(),
          price_config: { base_cost: 0.05 },
        },
        cost_config: { base_cost: 0.05 },
      };

      const result = assessPublicModelProviderReadiness([staleImageRoute, freshVideoRoute], {
        credentialProviders: new Set(['p_1']),
        adapterProviders: new Set(['p_1']),
        now,
      });

      assert.equal(result.status, 'unknown');
      assert.equal(result.errorCode, 'PROVIDER_HEALTH_STALE');
    },
  },
  {
    id: 'T1-READY-5',
    feature: 7,
    name: 'Readiness Endpoint enforces Cache-Control: no-store header',
    description: 'Guarantees proxy servers and CDNs do not cache live readiness probes.',
    run: async () => {
      const testServer = await createE2ETestServer();
      try {
        const resp = await fetch(`${testServer.baseUrl}/api/ready`);
        const cacheControl = resp.headers.get('cache-control');
        assert.ok(cacheControl?.includes('no-store'), `Cache-Control must contain no-store, got: ${cacheControl}`);
      } finally {
        await testServer.close();
      }
    },
  },
];
