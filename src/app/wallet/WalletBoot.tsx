import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useState,
  type ErrorInfo,
  type ReactNode
} from "react"
import { getStoredWalletConnectorId } from "./walletMeta"
import { reportRuntimeError } from "../feedback/runtimeErrorReporter"
import { loadWalletRuntimeProvider } from "./walletRuntimeLoader"
import { hasDesktopKeplrProvider } from "./keplrProviderIdentity"
import { WalletProvider } from "./WalletProvider"
import type { WalletRuntimeSnapshot } from "./walletRuntimeBridge"

const WalletRuntimeProvider = lazy(loadWalletRuntimeProvider)

const shouldLoadWalletRuntime = () =>
  !hasDesktopKeplrProvider() && getStoredWalletConnectorId() === "keplr-mobile"

class WalletRuntimeErrorBoundary extends Component<
  {
    children: ReactNode
    onError: (error: Error, info: ErrorInfo) => void
  },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError(error, info)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

const WalletBoot = ({ children }: { children: ReactNode }) => {
  const [runtime, setRuntime] = useState<WalletRuntimeSnapshot>()
  const [runtimeError, setRuntimeError] = useState<Error>()
  const [loadWalletRuntime, setLoadWalletRuntime] = useState(shouldLoadWalletRuntime)
  const requestWalletRuntime = useCallback(() => setLoadWalletRuntime(true), [])
  const handleWalletRuntimeError = useCallback(
    (error: Error, info: ErrorInfo) => {
      reportRuntimeError({
        kind: "react",
        error,
        componentStack: info.componentStack ?? undefined
      })
      setRuntime(undefined)
      setRuntimeError(error)
      setLoadWalletRuntime(false)
    },
    []
  )

  return (
    <WalletProvider
      runtime={runtime}
      runtimeError={runtimeError}
      onRuntimeRequested={requestWalletRuntime}
    >
      {children}
      {loadWalletRuntime ? (
        <WalletRuntimeErrorBoundary onError={handleWalletRuntimeError}>
          <Suspense fallback={null}>
            <WalletRuntimeProvider publishRuntime={setRuntime} />
          </Suspense>
        </WalletRuntimeErrorBoundary>
      ) : null}
    </WalletProvider>
  )
}

export default WalletBoot
