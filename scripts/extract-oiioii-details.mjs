import { chromium } from 'playwright';
import fs from 'node:fs';

async function run() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  console.log('Navigating to https://www.oiioii.tv/zh/price...');
  await page.goto('https://www.oiioii.tv/zh/price', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Extract relevant CSS rules from stylesheets
  const cssRules = await page.evaluate(() => {
    const rules = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          const cssText = rule.cssText;
          if (
            cssText.includes('_plan-column') ||
            cssText.includes('_buy-bento') ||
            cssText.includes('_billing-segment') ||
            cssText.includes('_model-discount-badge') ||
            cssText.includes('border-shine') ||
            cssText.includes('neon') ||
            cssText.includes('gradient') ||
            cssText.includes('scale') ||
            cssText.includes('transition')
          ) {
            rules.push(cssText);
          }
        }
      } catch (e) {}
    }
    return rules;
  });

  fs.writeFileSync('scripts/oiioii_css_rules.txt', cssRules.join('\n\n'));
  console.log(`Saved ${cssRules.length} matching CSS rules.`);

  // Let's also test hovering on the cards and the "订阅" buttons, and clicking the billing toggle (年付/月付/季付)
  // Let's take screenshot before and during hover
  await page.screenshot({ path: 'scripts/oiioii_before_hover.png' });

  // Hover over the 4th card (APEX)
  const apexCard = await page.$('._plan-column_acg4m_1299:nth-child(4), ._plan-column-upgrade-btn-last_acg4m_1871');
  if (apexCard) {
    await apexCard.hover();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'scripts/oiioii_apex_hover.png' });
  }

  // Hover over "订阅" button
  const upgradeBtn = await page.$('._plan-column-upgrade-btn-last_acg4m_1871');
  if (upgradeBtn) {
    await upgradeBtn.hover();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'scripts/oiioii_btn_hover.png' });
  }

  // Click on "月付" toggle
  const monthBtn = await page.$('button:has-text("月付")');
  if (monthBtn) {
    console.log('Clicking 月付 toggle...');
    await monthBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'scripts/oiioii_month_view.png' });
  }

  // Click on "季付" toggle if exists
  const quarterBtn = await page.$('button:has-text("季付")');
  if (quarterBtn) {
    console.log('Clicking 季付 toggle...');
    await quarterBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'scripts/oiioii_quarter_view.png' });
  }

  // Click on "年付" toggle back
  const yearBtn = await page.$('button:has-text("年付")');
  if (yearBtn) {
    console.log('Clicking 年付 toggle...');
    await yearBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'scripts/oiioii_year_view.png' });
  }

  // Click on "订阅" button on APEX or STAR to see what happens (does a modal open? does payment pop up?)
  if (upgradeBtn) {
    console.log('Clicking APEX 订阅 button...');
    await upgradeBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'scripts/oiioii_after_click_upgrade.png' });
  }

  await browser.close();
  console.log('Done!');
}

run().catch((err) => {
  console.error('Error running script:', err);
  process.exit(1);
});
