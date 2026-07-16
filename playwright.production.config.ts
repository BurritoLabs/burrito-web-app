import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /production-smoke\.spec\.ts/,
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  expect: {
    timeout: 15_000
  },
  use: {
    baseURL: process.env.PRODUCTION_BASE_URL ?? "https://app.burrito.money",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "production-desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: "production-mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true
      }
    }
  ]
})
