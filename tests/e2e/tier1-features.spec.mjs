import { test } from '@playwright/test';
import { tier1Tests } from './tier1-features.mjs';

test.describe('Tier 1: Feature Coverage Specifications', () => {
  for (const t of tier1Tests) {
    test(`[Tier 1] ${t.id}: ${t.name}`, async () => {
      await t.run();
    });
  }
});
