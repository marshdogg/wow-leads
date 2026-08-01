import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // The suite writes to the same database the app reads, so it runs serially
  // from a freshly seeded state rather than in parallel against shared rows.
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  // Never against loopback: there a failure means something and a retry would
  // hide it. Once against a deployed target, where a dropped navigation
  // (net::ERR_ABORTED) is the internet rather than the product — retrying is
  // what a person would do, and a test that fails twice is a real failure.
  //
  // Keyed on the target rather than on the variable being set: pointing
  // PLAYWRIGHT_BASE_URL at localhost was still switching retries on, which is
  // the opposite of what this comment claimed.
  retries: /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(baseURL) ? 0 : 1,
  timeout: 90_000,
  // Observed Neon latency on this project swings from ~17s for the whole
  // suite to several minutes for the same run. The assertions are right; the
  // database is sometimes slow. A 15s budget turned that into false failures.
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `pnpm build && pnpm start -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
