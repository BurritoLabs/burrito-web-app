import { CHAIN_RUNTIME_CONFIG, type SupportedChainKey } from "../config/chainConfig"

// Same-tab recovery only. Never store signed bytes, messages, fees or wallet credentials.
export const RECEIPT_STORAGE_KEY = "burrito:unresolved-tx:v1"
export type ReceiptPointer = {
  chainKey: SupportedChainKey
  startedAt: number
  hash?: string
  address?: string
}

export const normalizeTxHash = (hash: unknown) =>
  typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash) ? hash.toUpperCase() : undefined

export function readReceiptPointer(): ReceiptPointer | undefined {
  try {
    const item = JSON.parse(window.sessionStorage.getItem(RECEIPT_STORAGE_KEY) || "null")
    if (!item || (item.chainKey !== "lunc" && item.chainKey !== "luna") ||
      !Number.isSafeInteger(item.startedAt) || item.startedAt <= 0) return
    return { chainKey: item.chainKey, startedAt: item.startedAt, hash: normalizeTxHash(item.hash),
      address: typeof item.address === "string" && /^terra1[a-z0-9]{38,60}$/.test(item.address) ? item.address : undefined }
  } catch { return undefined }
}

export function saveReceiptPointer(pointer?: ReceiptPointer) {
  try {
    if (pointer) window.sessionStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(pointer))
    else window.sessionStorage.removeItem(RECEIPT_STORAGE_KEY)
  } catch { /* In-memory protection remains active when storage is unavailable. */ }
}

const signedListeners = new Set<(hash: string, chainId: string) => void>()
export function observeSignedTx(listener: (hash: string, chainId: string) => void) {
  signedListeners.add(listener)
  return () => { signedListeners.delete(listener) }
}
export function noteSignedTxForConfirmation(hash: string, chainId: string) {
  const normalized = normalizeTxHash(hash)
  if (normalized) for (const listener of signedListeners) listener(normalized, chainId)
}

// Read only. Missing, throttled or malformed replies do not prove execution or failure.
export async function lookupReceipt(pointer: ReceiptPointer): Promise<{code: number} | undefined> {
  const hash = normalizeTxHash(pointer.hash)
  if (!hash) return
  for (const endpoint of CHAIN_RUNTIME_CONFIG[pointer.chainKey].endpoints.lcd.slice(0, 2)) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    try {
      const res = await fetch(`${endpoint}/cosmos/tx/v1beta1/txs/${hash}`, {
        method: "GET", credentials: "omit", cache: "no-store", signal: controller.signal
      })
      if (!res.ok) continue
      const tx = (await res.json())?.tx_response
      if (normalizeTxHash(tx?.txhash) !== hash || !/^[1-9]\d*$/.test(String(tx.height)) ||
        !Number.isSafeInteger(tx.code) || tx.code < 0) continue
      return { code: tx.code }
    } catch { /* Try the next read endpoint without resubmitting anything. */ }
    finally { clearTimeout(timer) }
  }
}
