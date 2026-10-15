import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function run(script, args = [], options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });
}

test('default deploy entrypoint delegates to the fail-closed Canvas release gate', () => {
  const result = spawnSync('bash', ['scripts/deploy.sh'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SUPDANCE_DEPLOY_SOURCE_SNAPSHOT: '' },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /REFUSED: set SUPDANCE_DEPLOY_SOURCE_SNAPSHOT/);
  assert.doesNotMatch(result.stdout + result.stderr, /scp |ssh .*remote-deploy\.sh|npm run build/);
});

test('legacy remote and PowerShell deployment entrypoints are disabled', () => {
  const remote = fs.readFileSync(path.join(root, 'scripts/remote-deploy.sh'), 'utf8');
  const powershell = fs.readFileSync(path.join(root, 'scripts/deploy-to-server.ps1'), 'utf8');

  assert.match(remote, /REFUSED: legacy remote deployment is disabled/);
  assert.doesNotMatch(remote, /tar -x|rsync|rm -rf|systemctl/);
  assert.match(powershell, /REFUSED: the legacy PowerShell deployment path is disabled/);
  assert.doesNotMatch(powershell, /\b(?:scp|ssh)\b/);
});

test('artifact-only deploy-safe entrypoint cannot switch production builds', () => {
  const result = run('scripts/deploy-safe.mjs');

  assert.equal(result.status, 2);
  assert.match(result.stderr, /REFUSED: deploy-safe\.mjs only validated an artifact/);
});

test('Canvas candidate omits rotated builds while rollback archive captures them and sync protects them', () => {
  const localDeploy = fs.readFileSync(path.join(root, 'scripts/deploy-canvas-safe.sh'), 'utf8');
  const remoteDeploy = fs.readFileSync(path.join(root, 'scripts/remote-deploy-canvas-safe.sh'), 'utf8');

  assert.match(localDeploy, /--exclude='\.\/\.next-backup-\*'/);
  const rollbackArchive = remoteDeploy.match(/tar --exclude='\.\/\.git'[\s\S]*?-czf "\$SOURCE_ROLLBACK" -C "\$WEB_DIR" \./)?.[0] || '';
  assert.notEqual(rollbackArchive, '');
  assert.doesNotMatch(rollbackArchive, /--exclude='\.\/\.next-backup-\*'/);
  assert.match(remoteDeploy, /rsync -a --delete[\s\S]*?--exclude='\.next-backup-\*\/'/);
  assert.match(remoteDeploy, /--exclude='\.next-pre-\*\/'/);
});
