import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildSocialOptions } from '../../lib/auth/socialOptions.js';
import { getChinaIpDataStatus } from '../../lib/security/chinaIpBlock.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ALL_CONFIGURED = {
  qq: true,
  wechat: true,
  douyin: true,
  bilibili: true,
  google: true,
  x: true,
  tiktok: true,
  instagram: true,
};

function makeDeps({ setting = null, configured = ALL_CONFIGURED, settingThrows = false } = {}) {
  return {
    getSetting: async () => {
      if (settingThrows) throw new Error('settings db down');
      return setting;
    },
    isProviderConfigured: async (id) => {
      const value = configured[id];
      if (value === 'throw') throw new Error(`credential store down for ${id}`);
      if (value === undefined) return null;
      return value === true;
    },
  };
}

async function options(headers, overrides = {}) {
  return buildSocialOptions({
    headers: new Headers(headers),
    queryRegion: overrides.queryRegion ?? null,
    ...makeDeps(overrides),
  });
}

test('mainland IP shows the Chinese catalog and reports a self-explanatory verdict', async () => {
  const payload = await options({ 'x-real-ip': '114.114.114.114' });
  assert.equal(payload.region, 'mainland_china');
  assert.equal(payload.detectedRegion, 'mainland_china');
  assert.equal(payload.isOverridden, false);
  assert.deepEqual(payload.providers.map((p) => p.id), ['qq', 'wechat', 'douyin', 'bilibili']);
  assert.equal(payload.diagnostics.regionSource, 'ip');
  assert.equal(payload.diagnostics.ipSource, 'x-real-ip');
  assert.equal(payload.diagnostics.ipKind, 'public-v4');
  assert.equal(payload.diagnostics.matchedBy, 'ip-range-v4');
  assert.ok(payload.diagnostics.ipRangeCount > 1000);
  assert.match(payload.diagnostics.ipDatasetUpdatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(payload.diagnostics.hiddenProviders, []);
});

test('overseas IP shows the international catalog including Instagram when its state is unknown', async () => {
  const payload = await options(
    { 'x-real-ip': '8.8.8.8' },
    { configured: { google: true, x: true, tiktok: true } }
  );
  assert.equal(payload.region, 'international');
  assert.deepEqual(payload.providers.map((p) => p.id), ['google', 'x', 'tiktok', 'instagram']);
  assert.equal(payload.diagnostics.matchedBy, 'ip-range-v4');
});

test('a settings-database failure keeps every enabled channel visible', async () => {
  const payload = await options({ 'x-real-ip': '8.8.8.8' }, { settingThrows: true });
  assert.equal(payload.region, 'international');
  assert.deepEqual(payload.providers.map((p) => p.id), ['google', 'x', 'tiktok', 'instagram']);
});

test('a credential-store failure is unknown, not unconfigured, so it cannot empty the login page', async () => {
  const payload = await options(
    { 'x-real-ip': '8.8.8.8' },
    { configured: { google: 'throw', x: 'throw', tiktok: 'throw', instagram: 'throw' } }
  );
  assert.deepEqual(payload.providers.map((p) => p.id), ['google', 'x', 'tiktok', 'instagram']);
  assert.ok(payload.providers.every((p) => p.configured === false));
  assert.deepEqual(payload.diagnostics.hiddenProviders, []);
});

test('explicitly missing credentials hide only that channel', async () => {
  const payload = await options(
    { 'x-real-ip': '114.114.114.114' },
    { configured: { qq: true, wechat: false, douyin: true, bilibili: true } }
  );
  assert.deepEqual(payload.providers.map((p) => p.id), ['qq', 'douyin', 'bilibili']);
  assert.deepEqual(payload.diagnostics.hiddenProviders, [{ id: 'wechat', reason: 'unconfigured' }]);
});

test('operator-disabled channels stay hidden and report the operator as the reason', async () => {
  const payload = await options(
    { 'x-real-ip': '8.8.8.8' },
    { setting: { value: { international: [{ id: 'instagram', enabled: false }] } } }
  );
  assert.deepEqual(payload.providers.map((p) => p.id), ['google', 'x', 'tiktok']);
  assert.deepEqual(payload.diagnostics.hiddenProviders, [{ id: 'instagram', reason: 'disabled' }]);
});

test('query override wins for previews while detectedRegion still reflects the real IP', async () => {
  const payload = await options({ 'x-real-ip': '114.114.114.114' }, { queryRegion: 'international' });
  assert.equal(payload.region, 'international');
  assert.equal(payload.detectedRegion, 'mainland_china');
  assert.equal(payload.isOverridden, true);
  assert.equal(payload.diagnostics.regionSource, 'query');
});

test('a forged leading X-Forwarded-For hop cannot flip the region', async () => {
  const payload = await options({ 'x-forwarded-for': '114.114.114.114, 8.8.8.8' });
  assert.equal(payload.region, 'international');
  assert.equal(payload.diagnostics.ipSource, 'x-forwarded-for');
});

test('private reverse-proxy hop falls back to the CDN country header', async () => {
  const payload = await options({ 'x-real-ip': '127.0.0.1', 'cf-ipcountry': 'CN' });
  assert.equal(payload.region, 'mainland_china');
  assert.equal(payload.diagnostics.ipKind, 'private');
  assert.equal(payload.diagnostics.matchedBy, 'country-header');
});

test('bundled IP ranges still classify correctly when no JSON file exists in the runtime cwd', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'china-ip-bundle-'));
  const securityDir = path.join(tempRoot, 'lib', 'security');
  await fs.mkdir(securityDir, { recursive: true });
  for (const file of ['chinaIpBlock.js', 'chinaIpRangesData.js', 'chinaIpModuleFile.js']) {
    await fs.copyFile(path.join(repoRoot, 'lib', 'security', file), path.join(securityDir, file));
  }

  const script = `
    import { getChinaIpDataStatus, getChinaIpVerdict } from './lib/security/chinaIpBlock.js';
    process.stdout.write(JSON.stringify({
      status: getChinaIpDataStatus(),
      cn: getChinaIpVerdict('114.114.114.114').inChina,
      us: getChinaIpVerdict('8.8.8.8').inChina,
    }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: tempRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status.source, 'bundled');
  assert.ok(output.status.v4RangeCount > 1000);
  assert.equal(output.cn, true);
  assert.equal(output.us, false);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('bundled data matches lib/security/china_ip_ranges.json so syncs cannot silently drift', async () => {
  const jsonPath = path.join(repoRoot, 'lib', 'security', 'china_ip_ranges.json');
  const raw = await fs.readFile(jsonPath, 'utf8').catch(() => null);
  if (!raw) return; // production source trees may ship only the generated module
  const json = JSON.parse(raw);
  const status = getChinaIpDataStatus();
  assert.equal(status.updatedAt, json.updatedAt);
  assert.equal(status.v4RangeCount, json.v4Ranges.length);
  assert.equal(status.v6RangeCount, json.v6Ranges.length);
});
