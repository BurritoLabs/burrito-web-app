import { defineConfig } from "vitest/config"

export default defineConfig({
  define: {
    __BURRITO_RELEASE__: JSON.stringify("test")
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"]
  }
})
