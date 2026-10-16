import { chromium } from 'playwright';

async function run() {
  console.log('🚀 Starting Instagram login configuration & UI flow verification...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  const sessionToken = 'insta_admin_test_session_token_123';
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
    {
      name: 'ko_social_region',
      value: 'international',
      domain: 'www.supdance.com',
      path: '/',
      secure: true,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();

  // 1. Visit Admin Social Login page
  console.log('\n--- 1. Testing /admin/system/login?category=social ---');
  const adminRes = await page.goto('https://www.supdance.com/admin/system/login?category=social', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  console.log('Admin Page Status:', adminRes.status());

  // Click overseas tab
  console.log('Switching to 海外渠道 tab...');
  const overseasTab = await page.$('button[role="radio"]:has-text("海外渠道")');
  if (overseasTab) {
    await overseasTab.click();
    await page.waitForTimeout(1500);
  }

  await page.screenshot({ path: '/tmp/instagram_admin_backend.png', fullPage: true });
  console.log('📸 Saved /tmp/instagram_admin_backend.png');

  // Verify Instagram Card content in admin
  const cardTexts = await page.$$eval('div', els =>
    els.filter(e => e.innerText && e.innerText.includes('Instagram 登录')).map(e => e.innerText)
  );
  console.log('Found Instagram card matches:', cardTexts.length > 0 ? 'YES' : 'NO');

  // 2. Visit Frontend Login page with international region
  console.log('\n--- 2. Testing /login page with international social providers ---');
  const loginRes = await page.goto('https://www.supdance.com/login?region=international', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  console.log('Login Page Status:', loginRes.status());
  await page.waitForTimeout(2000);

  // Check if Instagram button exists
  const instaButton = await page.$('button:has-text("Instagram")');
  if (!instaButton) {
    // If on mainland mode, toggle to overseas
    const toggleBtn = await page.$('button:has-text("切换为海外快捷登录")');
    if (toggleBtn) {
      console.log('Clicking toggle to overseas...');
      await toggleBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  const buttons = await page.$$eval('button', els => els.map(e => e.innerText.trim()).filter(Boolean));
  console.log('Login buttons found:', buttons.filter(b => b.includes('Google') || b.includes('Instagram') || b.includes('TikTok') || b.includes('X') || b.includes('微信') || b.includes('QQ')));

  await page.screenshot({ path: '/tmp/instagram_login_button.png' });
  console.log('📸 Saved /tmp/instagram_login_button.png');

  // 3. Test clicking Instagram button and verifying OAuth redirection
  console.log('\n--- 3. Testing Instagram OAuth Trigger ---');
  const targetBtn = await page.$('button:has-text("Instagram")');
  if (!targetBtn) {
    throw new Error('Instagram login button was not found on /login page!');
  }

  console.log('Clicking Instagram login button...');
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 15000 }).catch(() => null),
    targetBtn.click(),
  ]);

  if (popup) {
    console.log('Popup opened! Waiting for navigation to Instagram...');
    try {
      await popup.waitForURL(url => url.hostname.includes('instagram.com'), { timeout: 15000 });
      console.log('Popup URL:', popup.url());
      await popup.waitForTimeout(3000);
      await popup.screenshot({ path: '/tmp/instagram_oauth_popup.png' });
      console.log('📸 Saved /tmp/instagram_oauth_popup.png');
    } catch (e) {
      console.log('Popup current URL:', popup.url());
      await popup.screenshot({ path: '/tmp/instagram_oauth_popup.png' });
    }
  } else {
    console.log('No popup event, checking current page URL...');
    console.log('Page URL:', page.url());
  }

  await browser.close();
  console.log('\n✅ Verification script finished successfully!');
}

run().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
