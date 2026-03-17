export type WalletPanelAssetSnapshot = {
  denom: string
  symbol: string
  name: string
  decimals: number
}

export type WalletPanelView = "wallet" | "send" | "receive" | "asset"

export type WalletPanelNavigationDetail = {
  view: WalletPanelView
  asset?: WalletPanelAssetSnapshot
}

export const WALLET_PANEL_NAVIGATION_EVENT = "burrito:wallet-panel:navigate"

export const openWalletPanel = (detail: WalletPanelNavigationDetail) => {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<WalletPanelNavigationDetail>(WALLET_PANEL_NAVIGATION_EVENT, {
      detail
    })
  )
}
