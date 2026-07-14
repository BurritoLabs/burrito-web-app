import { describe, expect, it } from "vitest"
import { deriveUsdPriceGraphFromPools } from "../src/app/market/priceGraph"

describe("market price confidence graph", () => {
  it("carries the weakest seed-linked liquidity into derived prices", () => {
    const graph = deriveUsdPriceGraphFromPools({
      pools: [
        {
          pair: `terra1${"q".repeat(38)}`,
          dexId: "test",
          dexLabel: "Test",
          type: "xyk",
          poolAssets: [
            { id: "native:uluna", amount: "100000000" },
            { id: "cw20:terra1pppppppppppppppppppppppppppppppppppppp", amount: "100000000" }
          ]
        },
        {
          pair: `terra1${"r".repeat(38)}`,
          dexId: "test",
          dexLabel: "Test",
          type: "xyk",
          poolAssets: [
            { id: "cw20:terra1pppppppppppppppppppppppppppppppppppppp", amount: "1" },
            { id: "cw20:terra1ssssssssssssssssssssssssssssssssssssss", amount: "999999999999999999" }
          ]
        }
      ],
      seedAssetIds: ["native:uluna"],
      getDecimals: () => 6,
      getSeedUsdPrice: (_id, key) => (key === "uluna" ? 1 : undefined)
    })

    expect(graph.terra1pppppppppppppppppppppppppppppppppppppp.liquidity).toBe(200)
    expect(graph.terra1ssssssssssssssssssssssssssssssssssssss.liquidity).toBeLessThanOrEqual(200)
  })
})
