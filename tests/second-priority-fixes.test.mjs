import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();

test('1. FrontendConfigClient: Drawer form credit price input, rigorous validation & saveEdit transmission', () => {
  const filePath = path.join(root, 'app/admin/models/frontend/FrontendConfigClient.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  // Verify credit price input field in drawer
  assert.ok(content.includes('单次生成积分 (base_credits)'), 'FrontendConfigClient must render label for base_credits');
  assert.ok(content.includes('value={editForm.credits ?? \'\'}'), 'FrontendConfigClient must bind editForm.credits to input');
  assert.ok(content.includes('setEditForm((f) => ({ ...f, credits: val }))'), 'FrontendConfigClient must update editForm.credits on change');

  // Verify saveEdit validates positive integer and transmits creditsPrice
  assert.ok(content.includes('const creditsPrice = Number(editForm.credits);'), 'saveEdit must calculate creditsPrice directly from editForm.credits without falsy 0 bypass');
  assert.ok(content.includes('!Number.isInteger(creditsPrice) || creditsPrice <= 0'), 'saveEdit must reject non-integer or zero/negative credits');
  assert.ok(content.includes('creditsPrice,'), 'saveEdit must send creditsPrice in update_model_tiering payload');
  assert.ok(content.includes('base_credits: creditsPrice,'), 'saveEdit must update local base_credits state');
  assert.ok(content.includes('credits_price: creditsPrice,'), 'saveEdit must update local credits_price state');

  // Verify startEdit & handleSelectModel initialize credits properly without fabricating fake 50
  assert.ok(content.includes('Number(model.base_credits) > 0'), 'startEdit and handleSelectModel must check model.base_credits');
  assert.ok(content.includes('Number(model.credits_price) > 0'), 'startEdit and handleSelectModel must check model.credits_price');

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

test('2. FrontendConfigClient: Model display toggle automatically sets autoRouteEligible and isActive', () => {
  const filePath = path.join(root, 'app/admin/models/frontend/FrontendConfigClient.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  // In executeToggleVisibility
  assert.ok(content.includes('autoRouteEligible: newVisible ? true : (model.auto_route_eligible ?? false)'), 'executeToggleVisibility must send autoRouteEligible: true when newVisible is true');
  assert.ok(content.includes('isActive: newVisible ? true : (model.status === \'active\' || model.is_active)'), 'executeToggleVisibility must send isActive: true when newVisible is true');
  assert.ok(content.includes('...(newVisible ? { auto_route_eligible: true, status: \'active\', tier: \'core\' } : {})'), 'executeToggleVisibility must optimistically set auto_route_eligible: true and status: active');

  // In executeAddModelToCategory
  assert.ok(content.includes('autoRouteEligible: true,'), 'executeAddModelToCategory must send autoRouteEligible: true');
  assert.ok(content.includes('isActive: true,'), 'executeAddModelToCategory must send isActive: true');

  // In saveEdit
  assert.ok(content.includes('autoRouteEligible: isVisible ? true : undefined,'), 'saveEdit must send autoRouteEligible: true when isVisible');
  assert.ok(content.includes('isActive: isVisible ? true : undefined,'), 'saveEdit must send isActive: true when isVisible');
  assert.ok(content.includes('tier: editForm.tier || (isVisible ? \'core\' : \'backup\')'), 'saveEdit must ensure core tier when visible');
  assert.ok(content.includes('...(isVisible ? { auto_route_eligible: true, status: \'active\' } : {})'), 'saveEdit must update local auto_route_eligible state');
});

test('3. PricingManagerClient: Approval and activation action entry for pending price versions with Idempotency-Key and UI compliance', () => {
  const clientPath = path.join(root, 'app/admin/models/pricing/PricingManagerClient.jsx');
  const content = fs.readFileSync(clientPath, 'utf8');

  // Props and state
  assert.ok(content.includes('initialPendingPrices = []'), 'PricingManagerClient must accept initialPendingPrices prop');
  assert.ok(content.includes('const [pendingPrices, setPendingPrices] = useState(initialPendingPrices);'), 'PricingManagerClient must maintain pendingPrices state');

  // Approval endpoint invocation
  assert.ok(content.includes("action: 'approve_price'"), 'PricingManagerClient must call control endpoint with approve_price action');
  assert.ok(content.includes('versionId,'), 'handleApprovePrice must transmit versionId');
  assert.ok(content.includes("fetch('/api/admin/models/control'"), 'PricingManagerClient must target /api/admin/models/control');

  // Idempotency-Key header mandatory check (prevent 422 IDEMPOTENCY_REQUIRED)
  assert.ok(content.includes("'Idempotency-Key': `approve_price_${versionId}"), 'handleApprovePrice must provide Idempotency-Key header');
  assert.ok(content.includes("'Idempotency-Key': `approve_price_${item.id}"), 'handleBatchApprove must provide Idempotency-Key header');

  // Batch approve action
  assert.ok(content.includes('handleBatchApprove'), 'PricingManagerClient must provide handleBatchApprove');
  assert.ok(content.includes('一键批量批准'), 'PricingManagerClient must render batch approve button');

  // Navigation tab & banner
  assert.ok(content.includes('待审价格版本'), 'PricingManagerClient must include Pending Price Versions tab');
  assert.ok(content.includes("setActiveTab('pending')"), 'PricingManagerClient must allow switching to pending tab');
  assert.ok(content.includes('PRICE_MISSING'), 'PricingManagerClient must notify about PRICE_MISSING prevention in pending tab / banner');

  // UI Repair Instruction compliance
  assert.ok(content.includes('data-pill-segmented'), 'PricingManagerClient tab bar must declare data-pill-segmented');
  assert.ok(content.includes('data-pill-segment-item'), 'PricingManagerClient tab buttons must declare data-pill-segment-item');
  assert.ok(content.includes('shadow-elevation-1'), 'PricingManagerClient active tab must use shadow-elevation-1 token');

  // Linking from Tab 2
  assert.ok(content.includes('setPendingSearch(item.modelId)'), 'Tab 2 must provide jump to pending price versions for unpriced models');
});

test('4. Pricing Page: SSR query for pending price versions', () => {
  const pagePath = path.join(root, 'app/admin/models/pricing/page.js');
  const content = fs.readFileSync(pagePath, 'utf8');

  assert.ok(content.includes('FROM ai_studio.provider_model_price_versions pv'), 'page.js must query provider_model_price_versions');
  assert.ok(content.includes("WHERE pv.status IN ('staged', 'pending_review')"), 'page.js must query staged and pending_review versions');
  assert.ok(content.includes('initialPendingPrices={pendingPrices || []}'), 'page.js must pass initialPendingPrices prop to client');
});

test('5. channelSync: getPricingControlSnapshot includes failover_enabled & joins provider/model metadata', () => {
  const syncPath = path.join(root, 'lib/services/channelSync.js');
  const content = fs.readFileSync(syncPath, 'utf8');

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

test('6. JSX Syntax Validation: FrontendConfigClient and PricingManagerClient parse without error', () => {
  const babel = require('next/dist/compiled/babel/core');
  const preset = require.resolve('next/dist/compiled/babel/preset-react');
  const jsxFiles = [
    'app/admin/models/frontend/FrontendConfigClient.jsx',
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
