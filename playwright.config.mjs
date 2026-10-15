import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

import { requireIsolatedTestDatabase } from './scripts/test-database-guard.mjs';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const appPort = Number(process.env.E2E_PORT || 3100);
const appBaseUrl = process.env.E2E_BASE_URL || `http://127.0.0.1:${appPort}`;

// 浏览器用例只能跑在隔离库上：与业务库同库、或库名不带显式 test 后缀 → 直接拒绝启动。
const e2eDatabaseUrl = requireIsolatedTestDatabase(
  process.env.TEST_DATABASE_URL || '',
  process.env.DATABASE_URL || '',
);

process.env.E2E_BASE_URL = appBaseUrl;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.mjs$/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: '.playwright-artifacts/test-results',
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: '.playwright-artifacts/report' }]]
    : [['list']],
  use: {
    baseURL: appBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'npm run start',
    cwd: repoRoot,
    url: `${appBaseUrl}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'production',
      PORT: String(appPort),
      HOSTNAME: '127.0.0.1',
      DATABASE_URL: e2eDatabaseUrl.href,
      E2E_TEST_MODE: 'true',
      ALLOW_MOCK_GENERATION: 'true',
      E2E_SESSION_FILE: process.env.E2E_SESSION_FILE || 'e2e/.sessions.json',
    },
  },
});
