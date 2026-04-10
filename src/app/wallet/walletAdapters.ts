import type { OfflineSigner } from "@cosmjs/proto-signing"
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { KEPLR_CHAIN_CONFIG } from "../chain"
import {
  connectClassicSigningClient,
  connectClassicStargateClient
} from "./signingClient"
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

type WalletAdapterMeta = {
  id: WalletConnectorId
  label: string
  badge: string
  type: WalletConnector["type"]
}

const CONNECTOR_META: Record<WalletConnectorId, WalletAdapterMeta> = {
  keplr: {
    id: "keplr",
    label: "Keplr",
    badge: "K",
    type: "extension"
  },
  "keplr-mobile": {
    id: "keplr-mobile",
    label: "Keplr Mobile",
    badge: "K",
    type: "mobile"
  },
  galaxy: {
    id: "galaxy",
    label: "Galaxy Station",
    badge: "G",
    type: "extension"
  }
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
  signerAddress: string
): T =>
  ({
    ...client,
    simulate: (
      _signerAddress: string,
      messages: readonly EncodeObjectLike[],
      memo: string
    ) => client.simulate(signerAddress, messages, memo),
    sign: (
      _signerAddress: string,
      messages: readonly EncodeObjectLike[],
      fee: StdFeeLike,
      memo: string,
      signerData: SignerDataLike
    ) => client.sign(signerAddress, messages, fee, memo, signerData),
    signAndBroadcast: (
      _signerAddress: string,
      messages: readonly EncodeObjectLike[],
      fee: "auto" | StdFeeLike,
      memo = ""
    ) => client.signAndBroadcast(signerAddress, messages, fee, memo),
    delegateTokens: (
      _delegatorAddress: string,
      validatorAddress: string,
      amount: { denom: string; amount: string },
      fee: "auto" | StdFeeLike,
      memo?: string
    ) => client.delegateTokens(signerAddress, validatorAddress, amount, fee, memo),
    undelegateTokens: (
      _delegatorAddress: string,
      validatorAddress: string,
      amount: { denom: string; amount: string },
      fee: "auto" | StdFeeLike,
      memo?: string
    ) => client.undelegateTokens(signerAddress, validatorAddress, amount, fee, memo),
    getSequence: (address: string) => client.getSequence(address),
    broadcastTxSync: (tx: Uint8Array) => client.broadcastTxSync(tx)
  }) as T

const getWalletWindow = () => {
  if (typeof window === "undefined") return undefined
  return window as WalletWindow
}

const getConnectorMeta = (id: WalletConnectorId) => CONNECTOR_META[id]

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

const enableKeplr = async (provider: InjectedWallet) => {
  if (provider.experimentalSuggestChain) {
    await provider.experimentalSuggestChain(KEPLR_CHAIN_CONFIG)
  }
  if (provider.enable) {
    await provider.enable(KEPLR_CHAIN_CONFIG.chainId)
  }
}

const getOfflineSignerFromKeplr = async (
  provider: InjectedWallet,
  walletWindow: WalletWindow
) => {
  if (provider.getOfflineSignerAuto) {
    return await provider.getOfflineSignerAuto(KEPLR_CHAIN_CONFIG.chainId)
  }
  if (provider.getOfflineSigner) {
    return provider.getOfflineSigner(KEPLR_CHAIN_CONFIG.chainId)
  }
  if (walletWindow.getOfflineSignerAuto) {
    return await walletWindow.getOfflineSignerAuto(KEPLR_CHAIN_CONFIG.chainId)
  }
  if (walletWindow.getOfflineSigner) {
    return walletWindow.getOfflineSigner(KEPLR_CHAIN_CONFIG.chainId)
  }
  return undefined
}

const getAminoOfflineSignerFromKeplr = async (
  provider: InjectedWallet,
  walletWindow: WalletWindow
) => {
  if (provider.getOfflineSignerOnlyAmino) {
    return provider.getOfflineSignerOnlyAmino(KEPLR_CHAIN_CONFIG.chainId)
  }
  if (provider.getOfflineSignerAmino) {
    return provider.getOfflineSignerAmino(KEPLR_CHAIN_CONFIG.chainId)
  }
  if (walletWindow.getOfflineSigner) {
    return walletWindow.getOfflineSigner(KEPLR_CHAIN_CONFIG.chainId)
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
    const key = await provider.getKey(KEPLR_CHAIN_CONFIG.chainId)
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
    keplrRuntimeConnector ?? {
      ...getConnectorMeta("keplr"),
      available: Boolean(walletWindow?.keplr)
    },
    {
      ...getConnectorMeta("keplr-mobile"),
      available: false
    },
    galaxyRuntimeConnector ?? getGalaxyConnector()
  ]
}

export const isWalletConnectorAvailable = (id: WalletConnectorId) =>
  getWalletConnectors().some((connector) => connector.id === id && connector.available)

export const getWalletConnectorLabel = (id?: WalletConnectorId) =>
  id ? getConnectorMeta(id).label : "Wallet"

export const getWalletConnectorBadge = (id?: WalletConnectorId) =>
  id ? getConnectorMeta(id).badge : "W"

export const connectWalletConnector = async (id: WalletConnectorId) => {
  const runtimeAccount = await walletAdapterRuntime?.connect?.(id)
  if (runtimeAccount) {
    return runtimeAccount
  }

  if (id === "galaxy") {
    return connectGalaxyWallet()
  }

  return connectInjectedKeplr()
}

export const disconnectWalletConnector = async (id: WalletConnectorId) => {
  await walletAdapterRuntime?.disconnect?.(id)

  if (id === "galaxy") {
    await disconnectGalaxyWallet()
  }
}

export const getOfflineSignerForConnector = async (id: WalletConnectorId) => {
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
    return getGalaxyOfflineSigner()
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
  const signer = await getOfflineSignerForConnector(id)
  const signerAddress = await getSignerAddress(signer)
  const client = await connectClassicSigningClient(signer)
  return bindSignerAddress(client as ClassicStargateClient, signerAddress)
}

export const connectClassicStargateClientForConnector = async (
  id: WalletConnectorId,
  feeDenom?: string
) : Promise<ClassicStargateClient> => {
  if (id === "keplr" && hasDesktopKeplr()) {
    const signer = await getDirectDesktopKeplrSigner()
    if (!signer) {
      throw new Error("Keplr signer not available")
    }
    const signerAddress = await getSignerAddress(signer)
    const client = await connectClassicStargateClient(signer, feeDenom)
    return bindSignerAddress(client, signerAddress)
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
    const client = await connectClassicStargateClient(aminoSigner, feeDenom)
    return bindSignerAddress(client, signerAddress)
  }

  const signer = await getOfflineSignerForConnector(id)
  const signerAddress = await getSignerAddress(signer)
  const client = await connectClassicStargateClient(signer, feeDenom)
  return bindSignerAddress(client, signerAddress)
}
