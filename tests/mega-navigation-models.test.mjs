import test from 'node:test';
import assert from 'node:assert/strict';
import { withPublicNavigationModels } from '../lib/modelCenter/megaNavigationModels.js';

test('navigation lists only public models and links the exact canonical model ID', () => {
  const categories = [{ id: 'images', models: [{ id: 'old-static' }] }, { id: 'audio', models: [{ id: 'old-audio' }] }];
  const output = withPublicNavigationModels(categories, [{ id: 'seedream-4.5', category: 'image', displayName: 'Seedream 4.5' }], '/zh');
  assert.deepEqual(output[0].models.map(({ modelKey, href }) => ({ modelKey, href })), [{ modelKey: 'seedream-4.5', href: '/zh/studio?tab=image&model=seedream-4.5' }]);
  assert.deepEqual(output[1].models, []);
  assert.deepEqual(withPublicNavigationModels(categories, null)[0].models, []);
});
