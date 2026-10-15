import test from 'node:test';
import { tier1Tests } from './tier1-features.mjs';

for (const t of tier1Tests) {
  test(`[Tier 1] ${t.id}: ${t.name}`, async () => {
    await t.run();
  });
}
