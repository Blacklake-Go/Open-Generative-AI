import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  const sessionToken = 'lM-f8uOHIqBGMevwWv6li7ruy1vHqe2h44RnzldE9k8';
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });

  await context.addCookies([
    {
      name: 'ko_session',
      value: sessionToken,
      domain: 'www.supdance.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();

  console.log('--- 1. Testing /admin/system/login?category=social ---');
  const res = await page.goto('https://www.supdance.com/admin/system/login?category=social', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  console.log('Status code:', res.status());

  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/admin_social_login_mainland.png', fullPage: true });
  console.log('Saved /tmp/admin_social_login_mainland.png');

  // Check channel titles
  const channelTitles = await page.$$eval('h3', els => els.map(e => e.innerText.trim()).filter(Boolean));
  console.log('Rendered cards on mainland tab:', channelTitles);

  // Check "配置密钥 / 轮换" buttons
  const configButtons = await page.$$eval('button:has-text("配置密钥 / 轮换")', els => els.length);
  console.log('Count of "配置密钥 / 轮换" buttons:', configButtons);

  // Click first "配置密钥 / 轮换" button to test modal opening
  const firstConfigBtn = await page.$('button:has-text("配置密钥 / 轮换")');
  if (firstConfigBtn) {
    console.log('Clicking "配置密钥 / 轮换" button...');
    await firstConfigBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/admin_social_login_modal_open.png' });
    console.log('Saved /tmp/admin_social_login_modal_open.png');

    const modalTitle = await page.textContent('div[role="dialog"] h4');
    console.log('Credentials modal title:', modalTitle);

    // Close modal
    const closeBtn = await page.$('div[role="dialog"] button[aria-label="关闭"]');
    if (closeBtn) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // Switch to overseas tab
  console.log('--- 2. Switching to 海外渠道 tab ---');
  const overseasTab = await page.$('button[role="radio"]:has-text("海外渠道")');
  if (overseasTab) {
    await overseasTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/admin_social_login_international.png', fullPage: true });
    console.log('Saved /tmp/admin_social_login_international.png');

    const overseasCards = await page.$$eval('h3', els => els.map(e => e.innerText.trim()).filter(Boolean));
    console.log('Rendered cards on overseas tab:', overseasCards);
  }

  // Test legacy redirect: /admin/providers/social
  console.log('--- 3. Testing legacy redirect: /admin/providers/social ---');
  const redirRes = await page.goto('https://www.supdance.com/admin/providers/social', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  console.log('Redirect landing URL:', page.url());
  console.log('Landing status code:', redirRes.status());
  await page.screenshot({ path: '/tmp/admin_social_legacy_redirect.png', fullPage: true });
  console.log('Saved /tmp/admin_social_legacy_redirect.png');

  await browser.close();
  console.log('✅ All verification steps completed successfully!');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
