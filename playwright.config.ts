import { defineConfig, devices } from '@playwright/test';

/**
 * One happy-path E2E (brief §2). It runs against the seeded demo store, so it needs no
 * cloud account and asserts the same golden figures the unit tests do.
 *
 * PLAYWRIGHT_CHROMIUM_PATH lets a preinstalled browser be used where the sandbox ships a
 * different build than the pinned Playwright version.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run seed && npm run build && npm run start',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
