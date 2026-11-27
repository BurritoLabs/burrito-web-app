import { normalizeTxHash } from "./receiptJournal"

// Keep this module independent of the signing SDK: the transaction status
// dialog also loads on read-only routes.
export class TxConfirmationUnknownError extends Error {
  readonly txHash?: string
  readonly chainId?: string

  constructor(txHash?: string, chainId?: string) {
    super("Transaction confirmation is unavailable. Check the original transaction before taking any further action. Do not submit it again.")
    this.name = "TxConfirmationUnknownError"
    this.txHash = normalizeTxHash(txHash)
    this.chainId = chainId
  }
}

export const isTxConfirmationUnknown = (error: unknown): error is TxConfirmationUnknownError =>
  error instanceof TxConfirmationUnknownError

// Call with knownHash ONLY after we have handed signed bytes to the network.
// SDK inclusion timeouts also carry a txId; pre-sign network errors do not.
export const asTxConfirmationUnknown = (
  error: unknown, knownHash?: string, chainId?: string
) => {
  if (isTxConfirmationUnknown(error)) return error
  const hash = normalizeTxHash(knownHash) ??
    (error && typeof error === "object" && "txId" in error ? normalizeTxHash(error.txId) : undefined)
  return hash ? new TxConfirmationUnknownError(hash, chainId) : undefined
}
