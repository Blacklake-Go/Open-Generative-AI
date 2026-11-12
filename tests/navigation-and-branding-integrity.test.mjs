import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('1. 品牌配置与 Logo 兜底规范性审计（彻底杜绝旧默认图标闪烁）', async () => {
  const { DEFAULT_BRAND } = await import('../lib/hooks/useBranding.js');
  const layoutCode = fs.readFileSync(path.join(repoRoot, 'app/layout.js'), 'utf8');
  const hookCode = fs.readFileSync(path.join(repoRoot, 'lib/hooks/useBranding.js'), 'utf8');

  // 1.1 DEFAULT_BRAND 必须使用真实的官方 Logo 图片，绝不能为空或退化为旧版 layers 图标
  assert.ok(DEFAULT_BRAND.logoUrl, 'DEFAULT_BRAND.logoUrl 不能为空');
  assert.match(DEFAULT_BRAND.logoUrl, /\.(png|svg|webp)$/i, 'DEFAULT_BRAND.logoUrl 必须为合法图片格式');
  assert.equal(DEFAULT_BRAND.showBrandName, false, '默认品牌文字应隐藏，避免首屏文字闪现');

  // 1.2 useBranding 必须导出 BrandingProvider 并提供本地持久化
  assert.match(hookCode, /export function BrandingProvider/, 'useBranding.js 必须导出 BrandingProvider');
  assert.match(hookCode, /localStorage/, 'useBranding.js 必须具备本地缓存机制');

  // 1.3 app/layout.js 必须在服务端获取品牌并在 SSR 阶段注水注入 BrandingProvider
  assert.match(layoutCode, /BrandingProvider/, 'app/layout.js 必须包裹 BrandingProvider');
  assert.match(layoutCode, /getBrandConfig/, 'app/layout.js 必须在服务端拉取品牌配置');
  assert.match(layoutCode, /initialBrand/, 'app/layout.js 必须向 BrandingProvider 透传 initialBrand');
});

test('2. 顶部 Mega Menu 菜单模型与对应工作室区域映射审计', async () => {
  const { MEGA_NAV_CATEGORIES } = await import('../config/mega-navigation.js');
  const { STUDIO_TAB_IDS } = await import('../lib/studio-routes.js');

  for (const category of MEGA_NAV_CATEGORIES) {
    if (category.tabId) {
      assert.ok(
        STUDIO_TAB_IDS.includes(category.tabId),
        `大类 ${category.id} 的 tabId (${category.tabId}) 必须在 STUDIO_TAB_IDS 中注册`
      );
    }

    for (const feature of category.features || []) {
      if (feature.tabId) {
        assert.ok(
          STUDIO_TAB_IDS.includes(feature.tabId),
          `功能 ${feature.id} 的 tabId (${feature.tabId}) 必须在 STUDIO_TAB_IDS 中注册`
        );
      }
    }

    for (const model of category.models || []) {
      assert.ok(model.tabId, `模型 ${model.id} 必须指定所属工作台 tabId`);
      assert.ok(
        STUDIO_TAB_IDS.includes(model.tabId),
        `模型 ${model.id} 的 tabId (${model.tabId}) 必须在 STUDIO_TAB_IDS 中注册`
      );

      // 验证 href 是否与 modelKey 和 tabId 严格对齐
      const url = new URL(model.href, 'https://www.Supdance.com');
      const hrefTab = url.searchParams.get('tab');
      const hrefModel = url.searchParams.get('model');

      assert.equal(
        hrefTab,
        model.tabId,
        `模型 ${model.id} 的链接 tab (${hrefTab}) 必须与声明的 tabId (${model.tabId}) 完全一致`
      );

      assert.ok(
        hrefModel,
        `模型 ${model.id} 的链接必须携带 model 查询参数`
      );

      // 重点核查：严禁出现复制粘贴导致的错误模型映射！
      if (model.id === 'seedream-5-0-pro') {
        assert.notEqual(hrefModel, 'gpt-image-2.5-flash', 'Seedream 5.0 不能指向 gpt-image-2.5-flash');
        assert.match(hrefModel, /seedream/i, 'Seedream 5.0 链接必须映射到 seedream 模型');
      }

      if (model.id === 'midjourney-v7') {
        assert.notEqual(hrefModel, 'gpt-image-2.5-flash', 'Midjourney v7 不能指向 gpt-image-2.5-flash');
        assert.match(hrefModel, /midjourney/i, 'Midjourney 链接必须映射到 midjourney 模型');
      }

      if (model.id === 'nano-banana-pro') {
        assert.notEqual(hrefModel, 'gpt-image-2.5-flash', 'Nano Banana 不能指向 gpt-image-2.5-flash');
        assert.match(hrefModel, /banana/i, 'Nano Banana 链接必须映射到 banana 模型');
      }

      if (model.id === 'vidu-q2') {
        assert.notEqual(hrefModel, 'gpt-image-2.5-flash', 'Vidu Q2 不能指向 gpt-image-2.5-flash');
        assert.match(hrefModel, /vidu/i, 'Vidu Q2 链接必须映射到 vidu 模型');
      }

      if (model.id === 'seedance-2-5') {
        assert.notEqual(hrefModel, 'kling-v2.6-pro-t2v', 'Seedance 2.5 不能指向可灵');
        assert.match(hrefModel, /seedance/i, 'Seedance 2.5 链接必须映射到 seedance 模型');
      }

      if (model.id === 'wan-2-7') {
        assert.notEqual(hrefModel, 'kling-v2.6-pro-t2v', 'Wan 2.7 不能指向可灵');
        assert.match(hrefModel, /wan/i, 'Wan 2.7 链接必须映射到 wan 模型');
      }

      if (model.id === 'runway-gen3-alpha') {
        assert.notEqual(hrefModel, 'kling-v2.6-pro-t2v', 'Runway 不能指向可灵');
        assert.match(hrefModel, /runway/i, 'Runway 链接必须映射到 runway 模型');
      }

      if (model.id === 'openai-sora-2') {
        assert.notEqual(hrefModel, 'kling-v2.6-pro-t2v', 'Sora 2 不能指向可灵');
        assert.match(hrefModel, /sora/i, 'Sora 2 链接必须映射到 sora 模型');
      }

      if (model.id === 'luma-dream-machine') {
        assert.notEqual(hrefModel, 'kling-v2.6-pro-t2v', 'Luma 不能指向可灵');
        assert.match(hrefModel, /luma/i, 'Luma 链接必须映射到 luma 模型');
      }

      if (model.id === 'claude-3-7-sonnet') {
        assert.equal(model.tabId, 'agents', 'Claude 3.7 属于智能体对话模型，tabId 必须为 agents');
        assert.equal(hrefTab, 'agents', 'Claude 3.7 链接 tab 必须指向 agents');
      }
    }
  }
});

