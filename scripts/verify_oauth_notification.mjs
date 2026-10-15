import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = '/Users/seelucency/.gemini/antigravity/brain/9d94f305-b637-416d-919d-e7d4ff045a3d';
const BASE_URL = 'https://www.Supdance.com';

async function main() {
  console.log('Testing OAuth notification and URL cleanup on production...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Test 1: Visit /studio with auth=success (simulating redirect return from third-party login)
  console.log('1. Navigating to /studio?auth=success&provider=google...');
  await page.goto(`${BASE_URL}/studio?auth=success&provider=google`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Check URL cleanup
  const currentUrl = page.url();
  console.log('Current URL after cleanup:', currentUrl);
  const hasAuthParam = currentUrl.includes('auth=');
  console.log('Has auth param in URL:', hasAuthParam);

  // Check notification container
  const notifications = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-notification-type]'));
    return cards.map(c => {
      const btns = Array.from(c.querySelectorAll('button')).map(b => b.innerText.trim());
      const hasOpen = btns.some(t => t.includes('打开') || t.includes('Open'));
      return {
        text: c.innerText.replace(/\n+/g, ' '),
        hasOpenBtn: hasOpen,
        buttons: btns
      };
    });
  });
  console.log('Detected notification cards:', JSON.stringify(notifications, null, 2));

  // Take screenshot of notification
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'verified_oauth_toast_fixed.png')
  });

  // Test 2: Verify BroadcastChannel multi-event deduplication
  console.log('2. Simulating rapid duplicate BroadcastChannel and Storage events...');
  const cardCount = await page.evaluate(async () => {
    // Dispatch duplicate events
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('supdance_auth_channel');
      bc.postMessage({ type: 'supdance-auth-complete', ok: true, provider: 'google' });
      bc.postMessage({ type: 'supdance-auth-complete', ok: true, provider: 'google' });
    }
    // Wait 500ms
    await new Promise(r => setTimeout(r, 600));
    const cards = document.querySelectorAll('[data-notification-type]');
    return cards.length;
  });
  console.log('Cards count after rapid duplicate events:', cardCount);

  await browser.close();
  console.log('Verification finished successfully!');
}

main().catch(err => {
  console.error('Error in verification:', err);
  process.exit(1);
});
