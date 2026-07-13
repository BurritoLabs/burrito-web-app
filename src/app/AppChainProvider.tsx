import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  APP_CHAINS,
  APP_CHAIN_STORAGE_KEY,
  DEFAULT_APP_CHAIN,
  isAppChainKey,
  type AppChainKey
} from "./appChains"
import { AppChainContext } from "./appChainContext"
import { setActiveAppChainKey } from "./activeChain"

const readStoredChain = () => {
  if (typeof window === "undefined") return DEFAULT_APP_CHAIN
  const stored = window.localStorage.getItem(APP_CHAIN_STORAGE_KEY)
  const selected = stored && isAppChainKey(stored) ? stored : DEFAULT_APP_CHAIN
  setActiveAppChainKey(selected)
  return selected
}

export const AppChainProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient()
  const [chainKey, setChainKeyState] = useState<AppChainKey>(readStoredChain)

  const setChainKey = useCallback((next: AppChainKey) => {
    setActiveAppChainKey(next)
    void queryClient.cancelQueries()
    queryClient.clear()
    setChainKeyState(next)
    window.localStorage.setItem(APP_CHAIN_STORAGE_KEY, next)
  }, [queryClient])

  useEffect(() => {
    setActiveAppChainKey(chainKey)
    document.documentElement.dataset.appChain = chainKey
    document.documentElement.style.setProperty(
      "--active-chain-rgb",
      APP_CHAINS[chainKey].accentRgb
    )
    document.documentElement.style.setProperty(
      "--chain-accent",
      APP_CHAINS[chainKey].accent
    )
    document.documentElement.style.setProperty(
      "--chain-accent-strong",
      APP_CHAINS[chainKey].accentStrong
    )
    document.documentElement.style.setProperty(
      "--chain-accent-soft",
      APP_CHAINS[chainKey].accentSoft
    )
  }, [chainKey])

  const value = useMemo(
    () => ({
      chainKey,
      chain: APP_CHAINS[chainKey],
      setChainKey
    }),
    [chainKey, setChainKey]
  )

  return (
    <AppChainContext.Provider value={value}>
      {children}
    </AppChainContext.Provider>
  )
}
