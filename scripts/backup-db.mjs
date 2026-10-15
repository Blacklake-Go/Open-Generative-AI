import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

function decodeUrlPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw Object.assign(new Error('DATABASE_URL contains invalid URL encoding.'), { code: 'DATABASE_URL_INVALID' });
  }
}

function escapePgPassField(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll(':', '\\:');
}

export function buildPgDumpConnection(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(String(databaseUrl || '').trim());
  } catch {
    throw Object.assign(new Error('DATABASE_URL must be a valid PostgreSQL connection URL.'), { code: 'DATABASE_URL_INVALID' });
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw Object.assign(new Error('DATABASE_URL must use PostgreSQL.'), { code: 'DATABASE_URL_INVALID' });
  }
  if (parsed.searchParams.has('sslpassword')) {
    throw Object.assign(new Error('Put SSL key passphrases in the approved libpq environment instead of DATABASE_URL.'), {
      code: 'DATABASE_URL_SSL_PASSWORD_UNSUPPORTED',
    });
  }

  const queryPassword = parsed.searchParams.has('password') ? parsed.searchParams.get('password') : null;
  const uriPassword = parsed.password ? decodeUrlPart(parsed.password) : null;
  if (uriPassword !== null && queryPassword !== null && uriPassword !== queryPassword) {
    throw Object.assign(new Error('DATABASE_URL contains conflicting password values.'), { code: 'DATABASE_URL_INVALID' });
  }
  const password = queryPassword ?? uriPassword;
  const queryUsername = String(parsed.searchParams.get('user') || '');
  const uriUsername = parsed.username ? decodeUrlPart(parsed.username) : '';
  if (queryUsername && uriUsername && queryUsername !== uriUsername) {
    throw Object.assign(new Error('DATABASE_URL contains conflicting user values.'), { code: 'DATABASE_URL_INVALID' });
  }
  const username = queryUsername || uriUsername;
  const database = decodeUrlPart(parsed.pathname.replace(/^\/+/, ''));
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '') || '*';
  const port = parsed.port || '*';

  parsed.password = '';
  parsed.searchParams.delete('password');
  parsed.searchParams.delete('user');
  if (username) parsed.username = username;
  return {
    connectionString: parsed.toString(),
    pgpass: password === null ? null : [hostname, port, database || '*', username || '*', password]
      .map(escapePgPassField)
      .join(':'),
  };
}

export async function createPostgresBackup({
  databaseUrl = process.env.DATABASE_URL,
  exec = execFileAsync,
  backupDir = path.join(process.cwd(), 'data', 'backups'),
} = {}) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required for PostgreSQL backup.');
  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
  await fs.chmod(backupDir, 0o700);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupDir, 'postgres-' + timestamp + '.dump');
  const connection = buildPgDumpConnection(databaseUrl);
  let credentialDir = null;
  try {
    const childEnv = { ...process.env };
    delete childEnv.DATABASE_URL;
    if (connection.pgpass !== null) {
      credentialDir = await fs.mkdtemp(path.join(os.tmpdir(), 'supdance-pgdump-'));
      await fs.chmod(credentialDir, 0o700);
      const passFile = path.join(credentialDir, 'pgpass');
      await fs.writeFile(passFile, `${connection.pgpass}\n`, { mode: 0o600, flag: 'wx' });
      await fs.chmod(passFile, 0o600);
      childEnv.PGPASSFILE = passFile;
      delete childEnv.PGPASSWORD;
    }
    await exec('pg_dump', ['--format=custom', '--no-owner', '--file', target, connection.connectionString], { env: childEnv, windowsHide: true });
    await fs.chmod(target, 0o600);
  } catch (error) {
    await fs.rm(target, { force: true }).catch(() => {});
    throw Object.assign(new Error('PostgreSQL backup creation or permission hardening failed.'), { code: error?.code || 'PG_DUMP_FAILED' });
  } finally {
    if (credentialDir) await fs.rm(credentialDir, { recursive: true, force: true }).catch(() => {});
  }
  const stat = await fs.stat(target);
  return { target, bytes: stat.size };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const result = await createPostgresBackup();
    console.log('[backup] PostgreSQL backup created: ' + result.target + ' (' + (result.bytes / 1024 / 1024).toFixed(2) + ' MB)');
  } catch (error) {
    console.error('[backup] PostgreSQL backup failed:', { code: error.code || 'POSTGRES_BACKUP_FAILED' });
    process.exitCode = 1;
  }
}
