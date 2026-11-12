import test from 'node:test';
import assert from 'node:assert/strict';
import { getMegaNavCategories } from '../config/mega-navigation.js';

test('navigation keeps image, video and music categories visible after restricted launch retirement', () => {
  const categories = getMegaNavCategories('zh');
  const ids = new Set(categories.map(category => category.id));
  assert.ok(ids.has('images'));
  assert.ok(ids.has('video') || ids.has('videos'));
  assert.ok(ids.has('audio'));
});
