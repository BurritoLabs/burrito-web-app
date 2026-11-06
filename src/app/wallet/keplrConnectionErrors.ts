export const getKeplrConnectionErrorMessage = (error: unknown) => {
  // This exact empty-keyring message was verified with official Keplr 0.13.52.
  // Do not infer a missing wallet from cancellation or generic account errors.
  if (error instanceof Error && error.message === "Users need to create their accounts first") {
    return "No account found in Keplr. Open the Keplr extension to create or import a wallet, then connect again."
  }
  return error instanceof Error ? error.message : "Wallet connection failed"
}
