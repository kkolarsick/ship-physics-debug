import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
