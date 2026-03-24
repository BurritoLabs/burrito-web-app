import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ChainProvider } from "@cosmos-kit/react"
import "./index.css"
import App from "./App"
import { WalletProvider } from "./app/wallet/WalletProvider"
import {
  COSMOS_KIT_ASSET_LISTS,
  COSMOS_KIT_CHAINS,
  COSMOS_KIT_WALLETS,
  getWalletConnectOptions
} from "./app/wallet/cosmosKit"

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
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery
    }
  }
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ChainProvider
        chains={COSMOS_KIT_CHAINS}
        assetLists={COSMOS_KIT_ASSET_LISTS}
        wallets={COSMOS_KIT_WALLETS}
        walletConnectOptions={getWalletConnectOptions()}
        throwErrors={false}
      >
        <WalletProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </WalletProvider>
      </ChainProvider>
    </QueryClientProvider>
  </StrictMode>
)
