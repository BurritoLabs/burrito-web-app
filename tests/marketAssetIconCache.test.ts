import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearFailedMarketIconCacheForTests,
  getFailedMarketIconCacheSizeForTests,
  isFailedMarketIcon,
  nextAvailableMarketIconIndex,
  rememberFailedMarketIcon
} from "../src/pages/market/marketAssetIconCache"

describe("market asset icon failure cache", () => {
  afterEach(() => {
    clearFailedMarketIconCacheForTests()
    vi.restoreAllMocks()
  })

  it("allows a recovered source to retry after five minutes", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    rememberFailedMarketIcon("https://tokens.example/temporary.svg")
    expect(isFailedMarketIcon("https://tokens.example/temporary.svg")).toBe(true)
    now.mockReturnValue(301000)
    expect(isFailedMarketIcon("https://tokens.example/temporary.svg")).toBe(false)
  })

  it("skips failed remote candidates but preserves local identity fallbacks", () => {
    const brokenLogo = "https://tokens.example/logo.svg"
    rememberFailedMarketIcon(brokenLogo)

    expect(
      nextAvailableMarketIconIndex([brokenLogo, "/system/cw20.svg", "data:image/svg+xml,x"])
    ).toBe(1)
  })

  it("keeps failed-source memory bounded to the most recent 128 remote URLs", () => {
    for (let index = 0; index < 129; index += 1) {
      rememberFailedMarketIcon(`https://tokens.example/${index}.svg`)
    }

    expect(getFailedMarketIconCacheSizeForTests()).toBe(128)
    expect(isFailedMarketIcon("https://tokens.example/0.svg")).toBe(false)
    expect(isFailedMarketIcon("https://tokens.example/128.svg")).toBe(true)
  })

  it("does not put local system and generated fallbacks into the remote cache", () => {
    rememberFailedMarketIcon("/system/cw20.svg")
    rememberFailedMarketIcon("data:image/svg+xml,placeholder")

    expect(getFailedMarketIconCacheSizeForTests()).toBe(0)
  })
})
