import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getAuthCopy, getAuthRoutes, AUTH_LOCALES } from '../../lib/authCopy.js';
import { getSocialLoginRegion } from '../../lib/auth/socialRegion.js';
import { buildAuthorizationUrl, getOAuthProvider } from '../../lib/oauth.js';

test('Instagram OAuth configuration isolates credentials, avoids invalid extra params, and uses comma scope delimiter', async () => {
  const provider = getOAuthProvider('instagram');
  assert.ok(provider, 'Instagram provider must be registered');
  assert.equal(provider.authExtraParams?.enable_fb_login, '0', 'enable_fb_login must be 0 to bypass Facebook redirect loop');
  assert.equal(provider.authExtraParams?.force_authentication, undefined, 'force_authentication is invalid in Meta OAuth and must not be set');

  // Verify buildAuthorizationUrl produces comma-separated scopes for Instagram
  const authUrl = await buildAuthorizationUrl(
    'instagram',
    'https://www.supdance.com/api/auth/oauth/instagram/callback',
    'test_state',
    null,
    {
      ...provider,
      resolvedClientId: 'test_insta_client_id',
    }
  );

  const parsed = new URL(authUrl);
  assert.equal(parsed.searchParams.get('client_id'), 'test_insta_client_id');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('enable_fb_login'), '0');
  assert.equal(parsed.searchParams.get('force_authentication'), null);
  const scope = parsed.searchParams.get('scope');
  assert.ok(scope, 'Scope must be set');
  assert.ok(!scope.includes(' '), 'Instagram scope must not contain space separators');
  assert.equal(scope, 'instagram_business_basic');
});

test('Region toggle buttons are completely removed from auth components', () => {
  const rootDir = process.cwd();
  const filesToCheck = [
    'components/auth/LoginForm.jsx',
    'components/auth/RegisterForm.jsx',
    'components/auth/AuthCard.jsx',
    'components/auth/SocialLoginButtons.jsx',
  ];

  for (const relPath of filesToCheck) {
    const fullPath = path.join(rootDir, relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert.ok(!content.includes('切换为国内'), `${relPath} must not contain "切换为国内"`);
    assert.ok(!content.includes('切换为海外'), `${relPath} must not contain "切换为海外"`);
    assert.ok(!content.includes('onToggleRegion'), `${relPath} must not use onToggleRegion`);
    assert.ok(!content.includes('isSwitchingRegion'), `${relPath} must not use isSwitchingRegion`);
  }
});

test('Popup blocker safety pattern is implemented via openOAuthPopup with unique oauth name and location.assign fallback', () => {
  const rootDir = process.cwd();

  // 1. Verify lib/auth/oauthPopup.js exists and implements safe opening
  const helperPath = path.join(rootDir, 'lib/auth/oauthPopup.js');
  assert.ok(fs.existsSync(helperPath), 'lib/auth/oauthPopup.js must exist');
  const helperContent = fs.readFileSync(helperPath, 'utf8');
  assert.ok(helperContent.includes('oauth_'), 'Helper must use unique window name starting with oauth_ for popup callback detection');
  assert.ok(helperContent.includes('popup.closed'), 'Helper must check popup.closed for popup blocker detection');
  assert.ok(helperContent.includes('window.location.assign(url)'), 'Helper must fallback to location.assign');

  // 2. Verify all auth components use openOAuthPopup
  const filesWithOAuth = [
    'components/auth/LoginForm.jsx',
    'components/auth/RegisterForm.jsx',
    'components/auth/SocialLoginButtons.jsx',
  ];

  for (const relPath of filesWithOAuth) {
    const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    assert.ok(!content.includes("'supdance-oauth'"), `${relPath} must not use fixed window target 'supdance-oauth'`);
    assert.ok(content.includes('openOAuthPopup'), `${relPath} must use openOAuthPopup helper`);
  }
});

test('Region is strictly determined by IP address and ignores legacy cookies', () => {
  // China IP (Hangzhou Unicom) with foreign cookie
  const cnHeaders = {
    'x-forwarded-for': '116.148.99.110',
    cookie: 'session_id=123; ko_social_region=international; theme=dark',
  };
  assert.equal(getSocialLoginRegion(cnHeaders), 'mainland_china');

  // Overseas IP (Seoul Oracle) with china cookie
  const krHeaders = {
    'x-forwarded-for': '138.2.120.119',
    cookie: 'session_id=456; ko_social_region=mainland_china',
  };
  assert.equal(getSocialLoginRegion(krHeaders), 'international');
});

test('Full i18n coverage across all 6 supported locales in lib/authCopy.js', () => {
  assert.deepEqual(AUTH_LOCALES, ['en', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'es']);

  const requiredSections = ['layout', 'login', 'register', 'forgot', 'change'];
  const requiredLoginKeys = [
    'title', 'subtitle', 'tabEmail', 'tabPhone', 'emailLabel',
    'passwordLabel', 'forgotPasswordLink', 'phoneLabel', 'codeLabel',
    'sendCode', 'submitLogin', 'loggingIn', 'socialDivider',
    'noAccountPrompt', 'registerLink', 'errEnterPhone', 'errEnterEmail',
    'errEnterPassword', 'errLoginFailed', 'msgCodeSent', 'msgLoginSuccess',
  ];

  for (const loc of AUTH_LOCALES) {
    const copy = getAuthCopy(loc);
    assert.ok(copy, `Copy must exist for locale ${loc}`);

    for (const section of requiredSections) {
      assert.ok(copy[section], `Section ${section} must exist in ${loc}`);
      assert.equal(typeof copy[section], 'object', `Section ${section} in ${loc} must be an object`);
    }

    for (const key of requiredLoginKeys) {
      assert.ok(copy.login[key], `Login key ${key} must exist in ${loc}`);
      assert.equal(typeof copy.login[key], 'string', `Login key ${key} in ${loc} must be a string`);
    }

    // Verify resendCode function
    assert.equal(typeof copy.login.resendCode, 'function', `resendCode in ${loc} must be a function`);
    const resendText = copy.login.resendCode(55);
    assert.ok(resendText.includes('55'), `resendCode output must contain seconds in ${loc}`);

    // Verify routes for each locale
    const routes = getAuthRoutes(loc);
    assert.ok(routes.loginUrl, `routes.loginUrl must exist for ${loc}`);
    assert.equal(routes.localeOptions.length, 6, `routes.localeOptions must have 6 items in ${loc}`);
    const activeOption = routes.localeOptions.find((o) => o.active);
    assert.ok(activeOption, `Active option must exist for ${loc}`);
    assert.equal(activeOption.code, loc, `Active option code must match ${loc}`);
  }
});

test('Localized login routes page file exists and imports cleanly', () => {
  const rootDir = process.cwd();
  const localizedPagePath = path.join(rootDir, 'app/[locale]/login/page.js');
  assert.ok(fs.existsSync(localizedPagePath), 'app/[locale]/login/page.js must exist on disk');
  const content = fs.readFileSync(localizedPagePath, 'utf8');
  assert.ok(content.includes('LocalizedLoginPage'), 'Page component must be declared');
  assert.ok(content.includes('LoginForm'), 'LoginForm must be rendered');
  assert.ok(content.includes('AuthLayout'), 'AuthLayout must be rendered');
});
