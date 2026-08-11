import type { OfflineSigner } from "@cosmjs/proto-signing"
import type { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { getActiveAppChainKey } from "../activeChain"
import { getKeplrChainConfig } from "../chain"
import { CHAIN_RUNTIME_CONFIG } from "../config/chainConfig"
import {
  connectBurritoNativeWallet,
  disconnectBurritoNativeWallet,
  getBurritoNativeConnector,
  getBurritoNativeOfflineSigner
} from "./burritoNativeWallet"
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
  getSigningStargateClient?: (
    id: WalletConnectorId,
    feeDenom?: string
  ) => Promise<ClassicStargateClient | undefined>
  runWithSessionRetry?: <T>(
    id: WalletConnectorId,
    operation: () => Promise<T>
  ) => Promise<T>
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
  const ensureCurrentSigner = async () => {
    const currentAddress = await getSignerAddress(signer)
    if (currentAddress !== signerAddress) {
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
      _signerAddress: string,
      messages: readonly EncodeObjectLike[],
      fee: StdFeeLike,
      memo: string,
      signerData: SignerDataLike
    ) => {
      await ensureCurrentSigner()
      return client.sign(signerAddress, messages, fee, memo, signerData)
    },
    signAndBroadcast: async (
      _signerAddress: string,
      messages: readonly EncodeObjectLike[],
      fee: "auto" | StdFeeLike,
      memo = ""
    ) => {
      await ensureCurrentSigner()
      return client.signAndBroadcast(signerAddress, messages, fee, memo)
    },
    delegateTokens: async (
      _delegatorAddress: string,
      validatorAddress: string,
      amount: { denom: string; amount: string },
      fee: "auto" | StdFeeLike,
      memo?: string
    ) => {
      await ensureCurrentSigner()
      return client.delegateTokens(signerAddress, validatorAddress, amount, fee, memo)
    },
    undelegateTokens: async (
      _delegatorAddress: string,
      validatorAddress: string,
      amount: { denom: string; amount: string },
      fee: "auto" | StdFeeLike,
      memo?: string
    ) => {
      await ensureCurrentSigner()
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
  if (!walletWindow?.keplr) {
    throw new Error("Keplr not installed")
  }
  return {
    provider: walletWindow.keplr,
    walletWindow
  }
}

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
  if (walletWindow.getOfflineSignerAuto) {
    return await walletWindow.getOfflineSignerAuto(chainId)
  }
  if (walletWindow.getOfflineSigner) {
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
  if (walletWindow.getOfflineSigner) {
    return walletWindow.getOfflineSigner(chainId)
  }
  return undefined
}

const hasDesktopKeplr = () => Boolean(getWalletWindow()?.keplr)

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
  const walletWindow = getWalletWindow()
  const keplrRuntimeConnector = walletAdapterRuntime?.getConnector?.("keplr")
  const galaxyRuntimeConnector = walletAdapterRuntime?.getConnector?.("galaxy")

  return [
    getBurritoNativeConnector(),
    keplrRuntimeConnector ?? {
      ...getWalletConnectorMeta("keplr"),
      available: Boolean(walletWindow?.keplr)
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

export const connectWalletConnector = async (id: WalletConnectorId) => {
  if (id === "burrito-native") {
    return connectBurritoNativeWallet(getActiveChain().chain.chainId)
  }
  const runtimeAccount = await walletAdapterRuntime?.connect?.(id)
  if (runtimeAccount) {
    return runtimeAccount
  }

  if (id === "galaxy") {
    return connectGalaxyWallet(getActiveChain().chain.chainId)
  }

  return connectInjectedKeplr()
}

export const disconnectWalletConnector = async (id: WalletConnectorId) => {
  if (id === "burrito-native") {
    await disconnectBurritoNativeWallet()
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
  if (id === "keplr" && hasDesktopKeplr()) {
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

  const { provider, walletWindow } = getRequiredKeplrProvider()
  await enableKeplr(provider)
  const signer = await getOfflineSignerFromKeplr(provider, walletWindow)
  if (!signer) {
    throw new Error("Keplr signer not available")
  }
  return signer
}

export const getAminoOfflineSignerForConnector = async (
  id: WalletConnectorId
) => {
  if (id === "keplr" && hasDesktopKeplr()) {
    return getDirectDesktopKeplrAminoSigner()
  }

  const runtimeSigner = await walletAdapterRuntime?.getAminoOfflineSigner?.(id)
  if (runtimeSigner) {
    return runtimeSigner
  }

  return undefined
}

export const connectClassicSigningClientForConnector = async (
  id: WalletConnectorId
) => {
  const createClient = async () => {
    const { connectSigningClient } = await import("./signingClient")
    const signer =
      (await getAminoOfflineSignerForConnector(id)) ??
      (await getOfflineSignerForConnector(id))
    const signerAddress = await getSignerAddress(signer)
    const client = await connectSigningClient(signer, getActiveChain())
    return bindSignerAddress(
      client as ClassicStargateClient,
      signerAddress,
      signer
    )
  }

  const client = await createClient()
  const runWithSessionRetry = walletAdapterRuntime?.runWithSessionRetry
  if (id !== "keplr-mobile" || !runWithSessionRetry) {
    return client
  }

  const withFreshClient = async <T>(
    operation: (activeClient: ClassicStargateClient) => Promise<T>
  ) => {
    let isFirstAttempt = true
    return runWithSessionRetry(id, async () => {
      if (isFirstAttempt) {
        isFirstAttempt = false
        return operation(client)
      }
      return operation(await createClient())
    })
  }

  return {
    ...client,
    sign: (...args: Parameters<ClassicStargateClient["sign"]>) =>
      withFreshClient((activeClient) => activeClient.sign(...args)),
    signAndBroadcast: (
      ...args: Parameters<ClassicStargateClient["signAndBroadcast"]>
    ) =>
      withFreshClient((activeClient) =>
        activeClient.signAndBroadcast(...args)
      ),
    delegateTokens: (
      ...args: Parameters<ClassicStargateClient["delegateTokens"]>
    ) =>
      withFreshClient((activeClient) => activeClient.delegateTokens(...args)),
    undelegateTokens: (
      ...args: Parameters<ClassicStargateClient["undelegateTokens"]>
    ) =>
      withFreshClient((activeClient) => activeClient.undelegateTokens(...args))
  } satisfies ClassicStargateClient
}

export const connectClassicStargateClientForConnector = async (
  id: WalletConnectorId,
  feeDenom?: string
) : Promise<ClassicStargateClient> => {
  const { connectStargateClient } = await import("./signingClient")
  if (id === "keplr" && hasDesktopKeplr()) {
    const signer = await getDirectDesktopKeplrSigner()
    if (!signer) {
      throw new Error("Keplr signer not available")
    }
    const signerAddress = await getSignerAddress(signer)
    const client = await connectStargateClient(signer, getActiveChain(), feeDenom)
    return bindSignerAddress(client, signerAddress, signer)
  }

  const runtimeClient = await walletAdapterRuntime?.getSigningStargateClient?.(
    id,
    feeDenom
  )
  if (runtimeClient) {
    return runtimeClient
  }

  const aminoSigner = await getAminoOfflineSignerForConnector(id)
  if (aminoSigner) {
    const signerAddress = await getSignerAddress(aminoSigner)
    const client = await connectStargateClient(
      aminoSigner,
      getActiveChain(),
      feeDenom
    )
    return bindSignerAddress(client, signerAddress, aminoSigner)
  }

  const signer = await getOfflineSignerForConnector(id)
  const signerAddress = await getSignerAddress(signer)
  const client = await connectStargateClient(signer, getActiveChain(), feeDenom)
  return bindSignerAddress(client, signerAddress, signer)
}

export const connectSigningClientForConnector =
  connectClassicSigningClientForConnector

export const connectStargateClientForConnector =
  connectClassicStargateClientForConnector
