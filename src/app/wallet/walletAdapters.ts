import type { OfflineSigner } from "@cosmjs/proto-signing"
import type { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { getActiveAppChainGeneration, getActiveAppChainKey } from "../activeChain"
import { getKeplrChainConfig } from "../chain"
import { CHAIN_RUNTIME_CONFIG } from "../config/chainConfig"
import { getIndependentKeplrProvider, hasDesktopKeplrProvider } from "./keplrProviderIdentity"
import { captureSigningSelection } from "./signingSelection"
import {
  connectBurritoNativeWallet,
  disconnectBurritoNativeWallet,
  getBurritoNativeConnector,
  getBurritoNativeOfflineSigner
} from "./burritoNativeWallet"
import {
  connectBurritoExtensionWallet,
  disconnectBurritoExtensionWallet,
  getBurritoExtensionConnector,
  getBurritoExtensionOfflineSigner,
  restoreBurritoExtensionWallet
} from "./burritoExtensionWallet"
import {
  connectGalaxyWallet,
  disconnectGalaxyWallet,
  getGalaxyConnector,
  getGalaxyOfflineSigner
} from "./galaxyWallet"
import type {
  WalletAccount,
  WalletConnector,
  WalletConnectorId
} from "./WalletContext"
import {
  getWalletConnectorBadge,
  getWalletConnectorLabel,
  getWalletConnectorMeta
} from "./walletMeta"

type WalletAdapterRuntime = {
  getConnector?: (id: WalletConnectorId) => WalletConnector | undefined
  connect?: (id: WalletConnectorId) => Promise<WalletAccount | undefined>
  disconnect?: (id: WalletConnectorId) => Promise<void>
  getOfflineSigner?: (id: WalletConnectorId) => Promise<OfflineSigner | undefined>
  getAminoOfflineSigner?: (
    id: WalletConnectorId
  ) => Promise<OfflineSigner | undefined>
}

type EncodeObjectLike = {
  typeUrl: string
  value: unknown
}

type StdFeeLike = {
  amount: Array<{ amount: string; denom: string }>
  gas: string
}

type BroadcastResultLike = {
  code: number
  rawLog?: string
  transactionHash: string
  events?: readonly {
    type: string
    attributes: readonly {
      key: string
      value: string
    }[]
  }[]
}

type SignerDataLike = {
  accountNumber: number
  sequence: number
  chainId: string
}

export type ClassicStargateClient = {
  simulate: (
    signerAddress: string,
    messages: readonly EncodeObjectLike[],
    memo: string
  ) => Promise<number>
  signAndBroadcast: (
    signerAddress: string,
    messages: readonly EncodeObjectLike[],
    fee: "auto" | StdFeeLike,
    memo?: string
  ) => Promise<BroadcastResultLike>
  getSequence: (
    address: string
  ) => Promise<{ accountNumber: number; sequence: number }>
  sign: (
    signerAddress: string,
    messages: readonly EncodeObjectLike[],
    fee: StdFeeLike,
    memo: string,
    signerData: SignerDataLike
  ) => Promise<TxRaw>
  broadcastTx: (
    tx: Uint8Array,
    timeoutMs?: number,
    pollIntervalMs?: number
  ) => Promise<BroadcastResultLike>
  broadcastTxSync: (tx: Uint8Array) => Promise<string>
  delegateTokens: (
    delegatorAddress: string,
    validatorAddress: string,
    amount: { denom: string; amount: string },
    fee: "auto" | StdFeeLike,
    memo?: string
  ) => Promise<BroadcastResultLike>
  undelegateTokens: (
    delegatorAddress: string,
    validatorAddress: string,
    amount: { denom: string; amount: string },
    fee: "auto" | StdFeeLike,
    memo?: string
  ) => Promise<BroadcastResultLike>
}

type InjectedKey = {
  bech32Address: string
  name?: string
}

type InjectedWallet = {
  enable?: (chainId: string) => Promise<void>
  getKey?: (chainId: string) => Promise<InjectedKey>
  experimentalSuggestChain?: (config: unknown) => Promise<void>
  getOfflineSigner?: (chainId: string) => OfflineSigner
  getOfflineSignerAmino?: (chainId: string) => OfflineSigner
  getOfflineSignerOnlyAmino?: (chainId: string) => OfflineSigner
  getOfflineSignerAuto?: (chainId: string) => Promise<OfflineSigner>
}

type WalletWindow = Window & {
  keplr?: InjectedWallet
  BurritoKeplr?: InjectedWallet
  getOfflineSigner?: (chainId: string) => OfflineSigner
  getOfflineSignerAuto?: (chainId: string) => Promise<OfflineSigner>
}

let walletAdapterRuntime: WalletAdapterRuntime | undefined

export const registerWalletAdapterRuntime = (runtime?: WalletAdapterRuntime) => {
  walletAdapterRuntime = runtime
}

const getSignerAddress = async (signer: OfflineSigner) => {
  const account = (await signer.getAccounts())[0]
  if (!account?.address) {
    throw new Error("Wallet account unavailable")
  }
  return account.address
}

export const getSignerAddressForConnector = async (id: WalletConnectorId) => {
  const signer = await getOfflineSignerForConnector(id)
  return getSignerAddress(signer)
}

const bindSignerAddress = <T extends ClassicStargateClient>(
  client: T,
  signerAddress: string,
  signer: OfflineSigner
): T => {
  const ensureCurrentSigner = async (requested: string) => {
    const currentAddress = await getSignerAddress(signer)
    if (requested !== signerAddress || currentAddress !== signerAddress) {
      throw new Error(
        "Wallet account changed before signing. Burrito stopped the transaction; try again with the active account."
      )
    }
  }

  return ({
    ...client,
    simulate: (
      _signerAddress: string,
      messages: readonly EncodeObjectLike[],
      memo: string
    ) => client.simulate(signerAddress, messages, memo),
    sign: async (
      requested: string,
      messages: readonly EncodeObjectLike[],
      fee: StdFeeLike,
      memo: string,
      signerData: SignerDataLike
    ) => {
      await ensureCurrentSigner(requested)
      return client.sign(signerAddress, messages, fee, memo, signerData)
    },
    signAndBroadcast: async (
      requested: string,
      messages: readonly EncodeObjectLike[],
      fee: "auto" | StdFeeLike,
      memo = ""
    ) => {
      await ensureCurrentSigner(requested)
      return client.signAndBroadcast(signerAddress, messages, fee, memo)
    },
    delegateTokens: async (
      requested: string,
      validatorAddress: string,
      amount: { denom: string; amount: string },
      fee: "auto" | StdFeeLike,
      memo?: string
    ) => {
      await ensureCurrentSigner(requested)
      return client.delegateTokens(signerAddress, validatorAddress, amount, fee, memo)
    },
    undelegateTokens: async (
      requested: string,
      validatorAddress: string,
      amount: { denom: string; amount: string },
      fee: "auto" | StdFeeLike,
      memo?: string
    ) => {
      await ensureCurrentSigner(requested)
      return client.undelegateTokens(signerAddress, validatorAddress, amount, fee, memo)
    },
    getSequence: (address: string) => client.getSequence(address),
    broadcastTx: (
      tx: Uint8Array,
      timeoutMs?: number,
      pollIntervalMs?: number
    ) => client.broadcastTx(tx, timeoutMs, pollIntervalMs),
    broadcastTxSync: (tx: Uint8Array) => client.broadcastTxSync(tx)
  }) as T
}

const getWalletWindow = () => {
  if (typeof window === "undefined") return undefined
  return window as WalletWindow
}

const getRequiredKeplrProvider = () => {
  const walletWindow = getWalletWindow()
  const provider = getIndependentKeplrProvider(walletWindow)
  if (!walletWindow || !provider) {
    throw new Error("Keplr not installed")
  }
  return {
    provider,
    walletWindow
  }
}

const isBurritoSignerHelper = (helper: unknown, walletWindow: WalletWindow) =>
  Boolean(helper && walletWindow.BurritoKeplr && (
    helper === walletWindow.BurritoKeplr.getOfflineSigner ||
    helper === walletWindow.BurritoKeplr.getOfflineSignerAuto ||
    helper === walletWindow.BurritoKeplr.getOfflineSignerOnlyAmino
  ))

const getActiveChain = () => CHAIN_RUNTIME_CONFIG[getActiveAppChainKey()]

const getActiveKeplrChainConfig = () =>
  getKeplrChainConfig(getActiveAppChainKey())

const enableKeplr = async (provider: InjectedWallet) => {
  const config = getActiveKeplrChainConfig()
  if (provider.experimentalSuggestChain) {
    await provider.experimentalSuggestChain(config)
  }
  if (provider.enable) {
    await provider.enable(config.chainId)
  }
}

const getOfflineSignerFromKeplr = async (
  provider: InjectedWallet,
  walletWindow: WalletWindow
) => {
  const chainId = getActiveKeplrChainConfig().chainId
  if (provider.getOfflineSignerAuto) {
    return await provider.getOfflineSignerAuto(chainId)
  }
  if (provider.getOfflineSigner) {
    return provider.getOfflineSigner(chainId)
  }
  if (walletWindow.getOfflineSignerAuto && !isBurritoSignerHelper(walletWindow.getOfflineSignerAuto, walletWindow)) {
    return await walletWindow.getOfflineSignerAuto(chainId)
  }
  if (walletWindow.getOfflineSigner && !isBurritoSignerHelper(walletWindow.getOfflineSigner, walletWindow)) {
    return walletWindow.getOfflineSigner(chainId)
  }
  return undefined
}

const getAminoOfflineSignerFromKeplr = async (
  provider: InjectedWallet,
  walletWindow: WalletWindow
) => {
  const chainId = getActiveKeplrChainConfig().chainId
  if (provider.getOfflineSignerOnlyAmino) {
    return provider.getOfflineSignerOnlyAmino(chainId)
  }
  if (provider.getOfflineSignerAmino) {
    return provider.getOfflineSignerAmino(chainId)
  }
  if (walletWindow.getOfflineSigner && !isBurritoSignerHelper(walletWindow.getOfflineSigner, walletWindow)) {
    return walletWindow.getOfflineSigner(chainId)
  }
  return undefined
}

const getDirectDesktopKeplrSigner = async () => {
  const { provider, walletWindow } = getRequiredKeplrProvider()
  await enableKeplr(provider)
  return getOfflineSignerFromKeplr(provider, walletWindow)
}

const getDirectDesktopKeplrAminoSigner = async () => {
  const { provider, walletWindow } = getRequiredKeplrProvider()
  await enableKeplr(provider)
  return getAminoOfflineSignerFromKeplr(provider, walletWindow)
}

const connectInjectedKeplr = async (): Promise<WalletAccount> => {
  const { provider, walletWindow } = getRequiredKeplrProvider()
  await enableKeplr(provider)

  if (provider.getKey) {
    const key = await provider.getKey(getActiveKeplrChainConfig().chainId)
    return {
      address: key.bech32Address,
      name: key.name
    }
  }

  const signer = await getOfflineSignerFromKeplr(provider, walletWindow)
  const accounts = await signer?.getAccounts()
  const account = accounts?.[0]
  if (!account) {
    throw new Error("Keplr account unavailable")
  }
  return {
    address: account.address
  }
}

export const getWalletConnectors = (): WalletConnector[] => {
  const keplrRuntimeConnector = walletAdapterRuntime?.getConnector?.("keplr")
  const galaxyRuntimeConnector = walletAdapterRuntime?.getConnector?.("galaxy")

  return [
    getBurritoNativeConnector(),
    getBurritoExtensionConnector(),
    {
      ...getWalletConnectorMeta("keplr"),
      ...keplrRuntimeConnector,
      available: hasDesktopKeplrProvider()
    },
    {
      ...getWalletConnectorMeta("keplr-mobile"),
      available: false
    },
    galaxyRuntimeConnector ?? getGalaxyConnector()
  ]
}

export const isWalletConnectorAvailable = (id: WalletConnectorId) =>
  getWalletConnectors().some((connector) => connector.id === id && connector.available)

export { getWalletConnectorBadge, getWalletConnectorLabel }

export const connectWalletConnector = async (
  id: WalletConnectorId,
  options: { requestApproval?: boolean } = {}
) => {
  if (id === "burrito-native") {
    return connectBurritoNativeWallet(getActiveChain().chain.chainId)
  }
  if (id === "burrito-extension") {
    const connect = options.requestApproval === false
      ? restoreBurritoExtensionWallet
      : connectBurritoExtensionWallet
    return connect(getActiveChain().chain.chainId)
  }
  if (id === "keplr") return connectInjectedKeplr()
  const runtimeConnect = walletAdapterRuntime?.connect
  const runtimeAccount = await runtimeConnect?.(id)
  // A mobile handoff can intentionally return before an account is available.
  // Never replace that pending session with the desktop provider's account.
  if (runtimeAccount || (id === "keplr-mobile" && runtimeConnect)) {
    return runtimeAccount
  }

  if (id === "galaxy") {
    return connectGalaxyWallet(getActiveChain().chain.chainId)
  }

  throw new Error(`${getWalletConnectorLabel(id)} not available`)
}

export const disconnectWalletConnector = async (id: WalletConnectorId) => {
  if (id === "burrito-native") {
    await disconnectBurritoNativeWallet()
    return
  }
  if (id === "burrito-extension") {
    await disconnectBurritoExtensionWallet()
    return
  }
  await walletAdapterRuntime?.disconnect?.(id)

  if (id === "galaxy") {
    await disconnectGalaxyWallet()
  }
}

export const getOfflineSignerForConnector = async (id: WalletConnectorId) => {
  if (id === "burrito-native") {
    return getBurritoNativeOfflineSigner(getActiveChain().chain.chainId)
  }
  if (id === "burrito-extension") {
    return getBurritoExtensionOfflineSigner(getActiveChain().chain.chainId)
  }
  if (id === "keplr") {
    const signer = await getDirectDesktopKeplrSigner()
    if (!signer) {
      throw new Error("Keplr signer not available")
    }
    return signer
  }

  const runtimeSigner = await walletAdapterRuntime?.getOfflineSigner?.(id)
  if (runtimeSigner) {
    return runtimeSigner
  }

  if (id === "galaxy") {
    return getGalaxyOfflineSigner(getActiveChain().chain.chainId)
  }

  throw new Error(`${getWalletConnectorLabel(id)} signer not available`)
}

export const getAminoOfflineSignerForConnector = async (
  id: WalletConnectorId
) => {
  if (id === "keplr") {
    return getDirectDesktopKeplrAminoSigner()
  }

  const runtimeSigner = await walletAdapterRuntime?.getAminoOfflineSigner?.(id)
  if (runtimeSigner) {
    return runtimeSigner
  }

  return undefined
}

// Get the signer from its own connector (including WalletConnect), but always
// use our hash-aware single-dispatch transport. A session can be recovered
// before approval; retrying sign(), or a composite signAndBroadcast(), cannot
// safely distinguish an unanswered prompt from an already-approved payment.
const getConnectorSigningClient = async (
  id: WalletConnectorId,
  feeDenom?: string,
  preferDirectKeplr = false
): Promise<ClassicStargateClient> => {
  const runtime = getActiveChain()
  const generation = getActiveAppChainGeneration()
  const checkOwner = captureSigningSelection()
  const { connectStargateClient } = await import("./signingClient")
  const signer = id === "keplr" && preferDirectKeplr
    ? await getDirectDesktopKeplrSigner()
    : (await getAminoOfflineSignerForConnector(id)) ?? await getOfflineSignerForConnector(id)
  if (!signer) throw new Error("Wallet signer not available")
  const signerAddress = await getSignerAddress(signer)
  const verifyOwner = () => {
    if (getActiveAppChainGeneration() !== generation) {
      throw new Error("The selected chain changed before submission. No transaction was sent.")
    }
    checkOwner(id, signerAddress, runtime.chain.chainId)
  }
  verifyOwner()
  const client = await connectStargateClient(signer, runtime, feeDenom, {
    assertCurrent: verifyOwner,
    verifySigner: async () => {
      verifyOwner()
      if (await getSignerAddress(signer) !== signerAddress) {
        throw new Error("Wallet account changed after approval. No transaction was sent.")
      }
    }
  })
  return bindSignerAddress(client, signerAddress, signer)
}

export const connectClassicSigningClientForConnector = (id: WalletConnectorId) =>
  getConnectorSigningClient(id)

export const connectClassicStargateClientForConnector = (id: WalletConnectorId, feeDenom?: string) =>
  getConnectorSigningClient(id, feeDenom, true)

export const connectSigningClientForConnector =
  connectClassicSigningClientForConnector

export const connectStargateClientForConnector =
  connectClassicStargateClientForConnector
