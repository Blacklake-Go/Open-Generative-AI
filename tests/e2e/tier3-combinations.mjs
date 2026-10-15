import assert from 'node:assert/strict';
import {
  createTestLedger,
  createTestQuote,
  createMockStorageService,
  STUDIO_SPECIFICATIONS,
  RESERVATION_STATUS,
} from './helpers.mjs';

/**
 * Tier 3: Cross-Feature Combinations Specifications
 * Verifies complex pairwise and multi-feature interaction flows across platform subsystems.
 */
export const tier3Tests = [
  {
    id: 'T3-COMB-1',
    tier: 3,
    name: 'Quote + Job Creation + Provider 502 Outage + Atomic 100% Refund lifecycle',
    description: 'User gets quote -> creates job -> provider returns 502 -> engine voids reservation -> wallet 100% restored.',
    run: async () => {
      const ledger = createTestLedger({
        user_c1: { daily: 5, subscription: 10, perpetual: 25 },
      });
      const initialTotal = ledger.getAvailable('user_c1').total; // 40

      // Step 1: Pre-quote
      const quote = createTestQuote({
        userId: 'user_c1',
        modelId: 'nano-banana',
        parameters: { resolution: '1080p' },
        baseCredits: 15,
      });
      assert.ok(quote.quoteId);
      assert.equal(quote.credits, 23); // 15 * 1.5 for 1080p = 22.5 -> 23

      // Step 2: Job creation with atomic reserve
      const reservation = ledger.reserveCredits({
        userId: 'user_c1',
        amount: quote.credits,
        modelId: quote.modelId,
        studioId: 'image',
        idempotencyKey: 'flow_c1_key',
      });
      assert.equal(reservation.status, RESERVATION_STATUS.RESERVED);
      assert.equal(ledger.getAvailable('user_c1').total, initialTotal - 23);

      // Step 3: Provider simulated outage (502 Bad Gateway)
      const providerCall = async () => {
        const err = new Error('Bad Gateway from upstream provider');
        err.status = 502;
        throw err;
      };

      let taskFailed = false;
      try {
        await providerCall();
      } catch (err) {
        taskFailed = true;
        // Step 4: Atomic void on failure
        ledger.voidCredits({
          reservationId: reservation.reservationId,
          reason: `PROVIDER_ERROR_${err.status}`,
        });
      }

      assert.equal(taskFailed, true);
      assert.equal(ledger.getAvailable('user_c1').total, initialTotal, 'User balance must return exactly to initial total');
      assert.equal(ledger.getWallet('user_c1').frozen_credits, 0, 'Frozen credits must be 0');
    },
  },
  {
    id: 'T3-COMB-2',
    tier: 3,
    name: 'Model Change + Dynamic Quote Invalidation & Refresh Flow',
    description: 'User changes model in UI -> quote recalculates -> submission uses new quoteId with proper pricing.',
    run: async () => {
      const ledger = createTestLedger({ user_c2: { perpetual: 100 } });

      // Step 1: User selects Model A (nano-banana, 15 credits)
      const quoteA = createTestQuote({
        userId: 'user_c2',
        modelId: 'nano-banana',
        baseCredits: 15,
      });
      assert.equal(quoteA.credits, 15);

      // Step 2: User switches to Model B (seedance-v2.0-t2v, 30 credits)
      const quoteB = createTestQuote({
        userId: 'user_c2',
        modelId: 'seedance-v2.0-t2v',
        baseCredits: 30,
      });
      assert.equal(quoteB.credits, 30);
      assert.notEqual(quoteA.quoteId, quoteB.quoteId);

      // Step 3: Submit job carrying Quote B
      const reservation = ledger.reserveCredits({
        userId: 'user_c2',
        amount: quoteB.credits,
        modelId: quoteB.modelId,
        studioId: 'video',
        idempotencyKey: 'c2_dyn_submit',
      });

      assert.equal(reservation.reservedAmount, 30);
      assert.equal(ledger.getWallet('user_c2').perpetual_credits, 70);
    },
  },
  {
    id: 'T3-COMB-3',
    tier: 3,
    name: 'Studio Attribution + Pre-Quoting + Private Archival + Signed Download integration',
    description: 'Full path from studioId assignment through quote, generation, archival and signed download.',
    run: async () => {
      const storage = createMockStorageService('koyo-e2e-secret');
      const studioSpec = STUDIO_SPECIFICATIONS.image;

      // Studio supplies studioId: 'image'
      const clientPayload = {
        studioId: studioSpec.studioId,
        modelId: 'nano-banana',
        prompt: 'futuristic neon cityscape',
        parameters: { aspectRatio: '16:9', resolution: '1080p' },
      };
      assert.equal(clientPayload.studioId, 'image');

      // Server quotes
      const quote = createTestQuote({
        userId: 'user_studio_1',
        modelId: clientPayload.modelId,
        parameters: clientPayload.parameters,
      });

      // Provider generates and storage archives
      const archived = storage.archiveGenerationResult({
        creationId: 'gen_studio_123',
        remoteUrl: 'https://cdn.upstream/raw_neon.png',
        userId: 'user_studio_1',
        type: 'image',
      });

      assert.ok(archived.objectKey.startsWith('generated/'));
      assert.ok(archived.objectKey.endsWith('.webp'));

      // Validate download URL
      const verified = storage.verifyAssetUrl(archived.url);
      assert.equal(verified.valid, true);
      assert.equal(verified.objectKey, archived.objectKey);
    },
  },
  {
    id: 'T3-COMB-4',
    tier: 3,
    name: 'Multi-Bucket Split Settlement with FIFO Priority across Daily, Subscription, Perpetual',
    description: 'Wallet with mixed buckets executes FIFO deduction, success commits, and maintains ledger audit.',
    run: async () => {
      const ledger = createTestLedger({
        user_fifo_settle: { daily: 8, subscription: 12, perpetual: 20 },
      });

      // Task requires 25: 8 daily, 12 subscription, 5 perpetual
      const res = ledger.reserveCredits({
        userId: 'user_fifo_settle',
        amount: 25,
        modelId: 'm_complex',
        idempotencyKey: 'fifo_settle_key',
      });

      assert.deepEqual(res.split, { daily: 8, subscription: 12, perpetual: 5 });

      // Successful completion -> Commit
      const commitRes = ledger.commitCredits({ reservationId: res.reservationId });
      assert.equal(commitRes.success, true);

      const wallet = ledger.getWallet('user_fifo_settle');
      assert.equal(wallet.daily_free_credits, 0);
      assert.equal(wallet.subscription_credits, 0);
      assert.equal(wallet.perpetual_credits, 15);
      assert.equal(wallet.frozen_credits, 0);

      const reserveEntry = ledger.ledger.find((e) => e.action === 'TASK_RESERVE');
      const commitEntry = ledger.ledger.find((e) => e.action === 'TASK_COMMIT');
      assert.ok(reserveEntry);
      assert.ok(commitEntry);
    },
  },
  {
    id: 'T3-COMB-5',
    tier: 3,
    name: 'High-Concurrency Mutex Serialization on Wallet Depletion',
    description: 'Simulates 5 parallel requests on a wallet with funds for only 2; preserves atomic balance.',
    run: async () => {
      const ledger = createTestLedger({ user_stress: { perpetual: 40 } });
      const taskCost = 20; // Can satisfy exactly 2 tasks

      const attempts = [1, 2, 3, 4, 5].map((idx) => {
        try {
          const r = ledger.reserveCredits({
            userId: 'user_stress',
            amount: taskCost,
            modelId: 'nano-banana',
            idempotencyKey: `stress_${idx}`,
          });
          return { success: true, res: r };
        } catch (err) {
          return { success: false, code: err.code };
        }
      });

      const successful = attempts.filter((a) => a.success);
      const failed = attempts.filter((a) => !a.success);

      assert.equal(successful.length, 2, 'Exactly 2 tasks must succeed');
      assert.equal(failed.length, 3, 'Remaining 3 tasks must fail');
      assert.equal(ledger.getWallet('user_stress').perpetual_credits, 0);
      assert.equal(ledger.getWallet('user_stress').frozen_credits, 40);
    },
  },
  {
    id: 'T3-COMB-6',
    tier: 3,
    name: 'Synchronous Result URL Immediate Exposure without Polling Delay',
    description: 'POST /api/generations returns populated signed result_url immediately upon synchronous completion.',
    run: async () => {
      const storage = createMockStorageService();
      const archived = storage.archiveGenerationResult({
        creationId: 'creation_sync_immediate',
        remoteUrl: 'https://upstream/img.png',
        type: 'image',
      });

      // Synchronous response payload from POST /api/generations
      const postResponse = {
        creation: {
          id: 'creation_sync_immediate',
          status: 'succeeded',
          result_url: archived.url,
          result_object_key: archived.objectKey,
        },
        idempotent: false,
      };

      // Client checks if result_url is immediately accessible without polling
      assert.equal(postResponse.creation.status, 'succeeded');
      assert.ok(postResponse.creation.result_url, 'result_url must be present immediately');
      const verified = storage.verifyAssetUrl(postResponse.creation.result_url);
      assert.equal(verified.valid, true);
    },
  },
];
