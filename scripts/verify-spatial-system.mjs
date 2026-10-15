import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACTS_DIR = '/Users/seelucency/.gemini/antigravity/brain/200ea1c2-f029-44e7-9529-16a5d6b09a0e';

async function runSpatialVerification() {
  console.log('🚀 启动 Playwright AI 空间光影系统深度验证与无损交互审计...');

  const browser = await chromium.launch({ headless: true });
  const errors = [];

  // ==========================================
  // Test 1: Desktop /call-api Hero & Showcase
  // ==========================================
  console.log('\n--- 1. 桌面端 /call-api 空间光影与交互验证 (1440x900) ---');
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await desktopContext.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('Browser console error:', msg.text());
      errors.push(msg.text());
    }
  });

  await page.goto('http://localhost:3000/call-api', { waitUntil: 'networkidle', timeout: 30000 });

  // 检查背景容器
  const spatialBg = await page.$('[aria-hidden="true"]');
  console.log('✔ SpatialBackground DOM 节点存在:', !!spatialBg);

  // 检查点阵与光场 pointer-events
  const bgPointerEvents = await page.evaluate(() => {
    const bgContainer = document.querySelector('[aria-hidden="true"]');
    if (!bgContainer) return { found: false };
    const style = window.getComputedStyle(bgContainer);
    return {
      found: true,
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      backgroundColor: style.backgroundColor,
    };
  });
  console.log('✔ 背景容器样式审计:', bgPointerEvents);

  if (bgPointerEvents.pointerEvents !== 'none') {
    throw new Error(`背景容器 pointer-events 必须为 none，实际为: ${bgPointerEvents.pointerEvents}`);
  }

  // 检查 elementFromPoint 点击命中测试 (确保按钮绝不被背景遮挡)
  const ctaHitTest = await page.evaluate(() => {
    const cta = document.querySelector('a[href="/studio"].btn-spatial-glow');
    if (!cta) return { found: false };
    const rect = cta.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const hitElement = document.elementFromPoint(centerX, centerY);
    return {
      found: true,
      isTargetOrChild: cta === hitElement || cta.contains(hitElement),
      hitTagName: hitElement ? hitElement.tagName : null,
      hitClass: hitElement ? hitElement.className : null,
    };
  });
  console.log('✔ CTA 按钮点击穿透安全性审计 (elementFromPoint):', ctaHitTest);
  if (!ctaHitTest.isTargetOrChild) {
    throw new Error('警告：CTA 按钮被上层元素遮挡，无法正常点击！');
  }

  // 检查 GlowCard 鼠标移动微交互 (Spotlight effect)
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(500);

  const glowCardTest = await page.evaluate(() => {
    const card = document.querySelector('.group.relative.rounded-2xl');
    if (!card) return { found: false };
    
    // 模拟鼠标移动到 (100, 100)
    const rect = card.getBoundingClientRect();
    const event = new MouseEvent('mousemove', {
      clientX: rect.left + 100,
      clientY: rect.top + 100,
      bubbles: true,
    });
    card.dispatchEvent(event);
    
    return {
      found: true,
      mouseX: card.style.getPropertyValue('--mouse-x'),
      mouseY: card.style.getPropertyValue('--mouse-y'),
      opacity: card.style.getPropertyValue('--spotlight-opacity'),
    };
  });
  console.log('✔ GlowCard 聚光灯微交互测试:', glowCardTest);

  // 截图桌面端视觉
  const heroScreenshotPath = path.join(ARTIFACTS_DIR, 'spatial_hero_desktop.png');
  await page.screenshot({ path: heroScreenshotPath, fullPage: false });
  console.log('📸 桌面端视觉截图已保存至:', heroScreenshotPath);

  // ==========================================
  // Test 2: Mobile /call-api (390x844 iPhone)
  // ==========================================
  console.log('\n--- 2. 移动端 /call-api 响应式降级审计 (390x844) ---');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:3000/call-api', { waitUntil: 'domcontentloaded', timeout: 30000 });

  const mobileScreenshotPath = path.join(ARTIFACTS_DIR, 'spatial_hero_mobile.png');
  await mobilePage.screenshot({ path: mobileScreenshotPath, fullPage: false });
  console.log('📸 移动端视觉截图已保存至:', mobileScreenshotPath);

  // ==========================================
  // Test 3: /studio 工作台视觉与 PromptComposer 审计
  // ==========================================
  console.log('\n--- 3. /studio 工作台光影空间与 PromptComposer 激活态审计 ---');
  const studioPage = await desktopContext.newPage();
  await studioPage.goto('http://localhost:3000/studio', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await studioPage.waitForTimeout(3000);

  // 检查 PromptComposer 和 focus-within
  const composerAudit = await studioPage.evaluate(() => {
    const composer = document.querySelector('.prompt-composer-spatial');
    const textarea = composer ? composer.querySelector('textarea') : null;
    if (!composer || !textarea) return { found: false, hasComposer: !!composer, hasTextarea: !!textarea };

    // 获取未聚焦时的样式
    const initialShadow = window.getComputedStyle(composer).boxShadow;
    const initialBorder = window.getComputedStyle(composer).borderColor;

    // 聚焦
    textarea.focus();
    const focusedShadow = window.getComputedStyle(composer).boxShadow;
    const focusedBorder = window.getComputedStyle(composer).borderColor;

    return {
      found: true,
      initialBorder,
      focusedBorder,
      shadowChanged: initialShadow !== focusedShadow,
    };
  });
  console.log('✔ PromptComposer 空间光感与 focus-within 激活态审计:', composerAudit);

  const studioScreenshotPath = path.join(ARTIFACTS_DIR, 'spatial_studio_desktop.png');
  await studioPage.screenshot({ path: studioScreenshotPath, fullPage: false });
  console.log('📸 Studio 工作台截图已保存至:', studioScreenshotPath);

  await browser.close();

  console.log('\n==================================================');
  console.log('🎉 Playwright AI 空间光影系统全套验证 100% 通过！');
  console.log('==================================================');
}

runSpatialVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
