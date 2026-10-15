import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_NAV_GROUPS } from '../lib/admin/navigation.js';

const BASE_URL = 'http://127.0.0.1:3210';
const SESSION_TOKEN = process.env.SESSION_TOKEN || 'test-session-token';
const OUTPUT_DIR = path.resolve('outputs/admin-audit');

async function runAudit() {
  console.log('🔍 Launching deep browser audit with Chrome...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  await context.addCookies([
    {
      name: 'ko_session',
      value: SESSION_TOKEN,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();
  const consoleMessages = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleMessages.push({ type: 'error', text: msg.text() });
    }
  });

  const pageErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  const auditResults = [];

  const allItems = [];
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      allItems.push({ group: group.label, ...item });
    }
  }

  console.log(`📋 Total routes to audit: ${allItems.length}`);

  for (let idx = 0; idx < allItems.length; idx++) {
    const item = allItems[idx];
    const url = `${BASE_URL}${item.href}`;
    console.log(`\n[${idx + 1}/${allItems.length}] Auditing: ${item.group} -> ${item.label} (${item.href})`);

    const result = {
      href: item.href,
      label: item.label,
      group: item.group,
      status: null,
      clickableCount: 0,
      brokenLinks: [],
      deadButtons: [],
      hasHorizontalOverflow: false,
      screenshot: null,
    };

    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(500);
      result.status = resp ? resp.status() : 'TIMEOUT';

      // 1. Check page title/heading
      const heading = await page.$('h1, h2, [data-admin-page-title]');
      result.heading = heading ? (await heading.innerText()).trim() : 'NO_HEADING';

      // 2. Scan all clickable elements
      const clickables = await page.$$('a, button, input[type="button"], input[type="submit"]');
      result.clickableCount = clickables.length;

      // 3. Check for body horizontal overflow
      result.hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      // 4. Check links
      const links = await page.$$eval('a[href]', (anchors) =>
        anchors.map((a) => ({
          href: a.getAttribute('href'),
          text: a.innerText.trim(),
        }))
      );
      for (const link of links) {
        if (link.href === '#' || link.href === 'javascript:void(0)' || link.href === '') {
          result.brokenLinks.push(link);
        }
      }

      // 5. Check dead buttons (button without type=submit/reset and without any click handlers)
      const buttonIssues = await page.$$eval('button', (buttons) => {
        const issues = [];
        for (const btn of buttons) {
          const isSubmit = btn.type === 'submit' || btn.type === 'reset';
          const text = btn.innerText.trim();
          const hasAria = btn.getAttribute('aria-label');
          const disabled = btn.disabled;
          // check if inside a form
          const insideForm = !!btn.closest('form');
          if (!isSubmit && !insideForm && !disabled && !text && !hasAria && !btn.querySelector('svg')) {
            issues.push({ text: text || '(empty)', html: btn.outerHTML.slice(0, 100) });
          }
        }
        return issues;
      });
      result.deadButtons = buttonIssues;

      // 6. Capture screenshot for visual validation of key pages
      const safeName = item.href.replace(/\//g, '_').replace(/^_/, '');
      const screenshotPath = path.join(OUTPUT_DIR, `${safeName}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      result.screenshot = screenshotPath;

      console.log(`   ✅ Status: ${result.status}, Clickables: ${result.clickableCount}, Overflow: ${result.hasHorizontalOverflow}`);
    } catch (err) {
      console.log(`   ❌ Error during audit: ${err.message}`);
      result.status = 'ERROR';
      result.error = err.message;
    }

    auditResults.push(result);
  }

  await browser.close();

  // Summary
  console.log('\n================ AUDIT SUMMARY ================');
  const passed = auditResults.filter((r) => r.status === 200 && r.brokenLinks.length === 0 && r.deadButtons.length === 0 && !r.hasHorizontalOverflow);
  console.log(`Total Pages: ${auditResults.length}`);
  console.log(`Perfect Pages: ${passed.length}/${auditResults.length}`);
  console.log(`Console Errors: ${consoleMessages.length}`);
  console.log(`Page Errors: ${pageErrors.length}`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'audit-report.json'), JSON.stringify({
    timestamp: new Date().toISOString(),
    total: auditResults.length,
    passed: passed.length,
    consoleErrors: consoleMessages,
    pageErrors,
    results: auditResults,
  }, null, 2));

  console.log(`Report written to ${path.join(OUTPUT_DIR, 'audit-report.json')}`);

  if (passed.length !== auditResults.length || pageErrors.length > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
