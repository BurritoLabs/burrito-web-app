import { Component, type ErrorInfo, type ReactNode } from "react"
import DataErrorCard from "./DataErrorCard"
import {
  reportRuntimeError,
  sanitizeClientErrorText
} from "./runtimeErrorReporter"
import { clearVolatileStorageCaches } from "../utils/safeStorage"
import {
  getStaleAssetRecoveryDelay,
  STALE_ASSET_RECOVERY_DELAYS_MS
} from "./appRecovery"

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
  diagnosticsCopied: boolean
}

const APP_RECOVERY_STORAGE_KEY = "burrito.appRecoveryAt"
const APP_RECOVERY_COOLDOWN_MS = 60_000
const STALE_ASSET_RECOVERY_STORAGE_KEY = "burrito.staleAssetRecovery"
const STALE_ASSET_RECOVERY_WINDOW_MS = 2 * 60_000

const isStaleAssetLoadError = (error: Error) =>
  /failed to fetch dynamically imported module|chunkloaderror|loading chunk/i.test(
    `${error.name} ${error.message}`
  )

type StaleAssetRecoveryState = {
  attempts: number
  startedAt: number
}

const readStaleAssetRecoveryState = (): StaleAssetRecoveryState => {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(STALE_ASSET_RECOVERY_STORAGE_KEY) ?? "null"
    ) as Partial<StaleAssetRecoveryState> | null
    if (
      parsed &&
      Number.isInteger(parsed.attempts) &&
      typeof parsed.startedAt === "number" &&
      Date.now() - parsed.startedAt < STALE_ASSET_RECOVERY_WINDOW_MS
    ) {
      return {
        attempts: Math.max(0, parsed.attempts ?? 0),
        startedAt: parsed.startedAt
      }
    }
  } catch {
    // Start a fresh recovery sequence when session storage is restricted.
  }
  return { attempts: 0, startedAt: Date.now() }
}

const recoverStaleAsset = () => {
  clearVolatileStorageCaches()
  const state = readStaleAssetRecoveryState()
  if (state.attempts >= STALE_ASSET_RECOVERY_DELAYS_MS.length) return false

  try {
    window.sessionStorage.setItem(
      STALE_ASSET_RECOVERY_STORAGE_KEY,
      JSON.stringify({ ...state, attempts: state.attempts + 1 })
    )
  } catch {
    // Continue with a bounded reload when session storage is restricted.
  }

  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set("recover", Date.now().toString(36))
  window.location.replace(nextUrl.toString())
  return true
}

const recoverAppOnce = () => {
  clearVolatileStorageCaches()
  try {
    const recoveredAt = Number(
      window.sessionStorage.getItem(APP_RECOVERY_STORAGE_KEY)
    )
    if (
      Number.isFinite(recoveredAt) &&
      Date.now() - recoveredAt < APP_RECOVERY_COOLDOWN_MS
    ) {
      return false
    }
    window.sessionStorage.setItem(APP_RECOVERY_STORAGE_KEY, String(Date.now()))
  } catch {
    // Continue with recovery when session storage is restricted.
  }

  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set("recover", Date.now().toString(36))
  window.location.replace(nextUrl.toString())
  return true
}

class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  private recoveryTimer: number | undefined

  state: AppErrorBoundaryState = {
    error: null,
    diagnosticsCopied: false
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error, diagnosticsCopied: false }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportRuntimeError({
      kind: "react",
      error,
      componentStack: errorInfo.componentStack ?? undefined
    })

    if (import.meta.env.DEV) {
      console.error(error, errorInfo)
    }

    const staleAssetError = isStaleAssetLoadError(error)
    const delay = staleAssetError
      ? getStaleAssetRecoveryDelay(readStaleAssetRecoveryState().attempts)
      : 0
    this.recoveryTimer = window.setTimeout(() => {
      if (staleAssetError) recoverStaleAsset()
      else recoverAppOnce()
    }, delay)
  }

  componentWillUnmount() {
    if (this.recoveryTimer !== undefined) {
      window.clearTimeout(this.recoveryTimer)
    }
  }

  handleReload = () => {
    if (this.recoveryTimer !== undefined) {
      window.clearTimeout(this.recoveryTimer)
      this.recoveryTimer = undefined
    }
    try {
      window.sessionStorage.removeItem(APP_RECOVERY_STORAGE_KEY)
      window.sessionStorage.removeItem(STALE_ASSET_RECOVERY_STORAGE_KEY)
    } catch {
      // Continue with a manual recovery when session storage is restricted.
    }
    recoverAppOnce()
  }

  handleCopyDiagnostics = async () => {
    const error = this.state.error
    const diagnostics = JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        path: window.location.pathname,
        message: sanitizeClientErrorText(
          error?.message || error?.name || "Unknown runtime error",
          1_000
        ),
        userAgent: window.navigator.userAgent.slice(0, 500)
      },
      null,
      2
    )

    try {
      await window.navigator.clipboard.writeText(diagnostics)
      this.setState({ diagnosticsCopied: true })
    } catch {
      this.setState({ diagnosticsCopied: false })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <DataErrorCard
          message={
            import.meta.env.DEV
              ? this.state.error.message
              : "Reload the app and try again."
          }
          onAction={this.handleReload}
          secondaryActionLabel={
            this.state.diagnosticsCopied
              ? "Diagnostics copied"
              : "Copy diagnostics"
          }
          onSecondaryAction={() => void this.handleCopyDiagnostics()}
        />
      )
    }

    return this.props.children
  }
}

export default AppErrorBoundary
