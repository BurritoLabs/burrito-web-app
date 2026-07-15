import { Component, type ErrorInfo, type ReactNode } from "react"
import DataErrorCard from "./DataErrorCard"
import { reportRuntimeError } from "./runtimeErrorReporter"
import { clearVolatileStorageCaches } from "../utils/safeStorage"

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

const APP_RECOVERY_STORAGE_KEY = "burrito.appRecoveryAt"
const APP_RECOVERY_COOLDOWN_MS = 60_000

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
  state: AppErrorBoundaryState = {
    error: null
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
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

    recoverAppOnce()
  }

  handleReload = () => {
    try {
      window.sessionStorage.removeItem(APP_RECOVERY_STORAGE_KEY)
    } catch {
      // Continue with a manual recovery when session storage is restricted.
    }
    recoverAppOnce()
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
        />
      )
    }

    return this.props.children
  }
}

export default AppErrorBoundary
