import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readCode(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('Payment providers page delegates to PaymentProvidersPanel with permissions', async () => {
  const pageContent = await readCode('app/admin/providers/payments/page.js');
  assert.match(pageContent, /PaymentProvidersPanel/);
  assert.match(pageContent, /PERMISSIONS\.providersRead/);
  assert.match(pageContent, /PERMISSIONS\.providersWrite/);
  assert.match(pageContent, /getProvidersOverview/);
  assert.match(pageContent, /p\.kind === 'payment'/);
});

test('PaymentProvidersPanel renders categorized region tabs and card grid', async () => {
  const panelContent = await readCode('app/admin/providers/payments/PaymentProvidersPanel.js');
  assert.match(panelContent, /全部渠道/);
  assert.match(panelContent, /中国大陆渠道/);
  assert.match(panelContent, /海外国际渠道/);
  assert.match(panelContent, /rounded-full/);
  assert.match(panelContent, /ProviderCard/);
  assert.match(panelContent, /grid gap-3\.5/);
});

test('ProviderCard implements card grid UI and rich modal floating dialog matching social login standards', async () => {
  const cardContent = await readCode('app/admin/providers/ProviderCard.js');

  // UI structure & modal
  assert.match(cardContent, /z-modal/);
  assert.match(cardContent, /shadow-modal/);
  assert.match(cardContent, /rounded-2xl/);
  assert.match(cardContent, /Toggle/);
  assert.match(cardContent, /StatusBadge/);
  assert.match(cardContent, /fullWebhookUri/);
  assert.match(cardContent, /Idempotency-Key/);

  // Requirement: 生产与测试 API 按钮
  assert.match(cardContent, /测试生产 API/);
  assert.match(cardContent, /测试沙盒 API/);
  assert.match(cardContent, /生产环境/);
  assert.match(cardContent, /沙盒测试/);
  assert.match(cardContent, /handleSwitchEnv/);
  assert.match(cardContent, /api\/admin\/providers\/\$\{provider\.id\}\/env/);

  // Requirement: Webhook 日志信息
  assert.match(cardContent, /Webhook 日志/);
  assert.match(cardContent, /fetchWebhookLogs/);
  assert.match(cardContent, /api\/admin\/providers\/\$\{provider\.id\}\/webhooks/);
  assert.match(cardContent, /signatureStatus/);
  assert.match(cardContent, /orderId/);
  assert.match(cardContent, /eventType/);
  assert.match(cardContent, /eventId/);
});

test('API route app/api/admin/providers/[id]/env/route.js handles GET and PUT for active environment', async () => {
  const routeContent = await readCode('app/api/admin/providers/[id]/env/route.js');
  assert.match(routeContent, /getActiveProviderKeyEnv/);
  assert.match(routeContent, /setActiveProviderKeyEnv/);
  assert.match(routeContent, /PERMISSIONS\.providersRead/);
  assert.match(routeContent, /PERMISSIONS\.providersWrite/);
  assert.match(routeContent, /GET/);
  assert.match(routeContent, /PUT/);
});

test('API route app/api/admin/providers/[id]/webhooks/route.js provides provider webhook events', async () => {
  const routeContent = await readCode('app/api/admin/providers/[id]/webhooks/route.js');
  assert.match(routeContent, /listWebhookEvents/);
  assert.match(routeContent, /extractOrderId/);
  assert.match(routeContent, /resolveSignatureStatus/);
  assert.match(routeContent, /signatureStatus/);
  assert.match(routeContent, /PERMISSIONS\.providersRead/);
  assert.match(routeContent, /GET/);
});

test('testProviderHealth supports env parameter for alipay, paypal, stripe, and wechat', async () => {
  const serviceContent = await readCode('lib/services/providers.js');
  assert.match(serviceContent, /export async function testProviderHealth/);
  assert.match(serviceContent, /targetEnv = env \|\| await providerRepo\.getProviderKeyEnv\('alipay'\)/);
  assert.match(serviceContent, /targetEnv = env \|\| await providerRepo\.getProviderKeyEnv\('paypal'\)/);
  assert.match(serviceContent, /targetEnv = env \|\| await providerRepo\.getProviderKeyEnv\('stripe'\)/);
  assert.match(serviceContent, /targetEnv = env \|\| await providerRepo\.getProviderKeyEnv\('wechat'\)/);
  assert.match(serviceContent, /openapi-sandbox\.dl\.alipaydev\.com/);
  assert.match(serviceContent, /api-m\.sandbox\.paypal\.com/);
  assert.match(serviceContent, /sandboxnew\/pay\/getsignkey/);
});

test('SocialIcons exports StripeIcon and PayPalIcon and registers them in SOCIAL_ICON_COMPONENTS', async () => {
  const iconsContent = await readCode('components/SocialIcons.js');
  assert.match(iconsContent, /export function StripeIcon/);
  assert.match(iconsContent, /export function PayPalIcon/);
  assert.match(iconsContent, /stripe:\s*StripeIcon/);
  assert.match(iconsContent, /paypal:\s*PayPalIcon/);
});

test('hasPermission polymorphic support for role string and user object with role', async () => {
  const { hasPermission, PERMISSIONS } = await import('../../lib/admin/permissions.js');
  const user = { id: 808405, role: 'super_admin' };
  assert.equal(hasPermission(user, PERMISSIONS.providersWrite), true);
  assert.equal(hasPermission('super_admin', PERMISSIONS.providersWrite), true);
  assert.equal(hasPermission(user, PERMISSIONS.providersRead), true);
  assert.equal(hasPermission({ role: 'user' }, PERMISSIONS.providersWrite), false);
  assert.equal(hasPermission(null, PERMISSIONS.providersWrite), false);
});

test('billing repository listWebhookEvents includes event_type and payload_json and supports query filter', async () => {
  const billingRepo = await readCode('lib/repositories/billing.js');
  assert.match(billingRepo, /event_type/);
  assert.match(billingRepo, /payload_json/);
  assert.match(billingRepo, /event_id ILIKE/);
});
