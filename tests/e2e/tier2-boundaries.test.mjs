import test from 'node:test';
import { tier2Tests } from './tier2-boundaries.mjs';

for (const t of tier2Tests) {
  test(`[Tier 2] ${t.id}: ${t.name}`, async () => {
    await t.run();
  });
}
