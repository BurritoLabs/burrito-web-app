import { Component, type ErrorInfo, type ReactNode } from "react"
import DataErrorCard from "./DataErrorCard"
import { reportRuntimeError } from "./runtimeErrorReporter"

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

const CHUNK_RELOAD_STORAGE_KEY = "burrito.chunkReloaded"

const isChunkLoadError = (error: Error) =>
  /dynamically imported module|importing a module script failed|loading chunk|chunkloaderror/i.test(
    error.message
  )

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

    if (
      isChunkLoadError(error) &&
      window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY) !== "1"
    ) {
      window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, "1")
      window.location.reload()
    }
  }

  handleReload = () => {
    window.location.reload()
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
