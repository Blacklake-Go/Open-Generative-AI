#!/usr/bin/env node
/**
 * Fails a release before it is swapped in when the staged `.next` references
 * chunks that are not actually on disk (the failure that produced
 * "ChunkLoadError" and a login modal that never rendered).
 *
 *   node scripts/verify-build-assets.mjs .next
 */
import fs from 'node:fs';
import path from 'node:path';

const nextDir = path.resolve(process.argv[2] || '.next');
const buildIdPath = path.join(nextDir, 'BUILD_ID');
const staticDir = path.join(nextDir, 'static');

function fail(message) {
  console.error(`[verify-build] FAIL: ${message}`);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function collectManifestRefs(value, out) {
  if (typeof value === 'string') {
    if (value.includes('static/') || value.startsWith('/_next/')) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectManifestRefs(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectManifestRefs(item, out);
  }
}

if (!fs.existsSync(nextDir)) fail(`${nextDir} does not exist`);
if (!fs.existsSync(buildIdPath)) fail('BUILD_ID is missing');
if (!fs.existsSync(staticDir)) fail('static/ is missing');

const buildId = fs.readFileSync(buildIdPath, 'utf8').trim();
if (!buildId) fail('BUILD_ID is empty');

const buildIdDirs = fs
  .readdirSync(staticDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^[A-Za-z0-9_-]{8,}$/.test(entry.name) && entry.name !== 'chunks' && entry.name !== 'css' && entry.name !== 'media')
  .map((entry) => entry.name);
if (buildIdDirs.length && !buildIdDirs.includes(buildId)) {
  fail(`BUILD_ID ${buildId} has no matching static/${buildId} directory (found ${buildIdDirs.join(', ')})`);
}

const refs = new Set();
for (const manifestName of ['app-build-manifest.json', 'build-manifest.json', 'react-loadable-manifest.json']) {
  const manifest = readJson(path.join(nextDir, manifestName));
  if (manifest) collectManifestRefs(manifest, refs);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

for (const file of walk(path.join(nextDir, 'server'))) {
  if (!file.endsWith('.html')) continue;
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(/\/_next\/static\/[^"'\\\s<>)]+/g)) {
    refs.add(match[0]);
  }
}

const missing = [];
let checked = 0;
for (const ref of refs) {
  const clean = ref.split('?')[0].split('#')[0];
  const relative = clean.startsWith('/_next/') ? clean.slice('/_next/'.length) : clean;
  if (!relative.startsWith('static/')) continue;
  const target = path.resolve(nextDir, relative);
  if (!target.startsWith(path.resolve(nextDir) + path.sep)) {
    missing.push(`${ref} (path traversal)`);
    continue;
  }
  checked += 1;
  if (!fs.existsSync(target) || fs.statSync(target).size === 0) missing.push(ref);
}

if (!checked) {
  fail('no static asset references found in build manifests or server HTML');
}
if (missing.length) {
  fail(`${missing.length} referenced asset(s) missing from the build:\n  ${missing.slice(0, 25).join('\n  ')}`);
}

console.log(`[verify-build] OK — BUILD_ID ${buildId}, ${checked} referenced static assets present`);
