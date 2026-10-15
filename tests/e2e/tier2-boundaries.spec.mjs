import { test } from '@playwright/test';
import { tier2Tests } from './tier2-boundaries.mjs';

test.describe('Tier 2: Boundary & Corner Cases Specifications', () => {
  for (const t of tier2Tests) {
    test(`[Tier 2] ${t.id}: ${t.name}`, async () => {
      await t.run();
    });
  }
});
