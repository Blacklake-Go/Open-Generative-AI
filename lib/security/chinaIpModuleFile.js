import fs from 'node:fs';
import path from 'node:path';

export const CHINA_IP_MODULE_RELATIVE_PATH = path.join('lib', 'security', 'chinaIpRangesData.js');

export function buildChinaIpModuleSource(data) {
  const header = [
    '// AUTO-GENERATED from china_ip_ranges.json — do not edit by hand.',
    '// Run `node scripts/generate-china-ip-module.mjs` after refreshing the IP list.',
    '',
  ].join('\n');
  return `${header}export const CHINA_IP_RANGES = ${JSON.stringify(data)};\n`;
}

/** Returns the module path that was written, or null when the source tree is read-only. */
export function writeChinaIpModule(rootDir, data) {
  const targetPath = path.join(rootDir, CHINA_IP_MODULE_RELATIVE_PATH);
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, buildChinaIpModuleSource(data));
    return targetPath;
  } catch (err) {
    console.warn('[chinaIpBlock] 写入内置网段模块失败（下次构建仍使用旧数据）:', err.message);
    return null;
  }
}
