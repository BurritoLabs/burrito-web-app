import { describe, expect, it } from "vitest"
import { getRouteMetadata } from "../src/app/metadata/routeMetadataConfig"

describe("route metadata", () => {
  it("maps primary product routes", () => {
    expect(getRouteMetadata("/market")).toMatchObject({
      title: "Market | Burrito",
      canonicalPath: "/market"
    })
    expect(getRouteMetadata("/launchpad/")).toMatchObject({
      title: "Launchpad | Burrito",
      canonicalPath: "/launchpad"
    })
  })

  it("keeps detail routes canonical without query state", () => {
    expect(
      getRouteMetadata(
        "/market/pair/astroport/terra1pair"
      )
    ).toMatchObject({
      title: "Market Pair | Burrito",
      canonicalPath: "/market/pair/astroport/terra1pair"
    })
    expect(getRouteMetadata("/proposal/42")).toMatchObject({
      title: "Governance Proposal | Burrito",
      canonicalPath: "/proposal/42"
    })
  })

  it("falls back unknown paths to the app root", () => {
    expect(getRouteMetadata("/missing")).toMatchObject({
      title: "Burrito | Terra & Terra Classic",
      canonicalPath: "/"
    })
  })
})
