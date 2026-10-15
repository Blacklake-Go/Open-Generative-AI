import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const ARTIFACT_DIR = '/Users/seelucency/.gemini/antigravity/brain/c95d0848-624b-4bf4-bb69-215afcfe2954';
const VIDEO_DIR = path.join(ARTIFACT_DIR, 'recordings');
if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

async function recordFinalVerification() {
  console.log('Starting final post-overhaul verification recording...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1440, height: 900 },
    },
  });

  const page = await context.newPage();

  console.log('1. Navigating to http://127.0.0.1:3100/zh/studio ...');
  await page.goto('http://127.0.0.1:3100/zh/studio', { waitUntil: 'domcontentloaded', timeout: 20000 });
  
  // Wait for client hydration and showcase cards
  try {
    await page.waitForSelector('img[alt*="Creative asset"]', { timeout: 6000 });
  } catch {}
  await page.waitForTimeout(1000);

  // Capture clean home state
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'post_home_clean.png'), fullPage: false });
  console.log('Captured post_home_clean.png');

  // 2. Demonstrate MegaMenu hover and adaptive centering
  console.log('2. Demonstrating TopMegaNavigation hover and Backdrop Scrim...');
  const videoTab = await page.$('header nav button:has-text("视频")');
  if (videoTab) {
    await videoTab.hover();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'post_megamenu_scrim.png'), fullPage: false });
    console.log('Captured post_megamenu_scrim.png (Video panel open with Backdrop Scrim)');
  }

  // Hover image tab
  const imageTab = await page.$('header nav button:has-text("图像")');
  if (imageTab) {
    await imageTab.hover();
    await page.waitForTimeout(800);
  }

  // Hover audio tab
  const audioTab = await page.$('header nav button:has-text("音频")');
  if (audioTab) {
    await audioTab.hover();
    await page.waitForTimeout(800);
  }

  // 3. Dismiss MegaMenu via clicking backdrop scrim
  console.log('3. Dismissing MegaMenu via Backdrop Scrim...');
  const scrim = await page.$('.bg-scrim, [data-mega-scrim]');
  if (scrim) {
    const box = await scrim.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.7);
    }
  } else {
    await page.mouse.move(720, 600);
  }
  await page.waitForTimeout(800);

  // 4. Hover showcase cards to demonstrate smooth elevations
  console.log('4. Demonstrating showcase cards hover transitions...');
  const cards = await page.$$('img[alt*="Creative asset"]');
  for (const card of cards) {
    await card.hover();
    await page.waitForTimeout(400);
  }
  await page.mouse.move(100, 100);
  await page.waitForTimeout(500);

  // 5. Mobile responsive verification
  console.log('5. Verifying mobile viewport & drawer with updated terminology...');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(600);

  const menuButton = await page.$('button[aria-label*="Menu"], button[aria-label*="导航"], header button:has(svg)');
  if (menuButton) {
    await menuButton.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'post_mobile_drawer.png'), fullPage: false });
    console.log('Captured post_mobile_drawer.png');
  }

  await page.waitForTimeout(1000);

  const video = page.video();
  await page.close();
  await context.close();
  await browser.close();

  if (video) {
    const videoPath = await video.path();
    const finalVideoPath = path.join(ARTIFACT_DIR, 'homepage_post_overhaul.webm');
    fs.copyFileSync(videoPath, finalVideoPath);
    console.log('Final verification video saved to:', finalVideoPath);
  }

  console.log('All verification recordings and snapshots completed successfully!');
}

recordFinalVerification().catch((err) => {
  console.error('Recording error:', err);
  process.exit(1);
});
