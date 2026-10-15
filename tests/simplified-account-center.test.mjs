import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AccountLayout provides wide vertical navigation architecture with usage tab', async () => {
  const layoutSource = await readFile(new URL('../components/account/AccountLayout.js', import.meta.url), 'utf8');

  // 1. 验证保留 4 个核心垂直 Tab (包含明细单独拆分一页的 额度明细)
  assert.ok(layoutSource.includes("id: 'activity', label: '活跃历史'"), 'Must include activity tab with 活跃历史');
  assert.ok(layoutSource.includes("id: 'settings', label: '账号与设置'"), 'Must include settings tab with 账号与设置');
  assert.ok(layoutSource.includes("id: 'billing', label: '订阅与账单'"), 'Must include billing tab with 订阅与账单');
  assert.ok(layoutSource.includes("id: 'usage', label: '额度明细'"), 'Must include usage tab with 额度明细');

  // 2. 验证移除冗余项 (不作为独立 Tab 定义)
  const removedTabs = ['order-invoices', 'price-details', 'agent-api-key', 'terms', 'privacy'];
  for (const tabId of removedTabs) {
    assert.ok(!layoutSource.includes(`id: '${tabId}'`), `AccountLayout must not define redundant tab '${tabId}'`);
  }

  // 3. 验证弹窗容器尺寸展开为宽版面（再宽30%至 max-w-[1400px]）并具备竖排 Tab 侧栏
  assert.ok(layoutSource.includes('max-w-[1400px]'), 'Must expand modal width to wide layout max-w-[1400px]');
  assert.ok(layoutSource.includes('md:flex-col'), 'Must support vertical tabs in sidebar');

  // 4. 验证退出登录入口与 UID 展示
  assert.ok(layoutSource.includes('退出登录'), 'Must have sign out button');
  assert.ok(layoutSource.includes('user?.userNumber'), 'Must display user UID');
});

test('normalizeTab correctly maps navigation actions to activity, settings, billing, or usage', async () => {
  const layoutSource = await readFile(new URL('../components/account/AccountLayout.js', import.meta.url), 'utf8');
  
  // 从源码中提取 normalizeTab 函数执行验证
  const match = layoutSource.match(/export function normalizeTab\(tab\) \{([\s\S]*?)\n\}/);
  assert.ok(match, 'Must define normalizeTab function');
  const normalizeTab = new Function('tab', match[1]);

  assert.equal(normalizeTab('activity'), 'activity');
  assert.equal(normalizeTab('creations'), 'activity');
  assert.equal(normalizeTab('stats'), 'activity');
  assert.equal(normalizeTab(null), 'activity');

  assert.equal(normalizeTab('settings'), 'settings');
  assert.equal(normalizeTab('profile'), 'settings');
  assert.equal(normalizeTab('edit-profile'), 'settings');
  assert.equal(normalizeTab('security'), 'settings');

  assert.equal(normalizeTab('billing'), 'billing');
  assert.equal(normalizeTab('membership'), 'billing');
  assert.equal(normalizeTab('subscription'), 'billing');

  // 验证额度明细独立路由
  assert.equal(normalizeTab('usage'), 'usage');
  assert.equal(normalizeTab('ledger'), 'usage');
  assert.equal(normalizeTab('points-details'), 'usage');
  assert.equal(normalizeTab('credits'), 'usage');
});

test('ProfileTab implements reference-image edit profile, password, third-party bindings and deletion', async () => {
  const profileSource = await readFile(new URL('../components/account/tabs/ProfileTab.js', import.meta.url), 'utf8');

  // 1. 验证居中头像与相机上传、用户名输入框与全宽保存按钮
  assert.ok(profileSource.includes('Camera'), 'Must include Camera icon for avatar upload');
  assert.ok(profileSource.includes('用户名'), 'Must include username label');
  assert.ok(profileSource.includes('保存'), 'Must include save button');
  assert.ok(profileSource.includes('长度 1–40 个字符'), 'Must include username character requirement copy');

  // 2. 验证保留独立密码设置
  assert.ok(profileSource.includes('独立登录密码'), 'Must include password management');
  assert.ok(profileSource.includes('/api/user/password'), 'Must call password API');

  // 3. 验证保留三方账户绑定与登录
  assert.ok(profileSource.includes('登录凭证与第三方绑定'), 'Must include third party accounts');
  assert.ok(profileSource.includes('PhoneIcon'), 'Must include phone binding');
  assert.ok(profileSource.includes('MailIcon'), 'Must include email binding');
  assert.ok(profileSource.includes('WeChatIcon'), 'Must include WeChat binding');
  assert.ok(profileSource.includes('QQIcon'), 'Must include QQ binding');
  assert.ok(profileSource.includes('GoogleIcon'), 'Must include Google binding');

  // 4. 验证保留注销账户
  assert.ok(profileSource.includes('注销账户'), 'Must include delete account');
  assert.ok(profileSource.includes('/api/user/deactivate'), 'Must call deactivate API');

  // 5. 验证移除繁琐字段 (Bio, 43国籍, 职业代码, 风格标签, 个人网址)
  const bannedFields = ['occupationOptions', 'countryOptions', 'profileStyles', 'profileBio', 'profileOccupation', 'profileWebsite'];
  for (const field of bannedFields) {
    assert.ok(!profileSource.includes(field), `ProfileTab must not contain bloated field: ${field}`);
  }
});

