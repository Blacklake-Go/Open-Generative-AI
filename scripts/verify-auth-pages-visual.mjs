import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const ARTIFACT_DIR = '/Users/seelucency/.gemini/antigravity/brain/659f56a3-3a13-4f83-adae-205a3c19e988';
const BASE_URL = process.env.BASE_URL || 'https://www.supdance.com';

async function runVisualAudit() {
  console.log('🚀 启动视觉与交互全量检查...');

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
  const results = [];

  const pagesToTest = [
    {
      name: 'zh_login',
      url: `${BASE_URL}/zh/login`,
      expectedTitle: '创作者账号登录',
      screenshotName: 'auth_zh_login.png',
      testInteractions: async () => {
        // Test switching to phone tab
        const phoneTab = page.locator('button', { hasText: '手机快捷登录' });
        await phoneTab.click();
        await page.waitForTimeout(300);
        const hasPhoneInput = await page.locator('input[type="tel"]').isVisible();
        
        // Test switching back to email tab
        const emailTab = page.locator('button', { hasText: '邮箱登录' });
        await emailTab.click();
        await page.waitForTimeout(300);
        const hasEmailInput = await page.locator('input[type="email"]').isVisible();

        return { hasPhoneInput, hasEmailInput };
      },
    },
    {
      name: 'zh_register',
      url: `${BASE_URL}/zh/register`,
      expectedTitle: '创建创作者账号',
      screenshotName: 'auth_zh_register.png',
      testInteractions: async () => {
        const hasCodeInput = await page.locator('input[placeholder*="验证码"]').isVisible();
        const hasInviteInput = await page.locator('input[placeholder*="邀请码"]').isVisible();
        const hasAgreement = await page.locator('#agreement').isVisible();
        return { hasCodeInput, hasInviteInput, hasAgreement };
      },
    },
    {
      name: 'zh_forgot_password',
      url: `${BASE_URL}/zh/forgot-password`,
      expectedTitle: '找回密码与账号',
      screenshotName: 'auth_zh_forgot_password.png',
      testInteractions: async () => {
        const usernameTab = page.locator('button', { hasText: '找回账号信息' });
        await usernameTab.click();
        await page.waitForTimeout(300);
        const passwordTab = page.locator('button', { hasText: '重置登录密码' });
        await passwordTab.click();
        await page.waitForTimeout(300);
        return { tabsSwitched: true };
      },
    },
    {
      name: 'zh_change_password',
      url: `${BASE_URL}/zh/change-password`,
      expectedTitle: '修改密码',
      screenshotName: 'auth_zh_change_password.png',
      testInteractions: async () => {
        // Without auth session, should show sign-in required card
        const hasPrompt = await page.locator('text=需要登录创作者账号').isVisible();
        const hasLoginBtn = await page.locator('a', { hasText: '立即登录' }).isVisible();
        return { hasPrompt, hasLoginBtn };
      },
    },
    {
      name: 'en_login',
      url: `${BASE_URL}/login`,
      expectedTitle: 'Creator Account Login',
      screenshotName: 'auth_en_login.png',
    },
    {
      name: 'en_register',
      url: `${BASE_URL}/register`,
      expectedTitle: 'Create Creator Account',
      screenshotName: 'auth_en_register.png',
    },
    {
      name: 'en_forgot_password',
      url: `${BASE_URL}/forgot-password`,
      expectedTitle: 'Reset Password & Account',
      screenshotName: 'auth_en_forgot_password.png',
    },
    {
      name: 'en_change_password',
      url: `${BASE_URL}/change-password`,
      expectedTitle: 'Change Password',
      screenshotName: 'auth_en_change_password.png',
    },
  ];

  for (const item of pagesToTest) {
    console.log(`\n--- 测试页面: ${item.url} ---`);
    const response = await page.goto(item.url, { waitUntil: 'networkidle', timeout: 30000 });
    const status = response.status();
    console.log(`HTTP Status: ${status}`);

    const title = await page.title();
    console.log(`Page Title: ${title}`);

    // Click safety check: check that main card accepts pointer events
    const isClickSafe = await page.evaluate(() => {
      const card = document.querySelector('main > div > div');
      if (!card) return false;
      const rect = card.getBoundingClientRect();
      const el = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return card.contains(el);
    });
    console.log(`Click & Pointer Safety: ${isClickSafe ? 'PASS' : 'WARN'}`);

    let interactionResult = null;
    if (item.testInteractions) {
      try {
        interactionResult = await item.testInteractions();
        console.log(`Interactive actions result:`, interactionResult);
      } catch (err) {
        console.error(`Interaction error:`, err.message);
      }
    }

    const screenshotPath = path.join(ARTIFACT_DIR, item.screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`📸 截图已保存至: ${screenshotPath}`);

    results.push({
      page: item.name,
      url: item.url,
      status,
      title,
      isClickSafe,
      interactionResult,
      screenshot: screenshotPath,
    });
  }

  // Also test mobile view for /zh/login
  console.log(`\n--- 测试移动端视图 (390x844): ${BASE_URL}/zh/login ---`);
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    locale: 'zh-CN',
    deviceScaleFactor: 2,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE_URL}/zh/login`, { waitUntil: 'networkidle' });
  const mobileScreenshotPath = path.join(ARTIFACT_DIR, 'auth_mobile_zh_login.png');
  await mobilePage.screenshot({ path: mobileScreenshotPath, fullPage: false });
  console.log(`📸 移动端截图已保存至: ${mobileScreenshotPath}`);

  await mobileContext.close();
  await browser.close();

  console.log('\n✅ 全量视觉检查执行完毕！汇总:');
  console.table(results.map(r => ({ page: r.page, status: r.status, isClickSafe: r.isClickSafe })));
}

runVisualAudit().catch((err) => {
  console.error('Visual audit failed:', err);
  process.exit(1);
});
