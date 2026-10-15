import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadStaticCatalogs, validateCatalogs, buildMessagesFromCatalog } from '../lib/i18nCatalog.js';
import { getLocaleFromPathname, SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_CONFIGS } from '../lib/locales.js';

console.log('==============================================');
console.log('1. 验证支持的语言定义与默认语言');
console.log('==============================================');
console.log('SUPPORTED_LOCALES:', SUPPORTED_LOCALES);
console.log('DEFAULT_LOCALE:', DEFAULT_LOCALE);
const expectedLocales = ['en', 'zh-CN', 'ja-JP', 'ko-KR', 'zh-TW', 'es'];
assert.deepEqual([...SUPPORTED_LOCALES].sort(), [...expectedLocales].sort(), 'SUPPORTED_LOCALES 必须包含 6 种完整语言');
console.log('✔ 支持语言列表检查通过\n');

console.log('==============================================');
console.log('2. 验证路径解析 (getLocaleFromPathname)');
console.log('==============================================');
const testPaths = [
  { path: '/ja-JP/studio/video', expectedLocale: 'ja-JP' },
  { path: '/ko-KR/admin/i18n', expectedLocale: 'ko-KR' },
  { path: '/zh-TW/workspace', expectedLocale: 'zh-TW' },
  { path: '/zh/settings', expectedLocale: 'zh-CN' },
  { path: '/zh-CN/profile', expectedLocale: 'zh-CN' },
  { path: '/es/studio/image', expectedLocale: 'es' },
  { path: '/en/docs', expectedLocale: 'en' },
  { path: '/studio', expectedLocale: 'en' }
];

for (const t of testPaths) {
  const detected = getLocaleFromPathname(t.path);
  assert.equal(detected, t.expectedLocale, `Path ${t.path} 识别出的 locale 应为 ${t.expectedLocale}`);
  console.log(`   Path: ${t.path.padEnd(22)} -> Detected Locale: ${detected}`);
}
console.log('✔ 路径语言识别全部通过\n');

console.log('==============================================');
console.log('3. 验证静态 Catalog 与 100% 翻译覆盖率');
console.log('==============================================');
const catalogs = await loadStaticCatalogs();
const report = validateCatalogs(catalogs);

console.log(`基准语言 (en) 词条总数: ${report.en.total}`);

for (const loc of expectedLocales) {
  const stat = report[loc];
  console.log(`- [${loc}] (${stat.name}): 覆盖率: ${stat.coverage.toFixed(2)}%, 有效: ${stat.completed}/${stat.total}, missing: ${stat.missing}, fallback: ${stat.fallback}, 格式错误: ${stat.formatErrors}`);
  assert.equal(stat.missing, 0, `语言 ${loc} 不应有 missingKeys`);
  assert.equal(stat.formatErrors, 0, `语言 ${loc} 不应有 formatErrors`);
  assert.equal(stat.coverage, 100.0, `语言 ${loc} 覆盖率必须为 100.00%`);
}
console.log('✔ 全部语言目录 100% 覆盖率验证通过；同形产品名、品牌名和语言共用词不再被误判为缺失翻译。\n');

console.log('==============================================');
console.log('4. 验证关键字段的多语言抽取与本土化差异 (buildMessagesFromCatalog)');
console.log('==============================================');
const testKeys = [
  'common.financial.kcoin',
  'common.apiKeyModal.title',
  'studio.videoStudio.categories.t2v',
  'studio.videoStudio.dropdowns.model',
  'studio.clippingStudio.headings.aiClippingStudio',
  'studio.appsStudio.hero.badge'
];

for (const k of testKeys) {
  console.log(`字段 [${k}]:`);
  const values = {};
  for (const loc of expectedLocales) {
    const messages = buildMessagesFromCatalog(catalogs[loc]);
    const parts = k.split('.');
    values[loc] = parts.reduce((acc, part) => acc?.[part], messages);
    console.log(`   ${loc.padEnd(6)} -> "${values[loc]}"`);
  }
  for (const loc of expectedLocales) {
    assert.ok(values[loc], `语言 ${loc} 的字段 ${k} 不能为空`);
  }
}
console.log('✔ 关键字段抽取与非空校验通过；品牌名、产品名和跨语言共用词允许保持原文。\n');

console.log('==============================================');
console.log('5. 验证 Studio 前端组件打包产物导出');
console.log('==============================================');
const distDir = path.resolve('packages/studio/dist/components');
assert.ok(fs.existsSync(distDir), 'packages/studio/dist/components 必须存在');

const expectedComponents = [
  'AgentStudio.js',
  'AiInfluencerStudio.js',
  'AppsStudio.js',
  'AudioStudio.js',
  'CinemaStudio.js',
  'ClippingStudio.js',
  'ImageStudio.js',
  'LayersStudio.js',
  'LipSyncStudio.js',
  'MarketingStudio.js',
  'McpCliStudio.js',
  'MotionControlStudio.js',
  'RecastStudio.js',
  'VibeMotionStudio.js',
  'VideoStudio.js'
];

for (const comp of expectedComponents) {
  const filePath = path.join(distDir, comp);
  assert.ok(fs.existsSync(filePath), `编译产物 ${comp} 必须存在`);
  const compContent = fs.readFileSync(filePath, 'utf-8');
  assert.ok(compContent.includes('zh-TW') && compContent.includes('ja-JP') && compContent.includes('ko-KR') && /^ {2}es:/m.test(compContent), `${comp} 必须打包引入六种语言包`);
}
console.log('✔ Studio 前端组件已编译且包含 6 种语言完整映射\n');

console.log('🎉 全部多语言生效验证 100% 通过！');
