import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readCode(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('auth.js exports bindUserOAuth as alias for bindOAuthUser', async () => {
  const content = await readCode('lib/services/auth.js');
  assert.match(content, /export\s+const\s+bindUserOAuth\s*=\s*bindOAuthUser/);
  assert.match(content, /isNew:\s*true/);
});

test('lib/oauth.js supports douyin and qq configurations correctly', async () => {
  const content = await readCode('lib/oauth.js');
  
  // Douyin config
  assert.match(content, /open\.douyin\.com\/oauth\/access_token/);
  assert.match(content, /open\.douyin\.com\/oauth\/userinfo/);
  assert.match(content, /douyin-post/);
  
  // QQ fmt=json
  assert.match(content, /fmt:\s*'json'/);
  
  // Dynamic resolution of candidate names
  assert.match(content, /resolveSecretCandidate/);
});

test('oauthCallback.js htmlResponse generates robust multi-channel broadcast script', async () => {
  const content = await readCode('lib/services/oauthCallback.js');
  
  // BroadcastChannel
  assert.match(content, /new BroadcastChannel\('supdance_auth_channel'\)/);
  
  // localStorage event
  assert.match(content, /localStorage\.setItem\('supdance_auth_event'/);
  
  // postMessage
  assert.match(content, /window\.opener\.postMessage/);
  
  // isPopup detection
  assert.match(content, /supdance-oauth/);
  assert.match(content, /window\.close\(\)/);
  
  // eventId inclusion
  assert.match(content, /eventId/);
});

test('Frontend components (AuthModal, ProfileTab, StandaloneShell) subscribe to multi-channel auth events', async () => {
  const authModal = await readCode('components/AuthModal.js');
  const profileTab = await readCode('components/account/tabs/ProfileTab.js');
  const standaloneShell = await readCode('components/StandaloneShell.js');
  
  // AuthModal
  assert.match(authModal, /supdance_auth_channel/);
  assert.match(authModal, /supdance_auth_event/);
  
  // ProfileTab
  assert.match(profileTab, /supdance_auth_channel/);
  assert.match(profileTab, /supdance_auth_event/);
  assert.match(profileTab, /action=bind/);
  
  // StandaloneShell
  assert.match(standaloneShell, /supdance_auth_channel/);
  assert.match(standaloneShell, /supdance_auth_event/);
});

test('Bilibili buildAuthorizationUrl sets gourl and preserves response_type and scope', async () => {
  const content = await readCode('lib/oauth.js');
  // Must set gourl without early exit
  assert.match(content, /url\.searchParams\.set\(['"]gourl['"],\s*redirectUri\)/);
  // Ensure response_type is set for all providers
  assert.match(content, /url\.searchParams\.set\(['"]response_type['"],\s*['"]code['"]\)/);
});

test('Instagram OAuth uses safe user fields and robust fallback', async () => {
  const content = await readCode('lib/oauth.js');
  assert.match(content, /fields=user_id,username/);
  assert.match(content, /profileTransport:\s*'instagram'/);
  assert.match(content, /context\?\.user_id/);
});

test('QQ OpenID check specifies fmt=json and handles Tencent error descriptions', async () => {
  const content = await readCode('lib/oauth.js');
  assert.match(content, /fmt=json/);
  assert.match(content, /data\.error/);
});

test('Providers service includes health checks for all domestic providers', async () => {
  const content = await readCode('lib/services/providers.js');
  assert.match(content, /provider === 'wechat_oauth'/);
  assert.match(content, /provider === 'qq'/);
  assert.match(content, /provider === 'douyin'/);
  assert.match(content, /provider === 'bilibili'/);
  assert.match(content, /WeChat Open API Gateway/);
  assert.match(content, /QQ Connect Gateway/);
  assert.match(content, /Douyin Open Gateway/);
  assert.match(content, /Bilibili OAuth Gateway/);
});

test('Mobile OAuth triggers perform full-page redirection instead of popup', async () => {
  const authModal = await readCode('components/AuthModal.js');
  const profileTab = await readCode('components/account/tabs/ProfileTab.js');

  assert.match(authModal, /isMobile/);
  assert.match(authModal, /window\.location\.assign\(url\)/);

  assert.match(profileTab, /isMobile/);
  assert.match(profileTab, /window\.location\.assign\(url\)/);
});

test('Douyin OAuth redirect URI, token error assertions, and userinfo payload handling', async () => {
  const content = await readCode('lib/oauth.js');
  // Canonical redirect URI on supdance.com domains
  assert.match(content, /if \(provider === "douyin"\)/);
  assert.match(content, /https:\/\/www\.supdance\.com\/api\/auth\/oauth\/douyin\/callback/);
  // Authorize URL without trailing slash & scopeDelimiter
  assert.match(content, /authorizeUrl:\s*["']https:\/\/open\.douyin\.com\/platform\/oauth\/connect["']/);
  assert.match(content, /scopeDelimiter:\s*','/);
  // Token error checking handles error_code and data.error_code
  assert.match(content, /data\.data\?\.error_code/);
  // Userinfo error_code evaluates Number(errCode) !== 0 to prevent "0" string bug
  assert.match(content, /Number\(errCode\) !== 0/);
  // High-res avatar preference
  assert.match(content, /avatar_larger/);
});

