export const loadWalletRuntimeProvider = () => import("./WalletRuntimeProvider")

export const preloadWalletRuntime = () => {
  void loadWalletRuntimeProvider()
}
