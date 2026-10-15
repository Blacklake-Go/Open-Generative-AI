import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanCodeAst } from './ast-scanner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

function walk(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (stat && stat.isDirectory()) {
        if (!['node_modules', '.git', '.next', 'backups', 'dist', 'build', '.playwright-artifacts', '.ui-repair-preview'].includes(file) && !file.startsWith('.r')) {
          results = results.concat(walk(full));
        }
      } else if (/\.(js|jsx|ts|tsx)$/.test(file) && !file.endsWith('.test.js') && !file.endsWith('.spec.js') && !file.endsWith('.test.mjs') && !file.endsWith('.spec.mjs') && !file.includes('.bak')) {
        results.push(full);
      }
    }
  } catch (e) {}
  return results;
}

function loadExistingCatalogs() {
  const catalogs = {};
  const enCommonPath = path.join(ROOT, 'messages', 'en', 'common.json');
  if (fs.existsSync(enCommonPath)) {
    catalogs.common = JSON.parse(fs.readFileSync(enCommonPath, 'utf8'));
  }

  const studioDir = path.join(ROOT, 'packages', 'studio', 'src', 'messages', 'en');
  if (fs.existsSync(studioDir)) {
    for (const f of fs.readdirSync(studioDir)) {
      if (f.endsWith('.json')) {
        const tab = f.replace(/\.json$/, '');
        catalogs[`studio.${tab}`] = JSON.parse(fs.readFileSync(path.join(studioDir, f), 'utf8'));
      }
    }
  }
  return catalogs;
}

function flatten(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flatten(v, fullKey));
    } else if (typeof v === 'string') {
      result[fullKey] = v;
    }
  }
  return result;
}

function deriveKey(relPath, finding) {
  const parts = relPath.replace(/\.(js|jsx|ts|tsx)$/, '').split('/');
  // E.g. components/account/tabs/MembershipTab -> account.membership.<term>
  let namespace = 'common';
  let sub = 'general';

  if (relPath.includes('admin/')) {
    namespace = 'admin';
    const adminIdx = parts.indexOf('admin');
    sub = parts[adminIdx + 1] || 'dashboard';
  } else if (relPath.includes('account/')) {
    namespace = 'account';
    const acctIdx = parts.indexOf('account');
    sub = (parts[acctIdx + 1] || 'profile').replace('Tab', '').toLowerCase();
  } else if (relPath.includes('auth') || relPath.includes('login')) {
    namespace = 'auth';
    sub = 'login';
  } else if (relPath.includes('billing') || relPath.includes('pricing') || relPath.includes('subscription')) {
    namespace = 'billing';
    sub = 'plans';
  } else if (relPath.includes('coins') || relPath.includes('credits') || relPath.includes('benefits')) {
    namespace = 'financial';
    sub = relPath.includes('coins') ? 'coins' : 'credits';
  } else if (relPath.includes('community')) {
    namespace = 'community';
    sub = 'feed';
  } else if (relPath.includes('creations')) {
    namespace = 'creations';
    sub = 'gallery';
  } else if (relPath.includes('assets')) {
    namespace = 'assetLibrary';
    sub = 'manage';
  } else if (relPath.includes('legal') || relPath.includes('terms') || relPath.includes('privacy') || relPath.includes('refund')) {
    namespace = 'legal';
    sub = parts.at(-1).toLowerCase();
  } else if (relPath.includes('packages/studio')) {
    namespace = 'studio';
    sub = 'workbench';
  }

  // Generate slug from text
  const raw = finding.en || finding.text;
  const slug = raw
    .slice(0, 30)
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  return `${namespace}.${sub}.${slug || 'item_' + finding.line}`;
}

