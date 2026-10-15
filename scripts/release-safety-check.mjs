import fs from 'node:fs/promises';
import path from 'node:path';

const forbiddenRuntime = [
  /node:sqlite/,
  /DatabaseSync/,
  /BILLING_DB_PATH/,
  /process\.env\.DATABASE_URL\s*\|\|\s*['"`]postgres(?:ql)?:\/\//,
  /process\.env\.DATABASE_URL\s*=\s*process\.env\.DATABASE_URL\s*\|\|/,
];

// 供应商合规门禁：静态扫描阻断任何出站调用 MuAPI 等未授权聚合商的代码与路由
const forbiddenVendorPatterns = [
  /https?:\/\/(?:[a-zA-Z0-9-]+\.)?muapi\.(?:ai|com)/i,
  /\bmuapi\b/i,
];

// Stage 3 彻底剔除前的遗留存量豁免清单（Stage 3 物理清理时清空此列表）
const STAGE3_MUAPI_DEPRECATED_EXEMPTIONS = new Set([
  'app/account/AccountClient.js',
  'app/admin/models/ModelsManagerClient.legacy.jsx',
  'app/admin/models/routing/RoutingManagerClient.legacy.jsx',
  'app/admin/routing/RoutingViewClient.legacy.js',
  'app/agents/[agent_id]/AgentChatClient.js',
  'app/agents/create/AgentCreateClient.js',
  'app/agents/edit/[id]/AgentEditClient.js',
  'app/api/agents/[[...path]]/route.js',
  'app/api/api/v1/[[...path]]/route.js',
  'app/api/app/[[...path]]/route.js',
  'app/api/v1/[[...path]]/route.js',
  'app/api/v1/creative-agent/[[...path]]/route.js',
  'app/api/v1/get_upload_url/route.js',
  'app/api/workflow/[[...path]]/route.js',
  'components/ApiKeyModal.js',
  'components/StandaloneShell.js',
  'lib/adapters/MuAPIAdapter.js',
  'lib/adapters/index.js',
  'lib/adapters/muapiModelContracts.js',
  'lib/locales.js',
  'lib/modelCenter/syncRules.js',
  'lib/modelCenter/view.js',
  'lib/repositories/legacyCatalog.js',
  'lib/repositories/models.js',
  'lib/repositories/providers.js',
  'lib/security/byok.js',
  'lib/security/legacyProxyPolicy.js',
  'lib/services/channelSync.js',
  'lib/services/dependencyHealth.js',
  'lib/services/generationProviders.js',
  'lib/services/models.js',
  'lib/services/providerSecrets.js',
  'lib/services/providers.js',
  'lib/services/smartRouter.js',
  'packages/studio/src/components/AgentStudio.jsx',
  'packages/studio/src/components/AiInfluencerStudio.jsx',
  'packages/studio/src/components/AppsStudio.jsx',
  'packages/studio/src/components/AudioStudio.jsx',
  'packages/studio/src/components/CinemaStudio.jsx',
  'packages/studio/src/components/ClippingStudio.jsx',
  'packages/studio/src/components/DesignAgentStudio.jsx',
  'packages/studio/src/components/DrawModal.jsx',
  'packages/studio/src/components/ImageStudio.jsx',
  'packages/studio/src/components/LayersStudio.jsx',
  'packages/studio/src/components/LipSyncStudio.jsx',
  'packages/studio/src/components/MarketingStudio.jsx',
  'packages/studio/src/components/McpCliStudio.jsx',
  'packages/studio/src/components/MotionControlStudio.jsx',
  'packages/studio/src/components/RecastStudio.jsx',
  'packages/studio/src/components/VibeMotionStudio.jsx',
  'packages/studio/src/components/VideoStudio.jsx',
  'packages/studio/src/components/WorkflowStudio.jsx',
  'packages/studio/src/index.js',
  'packages/studio/src/modelFamilies.js',
  'packages/studio/src/models.js',
  'packages/studio/src/muapi.js',
  'packages/studio/src/providerLogos.js',
  'packages/studio/src/seedanceModels.js',
]);

const files = [];
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.next', 'dist', 'release', 'data'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.(js|jsx|mjs|cjs|ts|tsx)$/.test(entry.name)) files.push(full);
  }
}
for (const root of ['app', 'components', 'lib', 'packages', 'scripts']) {
  await walk(path.join(process.cwd(), root));
}
const violations = [];
for (const file of files) {
  if (path.resolve(file) === path.resolve(process.argv[1])) continue;
  const relPath = path.relative(process.cwd(), file).replace(/\\/g, '/');
  const source = await fs.readFile(file, 'utf8');
  for (const pattern of forbiddenRuntime) {
    if (pattern.test(source)) violations.push(`${relPath} matches ${pattern}`);
  }

  // Supplier compliance check: app/, lib/, packages/studio/src/, components/
  const inVendorScope = /^(?:app|lib|packages\/studio\/src|components)\//.test(relPath);
  if (inVendorScope && !STAGE3_MUAPI_DEPRECATED_EXEMPTIONS.has(relPath)) {
    for (const pattern of forbiddenVendorPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relPath} violates supplier compliance policy: unauthorized reference to muapi (${pattern})`);
      }
    }
  }
}
if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; }
else console.log(`release safety check passed for ${files.length} source files`);
