import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('1. Infinite Canvas links use unified relative path /canvas across all components', () => {
  const topNav = fs.readFileSync(path.join(root, 'components/navigation/TopMegaNavigation.js'), 'utf8');
  assert.ok(topNav.includes('href="/canvas"'), 'TopMegaNavigation must use href="/canvas"');
  assert.ok(!topNav.includes('https://www.Supdance.com/canvas'), 'TopMegaNavigation must not hardcode online canvas URL');

  const shell = fs.readFileSync(path.join(root, 'components/StandaloneShell.js'), 'utf8');
  assert.ok(shell.includes('href="/canvas"'), 'StandaloneShell must use href="/canvas"');
  assert.ok(!shell.includes('https://www.Supdance.com/canvas'), 'StandaloneShell must not hardcode online canvas URL');

  const portal = fs.readFileSync(path.join(root, 'components/home/JimengHomePortal.jsx'), 'utf8');
  assert.ok(portal.includes('href="/canvas"'), 'JimengHomePortal must use href="/canvas"');
  assert.ok(!portal.includes('https://www.Supdance.com/canvas'), 'JimengHomePortal must not hardcode online canvas URL');

  const header = fs.readFileSync(path.join(root, 'components/site/StudioHeader.js'), 'utf8');
  assert.ok(header.includes('href="/canvas"'), 'StudioHeader mobile drawer must include /canvas link');
  assert.ok(header.includes('onClick={() => setIsMobileOpen(false)}'), 'StudioHeader mobile links must close drawer on click');

  const middleware = fs.readFileSync(path.join(root, 'middleware.js'), 'utf8');
  assert.ok(middleware.includes('/canvas'), 'middleware must handle /canvas routes');
  assert.ok(middleware.includes('/canvas/'), 'middleware must canonicalize canvas routes with trailing slash');
});

test('2. Chinese home page 308 redirect prevention', () => {
  const topNav = fs.readFileSync(path.join(root, 'components/navigation/TopMegaNavigation.js'), 'utf8');
  assert.ok(topNav.includes('href="/"'), 'TopMegaNavigation home link must point directly to /');
  assert.ok(!topNav.includes('href={rootPath || \'/\'}'), 'TopMegaNavigation must not point to rootPath (/zh) to avoid 308 redirect loop');
});

test('3. Entitlements synchronous caching & screen flicker elimination', () => {
  const sessionHook = fs.readFileSync(path.join(root, 'lib/hooks/useUserSession.js'), 'utf8');
  assert.ok(sessionHook.includes("localStorage.getItem('ko_entitlements')"), 'useUserSession must synchronously restore ko_entitlements');
  assert.ok(sessionHook.includes("localStorage.setItem('ko_entitlements'"), 'useUserSession must persist ko_entitlements');
  assert.ok(sessionHook.includes("localStorage.removeItem('ko_entitlements'"), 'useUserSession must clear ko_entitlements on logout');
  assert.ok(sessionHook.includes('initFromStorage()'), 'useUserSession must invoke initFromStorage');
  assert.ok(sessionHook.includes('fallbackEntitlements'), 'useUserSession must build synchronous fallback entitlements from SSR user');

  const authService = fs.readFileSync(path.join(root, 'lib/services/auth.js'), 'utf8');
  assert.ok(authService.includes('getActiveSubscription'), 'getUserBySession must query active subscription');
  assert.ok(authService.includes('is_subscribed: isSubscribed'), 'getUserBySession must project is_subscribed');
  assert.ok(authService.includes('plan_id: planId'), 'getUserBySession must project plan_id');

  const header = fs.readFileSync(path.join(root, 'components/site/StudioHeader.js'), 'utf8');
  assert.ok(header.includes('entitlements={entitlements}'), 'StudioHeader must pass entitlements to UserDropdownMenu');

  const shell = fs.readFileSync(path.join(root, 'components/StandaloneShell.js'), 'utf8');
  assert.ok(shell.includes('entitlements: sessionEntitlements'), 'StandaloneShell must extract sessionEntitlements');
  assert.ok(shell.includes('entitlements={sessionEntitlements}'), 'StandaloneShell must pass entitlements to UserDropdownMenu');

  const assetCenter = fs.readFileSync(path.join(root, 'components/assets/JimengAssetCenter.jsx'), 'utf8');
  assert.ok(assetCenter.includes('entitlements, refresh: refreshSession'), 'JimengAssetCenter must extract entitlements');
  assert.ok(assetCenter.includes('entitlements={entitlements}'), 'JimengAssetCenter must pass entitlements to UserDropdownMenu');

  const figmaHeader = fs.readFileSync(path.join(root, 'components/about/FigmaHeader.jsx'), 'utf8');
  assert.ok(figmaHeader.includes('entitlements } = useUserSession'), 'FigmaHeader must extract entitlements');
  assert.ok(figmaHeader.includes('entitlements={entitlements}'), 'FigmaHeader must pass entitlements to UserDropdownMenu');

  const menu = fs.readFileSync(path.join(root, 'components/UserDropdownMenu.js'), 'utf8');
  assert.ok(menu.includes('entitlements = null'), 'UserDropdownMenu must accept entitlements prop');
  assert.ok(menu.includes("localStorage.getItem('ko_entitlements')"), 'UserDropdownMenu must have localStorage fallback on initial state');
  assert.ok(!menu.includes('showCoinPop'), 'UserDropdownMenu must not contain showCoinPop state causing layout shift');
  assert.ok(!menu.includes('animate-bounce'), 'UserDropdownMenu must not use bouncing coin popup');
});

