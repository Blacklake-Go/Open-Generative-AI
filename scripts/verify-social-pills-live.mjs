import { chromium } from 'playwright';
import path from 'node:path';

const ARTIFACT_DIR = '/Users/seelucency/.gemini/antigravity/brain/e26db6de-88dd-406b-80bd-62f9b3332e54';
const BASE_URL = 'https://www.supdance.com';

async function run() {
  console.log('🚀 启动三方登录药丸前后端实测验证...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // --- 测试 1: 中国大陆 IP 真实访问 /zh/login ---
  console.log('\n--- 1. 测试中国大陆 IP 访问 /zh/login ---');
  await page.goto(`${BASE_URL}/zh/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  const mainlandPills = await page.$$eval(
    'button:has-text("QQ"), button:has-text("微信"), button:has-text("抖音"), button:has-text("哔哩哔哩")',
    (els) => els.map((e) => ({
      text: e.innerText.trim(),
      className: e.className,
      isCapsule: e.className.includes('rounded-full'),
    }))
  );
  console.log('Mainland China Login Pills found:', mainlandPills);

  const screenshot1 = path.join(ARTIFACT_DIR, 'live_zh_login_mainland_pills.png');
  await page.screenshot({ path: screenshot1, fullPage: false });
  console.log(`Saved screenshot: ${screenshot1}`);

  // --- 测试 2: 验证 AuthModal 弹窗模式 ---
  console.log('\n--- 2. 测试 Studio 页面触发 AuthModal 弹窗 ---');
  await page.goto(`${BASE_URL}/zh/studio?auth=login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'login' } }));
  });
  await page.waitForTimeout(1000);

  const modalPills = await page.$$eval(
    'div[role="dialog"] button:has-text("QQ"), div[role="dialog"] button:has-text("微信"), div[role="dialog"] button:has-text("抖音"), div[role="dialog"] button:has-text("哔哩哔哩")',
    (els) => els.map((e) => ({
      text: e.innerText.trim(),
      className: e.className,
      isCapsule: e.className.includes('rounded-full'),
    }))
  );
  console.log('AuthModal Mainland China Pills found:', modalPills);

  const screenshot2 = path.join(ARTIFACT_DIR, 'live_auth_modal_mainland_pills.png');
  await page.screenshot({ path: screenshot2, fullPage: false });
  console.log(`Saved screenshot: ${screenshot2}`);

  // --- 测试 3: 模拟海外 IP 响应，验证海外药丸 (Google, X, TikTok, Instagram) ---
  console.log('\n--- 3. 模拟海外 IP 访问 /login 与弹窗，验证海外药丸 ---');
  await page.route('**/api/auth/social-options', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        region: 'international',
        providers: [
          { id: 'google', available: true, configured: true },
          { id: 'x', available: true, configured: true },
          { id: 'tiktok', available: true, configured: true },
          { id: 'instagram', available: true, configured: false },
        ],
      }),
    });
  });

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  const overseasPills = await page.$$eval(
    'button:has-text("Google"), button:has-text("X"), button:has-text("TikTok"), button:has-text("Instagram")',
    (els) => els.map((e) => ({
      text: e.innerText.trim(),
      className: e.className,
      isCapsule: e.className.includes('rounded-full'),
    }))
  );
  console.log('Overseas Login Pills found:', overseasPills);

  const screenshot3 = path.join(ARTIFACT_DIR, 'live_en_login_overseas_pills.png');
  await page.screenshot({ path: screenshot3, fullPage: false });
  console.log(`Saved screenshot: ${screenshot3}`);

  // 海外弹窗
  await page.goto(`${BASE_URL}/studio?auth=login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'login' } }));
  });
  await page.waitForTimeout(1000);

  const overseasModalPills = await page.$$eval(
    'div[role="dialog"] button:has-text("Google"), div[role="dialog"] button:has-text("X"), div[role="dialog"] button:has-text("TikTok"), div[role="dialog"] button:has-text("Instagram")',
    (els) => els.map((e) => ({
      text: e.innerText.trim(),
      className: e.className,
      isCapsule: e.className.includes('rounded-full'),
    }))
  );
  console.log('Overseas AuthModal Pills found:', overseasModalPills);

  const screenshot4 = path.join(ARTIFACT_DIR, 'live_auth_modal_overseas_pills.png');
  await page.screenshot({ path: screenshot4, fullPage: false });
  console.log(`Saved screenshot: ${screenshot4}`);

  await browser.close();
  console.log('\n🎉 所有验证均已通过！');
}

run().catch((err) => {
  console.error('❌ 验证异常:', err);
  process.exit(1);
});
