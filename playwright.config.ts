import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    extraHTTPHeaders: {
      "oai-authenticated-user-id": "browser-owner",
      "oai-authenticated-user-email": "owner@example.com",
      "oai-authenticated-user-full-name": "Browser%20Owner",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    // Reuse the installed Chrome on Windows; CI installs Playwright Chromium.
    channel: process.env.CI ? undefined : "chrome",
  },
  webServer: {
    command: "pnpm exec vinext dev -p 4173",
    // The protected homepage intentionally returns 404 without the owner
    // headers. Use a public compiled asset for server-readiness detection.
    url: "http://localhost:4173/app/globals.css",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      OWNER_EMAIL: "owner@example.com",
      APP_ENV: "test",
    },
  },
});