test('3. 关于页面导航与首页全站统一导航融合审计', () => {
  const aboutClientPath = path.join(repoRoot, 'components/about/AboutPageClient.jsx');
  const aboutClientCode = fs.readFileSync(aboutClientPath, 'utf8');

  // 3.1 必须使用 StudioHeader (全站统一顶栏/首页同款导航)
  assert.match(
    aboutClientCode,
    /import StudioHeader from '@\/components\/site\/StudioHeader'/,
    'AboutPageClient.jsx 必须导入 StudioHeader'
  );
  assert.match(
    aboutClientCode,
    /<StudioHeader[^>]*activeTab="about"/,
    'AboutPageClient.jsx 必须渲染 StudioHeader 并将 activeTab 设为 about'
  );

  // 3.2 必须杜绝旧版割裂的 FigmaHeader
  assert.doesNotMatch(
    aboutClientCode,
    /import FigmaHeader/,
    'AboutPageClient.jsx 必须彻底移除 FigmaHeader 导入'
  );
  assert.doesNotMatch(
    aboutClientCode,
    /<FigmaHeader/,
    'AboutPageClient.jsx 必须彻底移除 FigmaHeader 标签'
  );
});

test('4. 站点标题设置入口与 koyosim 旧版标题清理审计', async () => {
  const brandingServiceCode = fs.readFileSync(path.join(repoRoot, 'lib/services/branding.js'), 'utf8');
  const { DEFAULT_BRAND } = await import('../lib/hooks/useBranding.js');
  const brandingClientCode = fs.readFileSync(path.join(repoRoot, 'app/admin/content/branding/BrandingManagerClient.js'), 'utf8');

  // 4.1 DEFAULT_BRAND_CONFIG 与 DEFAULT_BRAND 必须包含站点标题及模板
  assert.match(brandingServiceCode, /siteTitle:\s*'SupDance — Free AI Image & Video Studio'/);
  assert.match(brandingServiceCode, /titleTemplate:\s*'%s \| SupDance AI Studio'/);
  assert.equal(DEFAULT_BRAND.siteTitle, 'SupDance — Free AI Image & Video Studio');
  assert.equal(DEFAULT_BRAND.titleTemplate, '%s | SupDance AI Studio');

  // 4.2 后台品牌设置工作台必须提供站点标题配置入口
  assert.match(brandingClientCode, /id="title-settings"/, '品牌设置必须包含 title-settings 区域');
  assert.match(brandingClientCode, /siteTitle/, '品牌设置必须包含 siteTitle 状态管理与输入项');
  assert.match(brandingClientCode, /titleTemplate/, '品牌设置必须包含 titleTemplate 模板输入项');
  assert.match(brandingClientCode, /站点标题与浏览器标签页设置/, '品牌设置必须包含直观的中文标题卡片');

  // 4.3 核心路由 metadata title 绝不应包含旧版 KOYO Studio
  const pagesToCheck = [
    'app/page.js',
    'app/about/page.js',
    'app/assets/page.js',
    'app/models/page.js',
    'app/zh/page.js',
    'app/zh/about/page.js',
    'app/zh/assets/page.js',
    'app/zh/models/page.js',
  ];

  for (const pagePath of pagesToCheck) {
    const code = fs.readFileSync(path.join(repoRoot, pagePath), 'utf8');
    assert.doesNotMatch(
      code,
      /KOYO Studio/i,
      `${pagePath} 中的元数据标题不应再包含旧版 KOYO Studio`
    );
  }
});
