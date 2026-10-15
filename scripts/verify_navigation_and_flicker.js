const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = '/Users/seelucency/.gemini/antigravity/brain/9d94f305-b637-416d-919d-e7d4ff045a3d';
const BASE_URL = process.env.BASE_URL || 'https://www.supdance.com';

async function main() {
  console.log(`Starting E2E Verification against ${BASE_URL}...`);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Test 1: Studio Page Inspection
  console.log('1. Loading /studio...');
  await page.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  const htmlStyles = await page.evaluate(() => {
    const html = document.documentElement;
    const computed = window.getComputedStyle(html);
    return {
      bgColor: computed.backgroundColor,
      scrollbarGutter: computed.scrollbarGutter
    };
  });
  console.log('HTML Styles:', htmlStyles);

  const headerDetails = await page.evaluate(() => {
    const header = document.querySelector('header');
    if (!header) return null;
    const rect = header.getBoundingClientRect();
    const style = window.getComputedStyle(header);
    return {
      tagName: header.tagName,
      height: rect.height,
      top: rect.top,
      position: style.position,
      zIndex: style.zIndex,
      className: header.className
    };
  });
  console.log('Studio Header Details:', headerDetails);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'verified_fixed_header_studio.png')
  });

  // Test 2: Hover over MegaMenu Trigger
  console.log('2. Testing MegaMenu Trigger hover...');
  const imageTrigger = page.locator('button:has-text("图像"), div:has-text("图像"), button:has-text("图像生成")').first();
  if (await imageTrigger.count() > 0) {
    await imageTrigger.hover();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'verified_megamenu_hover.png')
    });
    console.log('MegaMenu hovered successfully');
  }

  // Test 3: Community Page
  console.log('3. Loading /community...');
  await page.goto(`${BASE_URL}/community`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  const communityHeader = await page.evaluate(() => {
    const header = document.querySelector('header');
    if (!header) return null;
    const rect = header.getBoundingClientRect();
    const style = window.getComputedStyle(header);
    return {
      height: rect.height,
      top: rect.top,
      position: style.position,
      zIndex: style.zIndex
    };
  });
  console.log('Community Header Details:', communityHeader);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'verified_fixed_header_community.png')
  });

  // Test 4: Call API Page
  console.log('4. Loading /call-api...');
  await page.goto(`${BASE_URL}/call-api`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  const callApiHeader = await page.evaluate(() => {
    const header = document.querySelector('header');
    if (!header) return null;
    const rect = header.getBoundingClientRect();
    const style = window.getComputedStyle(header);
    return {
      height: rect.height,
      top: rect.top,
      position: style.position,
      zIndex: style.zIndex
    };
  });
  console.log('Call API Header Details:', callApiHeader);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'verified_fixed_header_call_api.png')
  });

  // Test 5: Credits Page
  console.log('5. Loading /credits...');
  await page.goto(`${BASE_URL}/credits`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  const creditsHeader = await page.evaluate(() => {
    const header = document.querySelector('header');
    if (!header) return null;
    const rect = header.getBoundingClientRect();
    const style = window.getComputedStyle(header);
    return {
      height: rect.height,
      top: rect.top,
      position: style.position,
      zIndex: style.zIndex
    };
  });
  console.log('Credits Header Details:', creditsHeader);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'verified_fixed_header_credits.png')
  });

  await browser.close();
  console.log('All E2E Verification steps completed successfully!');
}

main().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
