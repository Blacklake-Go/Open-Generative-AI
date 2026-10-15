import { defineConfig, devices } from '@playwright/test';

const appBaseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs$/,
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: appBaseUrl,
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
