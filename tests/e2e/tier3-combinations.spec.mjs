import { test } from '@playwright/test';
import { tier3Tests } from './tier3-combinations.mjs';

test.describe('Tier 3: Cross-Feature Combinations Specifications', () => {
  for (const t of tier3Tests) {
    test(`[Tier 3] ${t.id}: ${t.name}`, async () => {
      await t.run();
    });
  }
});
