import { isTxConfirmationUnknown } from "../tx/broadcastOutcome"
import { classifyTxError } from "../tx/txDiagnostics"

export const formatTxError = (
  error: unknown,
  fallback = "Transaction failed"
) => isTxConfirmationUnknown(error) ? error.message : classifyTxError(error, fallback).userMessage
