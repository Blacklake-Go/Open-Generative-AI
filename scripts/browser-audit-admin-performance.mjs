import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = 'https://www.Supdance.com';
const SESSION_COOKIE = 'zFymwWywZ8CQvaRv2SnfyncGEUvsyfItqYKPESz7TYA';
const OUTPUT_DIR = path.join(process.cwd(), 'docs', 'audit-data');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function runAudit() {
  console.log('🚀 [Browser Audit] 启动 Google Chrome 进行管理后台性能与交互深检...');
  
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });

  // 设置 admin session cookie
  await context.addCookies([
    {
      name: 'ko_session',
      value: SESSION_COOKIE,
      domain: 'www.Supdance.com',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();

  // 性能与网络事件监控
  const networkEvents = [];
  const consoleLogs = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text(), location: msg.location() });
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[Browser Console ${msg.type()}]:`, msg.text());
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push({ message: err.message, stack: err.stack });
    console.error('[Browser PageError]:', err.message, '\nStack:', err.stack);
  });

  page.on('request', (req) => {
    req._startTime = Date.now();
  });

  page.on('requestfinished', async (req) => {
    const duration = Date.now() - (req._startTime || Date.now());
    const res = await req.response().catch(() => null);
    networkEvents.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
      status: res ? res.status() : null,
      duration,
      size: res ? (res.headers()['content-length'] || 0) : 0,
    });
  });

  page.on('requestfailed', (req) => {
    const duration = Date.now() - (req._startTime || Date.now());
    networkEvents.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
      failed: true,
      errorText: req.failure()?.errorText,
      duration,
    });
    console.warn(`[Network Failed]: ${req.method()} ${req.url()} - ${req.failure()?.errorText} (${duration}ms)`);
  });

  console.log('\n--- 1. 访问 /admin/models (模型总览) ---');
  const t0 = Date.now();
  const resp = await page.goto(`${BASE_URL}/admin/models`, { waitUntil: 'load', timeout: 30000 });
  const loadTime = Date.now() - t0;
  console.log(`页面初始加载完成: HTTP ${resp.status()}, 耗时: ${loadTime}ms, 最终 URL: ${page.url()}`);

  // 收集客户端性能指标
  const performanceTiming = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint');
    return {
      dns: nav ? Math.round(nav.domainLookupEnd - nav.domainLookupStart) : null,
      tcp: nav ? Math.round(nav.connectEnd - nav.connectStart) : null,
      ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
      download: nav ? Math.round(nav.responseEnd - nav.responseStart) : null,
      domInteractive: nav ? Math.round(nav.domInteractive) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadEvent: nav ? Math.round(nav.loadEventEnd) : null,
      firstPaint: paint.find((p) => p.name === 'first-paint')?.startTime || null,
      firstContentfulPaint: paint.find((p) => p.name === 'first-contentful-paint')?.startTime || null,
    };
  });
  console.log('Navigation Timing (ms):', JSON.stringify(performanceTiming, null, 2));

  // 截屏
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'admin_models_overview.png'), fullPage: true });

  // 检查页面上所有可点击的导航与按钮
  const navItems = await page.$$eval('aside nav a, aside nav button', (els) =>
    els.map((el) => ({
      text: el.innerText.trim().replace(/\n+/g, ' '),
      href: el.getAttribute('href'),
      tagName: el.tagName,
      className: el.className,
      pointerEvents: window.getComputedStyle(el).pointerEvents,
      cursor: window.getComputedStyle(el).cursor,
      visible: el.offsetWidth > 0 && el.offsetHeight > 0,
    }))
  );
  console.log(`发现侧边栏导航交互项: ${navItems.length} 个`);

  // 测试点击：切换到各个模型子页面，测量客户端路由跳转延迟 (Client-side Navigation Latency)
  const testRoutes = [
    { label: '所有模型', selector: 'aside a[href*="/admin/models/registry"]' },
    { label: '模型接入', selector: 'aside a[href*="/admin/models/providers"]' },
    { label: '模型分配', selector: 'aside a[href*="/admin/models/routing"]' },
    { label: '定价管理', selector: 'aside a[href*="/admin/models/pricing"]' },
    { label: '模型健康', selector: 'aside a[href*="/admin/models/health"]' },
    { label: '返回模型总览', selector: 'aside a[href="/admin/models"]' },
  ];

  const clickBench = [];

  for (const target of testRoutes) {
    console.log(`\n--- 测试点击导航: ${target.label} (${target.selector}) ---`);
    const linkEl = await page.$(target.selector);
    if (!linkEl) {
      console.warn(`未找到元素: ${target.selector}`);
      clickBench.push({ label: target.label, error: 'SELECTOR_NOT_FOUND' });
      continue;
    }

    // 测量点击开始到页面内容更新或网络响应完毕的时间
    const clickStart = Date.now();
    
    // 监听网络请求
    let requestCount = 0;
    const reqListener = (r) => {
      if (r.url().includes('/api/') || r.url().includes('/_next/data/')) {
        requestCount++;
      }
    };
    page.on('request', reqListener);

    // 触发点击
    await linkEl.click();

    // 等待路由变化或 main 区域更新
    try {
      await page.waitForFunction(
        (sel) => {
          const activeEl = document.querySelector(sel);
          return activeEl && (activeEl.className.includes('text-cyan-300') || activeEl.className.includes('bg-cyan-500'));
        },
        target.selector,
        { timeout: 8000 }
      );
    } catch {
      console.warn(`高亮状态等待超时或未更新`);
    }

    // 等待网络空闲
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const clickDuration = Date.now() - clickStart;

    page.off('request', reqListener);

    const currentUrl = page.url();
    const currentHeading = await page.$eval('h1, h2', (h) => h?.innerText?.trim() || '').catch(() => '');

    console.log(`✓ 点击 ${target.label} 响应耗时: ${clickDuration}ms | 当前 URL: ${currentUrl} | 标头: ${currentHeading}`);
    clickBench.push({
      label: target.label,
      durationMs: clickDuration,
      url: currentUrl,
      heading: currentHeading,
    });

    await page.waitForTimeout(500);
  }

  // 测试页面内按钮点击（例如展开过滤、输入搜索等）
  console.log('\n--- 测试页面内部交互（搜索与过滤）---');
  const searchInput = await page.$('input[placeholder*="搜索"]');
  if (searchInput) {
    const searchStart = Date.now();
    await searchInput.fill('flux');
    await page.waitForTimeout(300);
    const searchDuration = Date.now() - searchStart;
    console.log(`搜索框输入响应耗时: ${searchDuration}ms`);
  }

  // 性能诊断摘要
  console.log('\n========================================');
  console.log('📊 [Browser Audit 汇总诊断]');
  console.log('========================================');
  console.log('初始页面加载耗时:', `${loadTime}ms`);
  console.log('TTFB:', `${performanceTiming.ttfb}ms`);
  console.log('FCP (First Contentful Paint):', `${performanceTiming.firstContentfulPaint}ms`);
  console.log('点击导航延迟对比:');
  console.table(clickBench);

  // 分析慢请求
  const slowRequests = networkEvents.filter((e) => e.duration > 800);
  console.log(`耗时 > 800ms 的慢网络请求 (${slowRequests.length} 个):`);
  slowRequests.forEach((r) => {
    console.log(`  - [${r.status || 'FAILED'}] ${r.duration}ms | ${r.method} ${r.url}`);
  });

  // 分析控制台错误
  console.log(`控制台错误数: ${consoleLogs.filter((l) => l.type === 'error').length}`);
  consoleLogs.filter((l) => l.type === 'error').forEach((e) => console.log('  - Error:', e.text));

  await browser.close();
  console.log('\n🎉 [Browser Audit] 审计完成！');
}

runAudit().catch((err) => {
  console.error('[Browser Audit] 运行失败:', err);
  process.exit(1);
});
