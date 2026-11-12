import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CORE_MODEL_IDS,
  CAPABILITY_AUTO_ALIASES,
} from '../lib/repositories/models.js';
import { updateModel } from '../lib/services/models.js';
import { hasProviderAdapter, getProviderAdapter } from '../lib/adapters/index.js';
import { ADMIN_NAV_GROUPS, ADMIN_LEGACY_REDIRECTS } from '../lib/admin/navigation.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('1. 模型分类与精简：Core 核心模型集收敛至精选高性能逻辑模型', () => {
  assert.ok(CORE_MODEL_IDS instanceof Set, 'CORE_MODEL_IDS 必须是 Set');

  // 生图核心 (7)
  const imageCore = [
    'seedream-5.0-pro', 'seedream-5.0-flash', 'seedream-5.0-lite',
    'seedream-4.5', 'seedream-5.0', 'gpt-image', 'imagen-4',
  ];
  // 生视频核心 (18)
  const videoCore = [
    'kling-3.0', 'kling-2.6', 'kling-2.5', 'kling-2.1', 'kling-o1',
    'seedance-2.0', 'hailuo-2.3', 'hailuo-02', 'wan-2.1', 'veo-2', 'veo-3',
    'gemini-omni-flash', 'sora-turbo', 'luma-dream-machine',
    'runway-image-to-video', 'hunyuan-video', 'cogvideo-2b', 'infinitetalk',
  ];
  // 语音核心 (2)
  const audioCore = ['minimax-speech-2.6', 'minimax-voice-clone'];
  // 生音乐核心 (3)：必须与迁移 044 中 tier='core' 的打标集合一致
  const musicCore = ['suno-create-music', 'minimax-music-3.0', 'mmaudio-v2-text-to-audio'];
  // 文本核心 (2)
  const textCore = ['deepseek-r1', 'deepseek-v3'];
  const expectedCore = [...imageCore, ...videoCore, ...audioCore, ...musicCore, ...textCore];

  for (const id of expectedCore) {
    assert.ok(CORE_MODEL_IDS.has(id), `核心模型集必须包含 ${id}`);
  }
  // 精简：核心集合恰好等于精选清单，不额外收录备份模型
  assert.equal(
    CORE_MODEL_IDS.size,
    expectedCore.length,
    `核心模型数应恰好为精选模型 ${expectedCore.length} 个，当前为 ${CORE_MODEL_IDS.size}`,
  );

  // 每个能力域都必须保有核心模型，不允许把某一模态整体挤出核心目录
  assert.ok(imageCore.length >= 4, '生图核心模型至少 4 个');
  assert.ok(videoCore.length >= 4, '生视频核心模型至少 4 个');
  assert.ok(audioCore.length >= 2, '语音核心模型至少 2 个');
  assert.ok(musicCore.length >= 2 && musicCore.length <= 4, '生音乐核心模型数量必须在 2~4 之间');
  assert.ok(textCore.length >= 1, '文本核心模型至少 1 个');
});

test('2. 无限画布与能力自动路由：CAPABILITY_AUTO_ALIASES 别名映射契约', () => {
  assert.ok(CAPABILITY_AUTO_ALIASES && typeof CAPABILITY_AUTO_ALIASES === 'object');

  // 生图自动路由
  for (const alias of ['auto', 'auto-image', 'image', 'image_generate', 'text_to_image', 't2i', 'i2i']) {
    const target = CAPABILITY_AUTO_ALIASES[alias];
    assert.ok(target, `必须定义 ${alias} 能力映射`);
    assert.equal(target.category, 'image');
    assert.ok(CORE_MODEL_IDS.has(target.defaultModelId), `${alias} 默认模型必须属于 Core 核心模型`);
  }

  // 生视频自动路由
  for (const alias of ['auto-video', 'video', 'video_generate', 'text_to_video', 'image_to_video', 't2v', 'i2v']) {
    const target = CAPABILITY_AUTO_ALIASES[alias];
    assert.ok(target, `必须定义 ${alias} 能力映射`);
    assert.equal(target.category, 'video');
    assert.ok(CORE_MODEL_IDS.has(target.defaultModelId), `${alias} 默认模型必须属于 Core 核心模型`);
  }

  // 语音自动路由（P1 起 audio 只表示语音/音频处理）
  for (const alias of ['auto-audio', 'audio', 'audio_generate', 't2a']) {
    const target = CAPABILITY_AUTO_ALIASES[alias];
    assert.ok(target, `必须定义 ${alias} 能力映射`);
    assert.equal(target.category, 'audio');
    assert.ok(CORE_MODEL_IDS.has(target.defaultModelId), `${alias} 默认模型必须属于 Core 核心模型`);
  }

  // 生音乐自动路由（P1 音乐迁移：独立 category，不再归并到 audio）
  for (const alias of ['auto-music', 'music', 'music_generate', 'text_to_music', 't2m']) {
    const target = CAPABILITY_AUTO_ALIASES[alias];
    assert.ok(target, `必须定义 ${alias} 能力映射`);
    assert.equal(target.category, 'music');
    assert.ok(CORE_MODEL_IDS.has(target.defaultModelId), `${alias} 默认模型必须属于 Core 核心模型`);
  }
  assert.equal(
    CAPABILITY_AUTO_ALIASES.music.defaultModelId,
    CAPABILITY_AUTO_ALIASES['auto-music'].defaultModelId,
    'music 与 auto-music 必须收敛到同一个默认音乐模型',
  );
  assert.notEqual(
    CAPABILITY_AUTO_ALIASES.music.defaultModelId,
    CAPABILITY_AUTO_ALIASES.audio.defaultModelId,
    '音乐与语音必须解析到不同默认模型',
  );

  // 文本自动路由
  for (const alias of ['auto-text', 'text']) {
    const target = CAPABILITY_AUTO_ALIASES[alias];
    assert.ok(target, `必须定义 ${alias} 能力映射`);
    assert.equal(target.category, 'text');
    assert.ok(CORE_MODEL_IDS.has(target.defaultModelId), `${alias} 默认模型必须属于 Core 核心模型`);
  }
});

