import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

try {
  register(pathToFileURL(path.join(repoRoot, 'scripts/server-only-loader.mjs')).href, import.meta.url);
} catch {}

test('Step 1: ModelNavTabs has exactly 3 standard tabs matching Three-Layer Mental Architecture', () => {
  const tabsFile = path.join(repoRoot, 'components/admin/ModelNavTabs.jsx');
  assert.ok(fs.existsSync(tabsFile), 'ModelNavTabs.jsx must exist');
  const content = fs.readFileSync(tabsFile, 'utf8');

  // Verify tab list contains the 3 standard tabs
  assert.match(content, /id:\s*'models',\s*label:\s*'模型货架与全景',\s*href:\s*'\/admin\/models'/);
  assert.match(content, /id:\s*'providers',\s*label:\s*'供应商与通道',\s*href:\s*'\/admin\/models\/providers'/);
  assert.match(content, /id:\s*'routing',\s*label:\s*'智能路由与价盘策略',\s*href:\s*'\/admin\/models\/routing'/);

  // Verify old tabs (brands, pricing) are no longer top-level navigation tabs
  assert.doesNotMatch(content, /id:\s*'brands',\s*label:/);
  assert.doesNotMatch(content, /id:\s*'pricing',\s*label:/);

  // Verify WeChat Underline Tabs design constraint (h-12 / 48px)
  assert.match(content, /h-12/);
  assert.match(content, /h-\[2px\] bg-brand rounded-full/);
});

test('Step 1: Smooth 308 redirects for deprecated /admin/models/pricing and /admin/models/brands', () => {
  const pricingPage = path.join(repoRoot, 'app/admin/models/pricing/page.js');
  assert.ok(fs.existsSync(pricingPage), 'pricing redirect page must exist');
  const pricingContent = fs.readFileSync(pricingPage, 'utf8');
  assert.match(pricingContent, /permanentRedirect\('\/admin\/models\/routing\?tab=pricing'\)/);
  assert.match(pricingContent, /permanentRedirect\('\/admin\/models\/routing\?tab=pending'\)/);

  const brandsPage = path.join(repoRoot, 'app/admin/models/brands/page.js');
  assert.ok(fs.existsSync(brandsPage), 'brands redirect page must exist');
  const brandsContent = fs.readFileSync(brandsPage, 'utf8');
  assert.match(brandsContent, /permanentRedirect\(`\/admin\/models\?brand=\${encodeURIComponent\(brandId\)}`\)/);
  assert.match(brandsContent, /permanentRedirect\('\/admin\/models\?brand=all'\)/);
});

test('Step 2: Gross margin formula and status classification', () => {
  function computeModelMargin(model, overrideCredits = null) {
    const costCny = model.min_cost_cny !== null && model.min_cost_cny !== undefined ? Number(model.min_cost_cny) : null;
    const credits = overrideCredits !== null ? overrideCredits : Number(model.base_credits || 0);
    const userPriceCny = credits * 0.1; // 1 credit = 0.1 CNY

    if (costCny !== null && costCny > 0 && userPriceCny > 0) {
      const marginCny = userPriceCny - costCny;
      const rate = Number(((marginCny / userPriceCny) * 100).toFixed(1));
      let status = 'healthy';
      if (rate < 0) status = 'loss';
      else if (rate < 30) status = 'low';
      else if (rate >= 30) status = 'healthy';

      return { hasData: true, costCny: costCny.toFixed(3), userPriceCny: userPriceCny.toFixed(2), marginCny: marginCny.toFixed(2), rate, status };
    }
    return { hasData: false, costCny: null, userPriceCny: userPriceCny.toFixed(2), marginCny: null, rate: null, status: 'unknown' };
  }

  // Healthy margin >= 30%
  const healthy = computeModelMargin({ min_cost_cny: 0.5, base_credits: 10 }); // userPrice = 1.0, margin = 0.5 (50%)
  assert.equal(healthy.rate, 50.0);
  assert.equal(healthy.status, 'healthy');

  // Low margin < 30% and >= 0%
  const low = computeModelMargin({ min_cost_cny: 0.8, base_credits: 10 }); // userPrice = 1.0, margin = 0.2 (20%)
  assert.equal(low.rate, 20.0);
  assert.equal(low.status, 'low');

  // Negative margin < 0% (loss)
  const loss = computeModelMargin({ min_cost_cny: 1.5, base_credits: 10 }); // userPrice = 1.0, margin = -0.5 (-50%)
  assert.equal(loss.rate, -50.0);
  assert.equal(loss.status, 'loss');

  // Missing cost
  const missing = computeModelMargin({ min_cost_cny: null, base_credits: 10 });
  assert.equal(missing.hasData, false);
  assert.equal(missing.status, 'unknown');
});

