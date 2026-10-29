import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('1. Model config drawer: credit price input, rigorous validation & save transmission', () => {
  // P5 后台重排后，积分售价输入拆到共享抽屉 ModelConfigDrawer，保存流程仍在 FrontendConfigClient。
  const drawer = read('app/admin/models/frontend/ModelConfigDrawer.jsx');
  const content = read('app/admin/models/frontend/FrontendConfigClient.jsx');

  // Drawer 内的积分售价输入与状态绑定
  assert.ok(drawer.includes('单次积分售价'), 'ModelConfigDrawer must render the credit price label');
  assert.ok(drawer.includes("value={formData.credits ?? ''}"), 'ModelConfigDrawer must bind formData.credits to the input');
  assert.ok(
    drawer.includes("setFormData((f) => ({ ...f, credits: e.target.value === '' ? '' : Number(e.target.value) }))"),
    'ModelConfigDrawer must update formData.credits on change'
  );

  // Drawer 保存前的严格正整数校验
  assert.ok(drawer.includes('const credits = Number(formData.credits);'), 'ModelConfigDrawer save must parse formData.credits');
  assert.ok(
    drawer.includes('!Number.isInteger(credits) || credits <= 0'),
    'ModelConfigDrawer save must reject non-integer or zero/negative credits'
  );

  // FrontendConfigClient handleDrawerSave 的校验与传输
  assert.ok(
    content.includes('const creditsPrice = Number(formData.credits);'),
    'handleDrawerSave must calculate creditsPrice from formData.credits without falsy 0 bypass'
  );
  assert.ok(content.includes('creditsPrice,'), 'handleDrawerSave must send creditsPrice in update_model_tiering payload');
  assert.ok(content.includes('base_credits: creditsPrice,'), 'handleDrawerSave must update local base_credits state');
  assert.ok(
    content.includes("tier: formData.tier || (isVisible ? 'core' : 'backup')"),
    'handleDrawerSave must ensure core tier when visible'
  );

  // 极速改价同样拒绝非法积分
  assert.ok(content.includes('const credits = Number(quickPriceInput);'), 'handleSaveQuickPrice must parse quickPriceInput');
  assert.ok(
    content.includes('!Number.isInteger(credits) || credits <= 0'),
    'handleSaveQuickPrice must reject non-integer or zero/negative credits'
  );
  assert.ok(content.includes('base_credits: credits'), 'handleSaveQuickPrice must update local base_credits state');

  // 抽屉初始化不得伪造默认积分
  assert.ok(drawer.includes('Number(model.base_credits) > 0'), 'drawer init must check model.base_credits');
  assert.ok(drawer.includes('Number(model.credits_price) > 0'), 'drawer init must check model.credits_price');

  // Edge case unit validation logic
  const validateCredits = (credits) => {
    if (credits === '' || credits === null || credits === undefined) return false;
    const num = Number(credits);
    return Number.isInteger(num) && num > 0;
  };
  assert.strictEqual(validateCredits(0), false, '0 must be rejected');
  assert.strictEqual(validateCredits('0'), false, '"0" string must be rejected');
  assert.strictEqual(validateCredits(-10), false, 'Negative credits must be rejected');
  assert.strictEqual(validateCredits(''), false, 'Empty string must be rejected');
  assert.strictEqual(validateCredits(null), false, 'Null must be rejected');
  assert.strictEqual(validateCredits(50.5), false, 'Floating point must be rejected');
  assert.strictEqual(validateCredits(50), true, '50 must be valid');
  assert.strictEqual(validateCredits('100'), true, '"100" string must be valid');
});

test('2. Model display toggle automatically sets autoRouteEligible and isActive', () => {
  const content = read('app/admin/models/frontend/FrontendConfigClient.jsx');

  // executeToggleVisibility: 开启展示时同步发送并乐观更新路由资格；关闭时保留原有资格，不强行降级
  assert.ok(
    content.includes('autoRouteEligible: newVisible ? true : undefined,'),
    'executeToggleVisibility must send autoRouteEligible: true when newVisible is true'
  );
  assert.ok(
    content.includes('isActive: newVisible ? true : undefined,'),
    'executeToggleVisibility must send isActive: true when newVisible is true'
  );
  assert.ok(
    content.includes("...(newVisible ? { auto_route_eligible: true, status: 'active', tier: 'core' } : {})"),
    'executeToggleVisibility must optimistically set auto_route_eligible: true and status: active'
  );

  // executeAddModelToCategory
  assert.ok(content.includes('autoRouteEligible: true,'), 'executeAddModelToCategory must send autoRouteEligible: true');
  assert.ok(content.includes('isActive: true,'), 'executeAddModelToCategory must send isActive: true');
  assert.ok(
    content.includes("auto_route_eligible: true, status: 'active', tier: 'core', category: targetCategory, sort: 1"),
    'executeAddModelToCategory must optimistically set local auto_route_eligible state'
  );

  // saveEdit
  assert.ok(content.includes('autoRouteEligible: isVisible ? true : undefined,'), 'saveEdit must send autoRouteEligible: true when isVisible');
  assert.ok(content.includes('isActive: isVisible ? true : undefined,'), 'saveEdit must send isActive: true when isVisible');
  assert.ok(
    content.includes("tier: formData.tier || (isVisible ? 'core' : 'backup')"),
    'saveEdit must ensure core tier when visible'
  );
});

