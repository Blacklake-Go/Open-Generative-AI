import { chromium } from 'playwright';
import path from 'path';

async function testAuthModalLocal() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  console.log('Navigating to local studio with auth=login...');
  await page.goto('http://localhost:3000/zh/studio?auth=login', { waitUntil: 'networkidle', timeout: 30000 });

  // Ensure modal is open by dispatching event if not already visible
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'login' } }));
  });
  await page.waitForTimeout(1000);

  const modalSelector = '[role="dialog"]';
  await page.waitForSelector(modalSelector, { timeout: 5000 });

  const artifactDir = '/Users/seelucency/.gemini/antigravity/brain/ae53f90d-a774-485b-b258-ddfc49577925';

  const loginScreenshot = path.join(artifactDir, 'auth_modal_fixed_login.png');
  await page.screenshot({ path: loginScreenshot, fullPage: false });
  console.log(`Saved login screenshot to: ${loginScreenshot}`);

  // Test switching to Register mode
  console.log('Switching to Register mode via "立即免费注册"...');
  await page.click('button:has-text("立即免费注册")');
  await page.waitForTimeout(600);
  const registerScreenshot = path.join(artifactDir, 'auth_modal_fixed_register.png');
  await page.screenshot({ path: registerScreenshot, fullPage: false });
  console.log(`Saved register screenshot to: ${registerScreenshot}`);

  // Switch back to Login
  console.log('Switching back to Login mode via "立即登录"...');
  await page.click('button:has-text("立即登录")');
  await page.waitForTimeout(600);

  // Test switching to Forgot Password mode
  console.log('Switching to Forgot Password mode via "忘记密码？"...');
  await page.click('button:has-text("忘记密码")');
  await page.waitForTimeout(600);
  const forgotScreenshot = path.join(artifactDir, 'auth_modal_fixed_forgot.png');
  await page.screenshot({ path: forgotScreenshot, fullPage: false });
  console.log(`Saved forgot password screenshot to: ${forgotScreenshot}`);

  await browser.close();
}

testAuthModalLocal().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
