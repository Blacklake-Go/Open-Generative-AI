import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationStatements } from '../lib/db/migrations.js';

test('legacy SQL wrappers cannot end the migration runner transaction', () => {
  const statements = migrationStatements(`-- legacy header\nBEGIN; CREATE TABLE fixture(id text); /* legacy commit */ COMMIT;`);
  assert.deepEqual(statements, ['CREATE TABLE fixture(id text)']);
});

test('SQL literals, dollar-quoted function transactions and comments keep their contents', () => {
  const sql = `BEGIN TRANSACTION; DO $body$ BEGIN RAISE NOTICE 'COMMIT; -- text'; END; $body$; INSERT INTO fixture VALUES('BEGIN;COMMIT;'); COMMIT WORK;`;
  const statements = migrationStatements(sql);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /DO \$body\$ BEGIN/);
  assert.match(statements[1], /'BEGIN;COMMIT;'/);
});
