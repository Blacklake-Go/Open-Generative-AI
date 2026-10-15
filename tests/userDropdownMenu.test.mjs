import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('UserDropdownMenu component follows Jimeng concise architecture without redundant items', async () => {
  const menuSource = await readFile(new URL('../components/UserDropdownMenu.js', import.meta.url), 'utf8');

  // 1. 验证即梦风格的核心元素存在
  assert.ok(menuSource.includes('export default function UserDropdownMenu'), 'UserDropdownMenu must be exported');
  assert.ok(menuSource.includes('个人主页') || menuSource.includes('Profile'), 'Must have direct Profile link like Jimeng');
  assert.ok(menuSource.includes('profileUrl'), 'Must have direct Profile navigation URL');
  assert.ok(!menuSource.includes('showMenuLangSub'), 'Must remove duplicate language submenu from avatar dropdown');
  assert.ok(menuSource.includes('ChevronRight'), 'Must use subtle right arrow for menu items');
  assert.ok(menuSource.includes('credits'), 'Must display credits balance cleanly');
  assert.ok(menuSource.includes('充值/升级') || menuSource.includes('Top up'), 'Must provide concise CTA button');

  // 2. 验证保留真实有效功能项并移除冗余项
  assert.ok(!menuSource.includes('myCreations'), 'Must remove redundant creations entry from dropdown');
  assert.ok(menuSource.includes('Coins'), 'Must display coin icon');
  assert.ok(!menuSource.includes('Exclusive K-Coins'), 'Must remove wordy coin labels');
  assert.ok(menuSource.includes('/account') || menuSource.includes('handleOpenAccountModal'), 'Must link to account center');
  assert.ok(menuSource.includes('onOpenSettings'), 'Must support opening settings modal');
  assert.ok(menuSource.includes('toggleLanguage'), 'Must support language switching');
  assert.ok(menuSource.includes('handleLogoutClick'), 'Must handle safe logout');

  // 3. 验证剔除了图1中所有无用/冗余/未实现的占位功能
  const bannedRedundantTerms = [
    '新手漂移',
    '使用说明书',
    '常见问题',
    'AI 水印',
    '专属盒饭',
    'OiiOii CLI',
    'OiiOii Desktop',
    '邀请好友+200盒饭',
  ];
  for (const term of bannedRedundantTerms) {
    assert.ok(!menuSource.includes(term), `Menu must not contain redundant/unimplemented term: ${term}`);
  }

  // 4. 验证交互机制：点击外部关闭和ESC键支持
  assert.ok(menuSource.includes('handleClickOutside'), 'Must support click outside to close');
  assert.ok(menuSource.includes('handleKeyDown'), 'Must support Escape key to close');

  // 5. 验证会员订阅动态隐藏与全站防破碎头像组件
  assert.ok(menuSource.includes('!isPaidPlan'), 'Must hide membership subscription button when already subscribed');
  assert.ok(menuSource.includes('<UserAvatar'), 'Must use bulletproof UserAvatar component');
  assert.ok(!menuSource.includes('【🪙 K 币 (专属代币)】余额入口'), 'Must hide coin button from topbar navigation');
});

test('StandaloneShell integrates UserDropdownMenu cleanly', async () => {
  const shellSource = await readFile(new URL('../components/StandaloneShell.js', import.meta.url), 'utf8');

  assert.ok(shellSource.includes("import UserDropdownMenu from './UserDropdownMenu';"), 'StandaloneShell must import UserDropdownMenu');
  assert.ok(shellSource.includes('<UserDropdownMenu'), 'StandaloneShell must render UserDropdownMenu');
  assert.ok(shellSource.includes('onLogout={handleLogout}'), 'StandaloneShell must pass handleLogout');
  assert.ok(shellSource.includes("fetch('/api/auth/logout'"), 'handleLogout must call logout api');
});

test('StudioHeader integrates UserDropdownMenu cleanly', async () => {
  const headerSource = await readFile(new URL('../components/site/StudioHeader.js', import.meta.url), 'utf8');

  assert.ok(headerSource.includes("import UserDropdownMenu from '@/components/UserDropdownMenu';"), 'StudioHeader must import UserDropdownMenu');
  assert.ok(headerSource.includes('<UserDropdownMenu'), 'StudioHeader must render UserDropdownMenu');
});
