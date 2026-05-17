import { Component, type ErrorInfo, type ReactNode } from "react"
import DataErrorCard from "./DataErrorCard"

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
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
    if (import.meta.env.DEV) {
      console.error(error, errorInfo)
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
