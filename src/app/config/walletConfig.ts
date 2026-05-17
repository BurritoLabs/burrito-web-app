const DEFAULT_WALLETCONNECT_PROJECT_ID = "e95bf03729cf2be3b408afc97030b40f"

const envWalletConnectProjectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim()

export const WALLETCONNECT_PROJECT_ID =
  envWalletConnectProjectId || DEFAULT_WALLETCONNECT_PROJECT_ID

let warnedMissingWalletConnectProjectId = false

export const warnIfDefaultWalletConnectProjectId = () => {
  if (
    warnedMissingWalletConnectProjectId ||
    !import.meta.env.PROD ||
    envWalletConnectProjectId
  ) {
    return
  }
  warnedMissingWalletConnectProjectId = true
  console.warn(
    "VITE_WALLETCONNECT_PROJECT_ID is not configured; Burrito is using the bundled fallback project id."
  )
}

export const getBurritoAppOrigin = () =>
  typeof window !== "undefined"
    ? window.location.origin
    : "https://app.burrito.money"