test('AccountClient renders ActivityTab, ProfileTab, MembershipTab, and UsageTab', async () => {
  const clientSource = await readFile(new URL('../app/account/AccountClient.js', import.meta.url), 'utf8');

  assert.ok(clientSource.includes('<ActivityTab'), 'Must render ActivityTab');
  assert.ok(clientSource.includes('<ProfileTab'), 'Must render ProfileTab');
  assert.ok(clientSource.includes('<MembershipTab'), 'Must render MembershipTab');
  assert.ok(clientSource.includes('<UsageTab'), 'Must render UsageTab');
});

test('UsageTab implements 1:1 reference UI of higgsfield.ai/me/settings/usage', async () => {
  const usageSource = await readFile(new URL('../components/account/tabs/UsageTab.js', import.meta.url), 'utf8');

  // 1. 验证顶部信用额度卡片（图 1）
  assert.ok(usageSource.includes('信用额度使用情况'), 'Must have 信用额度使用情况 title');
  assert.ok(usageSource.includes('贷方余额'), 'Must have 贷方余额 label');
  assert.ok(usageSource.includes('订阅积分'), 'Must display 订阅积分 bucket');
  assert.ok(usageSource.includes('购买积分'), 'Must display 购买积分 bucket');
  assert.ok(usageSource.includes('奖励积分'), 'Must display 奖励积分 bucket');
  assert.ok(usageSource.includes('数据更新可能会有延迟'), 'Must display latency notice');
  assert.ok(usageSource.includes('规则'), 'Must display rule modal link');

  // 2. 验证底部使用历史表格（图 2、图 3）
  assert.ok(usageSource.includes('使用历史'), 'Must have 使用历史 section');
  assert.ok(usageSource.includes('鸣谢'), 'Must have 鸣谢 column header');
  assert.ok(usageSource.includes('所有功能'), 'Must have 所有功能 dropdown filter');
  assert.ok(usageSource.includes('所有操作'), 'Must have 所有操作 dropdown filter');
  assert.ok(usageSource.includes('日期'), 'Must have 日期 column header');
  assert.ok(usageSource.includes('你已经到达终点'), 'Must have 你已经到达终点 end mark');
  assert.ok(usageSource.includes('展示'), 'Must have page size display');
  assert.ok(usageSource.includes('上一页') || usageSource.includes('ChevronLeft'), 'Must have pagination controls');
});

test('ActivityTab implements pixel-perfect aligned heatmap with floating tooltip and scrollbar-rail', async () => {
  const activitySource = await readFile(new URL('../components/account/tabs/ActivityTab.js', import.meta.url), 'utf8');

  // 1. 验证 365 天创作活跃矩阵标题与说明
  assert.ok(activitySource.includes('365 天创作活跃矩阵'), 'Must display 365 天创作活跃矩阵 title');
  assert.ok(activitySource.includes('按 52 周追踪每日的作品生成'), 'Must display 52-week tracking description');

  // 2. 验证星期行高与格子严格 1:1 像素对齐 (h-3.5 与 gap-1)
  assert.ok(activitySource.includes('h-3.5 flex items-center justify-end'), 'Weekday rows must lock height to h-3.5 matching cells');
  assert.ok(activitySource.includes('w-8 shrink-0'), 'Must use fixed w-8 alignment placeholder for month and weekday headers');

  // 3. 验证浮动气泡与小三角动态偏置 (Floating Tooltip)
  assert.ok(activitySource.includes('hoveredDay.arrowOffset'), 'Must calculate arrow offset to point directly at hovered cell');
  assert.ok(activitySource.includes('clampedCardX'), 'Must clamp floating tooltip position to avoid container edge overflow');

  // 4. 验证今日专属指示环 (Today Indicator)
  assert.ok(activitySource.includes('ring-brand ring-offset-1.5'), 'Today cell must display ring-brand focus ring');

  // 5. 验证滚动条符合 UI_DESIGN_SYSTEM.md 规范 (scrollbar-rail 且禁止 scrollbar-none)
  assert.ok(activitySource.includes('scrollbar-rail'), 'Heatmap container must use scrollbar-rail');
  assert.ok(!activitySource.includes('scrollbar-none'), 'Heatmap container must not use prohibited scrollbar-none');

  // 6. 验证全站品牌主色统一为专业艺术洋红 (#e11d74)
  assert.ok(activitySource.includes('#e11d74'), 'Heatmap levels must utilize brand magenta #e11d74');
});

