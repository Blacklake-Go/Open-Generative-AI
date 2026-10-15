import test from 'node:test';
import assert from 'node:assert/strict';
import { tier1Tests } from './e2e/ui-v370/tier1-features.mjs';
import { tier2Tests } from './e2e/ui-v370/tier2-boundaries.mjs';
import { tier3Tests } from './e2e/ui-v370/tier3-combinations.mjs';
import { tier4Tests } from './e2e/ui-v370/tier4-scenarios.mjs';

test('UI v3.7.0 E2E Tier 1: Feature Coverage (F1..F8)', async (t) => {
  for (const testCase of tier1Tests) {
    await t.test(`[F${testCase.feature}] ${testCase.id}: ${testCase.name}`, async () => {
      await testCase.run();
    });
  }
});

test('UI v3.7.0 E2E Tier 2: Boundary & Corner Cases (F1..F8)', async (t) => {
  for (const testCase of tier2Tests) {
    await t.test(`[F${testCase.feature}] ${testCase.id}: ${testCase.name}`, async () => {
      await testCase.run();
    });
  }
});

test('UI v3.7.0 E2E Tier 3: Cross-Feature Interactions', async (t) => {
  for (const testCase of tier3Tests) {
    await t.test(`[F${testCase.features.join('+')}] ${testCase.id}: ${testCase.name}`, async () => {
      await testCase.run();
    });
  }
});

test('UI v3.7.0 E2E Tier 4: Real-World Application Scenarios', async (t) => {
  for (const testCase of tier4Tests) {
    await t.test(`${testCase.id}: ${testCase.name}`, async () => {
      await testCase.run();
    });
  }
});
