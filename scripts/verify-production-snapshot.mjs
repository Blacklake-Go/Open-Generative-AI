import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSourceTreeSha256 } from './verify-production-backup.mjs';

export async function verifyProductionSnapshot(snapshotRoot, preflightResult, options = {}) {
  const root = path.resolve(snapshotRoot);
  const workingRoot = path.resolve(options.workingRoot || process.cwd());
  if (root === workingRoot) throw new Error('deployment source snapshot must be separate from the current dirty worktree');
  const markerPath = path.join(root, '.supdance-production-snapshot.json');
  let marker;
  try { marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')); }
  catch { throw new Error('frozen production snapshot marker is missing or invalid'); }
  if (marker.schema !== 'supdance-production-snapshot/v1') throw new Error('unsupported production snapshot marker');
  const production = preflightResult?.production;
  if (!production
    || marker.production?.head !== production.head
    || marker.production?.buildId !== production.buildId
    || marker.production?.sourceTreeSha256 !== production.sourceTreeSha256) {
    throw new Error('source snapshot does not match the freshly verified production baseline');
  }

  const actualTreeSha256 = await computeSourceTreeSha256(root);
  if (marker.candidateTreeSha256 !== actualTreeSha256) throw new Error('source snapshot changed after its candidate build was verified');
  const buildId = fs.readFileSync(path.join(root, '.next', 'BUILD_ID'), 'utf8').trim();
  if (marker.build?.buildId !== buildId
    || marker.build?.builtFromTreeSha256 !== actualTreeSha256
    || marker.build?.platform !== 'linux-x64') {
    throw new Error('build provenance must match this snapshot and a Linux x64 build');
  }

  const routeManifestPath = path.join(root, '.next', 'server', 'app-paths-manifest.json');
  let routeManifest;
  try { routeManifest = JSON.parse(fs.readFileSync(routeManifestPath, 'utf8')); }
  catch { throw new Error('candidate build route manifest is missing or invalid'); }
  const requiredRoutes = [
    '/api/canvas/config/route',
    '/api/canvas/session/route',
    '/api/canvas/models/route',
    '/api/canvas/quotes/route',
    '/api/canvas/jobs/route',
    '/api/canvas/jobs/[id]/route',
    '/api/canvas/projects/route',
    '/api/canvas/projects/[id]/route',
    '/api/canvas/assets/route',
    '/api/canvas/assets/upload/route',
    '/api/canvas/assets/[id]/content/route',
  ];
  const missingRoutes = requiredRoutes.filter((route) => !routeManifest[route]);
  if (missingRoutes.length) throw new Error(`candidate build is missing Canvas routes: ${missingRoutes.join(', ')}`);

  return { root, sourceTreeSha256: actualTreeSha256, buildId, routeCount: requiredRoutes.length };
}

async function main() {
  const snapshotRoot = process.argv[2];
  const preflightJson = process.argv[3];
  if (!snapshotRoot || !preflightJson) throw new Error('usage: verify-production-snapshot.mjs <snapshot-root> <backup-preflight-json>');
  const result = await verifyProductionSnapshot(snapshotRoot, JSON.parse(preflightJson));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`[production-snapshot-gate] REFUSED: ${error.message}\n`);
    process.exitCode = 2;
  });
}
