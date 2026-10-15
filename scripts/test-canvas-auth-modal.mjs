import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  console.log('Navigating to https://www.Supdance.com/canvas ...');
  await page.goto('https://www.Supdance.com/canvas', { waitUntil: 'networkidle', timeout: 30000 });

  await page.waitForTimeout(2000);

  // Take screenshot of Login mode
  await page.screenshot({ path: '/tmp/canvas_auth_modal_login.png', fullPage: true });
  console.log('Saved /tmp/canvas_auth_modal_login.png');

  // Check title
  const titleText = await page.textContent('#auth-modal-title');
  console.log('Modal title:', titleText);

  // Check social buttons
  const socialButtons = await page.$$eval('button[title*="登录"], button[title*="使用"]', els => els.map(e => ({
    title: e.getAttribute('title'),
    text: e.innerText.trim(),
  })));
  console.log('Social login buttons:', JSON.stringify(socialButtons));

  // Switch to register mode
  const registerLink = await page.$('button:has-text("立即免费注册")');
  if (registerLink) {
    await registerLink.click();
    await page.waitForTimeout(1000);
    const regTitle = await page.textContent('#auth-modal-title');
    console.log('Switched to register mode:', regTitle);
    await page.screenshot({ path: '/tmp/canvas_auth_modal_register.png', fullPage: true });
    console.log('Saved /tmp/canvas_auth_modal_register.png');
  }

  // Switch back to login, then to forgot password
  const loginLink = await page.$('button:has-text("立即登录")');
  if (loginLink) {
    await loginLink.click();
    await page.waitForTimeout(500);
    const forgotLink = await page.$('button:has-text("忘记密码？")');
    if (forgotLink) {
      await forgotLink.click();
      await page.waitForTimeout(1000);
      const forgotTitle = await page.textContent('#auth-modal-title');
      console.log('Switched to forgot mode:', forgotTitle);
      await page.screenshot({ path: '/tmp/canvas_auth_modal_forgot.png', fullPage: true });
      console.log('Saved /tmp/canvas_auth_modal_forgot.png');
    }
  }

  await browser.close();
  console.log('Done verification!');
}

run().catch((err) => {
  console.error('Error during test:', err);
  process.exit(1);
});
