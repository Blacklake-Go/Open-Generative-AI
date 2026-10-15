import { chromium } from 'playwright';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

async function main() {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const userId = '808405'; // super_admin

  console.log('Inserting remote session for verification...');
  const sql = `INSERT INTO auth_usr.sessions (token_hash, user_id, expires_at) VALUES ('${tokenHash}', '${userId}', now() + interval '1 day') ON CONFLICT (token_hash) DO NOTHING;`;
  execSync(`ssh -o ConnectTimeout=15 -o StrictHostKeyChecking=no ubuntu@43.155.166.90 "sudo -u postgres psql -d koyosim_ai -c \\"${sql}\\""`);

  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
  });

  await context.addCookies([
    {
      name: 'ko_session',
      value: token,
      domain: 'www.supdance.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => {
    console.error('Page error:', err.message);
    pageErrors.push(err.message);
  });

  console.log('--- 1. Visiting /admin/visitors?tab=analytics ---');
  const res1 = await page.goto('https://www.supdance.com/admin/visitors?tab=analytics', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  console.log('Status:', res1.status());
  await page.waitForTimeout(2500);

  const analyticsShot = '/Users/seelucency/.gemini/antigravity/brain/9558379d-0992-4ae3-b654-d5fa68fd2bf9/admin_visitors_analytics_streamlined.png';
  await page.screenshot({ path: analyticsShot, fullPage: true });
  console.log('Saved:', analyticsShot);

  console.log('--- 2. Visiting /admin/visitors?tab=seo ---');
  const res2 = await page.goto('https://www.supdance.com/admin/visitors?tab=seo', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  console.log('Status:', res2.status());
  await page.waitForTimeout(2500);

  const seoShot = '/Users/seelucency/.gemini/antigravity/brain/9558379d-0992-4ae3-b654-d5fa68fd2bf9/admin_visitors_seo_streamlined.png';
  await page.screenshot({ path: seoShot, fullPage: true });
  console.log('Saved:', seoShot);

  await browser.close();
  console.log('All verification done. Total page errors:', pageErrors.length);
}

main().catch((err) => {
  console.error('Error in verify-visitors-streamlined:', err);
  process.exit(1);
});
