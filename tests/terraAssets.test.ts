import { describe, expect, it } from "vitest"
import { pickChainAssets } from "../src/app/data/terraAssets"

describe("Terra asset registry selection", () => {
  const registry = {
    mainnet: { token: "luna" },
    classic: { token: "lunc" },
    testnet: { token: "test" }
  }

  it("selects the Phoenix mainnet registry", () => {
    expect(pickChainAssets(registry, "Terra", "phoenix-1")).toEqual({
      token: "luna"
    })
  })

  it("selects the Terra Classic registry", () => {
    expect(pickChainAssets(registry, "Terra Classic", "columbus-5")).toEqual({
      token: "lunc"
    })
  })

  it("prefers an exact chain id key when one exists", () => {
    expect(
      pickChainAssets(
        { ...registry, "phoenix-1": { token: "exact" } },
        "Terra",
        "phoenix-1"
      )
    ).toEqual({ token: "exact" })
  })
})