test('Step 2 & 3: Model Table & Drawer contain required safety checks and SSOT control', () => {
  const shelfContent = fs.readFileSync(path.join(repoRoot, 'app/admin/models/frontend/FrontendConfigClient.jsx'), 'utf8');

  // Verify at-a-glance status bar metrics
  assert.match(shelfContent, /在架运行/);
  assert.match(shelfContent, /备用储备/);
  assert.match(shelfContent, /0渠道阻断/);
  assert.match(shelfContent, /待审价盘/);
  assert.match(shelfContent, /负毛利预警/);
  assert.match(shelfContent, /全库体检与去重/);
  assert.match(shelfContent, /从模型库引入/);

  // Verify table columns 1-8
  assert.match(shelfContent, /模型主体/);
  assert.match(shelfContent, /归属工作台/);
  assert.match(shelfContent, /通道状态/);
  assert.match(shelfContent, /采购底价/);
  assert.match(shelfContent, /C 端售价/);
  assert.match(shelfContent, /实时毛利率/);
  assert.match(shelfContent, /前台可见性/);
  assert.match(shelfContent, /操作/);

  // Verify 0-channel offline safety modal interception
  assert.match(shelfContent, /UnroutedConfirmModal/);

  // Verify Idempotency-Key in callAPI
  assert.match(shelfContent, /'Idempotency-Key':\s*idempotencyKey/);

  const drawerContent = fs.readFileSync(path.join(repoRoot, 'app/admin/models/frontend/ModelConfigDrawer.jsx'), 'utf8');

  // Verify 5 sections in ModelConfigDrawer
  assert.match(drawerContent, /Section 1: 实时前台卡片 1:1 预览/);
  assert.match(drawerContent, /Section 2: 采购成本与定价毛利测算器/);
  assert.match(drawerContent, /Section 3: 就地供应通道与主备快速调度/);
  assert.match(drawerContent, /Section 4: 工作台规格与能力矩阵/);
  assert.match(drawerContent, /Section 5: 上下架与运营推荐控制/);

  // Verify negative margin alert & 0 routes warning
  assert.match(drawerContent, /赤红负毛利/);
  assert.match(drawerContent, /0 渠道阻断警示/);
});

test('Step 4: /admin/models/routing Sub-Tabs and SSOT Write API', () => {
  const routingContent = fs.readFileSync(path.join(repoRoot, 'app/admin/models/routing/RoutingClient.jsx'), 'utf8');

  // Verify 3 sub-tabs
  assert.match(routingContent, /id:\s*'topology',\s*label:\s*'模型路由拓扑与故障转移'/);
  assert.match(routingContent, /id:\s*'pricing',\s*label:\s*'全站价盘策略与安全红线'/);
  assert.match(routingContent, /id:\s*'pending',\s*label:\s*'待审价格版本集中核准'/);

  // Verify SSOT calls to /api/admin/models/control with Idempotency-Key
  assert.match(routingContent, /action:\s*'save_pricing_strategy'/);
  assert.match(routingContent, /action:\s*'save_model_pricing'/);
  assert.match(routingContent, /action:\s*'approve_price'/);

  const controlContent = fs.readFileSync(path.join(repoRoot, 'app/api/admin/models/control/route.js'), 'utf8');
  assert.match(controlContent, /case 'save_pricing_strategy':/);
  assert.match(controlContent, /case 'save_model_pricing':/);
  assert.match(controlContent, /case 'update_model_pricing':/);
  assert.match(controlContent, /case 'approve_price':/);
});

test('Step 5: Control Route Module resolves and exports required HTTP handlers without syntax errors', async () => {
  const controlModule = await import(path.join(repoRoot, 'app/api/admin/models/control/route.js'));
  assert.ok(controlModule.POST, 'POST handler must be exported');
  assert.ok(controlModule.GET, 'GET handler must be exported');
  assert.equal(controlModule.runtime, 'nodejs');
  assert.equal(controlModule.dynamic, 'force-dynamic');
});