test('3. PricingManagerClient: Approval and activation action entry for pending price versions with Idempotency-Key and UI compliance', () => {
  const content = read('app/admin/models/pricing/PricingManagerClient.jsx');

  // Props and state
  assert.ok(content.includes('initialPendingPrices = []'), 'PricingManagerClient must accept initialPendingPrices prop');
  assert.ok(
    content.includes('const [pendingPrices, setPendingPrices] = useState(initialPendingPrices);'),
    'PricingManagerClient must maintain pendingPrices state'
  );

  // Approval endpoint invocation
  assert.ok(content.includes("action: 'approve_price'"), 'PricingManagerClient must call control endpoint with approve_price action');
  assert.ok(content.includes('versionId,'), 'handleApprovePrice must transmit versionId');
  assert.ok(content.includes("fetch('/api/admin/models/control'"), 'PricingManagerClient must target /api/admin/models/control');

  // Idempotency-Key header mandatory check (prevent 422 IDEMPOTENCY_REQUIRED)
  assert.ok(
    content.includes("'Idempotency-Key': `approve_price_${versionId}"),
    'handleApprovePrice must provide Idempotency-Key header'
  );
  assert.ok(
    content.includes("'Idempotency-Key': `approve_price_${item.id}"),
    'handleBatchApprove must provide Idempotency-Key header'
  );

  // Batch approve action
  assert.ok(content.includes('handleBatchApprove'), 'PricingManagerClient must provide handleBatchApprove');
  assert.ok(content.includes('一键批量批准'), 'PricingManagerClient must render batch approve button');

  // Navigation tab & banner
  assert.ok(content.includes('待审价格版本'), 'PricingManagerClient must include Pending Price Versions tab');
  assert.ok(content.includes("setActiveTab('pending')"), 'PricingManagerClient must allow switching to pending tab');
  assert.ok(content.includes('PRICE_MISSING'), 'PricingManagerClient must notify about PRICE_MISSING prevention in pending tab / banner');

  // UI Repair Instruction compliance:
  // 分段 Pill 契约由共享组件承载；本页在 P5 重排后采用 WeChat 下划线选项卡契约。
  const tabsUi = read('components/ui/tabs.jsx');
  assert.ok(tabsUi.includes('data-pill-segmented'), 'shared Tabs pill root must declare data-pill-segmented');
  assert.ok(tabsUi.includes('data-pill-segment-item'), 'shared Tabs pill trigger must declare data-pill-segment-item');
  assert.ok(tabsUi.includes('shadow-elevation-1'), 'shared Tabs active pill must use shadow-elevation-1 token');
  assert.ok(content.includes('WeChat Underline Tabs'), 'PricingManagerClient tab bar must declare the underline tabs contract');
  assert.ok(content.includes('border-b border-line-subtle'), 'PricingManagerClient tab bar must use the shared underline divider token');
  assert.ok(content.includes('bg-brand rounded-full'), 'PricingManagerClient active tab must render the brand underline indicator');
  assert.ok(content.includes('shadow-elevation-1'), 'PricingManagerClient banner must use shadow-elevation-1 token');

  // Linking from Tab 2
  assert.ok(content.includes('setPendingSearch(item.modelId)'), 'Tab 2 must provide jump to pending price versions for unpriced models');
});

test('4. Routing page: SSR query for pending price versions and pricing route redirect', () => {
  const routingPage = read('app/admin/models/routing/page.js');
  assert.ok(
    routingPage.includes('FROM ai_studio.provider_model_price_versions pv'),
    'routing/page.js must query provider_model_price_versions'
  );
  assert.ok(
    routingPage.includes("WHERE pv.status IN ('staged', 'pending_review')"),
    'routing/page.js must query staged and pending_review versions'
  );
  assert.ok(
    routingPage.includes('initialPendingPrices={pendingPrices}'),
    'routing/page.js must pass initialPendingPrices prop to the client'
  );

  // 旧定价页保留兼容入口，重定向到统一路由页
  const pricingPage = read('app/admin/models/pricing/page.js');
  assert.ok(
    pricingPage.includes("permanentRedirect('/admin/models/routing?tab=pending')"),
    'pricing/page.js must redirect the pending tab to the unified routing page'
  );
  assert.ok(
    pricingPage.includes("permanentRedirect('/admin/models/routing?tab=pricing')"),
    'pricing/page.js must redirect other tabs to the unified routing page pricing tab'
  );
});

test('5. channelSync: getPricingControlSnapshot includes failover_enabled & joins provider/model metadata', () => {
  const content = read('lib/services/channelSync.js');

  assert.ok(
    content.includes('COALESCE(rp.failover_enabled, true) AS failover_enabled'),
    'channelSync.js getPricingControlSnapshot query must include COALESCE(rp.failover_enabled, true) AS failover_enabled'
  );
  assert.ok(
    content.includes('p.name AS provider_name'),
    'channelSync.js getPricingControlSnapshot pendingPrices query must join provider name'
  );
  assert.ok(
    content.includes('COALESCE(m.display_name, m.name) AS model_name'),
    'channelSync.js getPricingControlSnapshot pendingPrices query must join model display name'
  );
});

test('6. JSX Syntax Validation: admin model clients parse without error', () => {
  const babel = require('next/dist/compiled/babel/core');
  const preset = require.resolve('next/dist/compiled/babel/preset-react');
  const jsxFiles = [
    'app/admin/models/frontend/FrontendConfigClient.jsx',
    'app/admin/models/frontend/ModelConfigDrawer.jsx',
    'app/admin/models/pricing/PricingManagerClient.jsx',
  ];

  for (const relativePath of jsxFiles) {
    const fullPath = path.join(root, relativePath);
    const code = fs.readFileSync(fullPath, 'utf8');
    assert.doesNotThrow(() => {
      babel.parseSync(code, {
        filename: fullPath,
        presets: [preset],
      });
    }, `${relativePath} must parse without JSX/JS syntax errors`);
  }
});
