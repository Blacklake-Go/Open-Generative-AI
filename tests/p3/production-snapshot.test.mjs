import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { computeSourceTreeSha256 } from '../../scripts/verify-production-backup.mjs';
import { verifyProductionSnapshot } from '../../scripts/verify-production-snapshot.mjs';

const REQUIRED_ROUTES = [
  '/api/canvas/config/route',
  '/api/canvas/session/route',
  '/api/canvas/models/route',
  '/api/canvas/quotes/route',
  '/api/canvas/jobs/route',
  '/api/canvas/jobs/[id]/route',
  '/api/canvas/projects/route',
  '/api/canvas/projects/[id]/route',
  '/api/canvas/assets/route',
  '/api/canvas/assets/upload/route',
  '/api/canvas/assets/[id]/content/route',
];

async function makeSnapshot() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'supdance-source-snapshot-'));
  const snapshotRoot = path.join(temp, 'snapshot');
  const workingRoot = path.join(temp, 'dirty-worktree');
  await fs.mkdir(path.join(snapshotRoot, '.next/server'), { recursive: true });
  await fs.mkdir(workingRoot);
  await fs.writeFile(path.join(snapshotRoot, 'app.js'), 'frozen candidate source');
  await fs.writeFile(path.join(snapshotRoot, '.next/BUILD_ID'), 'candidate-build');
  await fs.writeFile(path.join(snapshotRoot, '.next/server/app-paths-manifest.json'), JSON.stringify(Object.fromEntries(REQUIRED_ROUTES.map((route) => [route, `server/${route}`]))));
  const candidateTreeSha256 = await computeSourceTreeSha256(snapshotRoot);
  const production = { head: 'c'.repeat(40), buildId: 'production-build', sourceTreeSha256: 'd'.repeat(64) };
  const marker = {
    schema: 'supdance-production-snapshot/v1',
    production,
    candidateTreeSha256,
    build: { buildId: 'candidate-build', builtFromTreeSha256: candidateTreeSha256, platform: 'linux-x64' },
  };
  await fs.writeFile(path.join(snapshotRoot, '.supdance-production-snapshot.json'), JSON.stringify(marker));
  return { temp, snapshotRoot, workingRoot, production };
}

test('source snapshot requires matching production provenance and all 11 Canvas routes', async () => {
  const fixture = await makeSnapshot();
  try {
    const result = await verifyProductionSnapshot(fixture.snapshotRoot, { production: fixture.production }, { workingRoot: fixture.workingRoot });
    assert.equal(result.buildId, 'candidate-build');
    assert.equal(result.routeCount, 11);
  } finally {
    await fs.rm(fixture.temp, { recursive: true, force: true });
  }
});

test('source tree fingerprint ignores active Next output but tracks frozen rollback builds and source changes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'supdance-source-hash-'));
  try {
    await fs.writeFile(path.join(root, 'app.js'), 'source');
    const initialHash = await computeSourceTreeSha256(root);
    await fs.mkdir(path.join(root, '.next/server'), { recursive: true });
    await fs.writeFile(path.join(root, '.next/BUILD_ID'), 'active-build');
    assert.equal(await computeSourceTreeSha256(root), initialHash);

    for (const directory of ['.next-backup-20261010_143131', '.next-pre-canvas-20261008', '.next-previous-release', '.next-failed-release']) {
      await fs.mkdir(path.join(root, directory));
      await fs.writeFile(path.join(root, directory, 'BUILD_ID'), directory);
    }
    const rollbackHash = await computeSourceTreeSha256(root);
    assert.notEqual(rollbackHash, initialHash);

    await fs.writeFile(path.join(root, '.next-backup-20261010_143131/BUILD_ID'), 'updated-rollback-build');
    const updatedRollbackHash = await computeSourceTreeSha256(root);
    assert.notEqual(updatedRollbackHash, rollbackHash);

    await fs.writeFile(path.join(root, 'app.js'), 'changed source');
    assert.notEqual(await computeSourceTreeSha256(root), updatedRollbackHash);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('source snapshot refuses an incomplete route manifest or post-build source drift', async () => {
  const fixture = await makeSnapshot();
  try {
    const manifestPath = path.join(fixture.snapshotRoot, '.next/server/app-paths-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify({ [REQUIRED_ROUTES[0]]: 'server/config' }));
    await assert.rejects(
      verifyProductionSnapshot(fixture.snapshotRoot, { production: fixture.production }, { workingRoot: fixture.workingRoot }),
      /missing Canvas routes/,
    );

    await fs.writeFile(manifestPath, JSON.stringify(Object.fromEntries(REQUIRED_ROUTES.map((route) => [route, `server/${route}`]))));
    await fs.appendFile(path.join(fixture.snapshotRoot, 'app.js'), ' changed');
    await assert.rejects(
      verifyProductionSnapshot(fixture.snapshotRoot, { production: fixture.production }, { workingRoot: fixture.workingRoot }),
      /changed after its candidate build/,
    );
  } finally {
    await fs.rm(fixture.temp, { recursive: true, force: true });
  }
});
