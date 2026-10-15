import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REQUIRED_COMPONENTS = ['source', 'config', 'database', 'objects', 'build'];
const EVIDENCE_METRICS = {
  source: ['restoredFileCount'],
  config: ['restoredEntryCount'],
  database: ['restoredRowCount'],
  objects: ['restoredObjectCount'],
  build: [],
};
const DEFAULT_BACKUP_ROOT = '/home/ubuntu/backups';
const DEFAULT_PRODUCTION_ROOT = '/home/wwwroot/AI/domain/supdance.com/web';
const MAX_BACKUP_AGE_MS = 24 * 60 * 60 * 1000;

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function parseTime(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid UTC timestamp`);
  return parsed;
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function resolveBackupFile(backupRoot, value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(`${label} path must be absolute`);
  const root = await fsp.realpath(backupRoot);
  const candidate = path.resolve(value);
  const resolved = await fsp.realpath(candidate);
  if (!isInside(root, resolved)) throw new Error(`${label} must be stored under the backup root`);
  const stat = await fsp.lstat(candidate);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size === 0) throw new Error(`${label} must be a non-empty regular file`);
  return { path: resolved, size: stat.size };
}

async function verifyHashedFile(backupRoot, entry, label) {
  if (!isSha256(entry?.sha256)) throw new Error(`${label} SHA-256 is missing or malformed`);
  const file = await resolveBackupFile(backupRoot, entry.path, label);
  if (await hashFile(file.path) !== entry.sha256) throw new Error(`${label} SHA-256 does not match`);
  return file;
}

function validateArchive(name, filePath, manifest) {
  const component = manifest.components[name];
  if (name === 'database') {
    if (component.format !== 'pg_custom') throw new Error('database backup must use pg_custom format');
    execFileSync('pg_restore', ['--list', filePath], { stdio: ['ignore', 'ignore', 'pipe'] });
    return;
  }
  if (component.format !== 'tar_gzip') throw new Error(`${name} backup must use tar_gzip format`);
  execFileSync('tar', ['-tzf', filePath], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (name === 'build') {
    let buildId = '';
    for (const member of ['BUILD_ID', '.next/BUILD_ID']) {
      try {
        buildId = execFileSync('tar', ['-xOzf', filePath, member], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (buildId) break;
      } catch {}
    }
    if (buildId !== manifest.production.buildId) throw new Error('build backup does not contain the current BUILD_ID');
  }
}

function loadJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function validateEvidence(name, evidence, component, manifest, nowMs) {
  if (!evidence || evidence.status !== 'passed' || evidence.target !== 'isolated') {
    throw new Error(`${name} restore evidence must show a passed isolated restore`);
  }
  if (evidence.component !== name || evidence.backupSha256 !== component.sha256) {
    throw new Error(`${name} restore evidence does not match the backup`);
  }
  const verifiedAt = parseTime(evidence.verifiedAt, `${name} restore verifiedAt`);
  const capturedAt = parseTime(manifest.capturedAt, 'capturedAt');
  if (verifiedAt < capturedAt || verifiedAt > nowMs || nowMs - verifiedAt > MAX_BACKUP_AGE_MS) {
    throw new Error(`${name} restore evidence is stale or outside the backup window`);
  }
  for (const metric of EVIDENCE_METRICS[name]) {
    if (!Number.isSafeInteger(evidence[metric]) || evidence[metric] < 1) {
      throw new Error(`${name} restore evidence is missing ${metric}`);
    }
  }
  if (name === 'source' && evidence.restoredTreeSha256 !== manifest.production.sourceTreeSha256) {
    throw new Error('source restore evidence does not match the frozen production source tree');
  }
  if (name === 'build' && evidence.restoredBuildId !== manifest.production.buildId) {
    throw new Error('build restore evidence does not match the current BUILD_ID');
  }
}

export async function computeSourceTreeSha256(rootDir) {
  const paths = [];
  const ignoredDirectories = new Set(['.git', '.next', 'node_modules', 'data', 'logs', '.cache', 'coverage', 'dist']);
  const shouldIgnore = (relative, name) => ignoredDirectories.has(name)
    || relative === '.supdance-production-snapshot.json'
    || relative === '.env'
    || relative.startsWith('.env.')
    || relative === 'public/uploads'
    || relative.startsWith('public/uploads/');
  const walk = async (absoluteDir, relativeDir = '') => {
    const entries = await fsp.readdir(absoluteDir, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (shouldIgnore(relative, entry.name)) continue;
      const absolute = path.join(absoluteDir, entry.name);
      const stat = await fsp.lstat(absolute);
      if (stat.isDirectory()) await walk(absolute, relative);
      else paths.push({ absolute, relative, stat });
    }
  };
  await walk(rootDir);
  const tree = crypto.createHash('sha256');
  for (const { absolute, relative, stat } of paths) {
    if (stat.isSymbolicLink()) {
      tree.update(`${relative}\0link\0${fs.readlinkSync(absolute)}\n`);
      continue;
    }
    if (!stat.isFile()) continue;
    const fileHash = await hashFile(absolute);
    tree.update(`${relative}\0${stat.size}\0${fileHash}\n`);
  }
  return tree.digest('hex');
}

async function readCurrentProductionState(productionRoot) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: productionRoot, encoding: 'utf8' }).trim();
  const buildId = fs.readFileSync(path.join(productionRoot, '.next', 'BUILD_ID'), 'utf8').trim();
  return { head, buildId, sourceTreeSha256: await computeSourceTreeSha256(productionRoot) };
}

export async function verifyProductionBackupManifest(manifestPath, options = {}) {
  const backupRoot = path.resolve(options.backupRoot || DEFAULT_BACKUP_ROOT);
  const productionRoot = path.resolve(options.productionRoot || DEFAULT_PRODUCTION_ROOT);
  const nowMs = options.nowMs ?? Date.now();
  const currentState = options.currentState || await readCurrentProductionState(productionRoot);
  const validateComponent = options.validateComponent || validateArchive;

  const manifestFile = await resolveBackupFile(backupRoot, path.resolve(manifestPath), 'backup manifest');
  const manifest = loadJson(manifestFile.path, 'backup manifest');
  if (manifest.schema !== 'supdance-production-backup/v1' || manifest.status !== 'verified') {
    throw new Error('backup manifest must use the verified production backup schema');
  }
  const capturedAt = parseTime(manifest.capturedAt, 'capturedAt');
  if (capturedAt > nowMs || nowMs - capturedAt > MAX_BACKUP_AGE_MS) throw new Error('production backup is stale');
  if (!manifest.production || !/^[a-f0-9]{40}$/.test(manifest.production.head || '') || !isSha256(manifest.production.sourceTreeSha256)) {
    throw new Error('production source identity is incomplete');
  }
  if (manifest.production.head !== currentState.head
    || manifest.production.buildId !== currentState.buildId
    || manifest.production.sourceTreeSha256 !== currentState.sourceTreeSha256) {
    throw new Error('production source or build changed after the backup snapshot');
  }
  if (!manifest.components || REQUIRED_COMPONENTS.some((name) => !manifest.components[name])) {
    throw new Error('backup manifest must include source, config, database, objects, and build');
  }

  const seenPaths = new Set([manifestFile.path]);
  const verified = {};
  for (const name of REQUIRED_COMPONENTS) {
    const component = manifest.components[name];
    const file = await verifyHashedFile(backupRoot, component, `${name} backup`);
    if (seenPaths.has(file.path)) throw new Error('backup components must be separate files');
    seenPaths.add(file.path);
    validateComponent(name, file.path, manifest);

    const evidence = await verifyHashedFile(backupRoot, component.restoreEvidence || {}, `${name} restore evidence`);
    if (seenPaths.has(evidence.path)) throw new Error('backup evidence files must be separate from backup data');
    seenPaths.add(evidence.path);
    validateEvidence(name, loadJson(evidence.path, `${name} restore evidence`), component, manifest, nowMs);
    verified[name] = { bytes: file.size, sha256: component.sha256 };
  }

  const rollback = await verifyHashedFile(backupRoot, manifest.rollbackEvidence || {}, 'rollback evidence');
  if (seenPaths.has(rollback.path)) throw new Error('rollback evidence must be a separate file');
  const rollbackReport = loadJson(rollback.path, 'rollback evidence');
  if (rollbackReport.status !== 'passed'
    || rollbackReport.sourceTreeSha256 !== manifest.production.sourceTreeSha256
    || rollbackReport.buildId !== manifest.production.buildId
    || REQUIRED_COMPONENTS.some((name) => rollbackReport.componentSha256s?.[name] !== manifest.components[name].sha256)) {
    throw new Error('rollback evidence does not prove restoration of all production components');
  }
  const rollbackVerifiedAt = parseTime(rollbackReport.verifiedAt, 'rollback verifiedAt');
  if (rollbackVerifiedAt < capturedAt || rollbackVerifiedAt > nowMs || nowMs - rollbackVerifiedAt > MAX_BACKUP_AGE_MS) {
    throw new Error('rollback evidence is stale or outside the backup window');
  }

  return {
    ok: true,
    production: currentState,
    backup: { capturedAt: manifest.capturedAt, components: verified },
    rollbackVerifiedAt: rollbackReport.verifiedAt,
  };
}

async function main() {
  if (process.argv[2] === '--hash-source-tree') {
    const rootDir = process.argv[3];
    if (!rootDir) throw new Error('usage: verify-production-backup.mjs --hash-source-tree <root>');
    process.stdout.write(`${await computeSourceTreeSha256(path.resolve(rootDir))}\n`);
    return;
  }
  const manifestPath = process.argv[2];
  const productionRoot = process.argv[3] || DEFAULT_PRODUCTION_ROOT;
  if (!manifestPath) throw new Error('usage: verify-production-backup.mjs <manifest> [production-root]');
  const result = await verifyProductionBackupManifest(manifestPath, { productionRoot });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1];
if (invokedPath === '-' || (invokedPath && path.resolve(invokedPath) === fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`[production-backup-gate] REFUSED: ${error.message}\n`);
    process.exitCode = 2;
  });
}
