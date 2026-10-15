import { chromium } from '@playwright/test';
import crypto from 'node:crypto';
import pg from 'pg';
import { requireIsolatedTestDatabase } from '../test-database-guard.mjs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';
let TEST_DATABASE_URL = null;
try {
  TEST_DATABASE_URL = requireIsolatedTestDatabase(
    process.env.TEST_DATABASE_URL,
    process.env.DATABASE_URL,
  ).href;
} catch (error) {
  console.warn('Skipping admin-session injection; an isolated TEST_DATABASE_URL is required:', error.message);
}

async function createAdminSession() {
  if (!TEST_DATABASE_URL) throw new Error('An isolated TEST_DATABASE_URL is required to create an admin session.');
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query("SELECT id, email FROM auth_usr.users WHERE role IN ('super_admin', 'admin') LIMIT 1");
    if (!res.rows.length) throw new Error('No admin user found');
    const admin = res.rows[0];
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const now = new Date().toISOString();

    await client.query(
      'INSERT INTO auth_usr.sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)',
      [tokenHash, admin.id, expiresAt, now]
    );
    return { token: rawToken, email: admin.email };
  } finally {
    await client.end();
  }
}

export async function runRuntimeCrawler({
  locales = ['en', 'zh-CN', 'ja-JP', 'ko-KR', 'zh-TW', 'es'],
  maxRoutes = 10,
} = {}) {
  console.log('--- Starting Playwright Runtime i18n Crawler ---');
  let session = null;
  try {
    session = await createAdminSession();
    console.log(`✓ Admin session created for: ${session.email}`);
  } catch (e) {
    console.warn('Could not create admin session (proceeding anonymously):', e.message);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
  });

  const baseHostname = new URL(BASE_URL).hostname;

  if (session) {
    await context.addCookies([
      {
        name: 'ko_session',
        value: session.token,
        domain: baseHostname,
        path: '/',
      },
    ]);
  }

  const routesToTest = [
    '/studio',
    '/pricing',
    '/community',
    '/creations',
    '/admin',
    '/admin/i18n',
  ];

  const results = {
    testedAt: new Date().toISOString(),
    localesTested: locales,
    routesTested: [],
    consoleErrors: [],
    i18nWarnings: [],
    extractedTextsCount: 0,
  };

  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' && !text.includes('favicon') && !text.includes('socket') && !text.includes('localStorage')) {
      results.consoleErrors.push({ url: page.url(), message: text });
    }
    if (/missing|i18n|translation|undefined/i.test(text)) {
      results.i18nWarnings.push({ url: page.url(), message: text });
    }
  });

  for (const locale of locales) {
    console.log(`\nTesting Locale: ${locale}`);
    await context.addCookies([
      {
        name: 'NEXT_LOCALE',
        value: locale,
        domain: baseHostname,
        path: '/',
      },
      {
        name: 'locale',
        value: locale,
        domain: baseHostname,
        path: '/',
      },
    ]);

    const studioPrefix = locale === 'en' ? '' : (locale === 'zh-CN' ? '/zh' : (locale === 'es' ? '/es' : `/${locale}`));

    for (const route of routesToTest.slice(0, maxRoutes)) {
      const fullUrl = route.startsWith('/studio') ? `${studioPrefix}${route}` : route;
      console.log(`  Navigating to: ${fullUrl} [locale=${locale}]`);

      try {
        const response = await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(800);

        const status = response?.status() || 0;
        const visibleTexts = await page.evaluate(() => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const texts = [];
          let node;
          while ((node = walker.nextNode())) {
            const val = node.nodeValue?.trim();
            if (val && val.length > 1 && !/^[0-9\s:.,+-]+$/.test(val)) {
              texts.push(val);
            }
          }
          return texts;
        });

        results.extractedTextsCount += visibleTexts.length;
        results.routesTested.push({
          locale,
          route: fullUrl,
          status,
          textsCount: visibleTexts.length,
          sampleTexts: visibleTexts.slice(0, 5),
        });

        console.log(`    ✓ Status: ${status}, Visible texts: ${visibleTexts.length}`);
      } catch (err) {
        console.warn(`    ⚠ Failed to load ${fullUrl}:`, err.message);
        results.routesTested.push({
          locale,
          route: fullUrl,
          error: err.message,
        });
      }
    }
  }

  await browser.close();
  console.log('\n--- Runtime Crawler Completed ---');
  console.log(`Total Routes Tested: ${results.routesTested.length}`);
  if (results.consoleErrors.length > 0) {
    console.log('Console Errors Sample:', results.consoleErrors.slice(0, 10));
  }
  if (results.i18nWarnings.length > 0) {
    console.log('i18n Warnings Sample:', results.i18nWarnings.slice(0, 10));
  }

  return results;
}

if (process.argv[1] && process.argv[1].endsWith('runtime-crawler.mjs')) {
  runRuntimeCrawler().catch(console.error);
}