export async function generateInventory() {
  console.log('1. Loading existing i18n catalogs...');
  const nestedCatalogs = loadExistingCatalogs();
  const flatEn = flatten(nestedCatalogs);
  const knownEnglishValues = new Map();
  for (const [k, v] of Object.entries(flatEn)) {
    knownEnglishValues.set(v.trim().toLowerCase(), k);
  }

  console.log(`Loaded ${Object.keys(flatEn).length} existing canonical English keys.`);

  console.log('2. Scanning source files with AST scanner...');
  const searchDirs = ['app', 'components', 'packages/studio/src', 'packages/Vibe-Workflow', 'packages/Open-Poe-AI', 'packages/Open-AI-Design-Agent', 'lib'];
  const allFiles = [];
  for (const d of searchDirs) {
    const full = path.join(ROOT, d);
    if (fs.existsSync(full)) allFiles.push(...walk(full));
  }

  console.log(`Found ${allFiles.length} files to scan.`);

  const inventoryItems = [];
  const textSeen = new Set();
  const cjkRegex = /[\u4e00-\u9fa5]/;

  let totalChars = 0;
  let translatedCount = 0;
  let missingCount = 0;
  let hardcodedCount = 0;
  let duplicateCount = 0;

  for (const file of allFiles) {
    const relPath = path.relative(ROOT, file);
    const code = fs.readFileSync(file, 'utf8');
    const findings = scanCodeAst(code, relPath);

    for (const f of findings) {
      const sourceText = f.zh || f.text;
      const enText = f.en || (cjkRegex.test(sourceText) ? null : sourceText);
      const isCjk = cjkRegex.test(sourceText);
      const sourceLang = isCjk ? 'zh-CN' : 'en';

      const matchKey = enText ? knownEnglishValues.get(enText.toLowerCase()) : null;
      const isDuplicate = textSeen.has(sourceText);
      textSeen.add(sourceText);
      if (isDuplicate) duplicateCount++;

      let status = 'hardcoded';
      let key = matchKey || deriveKey(relPath, f);

      if (matchKey) {
        status = 'translated';
        translatedCount++;
      } else if (f.type === 'conditional-isZh' && f.zh && f.en) {
        status = 'hardcoded-dual';
        hardcodedCount++;
      } else {
        hardcodedCount++;
        missingCount++;
      }

      totalChars += sourceText.length;

      inventoryItems.push({
        key,
        sourceText,
        englishText: enText || '',
        sourceLanguage: sourceLang,
        file: relPath,
        line: f.line,
        route: relPath.startsWith('app/') ? '/' + relPath.replace(/^app\/?/, '').replace(/\/(page|layout|route)\.(js|jsx)$/, '') : null,
        component: path.basename(relPath),
        context: f.context || f.type,
        type: f.type,
        isDynamic: f.type === 'ui-call' || f.type.includes('dynamic'),
        translationStatus: status,
        fallbackStatus: false,
        duplicateStatus: isDuplicate,
      });
    }
  }

  const summary = {
    TOTAL_KEYS: inventoryItems.length,
    TOTAL_SOURCE_CHARACTERS: totalChars,
    TRANSLATED_KEYS: translatedCount,
    TRANSLATED_CHARACTERS: inventoryItems.filter(i => i.translationStatus === 'translated').reduce((s, i) => s + i.sourceText.length, 0),
    MISSING_KEYS: missingCount,
    HARDCODED_STRINGS: hardcodedCount,
    FALLBACK_STRINGS: 0,
    INVALID_KEYS: 0,
    DUPLICATE_KEYS: duplicateCount,
    KEY_COVERAGE: inventoryItems.length ? Number(((translatedCount / inventoryItems.length) * 100).toFixed(2)) : 0,
    CHARACTER_COVERAGE: totalChars ? Number(((inventoryItems.filter(i => i.translationStatus === 'translated').reduce((s, i) => s + i.sourceText.length, 0) / totalChars) * 100).toFixed(2)) : 0,
  };

  const inventory = {
    generatedAt: new Date().toISOString(),
    summary,
    items: inventoryItems,
  };

  const outputPath = path.join(ROOT, 'i18n-inventory.json');
  fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2), 'utf8');
  console.log(`\nGenerated i18n-inventory.json at ${outputPath}`);
  console.log('Summary:');
  console.table(summary);

  return inventory;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateInventory().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