test('4. Purging legacy cyan, emerald, and neon materials', () => {
  const menu = fs.readFileSync(path.join(root, 'components/UserDropdownMenu.js'), 'utf8');
  assert.ok(!menu.includes('text-cyan-300'), 'UserDropdownMenu must not contain text-cyan-300');
  assert.ok(!menu.includes('text-cyan-400'), 'UserDropdownMenu must not contain text-cyan-400');
  assert.ok(!menu.includes('bg-cyan-500'), 'UserDropdownMenu must not contain bg-cyan-500');
  assert.ok(!menu.includes('#e6ff55'), 'UserDropdownMenu must not contain old fluorescent green VIP tag');
  assert.ok(!menu.includes('text-emerald-400'), 'UserDropdownMenu must not contain text-emerald-400 for copy feedback');

  const frame = fs.readFileSync(path.join(root, 'components/profile/AvatarFrame.js'), 'utf8');
  assert.ok(!frame.includes('0 0 18px'), 'AvatarFrame must not contain harsh neon glow');
  assert.ok(!frame.includes('0 0 20px'), 'AvatarFrame must not contain harsh neon glow');
  assert.ok(!frame.includes('text-[7px]'), 'AvatarFrame must not render gamified corner label tag');

  const headerCard = fs.readFileSync(path.join(root, 'components/profile/UserProfileHeaderCard.jsx'), 'utf8');
  assert.ok(!headerCard.includes('emerald'), 'UserProfileHeaderCard must not contain emerald tokens');
  assert.ok(!headerCard.includes('rgba(16,185,129'), 'UserProfileHeaderCard must not contain legacy green glow');

  const profileView = fs.readFileSync(path.join(root, 'components/profile/UserProfileView.jsx'), 'utf8');
  assert.ok(!profileView.includes('bg-emerald-400'), 'UserProfileView must not contain bg-emerald-400 tab underline');
});

test('5. Canonical UID projection and elimination of 000000 fallback', () => {
  const authService = fs.readFileSync(path.join(root, 'lib/services/auth.js'), 'utf8');
  assert.ok(authService.includes('userNumber: canonicalUserNumber'), 'getUserBySession must project userNumber');
  assert.ok(authService.includes('user_number: canonicalUserNumber'), 'getUserBySession must project user_number');

  const profileRoute = fs.readFileSync(path.join(root, 'app/api/user/profile/route.js'), 'utf8');
  assert.ok(profileRoute.includes("searchParams.get('userId')"), 'profile route must support ?userId= query parameter');
  assert.ok(profileRoute.includes('userNumber: canonicalUserNumber'), 'profile route must project userNumber');

  const usersRepo = fs.readFileSync(path.join(root, 'lib/repositories/users.js'), 'utf8');
  assert.ok(usersRepo.includes('user_number = $1'), 'getUserProfile must support query by user_number');

  const profilePage = fs.readFileSync(path.join(root, 'app/profile/page.js'), 'utf8');
  assert.ok(!profilePage.includes("'000000'"), 'app/profile/page.js must not contain 000000 fallback');

  const zhProfilePage = fs.readFileSync(path.join(root, 'app/zh/profile/page.js'), 'utf8');
  assert.ok(!zhProfilePage.includes("'000000'"), 'app/zh/profile/page.js must not contain 000000 fallback');

  const userPage = fs.readFileSync(path.join(root, 'app/u/[id]/page.js'), 'utf8');
  assert.ok(!userPage.includes("'000000'"), 'app/u/[id]/page.js must not contain 000000 fallback');

  const activityRoute = fs.readFileSync(path.join(root, 'app/api/user/activity-dashboard/route.js'), 'utf8');
  assert.ok(!activityRoute.includes("'000000'"), 'activity-dashboard route must not contain 000000 fallback');

  const userProfileView = fs.readFileSync(path.join(root, 'components/profile/UserProfileView.jsx'), 'utf8');
  assert.ok(!userProfileView.includes("'000000'"), 'UserProfileView.jsx must not contain 000000 fallback');

  const activityService = fs.readFileSync(path.join(root, 'lib/services/activity.js'), 'utf8');
  assert.ok(!activityService.includes("'000000'"), 'activity.js must not contain 000000 fallback');

  const activityTab = fs.readFileSync(path.join(root, 'components/account/tabs/ActivityTab.js'), 'utf8');
  assert.ok(!activityTab.includes('border-dashed'), 'ActivityTab.js must not contain border-dashed gray outline');
  assert.ok(!activityTab.includes("'000000'"), 'ActivityTab.js must not contain 000000 fallback');
});
