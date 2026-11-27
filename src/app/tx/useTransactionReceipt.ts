import { useCallback, useEffect, useRef, useState } from "react"
import { CHAIN_RUNTIME_CONFIG, type SupportedChainKey } from "../config/chainConfig"
import type { TxState, WalletConnectorId } from "../wallet/WalletContext"
import { isTxConfirmationUnknown } from "./broadcastOutcome"
import { tryAcquireBrowserSubmissionLock } from "./browserSubmissionLock"
import { classifyTxError, recordTxDiagnostic } from "./txDiagnostics"
import { lookupReceipt, normalizeTxHash, observeSignedTx, readReceiptPointer, saveReceiptPointer } from "./receiptJournal"

export function useTransactionReceipt(chainKey: SupportedChainKey, address?: string, connectorId?: WalletConnectorId) {
  const [txState, setState] = useState<TxState>(() => {
    const pointer = readReceiptPointer()
    return pointer ? { status: "unconfirmed", ...pointer } : { status: "idle" }
  })
  const current = useRef(txState)
  const lease = useRef<(() => void) | undefined>(undefined)
  const claiming = useRef(false)
  const mount = useRef(0)
  // Reclaim protection after a refresh with an unresolved receipt. Never wait
  // for a busy lock, and never release solely because Keplr hid this tab.
  useEffect(() => {
    const generation = ++mount.current
    if (current.current.status === "unconfirmed" && !lease.current) {
      void tryAcquireBrowserSubmissionLock().then(result => {
        if (result.kind !== "acquired") return
        if (mount.current !== generation || current.current.status !== "unconfirmed" || lease.current) result.release()
        else lease.current = result.release
      })
    }
    return () => {
      mount.current = generation + 1
      // A pending operation may still settle after unmount; its own callbacks
      // release the lease (or the browser releases it on document destruction).
      // An unresolved receipt is restored by the next provider instance.
      if (current.current.status !== "pending") { lease.current?.(); lease.current = undefined }
    }
  }, [])
  const checking = useRef<{key: string; done: Promise<void>} | undefined>(undefined)
  const update = useCallback((next: TxState) => {
    current.current = next
    if (next.status !== "pending" && next.status !== "unconfirmed") {
      lease.current?.()
      lease.current = undefined
    }
    if ((next.status === "pending" || next.status === "unconfirmed") && next.chainKey && next.startedAt) {
      saveReceiptPointer({ chainKey: next.chainKey, address: next.address, startedAt: next.startedAt, hash: next.hash })
    } else { saveReceiptPointer() }
    setState(next)
  }, [])
  const showTxReceipt = useCallback(() => {
    if (current.current.hidden) update({ ...current.current, hidden: false })
  }, [update])
  const startTx = useCallback(async (label?: string) => {
    if (current.current.status === "pending" || current.current.status === "unconfirmed") {
      showTxReceipt()
      return false
    }
    if (claiming.current) return false
    claiming.current = true
    const generation = mount.current
    const result = await tryAcquireBrowserSubmissionLock()
    claiming.current = false
    if (generation !== mount.current) {
      if (result.kind === "acquired") result.release()
      return false
    }
    if (result.kind !== "acquired") {
      update({ status: "blocked", error: result.kind === "busy"
        ? "Another Burrito tab is handling a transaction. Return to that tab to check the result. Nothing was sent from this tab."
        : "This browser could not verify that another Burrito tab is not submitting. No transaction was sent from this tab." })
      return false
    }
    lease.current = result.release
    update({ status: "pending", chainKey, address, label, startedAt: Date.now() })
    recordTxDiagnostic({ phase: "start", label, connectorId, accountAddress: address })
    return true
  }, [address, chainKey, connectorId, showTxReceipt, update])
  const setTxPhase = useCallback((phase: "signing" | "confirming") => {
    const prev = current.current
    if (prev.status === "pending" && prev.phase !== phase) update({ ...prev, phase })
  }, [update])
  useEffect(() => observeSignedTx((hash, chainId) => {
    const prev = current.current
    if (prev.status === "pending" && prev.chainKey &&
      CHAIN_RUNTIME_CONFIG[prev.chainKey].chain.chainId === chainId && (!prev.hash || prev.hash === hash)) {
      update({ ...prev, hash, phase: "confirming" })
    }
  }), [update])
  const finishTx = useCallback((hash?: string) => {
    const prev = current.current
    if (prev.status !== "pending") return
    const resultHash = normalizeTxHash(hash) ?? prev.hash
    recordTxDiagnostic({ phase: "success", label: prev.label, connectorId, accountAddress: prev.address,
      txHash: resultHash, durationMs: prev.startedAt ? Date.now() - prev.startedAt : undefined })
    update({ ...prev, status: "success", hash: resultHash })
  }, [connectorId, update])
  const failTx = useCallback((error?: unknown) => {
    const prev = current.current
    if (prev.status !== "pending") return
    if (isTxConfirmationUnknown(error)) {
      update({ ...prev, status: "unconfirmed", hash: prev.hash ?? normalizeTxHash(error.txHash) })
      return
    }
    const info = classifyTxError(error, "Transaction failed")
    recordTxDiagnostic({ phase: "failure", label: prev.label, connectorId, accountAddress: prev.address,
      category: info.category, message: info.userMessage, rawMessage: info.rawMessage,
      durationMs: prev.startedAt ? Date.now() - prev.startedAt : undefined })
    update({ ...prev, status: "error", error: info.userMessage })
  }, [connectorId, update])
  const clearTx = useCallback(() => {
    const prev = current.current
    if (prev.status === "pending") return
    update(prev.status === "unconfirmed" ? { ...prev, hidden: true } : { status: "idle" })
  }, [update])
  const acknowledgeTxReview = useCallback(() => {
    if (current.current.status === "unconfirmed") update({ status: "idle" })
  }, [update])
  const checkTxReceipt = useCallback(async () => {
    const prev = current.current
    if (prev.status !== "unconfirmed" || !prev.hash || !prev.chainKey || !prev.startedAt) return
    const pointer = { chainKey: prev.chainKey, startedAt: prev.startedAt, hash: prev.hash }
    const key = `${pointer.chainKey}:${pointer.hash}:${pointer.startedAt}`
    if (checking.current?.key === key) return checking.current.done
    const done = lookupReceipt(pointer).then(receipt => {
      const now = current.current
      if (!receipt || now.status !== "unconfirmed" || now.hash !== prev.hash ||
        now.chainKey !== prev.chainKey || now.startedAt !== prev.startedAt) return
      update({ ...now, hidden: false, status: receipt.code === 0 ? "success" : "error",
        error: receipt.code === 0 ? undefined : `The chain included this transaction, but execution failed (code ${receipt.code}).` })
    }).finally(() => { if (checking.current?.key === key) checking.current = undefined })
    checking.current = { key, done }
    return done
  }, [update])
  useEffect(() => {
    if (txState.status !== "unconfirmed" || !txState.hash) return
    const resume = () => { if (document.visibilityState === "visible") void checkTxReceipt() }
    resume()
    // A slow indexer can publish the receipt just after the original timeout.
    // Never poll indefinitely, sign again or issue a network write here.
    const timers = [10_000, 30_000].map(ms => window.setTimeout(resume, ms))
    document.addEventListener("visibilitychange", resume)
    return () => {
      timers.forEach(id => window.clearTimeout(id))
      document.removeEventListener("visibilitychange", resume)
    }
  }, [checkTxReceipt, txState.status, txState.hash])
  return { txState, startTx, setTxPhase, finishTx, failTx, clearTx, showTxReceipt, checkTxReceipt, acknowledgeTxReview }
}
