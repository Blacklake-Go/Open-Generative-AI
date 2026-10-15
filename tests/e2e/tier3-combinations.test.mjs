import test from 'node:test';
import { tier3Tests } from './tier3-combinations.mjs';

for (const t of tier3Tests) {
  test(`[Tier 3] ${t.id}: ${t.name}`, async () => {
    await t.run();
  });
}
