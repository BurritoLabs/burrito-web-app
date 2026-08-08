import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BurritoThemeProvider } from "@burritolabs/ui"
import "@burritolabs/ui/tokens.css"
import "./index.css"
import App from "./App"
import { AppChainProvider } from "./app/AppChainProvider"
import AppErrorBoundary from "./app/feedback/AppErrorBoundary"
import { installRuntimeErrorReporting } from "./app/feedback/runtimeErrorReporter"
import { installClientWebVitals } from "./app/feedback/clientWebVitals"
import WalletBoot from "./app/wallet/WalletBoot"

installRuntimeErrorReporting()
installClientWebVitals()

const shouldRetryQuery = (failureCount: number, error: unknown) => {
  if (failureCount >= 1) return false
  if (!(error instanceof Error)) return true
  if (/\b(400|401|402|403|404|409|422|429)\b/.test(error.message)) {
    return false
  }
  if (/too many requests/i.test(error.message)) {
    return false
  }
  return true
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: shouldRetryQuery
    }
  }
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BurritoThemeProvider>
        <AppErrorBoundary>
          <AppChainProvider>
            <WalletBoot>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </WalletBoot>
          </AppChainProvider>
        </AppErrorBoundary>
      </BurritoThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
