import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'https://www.supdance.com';

const TARGET_PAGES = [
  { name: '首页/工作台 (/zh/studio)', path: '/zh/studio' },
  { name: '图像工作室 (/zh/studio?tab=image)', path: '/zh/studio?tab=image' },
  { name: '视频工作室 (/zh/studio?tab=video)', path: '/zh/studio?tab=video' },
  { name: '音频工作室 (/zh/studio?tab=audio)', path: '/zh/studio?tab=audio' },
  { name: '智能体工作室 (/zh/studio?tab=agent)', path: '/zh/studio?tab=agent' },
  { name: '社区画廊 (/zh/community)', path: '/zh/community' },
  { name: '关于我们 (/zh/about)', path: '/zh/about' },
  { name: '会员定价 (/zh/pricing)', path: '/zh/pricing' },
  { name: '订阅服务 (/zh/subscription)', path: '/zh/subscription' },
  { name: '算力/金币 (/zh/coins)', path: '/zh/coins' },
  { name: '权益中心 (/zh/benefits)', path: '/zh/benefits' },
  { name: 'API调用 (/zh/call-api)', path: '/zh/call-api' },
  { name: '工作流 (/zh/workflow)', path: '/zh/workflow' },
];

async function runAudit() {
  console.log(`====================================================`);
  console.log(`开始全面页面速度与导航点击审计: ${BASE_URL}`);
  console.log(`====================================================\n`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 KoyoAuditor/1.0',
  });

  const report = [];

  for (const target of TARGET_PAGES) {
    const fullUrl = `${BASE_URL}${target.path}`;
    console.log(`\n----------------------------------------------------`);
    console.log(`[测试中] ${target.name}: ${fullUrl}`);

    const page = await context.newPage();
    const requests = [];
    const slowRequests = [];
    const failedRequests = [];
    const consoleErrors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      consoleErrors.push(`[PageError] ${err.message}`);
    });

    page.on('request', req => {
      req._startTime = Date.now();
    });

    page.on('requestfinished', async req => {
      const duration = Date.now() - (req._startTime || Date.now());
      try {
        const res = await req.response();
        const status = res ? res.status() : 0;
        const headers = res ? res.headers() : {};
        const contentLength = headers['content-length'] ? parseInt(headers['content-length'], 10) : 0;
        const entry = {
          url: req.url(),
          method: req.method(),
          resourceType: req.resourceType(),
          status,
          duration,
          contentLength,
        };
        requests.push(entry);
        if (duration > 1000) {
          slowRequests.push(entry);
        }
      } catch (e) {
        // ignore
      }
    });

    page.on('requestfailed', req => {
      failedRequests.push({
        url: req.url(),
        failure: req.failure()?.errorText || 'Unknown failure',
      });
    });

    const startTime = Date.now();
    let status = 0;
    let finalUrl = '';
    let ttfb = 0;
    let domContentLoaded = 0;
    let loadTime = 0;
    let timingMetrics = {};

    try {
      const response = await page.goto(fullUrl, {
        waitUntil: 'networkidle',
        timeout: 45000,
      });

      status = response ? response.status() : 0;
      finalUrl = page.url();

      timingMetrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0;
        if (!nav) return { fcp };
        return {
          fcp,
          ttfb: nav.responseStart - nav.requestStart,
          domInteractive: nav.domInteractive - nav.startTime,
          domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
          loadEvent: nav.loadEventEnd - nav.startTime,
          transferSize: nav.transferSize,
          decodedBodySize: nav.decodedBodySize,
        };
      });

      ttfb = Math.round(timingMetrics.ttfb || 0);
      domContentLoaded = Math.round(timingMetrics.domContentLoaded || 0);
      loadTime = Date.now() - startTime;

      console.log(`  状态码: ${status} | 最终URL: ${finalUrl}`);
      console.log(`  TTFB: ${ttfb}ms | FCP: ${Math.round(timingMetrics.fcp || 0)}ms | DOMReady: ${domContentLoaded}ms | 完整加载耗时: ${loadTime}ms`);
      console.log(`  总请求数: ${requests.length} | 失败请求: ${failedRequests.length} | 慢请求(>1s): ${slowRequests.length} | 控制台错误: ${consoleErrors.length}`);

      if (slowRequests.length > 0) {
        console.log(`  [慢请求 TOP 5]:`);
        slowRequests.sort((a, b) => b.duration - a.duration).slice(0, 5).forEach(s => {
          console.log(`    - [${s.duration}ms] [${s.resourceType}] ${s.url.slice(0, 90)}...`);
        });
      }

      if (failedRequests.length > 0) {
        console.log(`  [失败请求]:`);
        failedRequests.forEach(f => {
          console.log(`    - 失败: ${f.url.slice(0, 90)} (原因: ${f.failure})`);
        });
      }

      if (consoleErrors.length > 0) {
        console.log(`  [控制台错误]:`);
        consoleErrors.slice(0, 3).forEach(err => console.log(`    - ${err.slice(0, 100)}`));
      }

      report.push({
        name: target.name,
        path: target.path,
        status,
        finalUrl,
        ttfb,
        fcp: Math.round(timingMetrics.fcp || 0),
        domContentLoaded,
        loadTime,
        requestCount: requests.length,
        totalTransferKb: Math.round((requests.reduce((acc, r) => acc + (r.contentLength || 0), 0)) / 1024),
        slowRequests: slowRequests.length,
        failedRequests: failedRequests.length,
        consoleErrors: consoleErrors.length,
        slowDetails: slowRequests.slice(0, 5),
        failedDetails: failedRequests,
      });
    } catch (err) {
      console.error(`  [页面访问超时或出错]: ${err.message}`);
      report.push({
        name: target.name,
        path: target.path,
        error: err.message,
      });
    } finally {
      await page.close();
    }
  }

  // Next: Click-testing all navigation items on live home page
  console.log(`\n====================================================`);
  console.log(`开始交互式测试：首页顶栏导航所有项目的真实点击与响应`);
  console.log(`====================================================\n`);

  const navPage = await context.newPage();
  try {
    await navPage.goto(`${BASE_URL}/zh/studio`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Find all links in header
    const navItems = await navPage.$$eval('header a, [data-mega-nav] a', links => {
      return links.map(l => ({
        text: l.innerText.trim(),
        href: l.getAttribute('href'),
      })).filter(l => l.text && l.href);
    });

    console.log(`发现顶栏导航链接数: ${navItems.length}`);
    for (const item of navItems) {
      console.log(`  - 链接: "${item.text}" -> ${item.href}`);
    }

    // Test clicking Mega Menu triggers
    const triggers = await navPage.$$('header button[data-state]');
    console.log(`发现顶栏可展开菜单项 (MegaMenu Triggers): ${triggers.length}`);
    for (let i = 0; i < triggers.length; i++) {
      const btn = triggers[i];
      const text = (await btn.innerText()).trim();
      console.log(`  测试展开菜单项 [${i + 1}]: "${text}"`);
      await btn.click();
      await navPage.waitForTimeout(400);
      const isVisible = await navPage.isVisible('[role="menu"], [data-radix-navigation-menu-viewport]');
      console.log(`    展开状态: ${isVisible ? '成功展示' : '未检测到浮层'}`);
      // Click again or click away to close
      await navPage.keyboard.press('Escape');
      await navPage.waitForTimeout(200);
    }
  } catch (e) {
    console.error(`导航点击测试出错:`, e.message);
  } finally {
    await navPage.close();
  }

  await browser.close();

  console.log(`\n====================================================`);
  console.log(`测试完成，输出审计报告汇总`);
  console.log(`====================================================`);
  console.log(JSON.stringify(report, null, 2));
}

runAudit().catch(console.error);
