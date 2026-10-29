import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { computeSourceTreeSha256, verifyProductionBackupManifest } from '../../scripts/verify-production-backup.mjs';

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'supdance-backup-gate-'));
  const backupRoot = path.join(root, 'backups');
  await fs.mkdir(backupRoot);
  const nowMs = Date.now();
  const capturedAt = new Date(nowMs - 30_000).toISOString();
  const verifiedAt = new Date(nowMs - 10_000).toISOString();
  const production = {
    head: 'a'.repeat(40),
    buildId: 'current-build',
    sourceTreeSha256: 'b'.repeat(64),
  };
  const components = {};
  for (const name of ['source', 'config', 'database', 'objects', 'build']) {
    const dataPath = path.join(backupRoot, `${name}.backup`);
    const body = Buffer.from(`${name} backup payload`);
    await fs.writeFile(dataPath, body);
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    const evidencePath = path.join(backupRoot, `${name}.restore.json`);
    const evidence = {
      status: 'passed',
      target: 'isolated',
      component: name,
      backupSha256: sha256,
      verifiedAt,
      restoredFileCount: 1,
      restoredEntryCount: 1,
      restoredRowCount: 1,
      restoredObjectCount: 1,
      restoredTreeSha256: production.sourceTreeSha256,
      restoredBuildId: production.buildId,
    };
    await fs.writeFile(evidencePath, JSON.stringify(evidence));
    components[name] = {
      path: dataPath,
      sha256,
      format: name === 'database' ? 'pg_custom' : 'tar_gzip',
      restoreEvidence: {
        path: evidencePath,
        sha256: crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
      },
    };
  }
  const rollbackPath = path.join(backupRoot, 'rollback.restore.json');
  const rollbackReport = {
    status: 'passed',
    verifiedAt,
    sourceTreeSha256: production.sourceTreeSha256,
    buildId: production.buildId,
    componentSha256s: Object.fromEntries(Object.entries(components).map(([name, item]) => [name, item.sha256])),
  };
  await fs.writeFile(rollbackPath, JSON.stringify(rollbackReport));
  const manifest = {
    schema: 'supdance-production-backup/v1',
    status: 'verified',
    capturedAt,
    production,
    components,
    rollbackEvidence: {
      path: rollbackPath,
      sha256: crypto.createHash('sha256').update(JSON.stringify(rollbackReport)).digest('hex'),
    },
  };
  const manifestPath = path.join(backupRoot, 'release-backup.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  return { root, backupRoot, manifestPath, manifest, production, nowMs };
}

test('release backup gate accepts five fresh hashed backups with isolated restore and rollback evidence', async () => {
  const fixture = await makeFixture();
  try {
    const result = await verifyProductionBackupManifest(fixture.manifestPath, {
      backupRoot: fixture.backupRoot,
      productionRoot: fixture.root,
      currentState: fixture.production,
      nowMs: fixture.nowMs,
      validateComponent: () => {},
    });
    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result.backup.components).sort(), ['build', 'config', 'database', 'objects', 'source']);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('release backup gate refuses incomplete or stale manifests', async () => {
  const fixture = await makeFixture();
  try {
    delete fixture.manifest.components.objects;
    await fs.writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest));
    await assert.rejects(
      verifyProductionBackupManifest(fixture.manifestPath, {
        backupRoot: fixture.backupRoot,
        currentState: fixture.production,
        nowMs: fixture.nowMs,
        validateComponent: () => {},
      }),
      /source, config, database, objects, and build/,
    );

    const stale = await makeFixture();
    stale.manifest.capturedAt = new Date(stale.nowMs - 25 * 60 * 60 * 1000).toISOString();
    await fs.writeFile(stale.manifestPath, JSON.stringify(stale.manifest));
    await assert.rejects(
      verifyProductionBackupManifest(stale.manifestPath, {
        backupRoot: stale.backupRoot,
        currentState: stale.production,
        nowMs: stale.nowMs,
        validateComponent: () => {},
      }),
      /stale/,
    );
    await fs.rm(stale.root, { recursive: true, force: true });
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('release backup gate detects backup digest changes and production drift', async () => {
  const fixture = await makeFixture();
  try {
    await fs.appendFile(fixture.manifest.components.source.path, 'tampered');
    await assert.rejects(
      verifyProductionBackupManifest(fixture.manifestPath, {
        backupRoot: fixture.backupRoot,
        currentState: fixture.production,
        nowMs: fixture.nowMs,
        validateComponent: () => {},
      }),
      /SHA-256 does not match/,
    );
    await assert.rejects(
      verifyProductionBackupManifest(fixture.manifestPath, {
        backupRoot: fixture.backupRoot,
        currentState: { ...fixture.production, buildId: 'newer-build' },
        nowMs: fixture.nowMs,
        validateComponent: () => {},
      }),
      /changed after the backup snapshot/,
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('production source hash ignores Next build outputs and rollback snapshots but tracks source files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'supdance-source-tree-'));
  try {
    await fs.mkdir(path.join(root, '.next-backup-20261011'), { recursive: true });
    await fs.mkdir(path.join(root, '.next'), { recursive: true });
    await fs.mkdir(path.join(root, 'public', 'uploads'), { recursive: true });
    await fs.writeFile(path.join(root, '.next-backup-20261011', 'BUILD_ID'), 'rollback-build');
    await fs.writeFile(path.join(root, '.next', 'BUILD_ID'), 'current-build');
    await fs.writeFile(path.join(root, 'public', 'uploads', 'asset.bin'), 'user-asset');
    await fs.writeFile(path.join(root, 'app.js'), 'source-v1');

    const initial = await computeSourceTreeSha256(root);
    // .next-* 是部署轮转出来的构建产物（3795311），计入会让每次轮转都造成 source drift 误报；
    // .next 与 public/uploads 同属运行时数据，也应排除。
    await fs.writeFile(path.join(root, '.next-backup-20261011', 'BUILD_ID'), 'changed-rollback-build');
    await fs.writeFile(path.join(root, '.next', 'BUILD_ID'), 'changed-current-build');
    await fs.writeFile(path.join(root, 'public', 'uploads', 'asset.bin'), 'changed-user-asset');
    assert.equal(await computeSourceTreeSha256(root), initial);

    await fs.writeFile(path.join(root, 'app.js'), 'source-v2');
    assert.notEqual(await computeSourceTreeSha256(root), initial);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
