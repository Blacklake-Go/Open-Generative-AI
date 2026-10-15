import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const LIVE_URL = process.env.LIVE_URL || 'https://www.supdance.com/zh/studio';
const OUTPUT_DIR = path.join(process.cwd(), 'tests', 'visual_baselines', 'output', 'live_prod');

async function main() {
  console.log(`🌐 正在对线上生产环境执行全链路交互与光学深度检查: ${LIVE_URL}`);

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  console.log('1. 加载线上页面...');
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Test 1: Click the Model Pill Button inside the Prompt Composer
  console.log('2. 测试点击 Prompt Composer 中的模型切换胶囊...');
  const modelPill = await page.$('button:has-text("Nano Banana Pro"), button:has-text("Seedream"), button:has-text("可灵")');
  if (modelPill) {
    console.log('   定位到模型胶囊按钮，执行真实点击...');
    await modelPill.click();
    await page.waitForTimeout(1200);

    const modelPickerShot = path.join(OUTPUT_DIR, '02_live_model_picker_active.png');
    await page.screenshot({ path: modelPickerShot });
    console.log(`📸 模型选择浮窗截图已保存: ${modelPickerShot}`);

    // Verify popover styles
    const popoverMetrics = await page.evaluate(() => {
      const popovers = Array.from(document.querySelectorAll('[role="dialog"], [data-radix-popper-content-wrapper], .custom-scrollbar, [class*="shadow-elevation"]'));
      const active = popovers.find(p => p.offsetWidth > 0 && p.offsetHeight > 0);
      if (!active) return null;
      const el = active.firstElementChild || active;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter,
        bg: style.backgroundColor,
      };
    });
    console.log('   浮窗实测计算样式:', popoverMetrics);

    // Dismiss with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  } else {
    console.warn('   未找到模型切换胶囊');
  }

  // Test 2: Click the Login Button in Top Navigation to open Auth Modal
  console.log('3. 测试点击顶栏【登录】按钮触发 Auth Modal...');
  const loginButton = await page.$('button:has-text("登录"), a:has-text("登录")');
  if (loginButton) {
    console.log('   找到登录按钮，触发点击...');
    await loginButton.click();
    await page.waitForTimeout(1500);

    const authModalShot = path.join(OUTPUT_DIR, '03_live_auth_modal_active.png');
    await page.screenshot({ path: authModalShot });
    console.log(`📸 登录弹窗截图已保存: ${authModalShot}`);

    // Verify Modal Shell geometry and Scrim
    const modalMetrics = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      const scrim = document.querySelector('.bg-scrim') || document.querySelector('[class*="fixed inset-0"]');
      const modalStyle = modal ? getComputedStyle(modal) : null;
      const scrimStyle = scrim ? getComputedStyle(scrim) : null;

      return {
        modalPresent: Boolean(modal),
        modalRadius: modalStyle?.borderRadius,
        modalShadow: modalStyle?.boxShadow,
        modalBg: modalStyle?.backgroundColor,
        scrimPresent: Boolean(scrim),
        scrimZIndex: scrimStyle?.zIndex,
        scrimBackdrop: scrimStyle?.backdropFilter,
      };
    });
    console.log('   Auth Modal 实测光学指标:', modalMetrics);

    // Dismiss Modal with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  } else {
    console.warn('   未找到顶栏登录按钮');
  }

  // Test 3: Hover Top Navigation Mega Menu
  console.log('4. 测试顶栏导航 Mega Menu 悬浮交互...');
  const navItem = await page.$('button:has-text("图像"), div:has-text("图像")');
  if (navItem) {
    await navItem.hover();
    await page.waitForTimeout(1000);
    const navShot = path.join(OUTPUT_DIR, '04_live_top_navigation_hover.png');
    await page.screenshot({ path: navShot });
    console.log(`📸 导航悬浮态截图已保存: ${navShot}`);
  }

  await browser.close();
  console.log('\n✅ 线上深度交互与视觉检查全部顺利完成！');
}

main().catch(err => {
  console.error('深度检查失败:', err);
  process.exit(1);
});
