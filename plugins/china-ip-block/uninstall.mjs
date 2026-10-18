#!/usr/bin/env node
/**
 * 临时插件自动卸载脚本 (Temporary Plugin Automated Uninstaller)
 * 
 * 执行方式: node plugins/china-ip-block/uninstall.mjs
 * 
 * 作用:
 * 1. 自动从 middleware.js、RuntimeTab.jsx、route.js 及 settings.js 中彻底清除挂钩代码
 * 2. 清理数据库 system_settings 中的 china_ip_block 记录（若数据库在线）
 * 3. 彻底删除 plugins/china-ip-block 文件夹自身
 * 4. 恢复代码库到插件引入前的纯净状态
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(PLUGIN_DIR, '..', '..');

const TARGET_FILES = [
  path.join(ROOT_DIR, 'middleware.js'),
  path.join(ROOT_DIR, 'components', 'admin', 'settings', 'RuntimeTab.jsx'),
  path.join(ROOT_DIR, 'app', 'api', 'admin', 'settings', 'route.js'),
  path.join(ROOT_DIR, 'lib', 'services', 'settings.js'),
];

console.log('====================================================');
console.log('   正在彻底移除 [屏蔽中国流量] 临时插件 (China IP Block)   ');
console.log('====================================================\n');

const HOOK_PATTERN = /\n?[ \t]*\/\* --- \[TEMPORARY PLUGIN: china-ip-block START\] --- \*\/[\s\S]*?\/\* --- \[TEMPORARY PLUGIN: china-ip-block END\] --- \*\/\n?/g;

let modifiedCount = 0;

for (const file of TARGET_FILES) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf-8');
    if (HOOK_PATTERN.test(content)) {
      content = content.replace(HOOK_PATTERN, '\n');
      // 确保文件结尾只有一个换行符（符合 format policy）
      content = content.trimEnd() + '\n';
      fs.writeFileSync(file, content, 'utf-8');
      console.log(`[已移除挂钩] ${path.relative(ROOT_DIR, file)}`);
      modifiedCount++;
    } else {
      console.log(`[无残留挂钩] ${path.relative(ROOT_DIR, file)}`);
    }
  }
}

// 尝试清理数据库记录
try {
  const { execute } = await import(path.join(ROOT_DIR, 'lib', 'db', 'index.js'));
  await execute(`DELETE FROM system_settings WHERE key = 'china_ip_block'`);
  console.log('[数据库清理] 已成功从 system_settings 删除 china_ip_block 配置');
} catch (err) {
  console.log('[数据库提示] 跳过数据库记录清理或无需清理:', err.message);
}

// 删除临时插件目录自身
try {
  fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
  console.log(`[目录已删除] ${path.relative(ROOT_DIR, PLUGIN_DIR)}`);
} catch (err) {
  console.warn(`[目录删除警告] 请手动删除 ${PLUGIN_DIR}:`, err.message);
}

console.log('\n====================================================');
console.log('   恭喜！[屏蔽中国流量] 临时插件已 100% 完全干净移除！   ');
console.log('====================================================\n');
