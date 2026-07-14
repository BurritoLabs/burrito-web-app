import { describe, expect, it } from "vitest"
import { mapVerifiedRegistryAssets } from "./tokenRegistry"

describe("mapVerifiedRegistryAssets", () => {
  it("maps verified CW20 and IBC assets into existing registry shapes", () => {
    const hash = "A".repeat(64)
    const contract = "terra15p8su45k45axng8ue59rl6zph4at27s49u3agr6uqrx3dhcxpg3qt0ekdt"
    const mapped = mapVerifiedRegistryAssets([
      {
        chainId: "columbus-5",
        type: "cw20",
        assetKey: contract,
        name: "DO",
        symbol: "DO",
        decimals: 6,
        logoUrl: "https://assets.terra.dev/do.png",
        verifiedAt: 1,
        updatedAt: 1
      },
      {
        chainId: "phoenix-1",
        type: "ibc",
        assetKey: `ibc/${hash}`,
        name: "Cosmos Hub",
        symbol: "ATOM",
        decimals: 6,
        logoUrl: null,
        baseDenom: "uatom",
        path: "transfer/channel-0",
        verifiedAt: 1,
        updatedAt: 1
      }
    ])

    expect(mapped.cw20[contract]?.name).toBe("DO")
    expect(mapped.ibc[hash]?.symbol).toBe("ATOM")
    expect(mapped.ibc[hash]?.base_denom).toBe("uatom")
    expect(mapped.ibc[hash]?.path).toBe("transfer/channel-0")
  })

  it("ignores malformed verified records", () => {
    const mapped = mapVerifiedRegistryAssets([
      {
        chainId: "phoenix-1",
        type: "ibc",
        assetKey: "ibc/not-a-hash",
        name: "Broken",
        symbol: "BROKEN",
        decimals: 6,
        logoUrl: null,
        verifiedAt: 1,
        updatedAt: 1
      }
    ])
    expect(mapped.ibc).toEqual({})
  })
})
