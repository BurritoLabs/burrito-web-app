import type { WalletConnectorId } from "./WalletContext"

type Owner = {
  token: object
  matches: (connector: WalletConnectorId, address: string, chainId: string) => boolean
}
let active: Owner | undefined

// Registered by the mounted connection owner, including the injected-wallet
// path that does not lazy-load Cosmos Kit. Never call connect/enable here.
export function publishSigningSelection(owner: Owner) {
  active = owner
  return () => { if (active === owner) active = undefined }
}

export function captureSigningSelection() {
  const token = active?.token
  return (connector: WalletConnectorId, address: string, chainId: string) => {
    if (active?.token !== token || (active && !active.matches(connector, address, chainId))) {
      throw new Error("Wallet selection changed before submission. No transaction was sent.")
    }
  }
}
