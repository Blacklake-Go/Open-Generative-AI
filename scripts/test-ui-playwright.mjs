import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'tests', 'visual_baselines', 'output');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log('🚀 启动 Playwright UI 端到端自动化检测流水线...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  const consoleMessages = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleMessages.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  try {
    // 1. 先访问页面
    console.log('1. 正在访问线上页面 https://www.Supdance.com/zh/studio ...');
    const response = await page.goto('https://www.Supdance.com/zh/studio', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    console.log(`   HTTP 响应码: ${response.status()}`);
    console.log(`   最终页面 URL: ${page.url()}`);
    console.log(`   页面标题: ${await page.title()}`);

    // 保存初始导航截图排查
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'initial_load.png') });
    const bodyContent = await page.evaluate(() => document.body.innerHTML.slice(0, 500));
    console.log(`   页面 Body 前500字符: ${bodyContent}`);

    // 3. 注入即梦流式测试批次数据到 localStorage
    console.log('3. 注入模拟图片生成批次数据并重新载入 ...');
    const mockState = {
      localHistory: [
        {
          id: 'mock_img_1',
          batchId: 'batch_mock_today',
          url: 'https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/sdxl-image.avif',
          prompt: '赛博朋克霓虹雨夜，未来机甲少女，电影级光影，8k高保真',
          model: 'gpt-image-2.5-flash',
          aspect_ratio: '16:9',
          quality: '2K',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'mock_img_2',
          batchId: 'batch_mock_today',
          url: 'https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/chroma-image.avif',
          prompt: '赛博朋克霓虹雨夜，未来机甲少女，电影级光影，8k高保真',
          model: 'gpt-image-2.5-flash',
          aspect_ratio: '16:9',
          quality: '2K',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'mock_img_3',
          batchId: 'batch_mock_yesterday',
          url: 'https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/neta-lumina.avif',
          prompt: '日系唯美水彩插画，春日樱花漫天飞舞',
          model: 'flux-1-schnell',
          aspect_ratio: '1:1',
          quality: '1K',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
    };

    await page.evaluate((state) => {
      localStorage.setItem('hg_image_studio_persistent', JSON.stringify(state));
    }, mockState);

    // 重新加载页面以生效持久化数据
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // 4. 验证流式批次卡片结构
    console.log('4. 验证流式批次卡片 (Feed Batch Cards) 呈现 ...');
    const dateLabels = await page.$$eval('[class*="sticky top-0"]', (els) =>
      els.map((e) => e.innerText.trim())
    );
    console.log(`   检测到日期分组标头: ${JSON.stringify(dateLabels)}`);

    // 检查批次卡片内的图片元素
    const imageCards = await page.$$('img[alt*="赛博朋克"]');
    console.log(`   检测到今日批次图片数量: ${imageCards.length}`);

    // 检查画幅比例计算（16:9 应该 aspect-ratio 约为 16 / 9）
    const imageStyle = await page.$eval('img[alt*="赛博朋克"]', (el) => {
      const container = el.closest('[style*="aspect-ratio"]');
      return container ? container.getAttribute('style') : 'none';
    });
    console.log(`   第一张图片容器画幅样式: ${imageStyle}`);

    // 检查是否有透明拦截层 (pointer-events 检查)
    const centerHit = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return {
        tagName: el ? el.tagName : null,
        className: el ? el.className : null,
        pointerEvents: el ? getComputedStyle(el).pointerEvents : null,
      };
    });
    console.log(`   页面中心点击穿透命中元素: <${centerHit.tagName}>, pointerEvents: ${centerHit.pointerEvents}`);

    // 截图 1: 流式批次卡片主界面
    const feedScreenshotPath = path.join(SCREENSHOT_DIR, 'feed_batch_cards.png');
    await page.screenshot({ path: feedScreenshotPath, fullPage: false });
    console.log(`   📸 主界面截图已保存至: ${feedScreenshotPath}`);

    // 5. 点击首张图片，展开 ImageDetailWorkbench 详情工作台
    console.log('5. 点击生成图片，测试 ImageDetailWorkbench 详情打开状态 ...');
    await imageCards[0].click();
    await page.waitForTimeout(800);

    // 验证工作台是否已弹出 (ImageDetailWorkbench 使用 z-[100])
    const workbenchVisible = await page.evaluate(() => {
      const workbench = document.querySelector('.fixed.inset-0.z-\\[100\\]') || document.querySelector('button:has-text("返回")');
      return !!document.querySelector('.fixed.inset-0.z-\\[100\\]');
    });
    console.log(`   ImageDetailWorkbench 是否已打开: ${workbenchVisible}`);

    if (workbenchVisible) {
      // 验证左侧对比条 / 视口
      const hasSlider = await page.evaluate(() => {
        return !!document.querySelector('input[type="range"]');
      });
      console.log(`   高保真分屏对比滑块存在: ${hasSlider}`);

      // 验证右侧动作与工具箱按钮
      const actions = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('.fixed.inset-0.z-\\[100\\] button'));
        return buttons.map((b) => b.innerText.trim()).filter(Boolean);
      });
      console.log(`   工作台内可用按钮操作群:`, actions.slice(0, 15));

      // 验证圆角与阴影
      const modalStyles = await page.evaluate(() => {
        const panel = document.querySelector('.fixed.inset-0.z-\\[100\\]');
        if (!panel) return null;
        const cs = getComputedStyle(panel);
        return {
          borderRadius: cs.borderRadius,
          boxShadow: cs.boxShadow,
          backgroundColor: cs.backgroundColor,
        };
      });
      console.log(`   工作台外壳视觉样式:`, modalStyles);

      // 截图 2: 图像打开详情工作台
      const detailScreenshotPath = path.join(SCREENSHOT_DIR, 'image_detail_workbench.png');
      await page.screenshot({ path: detailScreenshotPath, fullPage: false });
      console.log(`   📸 图像详情工作台截图已保存至: ${detailScreenshotPath}`);

      // 测试互动 1: 点击 [重新编辑]，验证参数回填并自动退出工作台
      console.log('6. 测试 [重新编辑] 交互 ...');
      const reEditBtn = await page.locator('.fixed.inset-0.z-\\[100\\] button:has-text("重新编辑")').first();
      await reEditBtn.click();
      await page.waitForTimeout(600);

      const workbenchClosedAfterReEdit = await page.evaluate(() => {
        return !document.querySelector('.fixed.inset-0.z-\\[100\\]');
      });
      console.log(`   点击 [重新编辑] 后工作台顺利关闭: ${workbenchClosedAfterReEdit}`);

      // 验证底部 Prompt 输入框是否成功回填提示词
      const textareaValue = await page.evaluate(() => {
        const ta = document.querySelector('textarea');
        return ta ? ta.value : '';
      });
      console.log(`   底部输入框回填内容: "${textareaValue}"`);

      // 测试互动 2: 再次点击卡片进入详情，测试快捷键 Esc 退出
      console.log('7. 再次打开详情工作台并测试 Esc 键退出 ...');
      await imageCards[0].click();
      await page.waitForTimeout(500);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      const workbenchClosedAfterEsc = await page.evaluate(() => {
        return !document.querySelector('.fixed.inset-0.z-\\[100\\]');
      });
      console.log(`   按下 Esc 键后工作台顺利退出: ${workbenchClosedAfterEsc}`);
    }

    console.log('7. 运行时控制台与错误审计:');
    console.log(`   Uncaught Page Errors: ${pageErrors.length}`);
    if (pageErrors.length > 0) {
      console.error('   Page Errors:', pageErrors);
    }
    console.log(`   Console Errors: ${consoleMessages.length}`);
    if (consoleMessages.length > 0) {
      console.log('   Console Errors (sample):', consoleMessages.slice(0, 5));
    }

    console.log('🎉 Playwright 端到端 UI 与交互全流程检测完成！');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('检测过程出现异常:', err);
  process.exit(1);
});
