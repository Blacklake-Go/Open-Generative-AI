import 'server-only';

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { query, queryMany, nowIso, withTransaction } from './index.js';

const MIGRATIONS_DIR = path.join(process.cwd(), 'lib', 'db', 'migrations');
const MIGRATION_LOCK_KEY = 'supdance:postgresql:migrations';

/**
 * Split a multi-statement SQL string on top-level semicolons, respecting:
 *  - single-quoted string literals (including '' escapes)
 *  - dollar-quoted blocks  ($tag$...$tag$)
 *  - line comments  (-- ...)
 *  - block comments (/* ... *​/)
 * Returns an array of non-empty trimmed statements (without trailing ';').
 */
function splitSqlStatements(sql) {
  const results = [];
  let current = '';
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];

    // Line comment
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const commentEnd = end === -1 ? len : end + 1;
      current += sql.slice(i, commentEnd);
      i = commentEnd;
      continue;
    }

    // Block comment
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const commentEnd = end === -1 ? len : end + 2;
      current += sql.slice(i, commentEnd);
      i = commentEnd;
      continue;
    }

    // Single-quoted string literal
    if (ch === "'") {
      let j = i + 1;
      while (j < len) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    // Dollar-quoted string  $tag$...$tag$
    if (ch === '$') {
      const tagMatch = sql.slice(i).match(/^(\$[A-Za-z0-9_]*\$)/);
      if (tagMatch) {
        const tag = tagMatch[1];
        const closeIdx = sql.indexOf(tag, i + tag.length);
        const end = closeIdx === -1 ? len : closeIdx + tag.length;
        current += sql.slice(i, end);
        i = end;
        continue;
      }
    }

    // Top-level semicolon → statement boundary
    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) results.push(trimmed);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) results.push(trimmed);
  return results;
}

function migrationVersion(fileName) { return fileName.replace(/\.sql$/i, ''); }
function checksum(sql) { return crypto.createHash('sha256').update(sql, 'utf8').digest('hex'); }

async function readMigrationFiles() {
  const entries = (await fs.readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql') && !name.startsWith('._')).sort((a, b) => a.localeCompare(b, 'en'));
  return Promise.all(entries.map(async (fileName) => {
    const rawSql = await fs.readFile(path.join(MIGRATIONS_DIR, fileName), 'utf8');
    const sql = rawSql.replace(/^\uFEFF/, '');
    return { fileName, version: migrationVersion(fileName), sql, checksum: checksum(sql) };
  }));
}

async function ensureLedger(tx) {
  await tx.query('CREATE SCHEMA IF NOT EXISTS sys_core');
  await tx.query(`
    CREATE TABLE IF NOT EXISTS sys_core.schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      execution_ms INTEGER NOT NULL DEFAULT 0
    )
  `);
  await tx.query('ALTER TABLE sys_core.schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT');
  await tx.query('ALTER TABLE sys_core.schema_migrations ADD COLUMN IF NOT EXISTS execution_ms INTEGER NOT NULL DEFAULT 0');
}

export async function runMigrations() {
  const files = await readMigrationFiles();
  return withTransaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [MIGRATION_LOCK_KEY]);
    await ensureLedger(tx);

    const applied = new Map((await tx.queryMany(
      'SELECT version, checksum FROM sys_core.schema_migrations ORDER BY version'
    )).map((row) => [row.version, row]));
    const result = [];

    for (const migration of files) {
      const previous = applied.get(migration.version);
      if (previous) {
        if (previous.checksum && previous.checksum !== migration.checksum) {
          throw new Error(`Migration checksum mismatch for ${migration.version}; refusing to continue.`);
        }
        result.push({ version: migration.version, status: 'already_applied' });
        continue;
      }

      const startedAt = Date.now();
      console.log(`[migrate] applying: ${migration.fileName}`);
      try {
        // node-pg extended protocol cannot handle multi-statement SQL in a single
        // query() call (causes 08P01 "invalid message format"). Split on semicolons
        // that are NOT inside string literals, then execute each statement individually.
        const statements = splitSqlStatements(migration.sql);
        for (const stmt of statements) {
          await tx.query(stmt);
        }
      } catch (err) {
        console.error(`[migrate] FAILED on ${migration.fileName}:`, err.message, err.code, err.detail);
        throw err;
      }
      await tx.query(`
        INSERT INTO sys_core.schema_migrations (version, name, checksum, applied_at, execution_ms)
        VALUES ($1, $2, $3, $4, $5)
      `, [migration.version, migration.fileName, migration.checksum, nowIso(), Date.now() - startedAt]);
      result.push({ version: migration.version, status: 'applied' });
    }
    return result;
  });
}

export async function getMigrationStatus() {
  const files = await readMigrationFiles();
  const applied = await queryMany('SELECT version, name, checksum, applied_at, execution_ms FROM sys_core.schema_migrations ORDER BY version');
  const appliedByVersion = new Map(applied.map((row) => [row.version, row]));
  const pending = files.filter((file) => !appliedByVersion.has(file.version)).map((file) => file.version);
  const drifted = files.filter((file) => {
    const row = appliedByVersion.get(file.version);
    return row?.checksum && row.checksum !== file.checksum;
  }).map((file) => file.version);
  return { ok: pending.length === 0 && drifted.length === 0, applied, pending, drifted, latest: applied.at(-1)?.version || null };
}
