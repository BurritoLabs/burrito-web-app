import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { useWalletAssetVisibility } from "../src/app/wallet/useWalletAssetVisibility"
import type { WalletAssetRow } from "../src/app/wallet/useWalletAssets"

const token: WalletAssetRow = {
  kind: "cw20", denom: "terra1fixture", symbol: "TOKEN", name: "Fixture Token",
  amount: "1", decimals: 18, chainCount: 1, whitelisted: true, isBuyable: false, iconCandidates: []
}

const visible = (row: WalletAssetRow, options = {}) => {
  const Probe = () => {
    const { visibleAssetRows } = useWalletAssetVisibility({ assetRows: [row], hideLowBalance: true, ...options })
    return createElement("output", null, visibleAssetRows.map((asset) => asset.symbol).join(","))
  }
  return renderToStaticMarkup(createElement(Probe)).includes("TOKEN")
}

describe("wallet low-balance visibility", () => {
  it("does not equate an unpriced positive CW20 holding with a low USD balance", () => {
    expect(visible(token)).toBe(true)
  })
  it("still hides a priced CW20 holding below the USD threshold", () => {
    expect(visible({ ...token, value: 0.5 })).toBe(false)
    expect(visible({ ...token, value: 1 })).toBe(true)
  })
  it("respects explicit hiding, unknown-asset filtering and real zero balances", () => {
    expect(visible(token, { hiddenKeys: [token.denom] })).toBe(false)
    expect(visible({ ...token, whitelisted: false }, { hideUnknownAssets: true })).toBe(false)
    expect(visible({ ...token, amount: "0" })).toBe(false)
  })
})
