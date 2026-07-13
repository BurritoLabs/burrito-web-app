import { createContext, useContext } from "react"
import {
  APP_CHAINS,
  type AppChainConfig,
  type AppChainKey
} from "./appChains"

export type AppChainContextValue = {
  chainKey: AppChainKey
  chain: AppChainConfig
  setChainKey: (next: AppChainKey) => void
}

export const AppChainContext = createContext<AppChainContextValue>({
  chainKey: "lunc",
  chain: APP_CHAINS.lunc,
  setChainKey: () => undefined
})

export const useAppChain = () => useContext(AppChainContext)
