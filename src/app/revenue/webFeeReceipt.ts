import type { AppChainKey } from "../appChains"

const WEB_FEE_CONFIRM_URL =
  import.meta.env.VITE_WEB_FEE_CONFIRM_URL?.trim() ||
  "https://ai.burrito.money/api/web-fees/confirm"
const STORAGE_KEY = "burrito.web-fee-confirmations.v1"

type PendingReceipt = {
  chain: AppChainKey
  txHash: string
}

const readPending = (): PendingReceipt[] => {
  if (typeof window === "undefined") return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is PendingReceipt =>
        Boolean(
          item &&
            (item.chain === "lunc" || item.chain === "luna") &&
            typeof item.txHash === "string" &&
            /^[0-9a-fA-F]{64}$/.test(item.txHash)
        )
    )
  } catch {
    return []
  }
}

const writePending = (items: PendingReceipt[]) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-50)))
}

const confirmReceipt = async (receipt: PendingReceipt) => {
  const response = await fetch(WEB_FEE_CONFIRM_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chain: receipt.chain,
      txHash: receipt.txHash
    }),
    signal: AbortSignal.timeout(20_000)
  })
  if (!response.ok) throw new Error(`Web fee confirmation returned ${response.status}`)
}

export const queueWebFeeReceipt = async (
  chain: AppChainKey,
  txHash: string
) => {
  if (!/^[0-9a-fA-F]{64}$/.test(txHash)) return
  const receipt = { chain, txHash: txHash.toUpperCase() }
  const pending = readPending().filter(
    (item) => !(item.chain === receipt.chain && item.txHash === receipt.txHash)
  )
  writePending([...pending, receipt])
  try {
    await confirmReceipt(receipt)
    writePending(
      readPending().filter(
        (item) =>
          !(item.chain === receipt.chain && item.txHash === receipt.txHash)
      )
    )
  } catch {
    // The successful chain transaction remains queued for a later retry.
  }
}

export const retryPendingWebFeeReceipts = async () => {
  for (const receipt of readPending()) {
    try {
      await confirmReceipt(receipt)
      writePending(
        readPending().filter(
          (item) =>
            !(item.chain === receipt.chain && item.txHash === receipt.txHash)
        )
      )
    } catch {
      return
    }
  }
}
