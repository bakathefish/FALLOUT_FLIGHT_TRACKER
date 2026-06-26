import { defineConfig, devices } from "@playwright/test";

// e2e runs against a real production build. the feed is mocked via the
// MOCK_ADSB env flag (see lib/adsb.ts) so tests never hit the real feeds.
export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // the feed is always mocked; the db + passcodes flow through from the
    // environment (CI provides a postgres service) so the write flows can run.
    env: {
      MOCK_ADSB: "1",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      DIRECT_URL: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
      WRITE_PASSCODE: process.env.WRITE_PASSCODE ?? "test-write",
      ADMIN_PASSCODE: process.env.ADMIN_PASSCODE ?? "test-admin",
      NEXT_PUBLIC_EVENT_NAME:
        process.env.NEXT_PUBLIC_EVENT_NAME ?? "Fallout 2026",
      NEXT_PUBLIC_EVENT_START_ISO:
        process.env.NEXT_PUBLIC_EVENT_START_ISO ?? "2026-07-01T00:00:00+08:00",
    },
  },
});