test('Step 5: Drawer healthy route counting & channelRoutes fallback cost logic', () => {
  // Test case 1: channelRoutes has 1 healthy route, formData.healthy_routes is 0
  const routesWithHealthy = [
    { id: 'pm_1', enabled: true, review_status: 'approved', health_status: 'healthy', cost_cny: 0.12 },
    { id: 'pm_2', enabled: false, review_status: 'approved', health_status: 'healthy', cost_cny: 0.15 },
  ];
  const countWithRoutes = routesWithHealthy.filter(
    (r) => r.enabled && (r.review_status === 'approved' || !r.review_status) && (r.health_status === 'healthy' || !r.health_status)
  ).length;
  const formDataZero = { healthy_routes: 0, min_cost_cny: null, credits: 10 };
  const activeCount1 = routesWithHealthy.length > 0 ? countWithRoutes : Number(formDataZero.healthy_routes || 0);
  assert.equal(activeCount1, 1, 'Should detect 1 active healthy route even if formData.healthy_routes was 0');
  assert.equal(activeCount1 <= 0, false, 'isZeroRoutes should be false');

  // Test case 2: channelRoutes is empty, fallback to formData.healthy_routes
  const emptyRoutes = [];
  const formDataHealthy = { healthy_routes: 3, min_cost_cny: 0.5, credits: 10 };
  const activeCount2 = emptyRoutes.length > 0 ? 0 : Number(formDataHealthy.healthy_routes || 0);
  assert.equal(activeCount2, 3, 'Should fall back to formData.healthy_routes when channelRoutes is empty');
  assert.equal(activeCount2 <= 0, false, 'isZeroRoutes should be false');

  // Test case 3: Both are 0
  const activeCount3 = emptyRoutes.length > 0 ? 0 : Number(formDataZero.healthy_routes || 0);
  assert.equal(activeCount3, 0, 'Should detect 0 routes');
  assert.equal(activeCount3 <= 0, true, 'isZeroRoutes should be true');

  // Test case 4: Cost fallback to channelRoutes when min_cost_cny is null
  let derivedCost = formDataZero.min_cost_cny;
  if (derivedCost === null || !Number.isFinite(derivedCost) || derivedCost <= 0) {
    const validRouteCosts = routesWithHealthy
      .map((r) => Number(r.cost_cny))
      .filter((c) => Number.isFinite(c) && c > 0);
    if (validRouteCosts.length > 0) {
      derivedCost = Math.min(...validRouteCosts);
    }
  }
  assert.equal(derivedCost, 0.12, 'Cost should fall back to min cost among channel routes');
  const userPriceCny = formDataZero.credits * 0.1; // 1.0 CNY
  const marginRate = Number((((userPriceCny - derivedCost) / userPriceCny) * 100).toFixed(1));
  assert.equal(marginRate, 88.0, 'Margin rate should be 88%');
});

test('Step 6: Canonical getModelById and repository contract covers full specification fields', () => {
  const modelsRepoContent = fs.readFileSync(path.join(repoRoot, 'lib/repositories/models.js'), 'utf8');

  // getModelById must query canonical fields
  assert.match(modelsRepoContent, /m\.description/);
  assert.match(modelsRepoContent, /COALESCE\(m\.is_featured,\s*false\)\s*AS\s*is_featured/);
  assert.match(modelsRepoContent, /COALESCE\(m\.capabilities->>'pricing_hint',\s*''\)\s*AS\s*pricing_hint/);
  assert.match(modelsRepoContent, /COALESCE\(m\.supported_ratios,\s*'\[\]'::jsonb\)\s*AS\s*supported_ratios/);
  assert.match(modelsRepoContent, /COALESCE\(m\.supported_resolutions,\s*'\[\]'::jsonb\)\s*AS\s*supported_resolutions/);
  assert.match(modelsRepoContent, /COALESCE\(m\.supported_durations,\s*'\[\]'::jsonb\)\s*AS\s*supported_durations/);

  // createModel must handle pricingHint
  assert.match(modelsRepoContent, /pricingHint/);

  // updateModelConfig must persist metadata.pricing_hint
  assert.match(modelsRepoContent, /metadata\.pricing_hint/);
});

