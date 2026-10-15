import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('app/api/canvas/config/route.js adheres to standard Canvas HTTP guards and auth', () => {
  const content = fs.readFileSync(new URL('../../app/api/canvas/config/route.js', import.meta.url), 'utf8');

  // Must import getUserFromRequest from auth service, NEVER admin authz
  assert.match(content, /import \{ getUserFromRequest \} from '@\/lib\/services\/auth';/);
  assert.doesNotMatch(content, /@\/lib\/admin\/authz/);

  // Must use canvasOriginGuard and canvasPreflight
  assert.match(content, /import \{ canvasJson, canvasOriginGuard, canvasPreflight \} from '@\/lib\/canvas\/http';/);
  assert.match(content, /export function OPTIONS\(request\) \{\s*return canvasPreflight\(request, 'GET, OPTIONS'\);\s*\}/);

  // Must NOT have bespoke allowed() or hardcoded '禁止访问'
  assert.doesNotMatch(content, /function allowed\(/);
  assert.doesNotMatch(content, /禁止访问/);

  // Must preserve allowedModelIds filtering logic
  assert.match(content, /getCanvasAllowedModelIds\(\{ userId: user\.id \}\)/);
  assert.match(content, /projected\.mountedModelIds\[capability\]\.filter\(\(id\) => allowedModelIds\.has\(id\)\)/);
});
