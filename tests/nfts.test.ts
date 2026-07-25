import { describe, expect, it } from "vitest"
import {
  extractNftTokenEntries,
  mapNftRegistry,
  normalizeNftUri,
  parseNftMetadata
} from "../src/app/data/nfts"

describe("NFT data normalization", () => {
  it("selects collections for the active chain", () => {
    const data = {
      classic: {
        terra1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe36rgt: {
          name: "Classic Collection",
          symbol: "CLASSIC"
        }
      },
      mainnet: {
        terra1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0l8z5: {
          contract: "terra1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0l8z5",
          name: "Terra Collection",
          symbol: "TERRA"
        }
      }
    }

    expect(mapNftRegistry(data, "lunc").map((item) => item.name)).toEqual([
      "Classic Collection"
    ])
    expect(mapNftRegistry(data, "luna").map((item) => item.name)).toEqual([
      "Terra Collection"
    ])
  })

  it("normalizes IPFS and Arweave URIs", () => {
    expect(normalizeNftUri("ipfs://QmExample/1.json")).toBe(
      "https://ipfs.io/ipfs/QmExample/1.json"
    )
    expect(normalizeNftUri("ar://example-id")).toBe(
      "https://arweave.net/example-id"
    )
    expect(normalizeNftUri("javascript:alert(1)")).toBeUndefined()
  })

  it("reads common CW721 metadata fields", () => {
    expect(
      parseNftMetadata({
        title: "Burrito #1",
        description: "Genesis",
        image_url: "ipfs://QmImage"
      })
    ).toEqual({
      name: "Burrito #1",
      description: "Genesis",
      image: "https://ipfs.io/ipfs/QmImage"
    })
  })

  it("supports standard and legacy CW721 owner token responses", () => {
    expect(
      extractNftTokenEntries({
        tokens: [
          "1",
          {
            token_id: "2",
            metadata_uri: "ipfs://QmMetadata/2.json"
          }
        ]
      })
    ).toEqual([
      { tokenId: "1" },
      { tokenId: "2", tokenUri: "ipfs://QmMetadata/2.json" }
    ])

    expect(extractNftTokenEntries({ ids: ["3"] })).toEqual([
      { tokenId: "3" }
    ])
  })
})
