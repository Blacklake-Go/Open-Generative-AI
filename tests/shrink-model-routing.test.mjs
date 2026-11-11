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

test('1. 模型分类与精简：Core 核心模型集收敛至精选高性能模型', () => {
  assert.ok(CORE_MODEL_IDS instanceof Set, 'CORE_MODEL_IDS 必须是 Set');
  assert.ok(CORE_MODEL_IDS.size >= 10 && CORE_MODEL_IDS.size <= 20, `核心模型数应在 10~20 之间，当前为 ${CORE_MODEL_IDS.size}`);

  // 生图核心 (6)
  const imageCore = ['nano-banana', 'flux-dev', 'flux-kontext-pro-t2i', 'wan2.1-text-to-image', 'gpt4o-text-to-image', 'bytedance-seedream-v3'];
  for (const id of imageCore) {
    assert.ok(CORE_MODEL_IDS.has(id), `生图核心模型必须包含 ${id}`);
  }
  assert.ok(imageCore.length >= 4 && imageCore.length <= 8, '生图核心模型数量必须在 4~8 之间');

  // 生视频核心 (5)
  const videoCore = ['seedance-v2.0-t2v', 'kling-v2.6-pro-t2v', 'veo3-text-to-video', 'wan2.1-image-to-video', 'minimax-hailuo-2.3-standard-t2v'];
  for (const id of videoCore) {
    assert.ok(CORE_MODEL_IDS.has(id), `生视频核心模型必须包含 ${id}`);
  }
  assert.ok(videoCore.length >= 4 && videoCore.length <= 6, '生视频核心模型数量必须在 4~6 之间');

  // 生音乐核心 (3)
  const audioCore = ['suno-create-music', 'minimax-music-3.0', 'mmaudio-v2-text-to-audio'];
  for (const id of audioCore) {
    assert.ok(CORE_MODEL_IDS.has(id), `生音乐核心模型必须包含 ${id}`);
  }
  assert.ok(audioCore.length >= 2 && audioCore.length <= 4, '生音乐核心模型数量必须在 2~4 之间');
});

test('2. 无限画布与能力自动路由：CAPABILITY_AUTO_ALIASES 别名映射契约', () => {
  assert.ok(CAPABILITY_AUTO_ALIASES && typeof CAPABILITY_AUTO_ALIASES === 'object');

  // 生图自动路由
  for (const alias of ['auto', 'auto-image', 'image', 't2i', 'i2i']) {
    const target = CAPABILITY_AUTO_ALIASES[alias];
    assert.ok(target, `必须定义 ${alias} 能力映射`);
    assert.equal(target.category, 'image');
    assert.ok(CORE_MODEL_IDS.has(target.defaultModelId), `${alias} 默认模型必须属于 Core 核心模型`);
  }

  // 生视频自动路由
  for (const alias of ['auto-video', 'video', 't2v', 'i2v']) {
    const target = CAPABILITY_AUTO_ALIASES[alias];
    assert.ok(target, `必须定义 ${alias} 能力映射`);
    assert.equal(target.category, 'video');
    assert.ok(CORE_MODEL_IDS.has(target.defaultModelId), `${alias} 默认模型必须属于 Core 核心模型`);
  }

  // 生音乐自动路由
  for (const alias of ['auto-audio', 'audio', 'music', 't2a']) {
    const target = CAPABILITY_AUTO_ALIASES[alias];
    assert.ok(target, `必须定义 ${alias} 能力映射`);
    assert.equal(target.category, 'audio');
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
  assert.match(coreSrc, /commitCredits\(/);
  assert.match(coreSrc, /voidCredits\(/);
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

test('6. 后台管理收敛：统一收纳为 5 个核心管理模块，定价页面独立可用', () => {
  const aiGroup = ADMIN_NAV_GROUPS.find((g) => g.id === 'ai-models');
  assert.ok(aiGroup, 'AI 模型与路由 导航分组必须存在');

  const expectedAreas = [
    { href: '/admin/models', label: '模型管理' },
    { href: '/admin/models/providers', label: '供应商管理' },
    { href: '/admin/models/routing', label: '智能路由与策略' },
    { href: '/admin/models/pricing', label: '模型定价' },
    { href: '/admin/models/health', label: '通道健康' },
  ];

  assert.ok(aiGroup.items.length >= expectedAreas.length, `后台模型路由模块必须包含核心二级区域，当前为 ${aiGroup.items.length}`);

  for (const expected of expectedAreas) {
    const item = aiGroup.items.find((i) => i.href === expected.href);
    assert.ok(item, `缺少核心后台模块: ${expected.href}`);
    assert.equal(item.label, expected.label, `模块 ${expected.href} 标题应为 ${expected.label}`);
  }

  // /admin/models/pricing 必须是独立可用页面，绝不能再处于 legacy redirect 列表中
  assert.equal(ADMIN_LEGACY_REDIRECTS['/admin/models/pricing'], undefined);

  // app/admin/models/pricing/page.js 必须存在且渲染 PricingManagerClient
  const pricingPageSrc = fs.readFileSync(path.join(repoRoot, 'app/admin/models/pricing/page.js'), 'utf8');
  assert.match(pricingPageSrc, /PricingManagerClient/);
  assert.doesNotMatch(pricingPageSrc, /redirect\('\/admin\/models'\)/);
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