test('3. 适配器中台注册：RunningHub, BytePlus, Volcengine 等供应商适配器完成接入', async () => {
  assert.equal(hasProviderAdapter('runninghub'), true, 'RunningHubAdapter 必须已注册');
  assert.equal(hasProviderAdapter('byteplus'), true, 'BytePlusAdapter 必须已注册');
  assert.equal(hasProviderAdapter('volcengine'), true, 'VolcengineAdapter 必须已注册');
  assert.equal(hasProviderAdapter('muapi'), true, 'MuAPIAdapter 必须保持注册');

  const runningHub = await getProviderAdapter('runninghub', { apiKey: 'test_key' });
  assert.ok(runningHub, '必须能实例化 RunningHubAdapter');
  assert.equal(typeof runningHub.createTask, 'function');
  assert.equal(typeof runningHub.getTask, 'function');
  assert.equal(typeof runningHub.normalizeError, 'function');
});

test('4. 二级故障转移与计费安全代码审计：支持 MODEL_FAILOVER 与最大 5 次尝试', () => {
  const coreSrc = fs.readFileSync(path.join(repoRoot, 'lib/services/generationCore.js'), 'utf8');

  // 必须支持二级模型故障转移事件
  assert.match(coreSrc, /MODEL_FAILOVER/, 'generationCore 必须支持记录 MODEL_FAILOVER 事件');
  assert.match(coreSrc, /triedBackupModel/, 'generationCore 必须维护 triedBackupModel 状态');
  assert.match(coreSrc, /backup_model_id/, 'generationCore 必须读取模型的 backup_model_id 配置');
  assert.match(coreSrc, /maxAttempts = 5/, '故障转移应允许最多 5 次 Multi-tier 尝试');

  // 计费与结算安全：成功时提交额度，失败时撤销预扣额度
  // 结算入口经 testDependencies 注入，默认必须回落到 creditService 的真实实现。
  assert.match(coreSrc, /executeCommitCredits\(/, '成功结算必须经 executeCommitCredits 提交额度');
  assert.match(coreSrc, /executeVoidCredits\(/, '失败/取消必须经 executeVoidCredits 释放预扣');
  assert.match(coreSrc, /testDependencies\?\.commitCredits \|\| commitCredits/, 'commitCredits 默认必须回落到 creditService.commitCredits');
  assert.match(coreSrc, /testDependencies\?\.voidCredits \|\| voidCredits/, 'voidCredits 默认必须回落到 creditService.voidCredits');
  assert.match(coreSrc, /NON_RETRYABLE_ERROR_CODES\.has/, '不可重试错误（如审核拦截）严禁触发重试或切换备用模型');

  // creations 仓库必须支持更新 provider 与 model
  const creationsRepoSrc = fs.readFileSync(path.join(repoRoot, 'lib/repositories/creations.js'), 'utf8');
  assert.match(creationsRepoSrc, /updates\.push\(`provider = \$\{nextParameter\(\)\}`\)/);
  assert.match(creationsRepoSrc, /updates\.push\(`model = \$\{nextParameter\(\)\}`\)/);
});

test('5. 数据库迁移契约：044_model_tiering_and_shrink_routing.sql 完整定义模型分层字段', () => {
  const migrationPath = path.join(repoRoot, 'lib/db/migrations/044_model_tiering_and_shrink_routing.sql');
  assert.ok(fs.existsSync(migrationPath), '迁移文件 044_model_tiering_and_shrink_routing.sql 必须存在');

  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS tier/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS is_visible/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS auto_route_eligible/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS backup_model_id/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS backup_provider_id/);

  // 检查是否正确给核心模型打标
  assert.match(sql, /'nano-banana'/);
  assert.match(sql, /'flux-dev'/);
  assert.match(sql, /'seedance-v2.0-t2v'/);
  assert.match(sql, /'suno-create-music'/);
  assert.match(sql, /tier\s*=\s*'core'/i);
});

test('6. 后台管理收敛：AI 模型中心收敛为真实区域，定价与通道健康深链可解析', () => {
  const aiGroup = ADMIN_NAV_GROUPS.find((g) => g.id === 'ai-models');
  assert.ok(aiGroup, 'AI 模型与路由 导航分组必须存在');
  assert.equal(aiGroup.label, 'AI 模型与路由');

  const expectedAreas = [
    { href: '/admin/models', label: '模型管理' },
    { href: '/admin/models/publication', label: '模型接入与发布' },
    { href: '/admin/models/canvas', label: '无限画布配置' },
    { href: '/admin/models/providers', label: '供应商管理' },
    { href: '/admin/models/routing', label: '智能路由与策略' },
    { href: '/admin/models/telemetry', label: '调用量与遥测' },
  ];

  assert.equal(aiGroup.items.length, expectedAreas.length, `AI 模型中心二级导航必须恰好登记 ${expectedAreas.length} 个区域，当前为 ${aiGroup.items.length}`);
  for (const expected of expectedAreas) {
    const item = aiGroup.items.find((i) => i.href === expected.href);
    assert.ok(item, `缺少核心后台模块: ${expected.href}`);
    assert.equal(item.label, expected.label, `模块 ${expected.href} 标题应为 ${expected.label}`);
    assert.ok(item.permission, `模块 ${expected.href} 必须声明所需权限`);
  }
  const navHrefs = aiGroup.items.map((i) => i.href);
  assert.equal(new Set(navHrefs).size, navHrefs.length, '二级导航不得重复登记同一入口');

  // 定价不再是独立页面：深链必须保留并落到路由页「模型定价与价盘」选项卡
  assert.equal(ADMIN_LEGACY_REDIRECTS['/admin/models/pricing'], '/admin/models/routing?tab=pricing');
  const pricingPageSrc = fs.readFileSync(path.join(repoRoot, 'app/admin/models/pricing/page.js'), 'utf8');
  assert.match(pricingPageSrc, /requireAdminPagePermission\(PERMISSIONS\.modelsRead\)/, '定价深链必须保留管理员权限校验');
  assert.match(pricingPageSrc, /permanentRedirect\('\/admin\/models\/routing\?tab=pricing'\)/, '定价深链必须永久重定向到路由页定价选项卡');
  assert.match(pricingPageSrc, /tab === 'pending'/, '待审定价深链必须映射到 routing 的 pending 选项卡');
  assert.doesNotMatch(pricingPageSrc, /notFound\(/, '定价深链不允许 404');

  // 通道健康并入供应商页，旧入口仍可解析
  assert.equal(ADMIN_LEGACY_REDIRECTS['/admin/models/health'], '/admin/models/providers');

  // 二级导航固定为三项下划线选项卡，且 pricing 深链点亮路由选项卡
  const tabsSrc = fs.readFileSync(path.join(repoRoot, 'components/admin/ModelNavTabs.jsx'), 'utf8');
  for (const href of ['/admin/models', '/admin/models/providers', '/admin/models/routing']) {
    assert.ok(tabsSrc.includes(`href: '${href}'`), `二级选项卡必须包含 ${href}`);
  }
  assert.equal((tabsSrc.match(/id: '(models|providers|routing)'/g) || []).length, 3, '二级导航固定为三个选项卡');
  assert.match(tabsSrc, /pathname === '\/admin\/models\/pricing'/, '定价深链必须点亮路由选项卡');

  // 积分售价输入收敛到共享模型配置抽屉
  const drawerSrc = fs.readFileSync(path.join(repoRoot, 'app/admin/models/frontend/ModelConfigDrawer.jsx'), 'utf8');
  assert.match(drawerSrc, /formData\.credits/, '积分售价必须由共享抽屉编辑');
  assert.match(drawerSrc, /base_credits/, '抽屉必须回填模型现有的 base_credits 售价');
});

test('7. 模型分级配置更新校验：合法的 Tier 与非法 Tier 拦截', async () => {
  const actor = { id: 'admin_test', email: 'admin@supdance.local', role: 'super_admin' };

  const invalidTier = await updateModel({
    actor,
    id: 'nano-banana',
    updates: { tier: 'super_vip_secret' },
    requestId: 'req_tier_inv',
  });
  assert.ok(invalidTier.error, '非法 tier 必须被拦截拒绝');
  assert.match(invalidTier.error, /模型分级必须为/);

  const invalidVisibility = await updateModel({
    actor,
    id: 'nano-banana',
    updates: { is_visible: 'yes_please' },
    requestId: 'req_vis_inv',
  });
  assert.ok(invalidVisibility.error, '非布尔值 is_visible 必须被拦截');

  const invalidAutoRoute = await updateModel({
    actor,
    id: 'nano-banana',
    updates: { auto_route_eligible: 123 },
    requestId: 'req_auto_inv',
  });
  assert.ok(invalidAutoRoute.error, '非布尔值 auto_route_eligible 必须被拦截');

  const invalidBackupModel = await updateModel({
    actor,
    id: 'nano-banana',
    updates: { backup_model_id: 12345 },
    requestId: 'req_backup_inv',
  });
  assert.ok(invalidBackupModel.error, '非字符串 backup_model_id 必须被拦截');
});
