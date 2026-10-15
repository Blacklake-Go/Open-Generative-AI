import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { isCanvasServerCapabilityEnabled } from '../../lib/canvas/capabilityPolicy.js';

test('SupDance Server Mode enables verified generation capabilities (image, video, audio, music)', () => {
  assert.equal(isCanvasServerCapabilityEnabled('image'), true);
  assert.equal(isCanvasServerCapabilityEnabled('IMAGE'), true);
  assert.equal(isCanvasServerCapabilityEnabled('video'), true);
  assert.equal(isCanvasServerCapabilityEnabled('VIDEO'), true);
  assert.equal(isCanvasServerCapabilityEnabled('audio'), true);
  assert.equal(isCanvasServerCapabilityEnabled('music'), true);

  for (const capability of ['', undefined, 'panorama', 'three_view', '3d']) {
    assert.equal(isCanvasServerCapabilityEnabled(capability), false, `${capability || '(missing)'} must stay disabled`);
  }
});

test('Canvas model listing, quotes, and jobs all enforce the same capability policy', () => {
  const models = fs.readFileSync(new URL('../../app/api/canvas/models/route.js', import.meta.url), 'utf8');
  const quotes = fs.readFileSync(new URL('../../app/api/canvas/quotes/route.js', import.meta.url), 'utf8');
  const jobs = fs.readFileSync(new URL('../../app/api/canvas/jobs/route.js', import.meta.url), 'utf8');

  assert.match(models, /isCanvasServerCapabilityEnabled\(model\.capability\)/);
  assert.match(quotes, /isCanvasServerCapabilityEnabled\(model\.type\)/);
  assert.match(jobs, /isCanvasServerCapabilityEnabled\(model\.type\)/);
  assert.equal((quotes.match(/CANVAS_CAPABILITY_DISABLED/g) || []).length, 1);
  assert.equal((jobs.match(/CANVAS_CAPABILITY_DISABLED/g) || []).length, 1);
});
