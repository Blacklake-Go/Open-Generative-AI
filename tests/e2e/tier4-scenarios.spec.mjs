import { test } from '@playwright/test';
import { tier4Tests } from './tier4-scenarios.mjs';

test.describe('Tier 4: Real-World Workloads Specifications', () => {
  for (const t of tier4Tests) {
    test(`[Tier 4] ${t.id}: ${t.name}`, async () => {
      await t.run();
    });
  }
});
