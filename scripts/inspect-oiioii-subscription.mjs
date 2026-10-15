import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

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

  console.log('Navigating to https://www.oiioii.tv/zh/...');
  try {
    await page.goto('https://www.oiioii.tv/zh/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log('Direct goto failed, trying /zh/price...', e.message);
  }

  // Look for subscription / price links or buttons
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'scripts/oiioii_home.png', fullPage: false });

  // Try to find "订阅" button or link
  const subBtn = await page.$('text="订阅"');
  if (subBtn) {
    console.log('Found 订阅 button on home page! Clicking it...');
    await subBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'scripts/oiioii_after_click_sub.png', fullPage: false });
  } else {
    console.log('Navigating directly to https://www.oiioii.tv/zh/price...');
    await page.goto('https://www.oiioii.tv/zh/price', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'scripts/oiioii_price_page.png', fullPage: false });
  }

  // Extract cards, styles, classes, and animations
  const details = await page.evaluate(() => {
    const results = {
      title: document.title,
      buttons: [],
      cards: [],
      toggles: [],
      keyframes: [],
    };

    // Find style rules for animations
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.type === CSSRule.KEYFRAMES_RULE) {
            results.keyframes.push(rule.name);
          }
        }
      } catch (e) {}
    }

    // Inspect buttons with "订阅"
    document.querySelectorAll('button, a').forEach((el) => {
      const text = el.innerText?.trim();
      if (text && (text.includes('订阅') || text.includes('年付') || text.includes('月付'))) {
        const style = window.getComputedStyle(el);
        results.buttons.push({
          text,
          tagName: el.tagName,
          className: el.className,
          bg: style.backgroundColor,
          color: style.color,
          border: style.border,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          transition: style.transition,
          transform: style.transform,
        });
      }
    });

    // Inspect pricing cards
    const cardCandidates = Array.from(document.querySelectorAll('div')).filter(el => {
      const text = el.innerText || '';
      return (text.includes('BASE') || text.includes('STAR') || text.includes('PRO') || text.includes('APEX')) &&
             (text.includes('¥') || text.includes('盒饭') || text.includes('算力'));
    });

    cardCandidates.slice(0, 10).forEach(el => {
      const style = window.getComputedStyle(el);
      results.cards.push({
        textSnippet: el.innerText.slice(0, 120),
        className: el.className,
        bg: style.backgroundColor,
        border: style.border,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        outline: style.outline,
        padding: style.padding,
      });
    });

    return results;
  });

  fs.writeFileSync('scripts/oiioii_analysis.json', JSON.stringify(details, null, 2));
  console.log('Analysis saved to scripts/oiioii_analysis.json');

  await browser.close();
}

run().catch((err) => {
  console.error('Error running playwright script:', err);
  process.exit(1);
});
