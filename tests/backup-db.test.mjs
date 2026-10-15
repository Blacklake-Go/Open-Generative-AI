import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPgDumpConnection, createPostgresBackup } from '../scripts/backup-db.mjs';

test('pg_dump connection removes URI passwords and escapes them in a private passfile entry', () => {
  const connection = buildPgDumpConnection('postgresql://backup-user:p%3A%5Csecret@db.example.test:5433/launch_test?sslmode=require');
  assert.equal(connection.connectionString.includes('secret'), false);
  assert.equal(connection.connectionString.includes('p%3A'), false);
  assert.equal(connection.pgpass, 'db.example.test:5433:launch_test:backup-user:p\\:\\\\secret');

  const queryPassword = buildPgDumpConnection('postgresql://backup-user@db.example.test/launch_test?password=query%3Asecret');
  assert.equal(queryPassword.connectionString.includes('query'), false);
  assert.equal(queryPassword.pgpass, 'db.example.test:*:launch_test:backup-user:query\\:secret');
});

test('pg_dump child receives no DATABASE_URL and temporary credentials have owner-only permissions', async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'supdance-backup-unit-'));
  const backupDir = path.join(testRoot, 'backups');
  let passfilePath = null;
  try {
    const result = await createPostgresBackup({
      databaseUrl: 'postgresql://backup-user:synthetic%3Apassword@db.example.test:5433/launch_test?sslmode=require',
      backupDir,
      exec: async (binary, args, options) => {
        assert.equal(binary, 'pg_dump');
        assert.equal(options.env.DATABASE_URL, undefined);
        assert.equal(args.at(-1).includes('synthetic'), false);
        assert.equal(args.at(-1).includes('password'), false);
        passfilePath = options.env.PGPASSFILE;
        assert.ok(passfilePath);
        assert.equal(options.env.PGPASSWORD, undefined);
        assert.equal((await fs.stat(path.dirname(passfilePath))).mode & 0o777, 0o700);
        const stat = await fs.stat(passfilePath);
        assert.equal(stat.mode & 0o777, 0o600);
        assert.equal(await fs.readFile(passfilePath, 'utf8'), 'db.example.test:5433:launch_test:backup-user:synthetic\\:password\n');
        const target = args[args.indexOf('--file') + 1];
        await fs.writeFile(target, 'synthetic dump');
        return { stdout: '' };
      },
    });

    assert.equal(result.bytes, Buffer.byteLength('synthetic dump'));
    assert.equal((await fs.stat(result.target)).mode & 0o777, 0o600);
    await assert.rejects(() => fs.access(path.dirname(passfilePath)), { code: 'ENOENT' });
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
});

test('pg_dump failure removes its partial dump and temporary password file without exposing the password', async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'supdance-backup-failure-'));
  const backupDir = path.join(testRoot, 'backups');
  let passfilePath = null;
  try {
    await assert.rejects(() => createPostgresBackup({
      databaseUrl: 'postgresql://backup-user:synthetic%3Apassword@db.example.test/launch_test',
      backupDir,
      exec: async (binary, args, options) => {
        passfilePath = options.env.PGPASSFILE;
        await fs.writeFile(args[args.indexOf('--file') + 1], 'partial');
        throw Object.assign(new Error('failed for synthetic:password'), { code: 'PG_DUMP_FAILED' });
      },
    }), (error) => {
      assert.equal(error.code, 'PG_DUMP_FAILED');
      assert.equal(error.message.includes('synthetic'), false);
      return true;
    });
    assert.ok(passfilePath);
    await assert.rejects(() => fs.access(path.dirname(passfilePath)), { code: 'ENOENT' });
    assert.deepEqual(await fs.readdir(backupDir), []);
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
});

test('pg_dump connection rejects unsupported SSL password query parameters', () => {
  assert.throws(
    () => buildPgDumpConnection('postgresql://db.example.test/launch_test?sslpassword=synthetic-secret'),
    { code: 'DATABASE_URL_SSL_PASSWORD_UNSUPPORTED' },
  );
  assert.throws(
    () => buildPgDumpConnection('postgresql://backup-user:first@db.example.test/launch_test?password=second'),
    { code: 'DATABASE_URL_INVALID' },
  );
  assert.throws(
    () => buildPgDumpConnection('postgresql://first@db.example.test/launch_test?user=second'),
    { code: 'DATABASE_URL_INVALID' },
  );
});
