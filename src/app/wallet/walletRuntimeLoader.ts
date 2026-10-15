export const loadWalletRuntimeProvider = () => import("./WalletRuntimeProvider")

export const preloadWalletRuntime = () => {
  // Speculative hover/focus preloads have no UI owner. A real lazy mount still
  // reports a failed import through WalletBoot's runtime error boundary.
  void loadWalletRuntimeProvider().catch(() => undefined)
}
