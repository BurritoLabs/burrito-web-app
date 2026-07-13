import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react"
import {
  APP_CHAINS,
  APP_CHAIN_STORAGE_KEY,
  DEFAULT_APP_CHAIN,
  isAppChainKey,
  type AppChainKey
} from "./appChains"
import { AppChainContext } from "./appChainContext"

const readStoredChain = () => {
  if (typeof window === "undefined") return DEFAULT_APP_CHAIN
  const stored = window.localStorage.getItem(APP_CHAIN_STORAGE_KEY)
  return stored && isAppChainKey(stored) ? stored : DEFAULT_APP_CHAIN
}

export const AppChainProvider = ({ children }: { children: ReactNode }) => {
  const [chainKey, setChainKeyState] = useState<AppChainKey>(readStoredChain)

  const setChainKey = useCallback((next: AppChainKey) => {
    setChainKeyState(next)
    window.localStorage.setItem(APP_CHAIN_STORAGE_KEY, next)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.appChain = chainKey
    document.documentElement.style.setProperty(
      "--active-chain-rgb",
      APP_CHAINS[chainKey].accentRgb
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
