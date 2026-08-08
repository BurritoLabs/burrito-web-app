import { defineConfig } from "@playwright/test"

const e2ePort = process.env.BURRITO_E2E_PORT || "4173"
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: /production-smoke\.spec\.ts/,
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium-desktop",
      testIgnore: [/production-smoke\.spec\.ts/, /mobile-layout\.spec\.ts/],
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: "chromium-mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true
      }
    }
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: `${e2eBaseUrl}/market`,
    env: {
      VITE_BURRITO_REGISTRY_API_URL: "/__registry-test"
    },
    reuseExistingServer: false,
    timeout: 120_000
  }
})
