#!/usr/bin/env node
/**
 * Live post-deploy check: every `_next/static` asset referenced by the public
 * pages must return 200 with the right content type, and the social-login API
 * must still know where its IP ranges came from.
 *
 *   node scripts/verify-production-assets.mjs --base https://www.supdance.com
 *   node scripts/verify-production-assets.mjs --base https://canvas.supdance.com --pages /
 */
const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const base = arg('--base', 'https://www.supdance.com').replace(/\/$/, '');
const pages = arg('--pages', '/,/login,/register,/studio')
  .split(',')
  .map((page) => (page.startsWith('/') ? page : `/${page}`));
const concurrency = Math.max(1, Number(arg('--concurrency', '8')) || 8);

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`[verify-live] FAIL: ${message}`);
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'supdance-release-verifier/1.0', ...(options.headers || {}) },
    signal: AbortSignal.timeout(20000),
    ...options,
  });
}

function extractAssetRefs(html) {
  const refs = new Set();
  for (const match of html.matchAll(/\/(?:_next\/static|assets)\/[^"'\\\s<>)]+\.(?:js|css|woff2?|png|svg|webp|avif|mp4)(?:\?[^"'\\\s<>)]*)?/g)) {
    refs.add(match[0]);
  }
  return refs;
}

async function checkPage(page) {
  const pageUrl = `${base}${page}`;
  let res;
  try {
    res = await fetchWithTimeout(pageUrl);
  } catch (err) {
    fail(`${pageUrl} request failed: ${err.message}`);
    return new Set();
  }
  if (!res.ok) {
    fail(`${pageUrl} returned HTTP ${res.status}`);
    return new Set();
  }
  const html = await res.text();
  const refs = extractAssetRefs(html);
  if (!refs.size) fail(`${pageUrl} referenced no build assets (stale or error HTML?)`);
  console.log(`[verify-live] ${pageUrl} → HTTP ${res.status}, ${refs.size} assets`);
  return refs;
}

async function checkAsset(ref) {
  const url = new URL(ref, base).toString();
  let res;
  try {
    res = await fetchWithTimeout(url);
  } catch (err) {
    fail(`${url} request failed: ${err.message}`);
    return;
  }
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok) {
    fail(`${url} returned HTTP ${res.status}`);
    return;
  }
  if (ref.includes('.js') && !contentType.includes('javascript') && !contentType.includes('ecmascript')) {
    fail(`${url} served ${contentType || 'no content-type'} instead of JavaScript`);
  }
  if (ref.includes('.css') && !contentType.includes('text/css')) {
    fail(`${url} served ${contentType || 'no content-type'} instead of CSS`);
  }
}

async function checkSocialOptions(region) {
  const url = `${base}/api/auth/social-options?region=${region}`;
  let res;
  try {
    res = await fetchWithTimeout(url, { headers: { 'x-social-region': region } });
  } catch (err) {
    fail(`${url} request failed: ${err.message}`);
    return;
  }
  if (!res.ok) {
    fail(`${url} returned HTTP ${res.status}`);
    return;
  }
  let data;
  try {
    data = await res.json();
  } catch {
    fail(`${url} did not return JSON`);
    return;
  }
  if (data.region !== region) fail(`${url} resolved region ${data.region} instead of ${region}`);
  if (!Array.isArray(data.providers)) fail(`${url} providers is not an array`);
  const diagnostics = data.diagnostics || {};
  if (!(Number(diagnostics.ipRangeCount) > 0)) {
    fail(`${url} loaded 0 IP ranges; every visitor would be classified overseas`);
  }
  if (!['file', 'bundled'].includes(diagnostics.ipDataSource)) {
    fail(`${url} IP dataset source is ${diagnostics.ipDataSource}`);
  }
  console.log(
    `[verify-live] ${url} → region=${data.region}, providers=${(data.providers || []).map((p) => p.id).join(',') || '(none)'}, ` +
    `ipData=${diagnostics.ipDataSource}@${diagnostics.ipDatasetUpdatedAt}, ranges=${diagnostics.ipRangeCount}`
  );
}

const pageAssets = new Map();
for (const page of pages) {
  pageAssets.set(page, await checkPage(page));
}

const uniqueAssets = new Set();
for (const refs of pageAssets.values()) {
  for (const ref of refs) uniqueAssets.add(ref);
}

const queue = [...uniqueAssets];
async function worker() {
  while (queue.length) {
    const ref = queue.shift();
    await checkAsset(ref);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

await checkSocialOptions('mainland_china');
await checkSocialOptions('international');

if (failures.length) {
  console.error(`\n[verify-live] ${failures.length} failure(s)`);
  process.exit(1);
}
console.log(`\n[verify-live] OK — ${pages.length} pages, ${uniqueAssets.size} assets, both social-option regions verified`);
