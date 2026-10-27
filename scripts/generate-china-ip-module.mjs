#!/usr/bin/env node
/**
 * Regenerates lib/security/chinaIpRangesData.js from china_ip_ranges.json.
 *
 * The generated module is compiled into the server bundle, so a deployment
 * that ships without the JSON files still classifies mainland visitors
 * correctly. Run this after every `syncLatestChinaIpList()`.
 *
 *   node scripts/generate-china-ip-module.mjs          # write
 *   node scripts/generate-china-ip-module.mjs --check  # fail if stale
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildChinaIpModuleSource,
  CHINA_IP_MODULE_RELATIVE_PATH,
} from '../lib/security/chinaIpModuleFile.js';

const root = process.cwd();
const candidates = [
  path.join(root, 'lib', 'security', 'china_ip_ranges.json'),
  path.join(root, 'data', 'china_ip_ranges.json'),
];
const sourcePath = candidates.find((file) => fs.existsSync(file));
if (!sourcePath) {
  console.error('[china-ip-module] china_ip_ranges.json not found; run syncLatestChinaIpList() first.');
  process.exit(1);
}

const targetPath = path.join(root, CHINA_IP_MODULE_RELATIVE_PATH);
const data = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const content = buildChinaIpModuleSource(data);

if (process.argv.includes('--check')) {
  const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
  if (current !== content) {
    console.error('[china-ip-module] bundled ranges are stale. Run node scripts/generate-china-ip-module.mjs');
    process.exit(1);
  }
  console.log(`[china-ip-module] up to date (${data.v4Ranges?.length || 0} v4 / ${data.v6Ranges?.length || 0} v6 ranges)`);
  process.exit(0);
}

fs.writeFileSync(targetPath, content);
console.log(
  `[china-ip-module] wrote ${path.relative(root, targetPath)} ` +
  `(${data.v4Ranges?.length || 0} v4 / ${data.v6Ranges?.length || 0} v6 ranges, updatedAt ${data.updatedAt})`
);
