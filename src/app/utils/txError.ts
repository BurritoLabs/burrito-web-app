import { classifyTxError } from "../tx/txDiagnostics"

export const formatTxError = (
  error: unknown,
  fallback = "Transaction failed"
) => classifyTxError(error, fallback).userMessage
