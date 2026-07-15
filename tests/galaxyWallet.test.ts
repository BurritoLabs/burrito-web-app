import { describe, expect, it } from "vitest"
import { resolveGalaxyAddress } from "../src/app/wallet/galaxyWallet"

describe("Galaxy wallet chain isolation", () => {
  it("does not fall back to an account from another chain", () => {
    const response = {
      addresses: {
        "phoenix-1": "terra1lunaaddress",
        "columbus-5": "terra1classicaddress"
      }
    }

    expect(resolveGalaxyAddress(response, "phoenix-1")).toBe("terra1lunaaddress")
    expect(resolveGalaxyAddress(response, "columbus-5")).toBe("terra1classicaddress")
    expect(resolveGalaxyAddress(response, "unknown-chain")).toBeUndefined()
  })
})
