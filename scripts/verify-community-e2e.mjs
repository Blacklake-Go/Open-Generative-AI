import { spawnSync } from 'node:child_process';

// The previous verifier selected the first real user and published an arbitrary
// external URL. Acceptance now requires an explicitly prepared protected clone.
const database = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (process.env.SUPDANCE_RESTORED_DRILL !== 'true' || database?.hostname !== 'one-db'
  || !database.pathname.startsWith('/restored_')) {
  throw new Error('Community acceptance requires SUPDANCE_RESTORED_DRILL=true and a fresh named one-db/restored_* database. No production user or asset was selected.');
}
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--experimental-loader',
  './scripts/server-only-loader.mjs', 'tests/federation-contract.test.mjs', 'tests/db/federation-restored.test.mjs',
  'tests/db/community-workflow-restored.test.mjs', 'tests/db/zz-campaign-restored.test.mjs'],
{ cwd: process.cwd(), env: process.env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