test('ActivityTab displays Brand card with model brand logo and 偏好比重', async () => {
  const activitySource = await readFile(new URL('../components/account/tabs/ActivityTab.js', import.meta.url), 'utf8');
  const { aggregateBrands } = await import('../lib/utils/modelBrands.js');

  // 1. 验证卡片标题由“最常调用的生成模型”变更为“品牌”，Badge 为 BRANDS
  assert.ok(activitySource.includes('品牌'), 'Must display 品牌 as card title');
  assert.ok(activitySource.includes('BRANDS'), 'Must have BRANDS badge');

  // 2. 验证右侧由“X 次 (Y%)”变更为“偏好比重”
  assert.ok(activitySource.includes('偏好比重'), 'Must display 偏好比重 label on the right side');
  assert.ok(!activitySource.includes('{item.count} 次 ({item.percentage}%)'), 'Must not display raw {count} 次 ({percentage}%)');

  // 3. 验证品牌图标与备用 Badge 容错机制
  assert.ok(activitySource.includes('item.logo'), 'Must render brand logo image when available');
  assert.ok(activitySource.includes('brand-fallback-badge'), 'Must support fallback badge when logo fails or missing');
  assert.ok(activitySource.includes('item.invert'), 'Must support dark mode logo inversion');

  // 4. 验证模型至品牌的映射及聚合计算
  const testModels = [
    { model: 'gpt-image-2.5-flash', count: 3 },
    { model: 'nano-banana-pro', count: 3 },
    { model: 'seedream-5.0', count: 2 },
    { model: 'google-imagen4-ultra', count: 1 },
    { model: 'wan2.7-text-to-image-pro', count: 1 },
  ];
  const brands = aggregateBrands(testModels, 10);
  assert.equal(brands[0].id, 'google');
  assert.equal(brands[0].name, 'Google');
  assert.equal(brands[0].percentage, 40);
  assert.equal(brands[0].invert, false);

  assert.equal(brands[1].id, 'openai');
  assert.equal(brands[1].name, 'OpenAI');
  assert.equal(brands[1].percentage, 30);
  assert.equal(brands[1].invert, true);

  assert.equal(brands[2].id, 'bytedance');
  assert.equal(brands[2].name, 'ByteDance');
  assert.equal(brands[2].percentage, 20);

  assert.equal(brands[3].id, 'alibaba');
  assert.equal(brands[3].name, 'Alibaba');
  assert.equal(brands[3].percentage, 10);
});

test('ActivityTab brand card implements frontend-aligned size-9 emblem badge, click floating physics and aurora glow', async () => {
  const activitySource = await readFile(new URL('../components/account/tabs/ActivityTab.js', import.meta.url), 'utf8');
  const { getBrandAuroraGlow, BRAND_AURORA_GLOW } = await import('../lib/utils/modelBrands.js');

  // 1. 验证 1:1 对齐前台图像模型切换器的 size-9 rounded-xl 徽标外壳
  assert.ok(activitySource.includes('size-9 rounded-xl'), 'Must use size-9 rounded-xl emblem badge matching FrontendModelPicker');

  // 2. 验证 activeBrandId 状态与点击切换交互
  assert.ok(activitySource.includes('activeBrandId'), 'Must maintain activeBrandId state for click interaction');
  assert.ok(activitySource.includes('setActiveBrandId'), 'Must provide click toggle handler');

  // 3. 验证浮动动态效果（-translate-y-0.5, scale, 阻尼过渡）
  assert.ok(activitySource.includes('-translate-y-0.5'), 'Must provide floating elevation effect on active/hover');
  assert.ok(activitySource.includes('transition-all duration-300'), 'Must provide smooth spring damping transition');

  // 4. 验证极光光晕动效层与安全穿透 (pointer-events-none, blur-xl, 多频渐变)
  assert.ok(activitySource.includes('pointer-events-none'), 'Aurora glow must have pointer-events-none for 100% click safety');
  assert.ok(activitySource.includes('blur-xl'), 'Aurora glow must use blur-xl spatial light system diffusion');
  assert.ok(activitySource.includes('auroraGlow'), 'Must bind brand auroraGlow color configuration');

  // 5. 验证主流品牌多频极光色系配置完整性
  assert.ok(BRAND_AURORA_GLOW.google, 'Google must have aurora glow config');
  assert.ok(BRAND_AURORA_GLOW.openai, 'OpenAI must have aurora glow config');
  assert.ok(BRAND_AURORA_GLOW.bytedance, 'ByteDance must have aurora glow config');
  assert.ok(BRAND_AURORA_GLOW.alibaba, 'Alibaba must have aurora glow config');
  assert.ok(getBrandAuroraGlow('google').gradient.includes('#4285f4'), 'Google aurora gradient must contain Google blue #4285f4');
});

