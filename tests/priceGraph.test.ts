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

  it("does not derive prices from concentrated pool reserve ratios", () => {
    const graph = deriveUsdPriceGraphFromPools({
      pools: [
        {
          pair: `terra1${"c".repeat(38)}`,
          dexId: "astroport",
          dexLabel: "Astroport",
          type: "concentrated",
          poolAssets: [
            { id: "native:uluna", amount: "100000000" },
            {
              id: "native:ibc/2C962DAB9F57FE0921435426AE75196009FAA1981BF86991203C8411F8980FDB",
              amount: "999999999999"
            }
          ]
        }
      ],
      seedAssetIds: ["native:uluna"],
      getDecimals: () => 6,
      getSeedUsdPrice: (_id, key) => (key === "uluna" ? 0.05 : undefined)
    })

    expect(graph.uluna?.price).toBe(0.05)
    expect(
      graph["ibc/2c962dab9f57fe0921435426ae75196009faa1981bf86991203c8411f8980fdb"]
    ).toBeUndefined()
  })
})
