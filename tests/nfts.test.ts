import { describe, expect, it } from "vitest"
import {
  buildNftMetadataCandidates,
  buildNftImageCandidates,
  buildNftTransferExecuteMsg,
  extractNftContractCandidates,
  extractNftTokenEntries,
  mapNftRegistry,
  mergeNftCollections,
  normalizeNftUri,
  parseCachedNftCollections,
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

  it("builds resilient IPFS image gateway candidates", () => {
    expect(buildNftImageCandidates("ipfs://QmImage/1.png")).toEqual([
      "https://dweb.link/ipfs/QmImage/1.png",
      "https://ipfs.io/ipfs/QmImage/1.png",
      "https://gateway.pinata.cloud/ipfs/QmImage/1.png"
    ])
    expect(buildNftImageCandidates("https://images.example/nft.png")).toEqual([
      "https://images.example/nft.png"
    ])
    expect(buildNftImageCandidates("javascript:alert(1)")).toEqual([])
  })

  it("reads common CW721 metadata fields", () => {
    expect(
      parseNftMetadata({
        title: "Burrito #1",
        description: "Genesis",
        image_url: "ipfs://QmImage",
        attributes: [
          { trait_type: "Layer", value: "Classic" },
          { name: "Edition", value: 1 }
        ]
      })
    ).toEqual({
      name: "Burrito #1",
      description: "Genesis",
      image: "https://ipfs.io/ipfs/QmImage",
      animationUrl: undefined,
      externalUrl: undefined,
      attributes: [
        { traitType: "Layer", value: "Classic" },
        { traitType: "Edition", value: "1" }
      ]
    })
  })

  it("uses multiple gateways for IPFS metadata", () => {
    expect(buildNftMetadataCandidates("ipfs://QmMetadata/1.json")).toEqual([
      "https://dweb.link/ipfs/QmMetadata/1.json",
      "https://ipfs.io/ipfs/QmMetadata/1.json",
      "https://gateway.pinata.cloud/ipfs/QmMetadata/1.json"
    ])
  })

  it("merges duplicate collections without losing curated links", () => {
    const contract = "terra1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe36rgt"
    expect(
      mergeNftCollections(
        [{ contract, name: "Curated", marketplace: ["https://market.example"] }],
        [{ contract, name: "On-chain", symbol: "NFT", marketplace: [] }]
      )
    ).toEqual([
      {
        contract,
        name: "Curated",
        symbol: "NFT",
        marketplace: ["https://market.example"]
      }
    ])
  })

  it("rejects stale collection cache entries", () => {
    const contract = "terra1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe36rgt"
    const cached = JSON.stringify({
      updatedAt: 100,
      collections: [{ contract, name: "Cached", marketplace: [] }]
    })
    expect(parseCachedNftCollections(cached, 200)).toHaveLength(1)
    expect(parseCachedNftCollections(cached, 31 * 24 * 60 * 60 * 1000)).toEqual([])
  })

  it("builds the standard CW721 transfer message", () => {
    expect(
      buildNftTransferExecuteMsg({
        recipient: " TERRA1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0L8Z5 ",
        tokenId: "burrito-1"
      })
    ).toEqual({
      transfer_nft: {
        recipient: "terra1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0l8z5",
        token_id: "burrito-1"
      }
    })
  })

  it("discovers collection contracts from messages and wasm events", () => {
    const messageContract = "terra1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqe36rgt"
    const eventContract = "terra1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0l8z5"
    expect(
      extractNftContractCandidates({
        txs: [{ body: { messages: [{ contract: messageContract }] } }],
        tx_responses: [
          {
            events: [
              {
                type: "wasm",
                attributes: [
                  { key: "_contract_address", value: eventContract }
                ]
              }
            ]
          }
        ]
      })
    ).toEqual([messageContract, eventContract])
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