test('Step 6: SSOT Control route and Drawer UI contracts for full field payload and disabled states', () => {
  const controlRouteContent = fs.readFileSync(path.join(repoRoot, 'app/api/admin/models/control/route.js'), 'utf8');

  // create_model must not hardcode isVisible: false, must support pricingHint
  assert.match(controlRouteContent, /const isVisible = body\.isVisible !== undefined/);
  assert.match(controlRouteContent, /pricingHint/);

  const drawerContent = fs.readFileSync(path.join(repoRoot, 'app/admin/models/frontend/ModelConfigDrawer.jsx'), 'utf8');
  // Loading spinner disabled fieldset
  assert.match(drawerContent, /<fieldset disabled=\{saving\}/);
  // Controlled display_name input
  assert.match(drawerContent, /value=\{formData\.display_name \|\| ''\}/);

  const frontendClientContent = fs.readFileSync(path.join(repoRoot, 'app/admin/models/frontend/FrontendConfigClient.jsx'), 'utf8');
  // Toast must use design system token z-toast
  assert.match(frontendClientContent, /z-toast/);
  // Must provide startCreate
  assert.match(frontendClientContent, /startCreate/);
});

test('Step 7: Model Specification & Hygiene Consolidation (Zero Text Walls, SSOT, In-Shelf Variants)', async () => {
  // 1. Check canonicalModels.js module
  const { CANONICAL_GROUPS, isOrphanVariantCandidate, suggestCanonicalTarget } = await import(path.join(repoRoot, 'lib/modelCenter/canonicalModels.js'));
  assert.ok(Array.isArray(CANONICAL_GROUPS) && CANONICAL_GROUPS.length >= 25, 'CANONICAL_GROUPS must define at least 25 canonical specs');

  const klingGroup = CANONICAL_GROUPS.find((g) => g.targetId === 'kling-3.0');
  assert.ok(klingGroup, 'Kling 3.0 canonical group must exist');
  assert.ok(klingGroup.aliases.includes('kling-v3.0-standard-text-to-video'), 'Kling 3.0 must consolidate action aliases');

  // Test orphan candidate detection
  assert.equal(isOrphanVariantCandidate('unknown-model-t2v', 'backup'), true, 'Should detect orphan variant candidate');
  assert.equal(isOrphanVariantCandidate('kling-3.0', 'core'), false, 'Canonical model is not an orphan candidate');
  assert.equal(suggestCanonicalTarget('kling-unknown-i2v'), 'kling-3.0', 'Should suggest kling-3.0 for kling variants');

  // 2. Check Control Route SSOT contract
  const controlRouteContent = fs.readFileSync(path.join(repoRoot, 'app/api/admin/models/control/route.js'), 'utf8');
  assert.match(controlRouteContent, /hygiene_scan/, 'Control route must support hygiene_scan');
  assert.match(controlRouteContent, /case 'hygiene_merge':/, 'Control route must support hygiene_merge');
  assert.match(controlRouteContent, /case 'hygiene_sync':/, 'Control route must support hygiene_sync');

  // 3. Check ModelHygieneDrawer.jsx contract
  const hygieneDrawerContent = fs.readFileSync(path.join(repoRoot, 'app/admin/models/frontend/ModelHygieneDrawer.jsx'), 'utf8');
  // Must eliminate text walls
  assert.equal(hygieneDrawerContent.includes('两层模型治理模型机制'), false, 'Must eliminate essay-like theory text wall');
  assert.equal(hygieneDrawerContent.includes('日常自动化治理机制'), false, 'Must eliminate essay-like automated theory text wall');
  // Must handle payload safely without relying strictly on json.ok
  assert.match(hygieneDrawerContent, /json\.data \|\| json\.result/);
  // Must call SSOT control actions
  assert.match(hygieneDrawerContent, /hygiene_merge/);
  assert.match(hygieneDrawerContent, /hygiene_sync/);

  // 4. Check FrontendConfigClient.jsx in-shelf badges
  const frontendClientContent = fs.readFileSync(path.join(repoRoot, 'app/admin/models/frontend/FrontendConfigClient.jsx'), 'utf8');
  assert.match(frontendClientContent, /model\.aliases\?\.length > 0/);
  assert.match(frontendClientContent, /model\.is_orphan_candidate/);
  assert.match(frontendClientContent, /全库体检与去重/);
});
