import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readCode(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('Admin navigation config keeps login under one submenu entry', async () => {
  const content = await readCode('components/admin/AdminNav.js');
  const sharedNavigationExists = await fs.access(path.join(repoRoot, 'lib/admin/navigation.js')).then(() => true, () => false);
  if (sharedNavigationExists) {
    assert.match(content, /ADMIN_NAV_GROUPS/);
    const { ADMIN_NAV_GROUPS } = await import('../../lib/admin/navigation.js');
    const systemGroup = ADMIN_NAV_GROUPS.find((group) => group.id === 'system');
    assert.ok(systemGroup, '缺少系统与安全分组');
    const loginMethods = systemGroup.items.filter((item) => item.id === 'login-methods');
    assert.equal(loginMethods.length, 1, '登录方式必须收敛为一个子菜单项');
    assert.equal(loginMethods[0].href, '/admin/system/login');
    assert.equal(loginMethods[0].label, '登录方式与连通性');
    assert.equal(loginMethods[0].permission, 'providers.read');
  } else {
    assert.match(content, /label:\s*'登录配置'/);
    assert.ok(content.includes('/admin/system/login'), '登录配置缺少集中入口');
  }
});

test('Providers service defines international and mainland social providers with distinct callbacks', async () => {
  const content = await readCode('lib/services/providers.js');
  assert.match(content, /id:\s*'google'/);
  assert.match(content, /id:\s*'x'/);
  assert.match(content, /id:\s*'tiktok'/);
  assert.match(content, /id:\s*'instagram'/);
  assert.match(content, /id:\s*'wechat_oauth'/);
  assert.match(content, /id:\s*'qq'/);
  assert.match(content, /id:\s*'douyin'/);
  assert.match(content, /kind:\s*'social'/);
  assert.match(content, /callbackPath:\s*'\/api\/auth\/oauth\/google\/callback'/);
  assert.match(content, /callbackPath:\s*'\/api\/auth\/oauth\/x\/callback'/);
  assert.match(content, /callbackPath:\s*'(\/api\/auth\/oauth\/|\/auth\/)tiktok\/callback'/);
  assert.match(content, /callbackPath:\s*'\/api\/auth\/oauth\/instagram\/callback'/);
  assert.match(content, /callbackPath:\s*'\/api\/auth\/oauth\/wechat\/callback'/);
  assert.match(content, /callbackPath:\s*'\/api\/auth\/oauth\/qq\/callback'/);
  assert.match(content, /callbackPath:\s*'\/api\/auth\/oauth\/douyin\/callback'/);
  assert.match(content, /wechat_oauth:app_secret/);
});

test('lib/oauth.js supports dynamic credentials from encrypted database', async () => {
  const content = await readCode('lib/oauth.js');
  assert.match(content, /export async function getResolvedOAuthConfig/);
  assert.match(content, /export async function isOAuthProviderConfigured/);
  assert.match(content, /credentialProvider: 'google'/);
  assert.match(content, /credentialProvider: 'x'/);
  assert.match(content, /credentialProvider: 'tiktok'/);
  assert.match(content, /wechat_oauth/);
  assert.match(content, /app_id/);
  assert.match(content, /app_secret/);
});

test('OAuth route uses resolved dynamic config before redirecting', async () => {
  const content = await readCode('app/api/auth/oauth/[provider]/route.js');
  assert.match(content, /getResolvedOAuthConfig/);
  assert.match(content, /await buildAuthorizationUrl/);
});

test('Secret PUT route supports batch secrets update for client_id and client_secret', async () => {
  const content = await readCode('app/api/admin/providers/[id]/secret/route.js');
  assert.match(content, /body\.secrets/);
  assert.match(content, /rotateProviderSecret/);
});

test('Social providers admin page and card component exist and are well structured', async () => {
  const pageContent = await readCode('app/admin/system/login/page.js');
  const cardContent = await readCode('app/admin/system/login/SocialProviderCard.js');
  assert.match(pageContent, /LoginMethodsPage/);
  assert.match(pageContent, /kind === 'social'/);
  assert.match(cardContent, /SocialProviderCard/);
  assert.match(cardContent, /一键复制/);
  assert.match(cardContent, /网关可达性探针/);
  assert.match(cardContent, /配置密钥 \/ 轮换/);
  // 确认已彻底删除管理员二次密码字段
  assert.doesNotMatch(cardContent, /adminPassword/);
});

test('Providers repo encryption key has multi-level fallback and uses ops_bill schema', async () => {
  const repoContent = await readCode('lib/repositories/providers.js');
  assert.match(repoContent, /ADMIN_SECRET_KEY/);
  assert.match(repoContent, /BILLING_SESSION_SECRET/);
  assert.match(repoContent, /ops_bill\.provider_secrets/);
  assert.match(repoContent, /ops_bill\.provider_health_checks/);
});

test('Health check probes in SocialProviderCard and ProviderCard include Idempotency-Key and error handling', async () => {
  const socialCard = await readCode('app/admin/system/login/SocialProviderCard.js');
  const genericCard = await readCode('app/admin/providers/ProviderCard.js');
  const secretRoute = await readCode('app/api/admin/providers/[id]/secret/route.js');
  
  // 确认两个卡片的 runTest 均注入 Idempotency-Key
  assert.match(socialCard, /Idempotency-Key/);
  assert.match(genericCard, /Idempotency-Key/);
  
  // 确认 SocialProviderCard 具有已托管存盘感知
  assert.match(socialCard, /已托管存盘/);
  
  // 确认 secret 保存成功后自动触发 testProviderHealth
  assert.match(secretRoute, /testProviderHealth/);
});

test('SocialProviderCard handles Date, ISO string, and env fallback without throwing .slice is not a function', async () => {
  const cardContent = await readCode('app/admin/system/login/SocialProviderCard.js');
  assert.doesNotMatch(cardContent, /keyDef\.updatedAt\.slice/);
  assert.match(cardContent, /formatUpdatedAt/);

  const repoContent = await readCode('lib/repositories/providers.js');
  assert.match(repoContent, /toISOString/);

  const serviceContent = await readCode('lib/services/providers.js');
  assert.match(serviceContent, /safeUpdatedAt/);
});

test('Instagram provider is configured in social catalog, oauth, card icon, and modal', async () => {
  const socialProviders = await readCode('lib/auth/socialProviders.js');
  assert.match(socialProviders, /'instagram'/);

  const oauth = await readCode('lib/oauth.js');
  assert.match(oauth, /instagram:\s*\{/);
  assert.match(oauth, /api\.instagram\.com\/oauth\/authorize/);
  assert.match(oauth, /api\.instagram\.com\/oauth\/access_token/);
  assert.match(oauth, /graph\.instagram\.com\/me/);

  const card = await readCode('app/admin/system/login/SocialProviderCard.js');
  assert.match(card, /instagram:\s*InstagramIcon/);
  assert.match(card, /instagram:\s*\{\s*label:\s*'Meta for Developers 控制台'/);

  const icons = await readCode('components/SocialIcons.js');
  assert.match(icons, /export function InstagramIcon/);

  const authModal = await readCode('components/AuthModal.js');
  assert.match(authModal, /instagram:\s*\{\s*label:\s*'Instagram'/);

  const profileTab = await readCode('components/account/tabs/ProfileTab.js');
  assert.match(profileTab, /instagram:\s*\{\s*title:\s*'Instagram 账号'/);
});

test('maskSecretKey correctly masks secrets and UI cards display semi-masked keys', async () => {
  const { maskSecretKey } = await import('../../lib/admin/redaction.js');
  assert.equal(maskSecretKey('123456'), '••••456');
  assert.equal(maskSecretKey('1234567890'), '••••7890');
  assert.equal(maskSecretKey('sk-1234567890abcdef'), '••••••••cdef');
  assert.equal(maskSecretKey(''), '');
  assert.equal(maskSecretKey(null), '');

  const socialCard = await readCode('app/admin/system/login/SocialProviderCard.js');
  assert.match(socialCard, /k\.maskedValue/);
  assert.match(socialCard, /未配置/);

  const modelProvidersPage = await readCode('app/admin/models/providers/page.js');
  assert.match(modelProvidersPage, /maskSecretKey/);
  assert.match(modelProvidersPage, /maskedApiKey/);

  const modelProvidersClient = await readCode('app/admin/models/providers/ProvidersManagerClient.jsx');
  assert.match(modelProvidersClient, /已填密钥:/);
  assert.match(modelProvidersClient, /c\.maskedApiKey/);
  assert.match(modelProvidersClient, /待配置密钥/);
});

test('Admin social login settings entry points and provider channels data mapping are fully resolved', async () => {
  const socialRedirect = await readCode('app/admin/providers/social/page.js');
  assert.match(socialRedirect, /\/admin\/system\/login\?category=social/);
  assert.doesNotMatch(socialRedirect, /\/admin\/system\?tab=login/);

  const smsRedirect = await readCode('app/admin/providers/sms/page.js');
  assert.match(smsRedirect, /\/admin\/system\/login\?category=sms/);

  const emailRedirect = await readCode('app/admin/providers/email/page.js');
  assert.match(emailRedirect, /\/admin\/system\/email/);

  const systemPage = await readCode('app/admin/system/page.js');
  assert.match(systemPage, /\/admin\/system\/login/);

  const loginPage = await readCode('app/admin/system/login/page.js');
  assert.match(loginPage, /catalogProviders\s*=\s*SOCIAL_LOGIN_CATALOG\[regionId\]/);
  assert.match(loginPage, /provider:\s*providerData/);
  assert.match(loginPage, /region:\s*chinaIp \? 'mainland_china' : 'international'/);
  assert.match(loginPage, /ipSource/);

  const navComponent = await readCode('components/admin/LoginConfigurationNav.js');
  assert.match(navComponent, /\/admin\/system\/login\?category=social/);
});

