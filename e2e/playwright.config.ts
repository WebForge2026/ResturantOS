import { defineConfig } from '@playwright/test';

/**
 * End-to-end acceptance tests against the LOCAL stack (Laravel :8000, Reverb :8080, QR :3000, Ops :5173).
 * Start everything first (see README). The suite resets nothing itself: run `php artisan noar:reset` before.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
});
