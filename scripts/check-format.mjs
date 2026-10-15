import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const result = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed');
const roots = ['app/', 'components/', 'lib/', 'packages/', 'scripts/', 'tests/'];
const extensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.sql', '.yml', '.yaml']);
// Applied migrations are byte immutable. This historical migration was applied
// without a trailing LF; restoring one changes the production checksum. Keep
// the exception hash-bound so an unrelated no-LF file still fails the gate.
const immutableMigrationByteExceptions = new Map([
  ['lib/db/migrations/017_user_notifications.sql', 'dbc2ff10fb8b7ed965e186dcb37a33c82251485bc874cc09a18f0794f93e3a05'],
]);
const issues = [];
for (const name of result.stdout.split(/\r?\n/).filter(Boolean)) {
  if (!roots.some((root) => name.startsWith(root)) || !extensions.has(path.extname(name))) continue;
  // `git ls-files -c` includes index entries deleted in the working tree;
  // formatting checks must not try to read legacy files that were intentionally
  // removed during a route migration.
  if (!fs.existsSync(name)) continue;
  const content = fs.readFileSync(name, 'utf8');
  if (content.includes('\u0000')) issues.push(`${name}: contains NUL byte`);
  if (/^(<<<<<<< |>>>>>>> |=======$)/m.test(content)) issues.push(`${name}: contains merge-conflict markers`);
  if (!content.endsWith('\n')) {
    const expectedHash = immutableMigrationByteExceptions.get(name);
    const actualHash = expectedHash
      ? crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')
      : null;
    if (actualHash !== expectedHash) issues.push(`${name}: must end with LF`);
  }
}
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log('format policy check passed');
}
