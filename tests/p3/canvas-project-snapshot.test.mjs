import assert from 'node:assert/strict';
import test from 'node:test';

import { canvasSnapshotContainsNode } from '../../lib/canvas/projectSnapshot.js';

test('Canvas generation target must exist in the persisted project snapshot', () => {
  const snapshot = { nodes: [{ id: 'source_1' }, { id: 'output_2' }] };
  assert.equal(canvasSnapshotContainsNode(snapshot, 'output_2'), true);
  assert.equal(canvasSnapshotContainsNode(JSON.stringify(snapshot), 'source_1'), true);
  assert.equal(canvasSnapshotContainsNode(snapshot, 'not_saved_yet'), false);
});

test('malformed or incomplete snapshots fail closed for generation targets', () => {
  assert.equal(canvasSnapshotContainsNode('{bad json', 'node_1'), false);
  assert.equal(canvasSnapshotContainsNode({ connections: [] }, 'node_1'), false);
  assert.equal(canvasSnapshotContainsNode(null, 'node_1'), false);
});
