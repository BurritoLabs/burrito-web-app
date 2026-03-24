import type { OfflineSigner } from "@cosmjs/proto-signing"
import { KEPLR_CHAIN_CONFIG } from "../chain"
import { connectClassicSigningClient } from "./signingClient"
import type {
  WalletAccount,
  WalletConnector,
  WalletConnectorId
} from "./WalletContext"

type InjectedKey = {
  bech32Address: string
  name?: string
}

type InjectedWallet = {
  enable?: (chainId: string) => Promise<void>
  getKey?: (chainId: string) => Promise<InjectedKey>
  experimentalSuggestChain?: (config: unknown) => Promise<void>
  getOfflineSigner?: (chainId: string) => OfflineSigner
  getOfflineSignerAuto?: (chainId: string) => Promise<OfflineSigner>
}

type TrustWalletContainer = {
  cosmos?: InjectedWallet
}

type WalletWindow = Window & {
  keplr?: InjectedWallet
  leap?: InjectedWallet
  station?: InjectedWallet
  galaxyStation?: InjectedWallet
  trustwallet?: TrustWalletContainer
  trustWallet?: TrustWalletContainer
  luncdash?: InjectedWallet
  luncDash?: InjectedWallet
  luncdashWallet?: InjectedWallet
  luncDashWallet?: InjectedWallet
  getOfflineSigner?: (chainId: string) => OfflineSigner
  getOfflineSignerAuto?: (chainId: string) => Promise<OfflineSigner>
}

type WalletAdapter = {
  id: WalletConnectorId
  label: string
  badge: string
  type: WalletConnector["type"]
  getProvider: (walletWindow: WalletWindow) => InjectedWallet | undefined
  supportsRootSignerFallback?: boolean
}

const ADAPTERS: readonly WalletAdapter[] = [
  {
    id: "keplr",
    label: "Keplr",
    badge: "K",
    type: "extension",
    getProvider: (walletWindow) => walletWindow.keplr,
    supportsRootSignerFallback: true
  },
  {
    id: "leap",
    label: "Leap",
    badge: "L",
    type: "extension",
    getProvider: (walletWindow) => walletWindow.leap
  },
  {
    id: "galaxy",
    label: "Galaxy Station",
    badge: "G",
    type: "extension",
    getProvider: (walletWindow) => walletWindow.galaxyStation
  },
  {
    id: "trust",
    label: "Trust Wallet",
    badge: "T",
    type: "extension",
    getProvider: (walletWindow) =>
      walletWindow.trustwallet?.cosmos ?? walletWindow.trustWallet?.cosmos
  },
  {
    id: "luncdash",
    label: "LUNC Dash",
    badge: "LD",
    type: "extension",
    getProvider: (walletWindow) =>
      walletWindow.luncDash ??
      walletWindow.luncdash ??
      walletWindow.luncDashWallet ??
      walletWindow.luncdashWallet
  }
] as const

const getWalletWindow = () => {
  if (typeof window === "undefined") return undefined
  return window as WalletWindow
}

const getAdapter = (id: WalletConnectorId) => ADAPTERS.find((adapter) => adapter.id === id)

const getRequiredAdapter = (id: WalletConnectorId) => {
  const adapter = getAdapter(id)
  if (!adapter) {
    throw new Error("Unsupported wallet connector")
  }
  return adapter
}

const getRequiredProvider = (id: WalletConnectorId) => {
  const walletWindow = getWalletWindow()
  if (!walletWindow) {
    throw new Error("Wallet not available")
  }
  const adapter = getRequiredAdapter(id)
  const provider = adapter.getProvider(walletWindow)
  if (!provider) {
    throw new Error(`${adapter.label} not installed`)
  }
  return {
    adapter,
    provider,
    walletWindow
  }
}

const enableProvider = async (provider: InjectedWallet) => {
  if (provider.experimentalSuggestChain) {
    await provider.experimentalSuggestChain(KEPLR_CHAIN_CONFIG)
  }
  if (provider.enable) {
    await provider.enable(KEPLR_CHAIN_CONFIG.chainId)
  }
}

const getOfflineSignerFromProvider = async (
  adapter: WalletAdapter,
  provider: InjectedWallet,
  walletWindow: WalletWindow
) => {
  if (provider.getOfflineSignerAuto) {
    return await provider.getOfflineSignerAuto(KEPLR_CHAIN_CONFIG.chainId)
  }
  if (provider.getOfflineSigner) {
    return provider.getOfflineSigner(KEPLR_CHAIN_CONFIG.chainId)
  }
  if (adapter.supportsRootSignerFallback && walletWindow.getOfflineSignerAuto) {
    return await walletWindow.getOfflineSignerAuto(KEPLR_CHAIN_CONFIG.chainId)
  }
  if (adapter.supportsRootSignerFallback && walletWindow.getOfflineSigner) {
    return walletWindow.getOfflineSigner(KEPLR_CHAIN_CONFIG.chainId)
  }
  return undefined
}

const resolveAccount = async (
  adapter: WalletAdapter,
  provider: InjectedWallet,
  walletWindow: WalletWindow
): Promise<WalletAccount> => {
  if (provider.getKey) {
    const key = await provider.getKey(KEPLR_CHAIN_CONFIG.chainId)
    return {
      address: key.bech32Address,
      name: key.name
    }
  }
  const signer = await getOfflineSignerFromProvider(adapter, provider, walletWindow)
  const accounts = await signer?.getAccounts()
  const account = accounts?.[0]
  if (!account) {
    throw new Error(`${adapter.label} account unavailable`)
  }
  return {
    address: account.address
  }
}

export const getWalletConnectors = (): WalletConnector[] => {
  const walletWindow = getWalletWindow()
  return ADAPTERS.map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    type: adapter.type,
    available: Boolean(walletWindow && adapter.getProvider(walletWindow))
  }))
}

export const isWalletConnectorAvailable = (id: WalletConnectorId) => {
  const walletWindow = getWalletWindow()
  if (!walletWindow) return false
  const adapter = getRequiredAdapter(id)
  return Boolean(adapter.getProvider(walletWindow))
}

export const getWalletConnectorLabel = (id?: WalletConnectorId) =>
  id ? getAdapter(id)?.label ?? "Wallet" : "Wallet"

export const getWalletConnectorBadge = (id?: WalletConnectorId) =>
  id ? getAdapter(id)?.badge ?? "W" : "W"

export const connectWalletConnector = async (id: WalletConnectorId) => {
  const { adapter, provider, walletWindow } = getRequiredProvider(id)
  await enableProvider(provider)
  return resolveAccount(adapter, provider, walletWindow)
}

export const getOfflineSignerForConnector = async (id: WalletConnectorId) => {
  const { adapter, provider, walletWindow } = getRequiredProvider(id)
  await enableProvider(provider)
  const signer = await getOfflineSignerFromProvider(adapter, provider, walletWindow)
  if (!signer) {
    throw new Error(`${adapter.label} signer not available`)
  }
  return signer
}

export const connectClassicSigningClientForConnector = async (
  id: WalletConnectorId
) => connectClassicSigningClient(await getOfflineSignerForConnector(id))
