import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const testsRoot = path.join(root, 'tests');

function collect(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'e2e' || entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    // Database integration runs only through test:db, which creates and drops
    // a guarded p7_test_it_* database. Never execute those tests against the
    // general TEST_DATABASE_URL a second time during the unit-file sweep.
    if (full === path.join(testsRoot, 'db')) continue;
    if (entry.isDirectory()) files.push(...collect(full));
    else if (/\.test\.(?:mjs|js)$/.test(entry.name)) files.push(full);
  }
  return files.sort();
}

const files = collect(testsRoot);
const envFile = fs.existsSync(path.join(root, '.env.local')) ? ['--env-file=.env.local'] : [];

for (const file of files) {
  const relative = path.relative(root, file);
  console.log(`\n[test-isolated] ${relative}`);
  const result = spawnSync(process.execPath, [
    '--test',
    ...envFile,
    '--experimental-loader',
    './scripts/server-only-loader.mjs',
    relative,
  ], { cwd: root, env: process.env, stdio: 'inherit' });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`[test-isolated] failed: ${relative}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\n[test-isolated] passed ${files.length} test files sequentially`);
