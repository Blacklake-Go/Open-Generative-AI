import { chromium } from 'playwright';
import path from 'path';

async function captureAuthModal() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  console.log('Navigating to live studio with auth=login...');
  try {
    await page.goto('https://www.Supdance.com/zh/studio?auth=login', { waitUntil: 'networkidle', timeout: 30000 });
  } catch (err) {
    console.log('Navigation warning:', err.message);
  }

  // Ensure modal is open by dispatching event if not already visible
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'login' } }));
  });
  await page.waitForTimeout(1000);

  // Wait for auth modal container
  const modalSelector = '[role="dialog"], div.fixed.inset-0.z-overlay';
  try {
    await page.waitForSelector(modalSelector, { timeout: 5000 });
  } catch (e) {
    console.log('Selector wait failed, proceeding anyway...');
  }

  const screenshotPath = '/Users/seelucency/.gemini/antigravity/brain/659f56a3-3a13-4f83-adae-205a3c19e988/auth_modal_new_design.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Saved screenshot to: ${screenshotPath}`);

  // Test switching to "注册" tab
  console.log('Switching to Register tab...');
  await page.click('button:has-text("注册")');
  await page.waitForTimeout(600);
  const registerScreenshotPath = '/Users/seelucency/.gemini/antigravity/brain/659f56a3-3a13-4f83-adae-205a3c19e988/auth_modal_register.png';
  await page.screenshot({ path: registerScreenshotPath, fullPage: false });
  console.log(`Saved screenshot to: ${registerScreenshotPath}`);

  // Test switching to "找回密码" tab
  console.log('Switching to Forgot Password tab...');
  await page.click('button:has-text("找回密码")');
  await page.waitForTimeout(600);
  const forgotScreenshotPath = '/Users/seelucency/.gemini/antigravity/brain/659f56a3-3a13-4f83-adae-205a3c19e988/auth_modal_forgot.png';
  await page.screenshot({ path: forgotScreenshotPath, fullPage: false });
  console.log(`Saved screenshot to: ${forgotScreenshotPath}`);

  await browser.close();
}


captureAuthModal().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});

