import { chromium } from 'playwright';
import path from 'node:path';

const ARTIFACT_DIR = '/Users/seelucency/.gemini/antigravity/brain/2fda4bec-ffe0-47a0-8457-1b69a11e0452';

async function verifyBrandAuroraLive() {
  console.log('Starting live verification of Brand Aurora Glow on https://www.Supdance.com/zh/studio?action=activity ...');

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: 'zh-CN',
  });

  await context.addCookies([
    {
      name: 'ko_session',
      value: '1DFgGB3YQTpvS6-gAkQXvaU0tAcolUEy7ZtEDdZUOms',
      domain: '.supdance.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[Console Error]:', msg.text());
  });

  page.on('pageerror', (err) => {
    console.log('[Page Error]:', err.message);
  });

  console.log('Navigating to https://www.Supdance.com/zh/studio?action=activity ...');
  await page.goto('https://www.Supdance.com/zh/studio?action=activity', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Wait for activity modal to render
  await page.waitForTimeout(4000);

  // Scroll the dialog modal main content area to bottom to show full Brand and Preference cards
  const modalMain = page.locator('[role="dialog"] main');
  if (await modalMain.count() > 0) {
    await modalMain.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
  } else {
    await page.evaluate(() => {
      const mains = Array.from(document.querySelectorAll('main'));
      mains.forEach((m) => (m.scrollTop = m.scrollHeight));
    });
  }
  await page.waitForTimeout(800);

  // 1. Capture Full Scrolled Default State
  const defaultPath = path.join(ARTIFACT_DIR, 'brand_aurora_scrolled_default.png');
  await page.screenshot({ path: defaultPath });
  console.log('Scrolled default state screenshot saved to:', defaultPath);

  // Find all brand items
  const brandItems = page.locator('div[role="button"]:has-text("偏好比重")');
  const count = await brandItems.count();
  console.log(`Found ${count} brand items in the card.`);

  for (let i = 0; i < count; i++) {
    const item = brandItems.nth(i);
    const text = await item.innerText();
    console.log(`Brand #${i + 1}:`, text.replace(/\n/g, ' '));
  }

  if (count > 0) {
    // 2. Click the first brand item (OpenAI) to activate floating & aurora glow
    console.log('Clicking first brand item...');
    await brandItems.first().click();
    await page.waitForTimeout(600);

    const activePath1 = path.join(ARTIFACT_DIR, 'brand_aurora_openai_active.png');
    await page.screenshot({ path: activePath1 });
    console.log('OpenAI active screenshot saved to:', activePath1);

    // 3. Click second brand item if available
    if (count > 1) {
      console.log('Clicking second brand item...');
      await brandItems.nth(1).click();
      await page.waitForTimeout(600);

      const activePath2 = path.join(ARTIFACT_DIR, 'brand_aurora_second_active.png');
      await page.screenshot({ path: activePath2 });
      console.log('Second brand active screenshot saved to:', activePath2);
    }
  }

  await browser.close();
  console.log('Live verification finished successfully.');
}

verifyBrandAuroraLive().catch(console.error);
