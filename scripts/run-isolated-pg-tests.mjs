import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import pg from 'pg';
import { requireIsolatedTestDatabase } from './test-database-guard.mjs';

try {
  if (typeof process.loadEnvFile === 'function' && fsSync.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }
} catch {}

const baseUrl = String(process.env.TEST_DATABASE_URL || '').trim();
const parsed = requireIsolatedTestDatabase(baseUrl, process.env.DATABASE_URL, 'TEST_DATABASE_URL');

const databaseName = `p7_test_it_${crypto.randomBytes(6).toString('hex')}`;
const adminUrl = new URL(parsed);
adminUrl.pathname = '/postgres';
const isolatedUrl = new URL(parsed);
isolatedUrl.pathname = `/${databaseName}`;

async function withAdmin(callback) {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function createDatabase() {
  await withAdmin((client) => client.query(`CREATE DATABASE "${databaseName}"`));
}

async function dropDatabase() {
  await withAdmin((client) => client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`));
}

function runNode(args, env) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env, windowsHide: true });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

const allTestFiles = (await fs.readdir(path.resolve('tests/db')))
  .filter((name) => name.endsWith('.mjs'))
  .sort()
  .map((name) => path.join('tests/db', name));
const requestedTestFiles = String(process.env.TEST_DB_FILES || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
if (requestedTestFiles.some((name) => path.basename(name) !== name || !name.endsWith('.test.mjs'))) {
  throw new Error('TEST_DB_FILES accepts comma-separated test basenames only.');
}
const testFiles = requestedTestFiles.length
  ? requestedTestFiles.map((name) => path.join('tests/db', name))
  : allTestFiles;
if (testFiles.some((name) => !allTestFiles.includes(name))) {
  throw new Error('TEST_DB_FILES contains a test file that does not exist in tests/db.');
}

try {
  await createDatabase();
  const childEnv = {
    ...process.env,
    TEST_DATABASE_URL: isolatedUrl.toString(),
    // The integration test module deliberately switches DATABASE_URL to the
    // isolated URL after verifying that TEST_DATABASE_URL is not the app DB.
    DATABASE_URL: baseUrl,
  };
  // Initialize the isolated database before running test files serially.
  // The files share one database, so serial execution avoids pool exhaustion
  // and cross-test interference from workers processing another file's queue.
  const migrationEnv = { ...childEnv, DATABASE_URL: isolatedUrl.toString() };
  const migrationExitCode = await runNode(['scripts/migrate.mjs'], migrationEnv);
  if (migrationExitCode !== 0) {
    process.exitCode = migrationExitCode;
  } else {
    const testExitCode = await runNode([
      '--experimental-loader',
      './scripts/server-only-loader.mjs',
      '--test',
      '--test-concurrency=1',
      ...testFiles,
    ], childEnv);
    if (testExitCode !== 0) process.exitCode = testExitCode;
  }
} finally {
  await dropDatabase();
}
