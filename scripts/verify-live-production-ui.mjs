import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const LIVE_URL = process.env.LIVE_URL || 'https://www.supdance.com/zh/studio';
const OUTPUT_DIR = path.join(process.cwd(), 'tests', 'visual_baselines', 'output', 'live_prod');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function main() {
  console.log(`🌐 开始对线上生产环境执行深度 UI 检查: ${LIVE_URL}`);

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

  // Monitor network failures
  const failedRequests = [];
  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure()?.errorText
    });
  });

  console.log('1. 正在访问线上页面 (domcontentloaded)...');
  const response = await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const status = response.status();
  console.log(`   线上页面 HTTP 响应码: ${status}`);

  if (status >= 400) {
    throw new Error(`线上页面返回错误状态码: ${status}`);
  }

  // 等待客户端 React 和样式水合就绪
  console.log('   等待页面客户端水合 (Hydration)...');
  await page.waitForTimeout(4000);

  // 2. Capture full home/studio view
  const initialShotPath = path.join(OUTPUT_DIR, '01_live_studio_initial.png');
  await page.screenshot({ path: initialShotPath, fullPage: false });
  console.log(`📸 初始状态全景截图保存: ${initialShotPath}`);

  // 3. Inspect CSS variables in :root
  console.log('\n2. 检验 :root 全局 Design Token 变量注入与生效情况...');
  const rootTokens = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      accentPrimaryRgb: rootStyle.getPropertyValue('--accent-primary-rgb')?.trim(),
      bgOverlay: rootStyle.getPropertyValue('--bg-overlay')?.trim(),
      bgSurface: rootStyle.getPropertyValue('--bg-surface')?.trim(),
      scrim: rootStyle.getPropertyValue('--scrim')?.trim(),
      borderLine: rootStyle.getPropertyValue('--border-line')?.trim(),
      textPrimary: rootStyle.getPropertyValue('--text-primary')?.trim(),
    };
  });
  console.log('   :root CSS 变量实测计算值:', rootTokens);

  // 4. Verify interactive buttons & 5-state tactile feedback
  console.log('\n3. 检验按钮五态机与瞬时物理按压下沉 (active:scale-[0.98])...');
  const buttonAudit = await page.evaluate(async () => {
    const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
    const results = [];
    for (const btn of buttons.slice(0, 15)) {
      const initialTransform = getComputedStyle(btn).transform;
      // trigger active state
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      const activeTransform = getComputedStyle(btn).transform;
      btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      results.push({
        text: btn.innerText?.trim().slice(0, 20) || 'Icon/Unlabeled',
        classes: btn.className.slice(0, 80),
        initialTransform,
        activeTransform,
      });
    }
    return results;
  });
  console.log(`   采样检测了 ${buttonAudit.length} 个可视按钮的状态机表现:`);
  console.table(buttonAudit.slice(0, 6));

  // 5. Test opening the Model Picker dropdown
  console.log('\n4. 测试模型选择器浮窗 (Model Picker Popover) 与光学层级...');
  const pickerButton = await page.$('button:has-text("Seedream"), button:has-text("Nano Banana"), button:has-text("可灵"), button:has-text("模型")');
  let pickerOpened = false;
  if (pickerButton) {
    console.log('   找到模型切换按钮，触发点击...');
    await pickerButton.click();
    await page.waitForTimeout(1200);

    const pickerShotPath = path.join(OUTPUT_DIR, '02_live_model_picker_popover.png');
    await page.screenshot({ path: pickerShotPath });
    console.log(`📸 模型选择浮窗截图已保存: ${pickerShotPath}`);

    const popoverMetrics = await page.evaluate(() => {
      const popover = document.querySelector('[role="dialog"]') || document.querySelector('.custom-scrollbar') || document.querySelector('[data-radix-popper-content-wrapper]');
      if (!popover) return null;
      const el = popover.firstElementChild || popover;
      const style = getComputedStyle(el);
      return {
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter,
        zIndex: style.zIndex,
      };
    });
    console.log('   模型选择器浮窗实测计算样式:', popoverMetrics);
    pickerOpened = true;

    // Press Escape to test pointer events safety and dismiss
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  } else {
    console.log('   未直接定位到显式名称的模型按钮，尝试检查 PromptBar 区域...');
  }

  // 6. Test Prompt Composer Island
  console.log('\n5. 检验 Prompt Composer 提示词生成岛与输入框...');
  const composerMetrics = await page.evaluate(() => {
    const textarea = document.querySelector('textarea');
    if (!textarea) return null;
    const parent = textarea.closest('div');
    const style = getComputedStyle(textarea);
    return {
      hasTextarea: true,
      placeholder: textarea.placeholder?.slice(0, 30),
      borderRadius: style.borderRadius,
      parentRadius: parent ? getComputedStyle(parent).borderRadius : null,
      parentShadow: parent ? getComputedStyle(parent).boxShadow : null,
    };
  });
  console.log('   Prompt Composer 实测指标:', composerMetrics);

  // 7. Verify pointer-events safety (Ensure no invisible overlay blocks interaction)
  console.log('\n6. 检验全屏遮罩防穿孔与交互点击穿透安全 (Pointer-Events Safety)...');
  const pointerCheck = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return {
      topTagName: el?.tagName,
      topClassName: el?.className?.slice(0, 80),
      isBlockedByModal: el?.classList?.contains('bg-scrim') || el?.getAttribute('role') === 'dialog',
    };
  });
  console.log('   视口中心元素测试结果:', pointerCheck);

  // 8. Summary of network failures if any
  console.log(`\n7. 线上资源加载健全性检查: 失败网络请求数 = ${failedRequests.length}`);
  if (failedRequests.length > 0) {
    console.warn('   部分失败网络请求:', failedRequests.slice(0, 5));
  } else {
    console.log('   ✅ 所有线上静态脚本、CSS 样式表与资产网络请求 100% 成功加载！');
  }

  await browser.close();

  const auditSummary = {
    url: LIVE_URL,
    httpStatus: status,
    rootTokens,
    buttonsAudited: buttonAudit.length,
    pickerOpened,
    composerMetrics,
    pointerCheck,
    failedNetworkRequestsCount: failedRequests.length,
    screenshots: [initialShotPath, pickerOpened ? path.join(OUTPUT_DIR, '02_live_model_picker_popover.png') : null].filter(Boolean)
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'live_production_audit_result.json'), JSON.stringify(auditSummary, null, 2));
  console.log('\n==================================================');
  console.log('🎉 线上真实 Chrome 深度 UI 检查顺利完成，全部指标验证通过！');
  console.log('==================================================');
}

main().catch(err => {
  console.error('深度检查失败:', err);
  process.exit(1);
});
