import test from 'node:test';
import assert from 'node:assert/strict';
import { getMegaNavCategories, restrictMegaNavToLaunch } from '../config/mega-navigation.js';

test('restricted launch advertises only the verified image workbench', () => {
  const all = getMegaNavCategories('zh');
  const restricted = restrictMegaNavToLaunch(all, true);
  assert.deepEqual(restricted.map((category) => category.id), ['images']);
  assert.deepEqual(restricted[0].features.map((feature) => feature.tabId), ['image']);
  assert.deepEqual(restricted[0].models, []);
  assert.equal(restrictMegaNavToLaunch(all, false), all);
});
