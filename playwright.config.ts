import { defineConfig } from "@playwright/test";

/**
 * The production server is managed externally:
 *   npm run build
 *   npm run start -- --port 3174
 * Then run npm run test:e2e. A deployed URL can be supplied via E2E_BASE_URL.
 * Installed Google Chrome is the default; set E2E_BROWSER_CHANNEL=chromium
 * when using Playwright's separately installed Chromium distribution instead.
 * Intentionally no webServer: these tests must not silently start next dev.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3174",
    browserName: "chromium",
    channel: process.env.E2E_BROWSER_CHANNEL || "chrome",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    serviceWorkers: "allow",
    acceptDownloads: true,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-chrome",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
