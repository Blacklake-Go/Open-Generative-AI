import test from 'node:test';
import { tier4Tests } from './tier4-scenarios.mjs';

for (const t of tier4Tests) {
  test(`[Tier 4] ${t.id}: ${t.name}`, async () => {
    await t.run();
  });
}
