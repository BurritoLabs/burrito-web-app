import { sha256 } from "@cosmjs/crypto"
import { toHex } from "@cosmjs/encoding"
import { Registry, type OfflineSigner } from "@cosmjs/proto-signing"
import {
  createWasmAminoConverters,
  wasmTypes
} from "@cosmjs/cosmwasm-stargate"
import {
  AminoTypes,
  BroadcastTxError,
  calculateFee,
  GasPrice,
  SigningStargateClient,
  createDefaultAminoConverters,
  defaultRegistryTypes
} from "@cosmjs/stargate"
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"
import {
  getActiveAppChainGeneration,
  getActiveAppChainRuntime
} from "../activeChain"
import {
  CHAIN_RUNTIME_CONFIG,
  CLASSIC_READ_ENDPOINTS_CONFIG,
  type ChainRuntimeConfig
} from "../config/chainConfig"
import { asTxConfirmationUnknown } from "../tx/broadcastOutcome"
import { noteSignedTxForConfirmation } from "../tx/receiptJournal"
import { runSerializedTransaction } from "../tx/transactionQueue"

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

export type ClassicSigningClient = {
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

type ClassicClientOptions = {
  feeDenom?: string
  runtime?: ChainRuntimeConfig
  selection?: { assertCurrent: () => void; verifySigner: () => Promise<void> }
}

const unique = <T,>(items: readonly T[]) => Array.from(new Set(items))

export const CLASSIC_SIGNING_RPC_ENDPOINTS = unique([
  CLASSIC_CHAIN.rpc,
  ...CLASSIC_READ_ENDPOINTS_CONFIG.rpc
])

export const getSigningRpcEndpoints = (runtime: ChainRuntimeConfig) =>
  unique([runtime.chain.rpc, ...runtime.endpoints.rpc])

export const isClassicEndpointRetryableError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ""
  const lower = message.toLowerCase()

  return (
    /\b(408|425|429|500|502|503|504)\b/.test(message) ||
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("network error") ||
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed")
  )
}

export const getClassicTxHash = (txBytes: Uint8Array) =>
  toHex(sha256(txBytes)).toUpperCase()

const createBroadcastResultError = (result: BroadcastResultLike) =>
  new Error(result.rawLog || `Classic transaction failed with code ${result.code}`)

const ensureBroadcastSuccess = (result: BroadcastResultLike) => {
  if (result.code !== 0) {
    throw createBroadcastResultError(result)
  }
  return result
}

export const getClassicRegistry = () => {
  return new Registry([...defaultRegistryTypes, ...wasmTypes])
}

export const getClassicAminoTypes = () =>
  new AminoTypes({
    ...createDefaultAminoConverters(),
    ...createWasmAminoConverters()
  })

const getClassicClientOptions = ({
  runtime = CHAIN_RUNTIME_CONFIG.lunc,
  feeDenom = runtime.nativeDenom.coinMinimalDenom
}: ClassicClientOptions = {}) => ({
  gasPrice: GasPrice.fromString(
    `${runtime.gasPriceStep.average}${feeDenom}`
  ),
  registry: getClassicRegistry(),
  aminoTypes: getClassicAminoTypes()
})

const connectClassicEndpoint = async (
  signer: OfflineSigner,
  endpoint: string,
  options?: ClassicClientOptions
): Promise<SigningStargateClient> => {
  const runtime = options?.runtime ?? CHAIN_RUNTIME_CONFIG.lunc
  const client = await SigningStargateClient.connectWithSigner(endpoint, signer, {
    ...getClassicClientOptions(options)
  })

  const actualChainId = await client.getChainId()
  if (actualChainId !== runtime.chain.chainId) {
    client.disconnect()
    throw new Error(
      `RPC chain mismatch. Expected ${runtime.chain.chainId}, received ${actualChainId}.`
    )
  }

  return client
}

const connectClassicEndpointWithFallback = async (
  signer: OfflineSigner,
  options?: ClassicClientOptions
) => {
  let lastError: unknown
  const runtime = options?.runtime ?? CHAIN_RUNTIME_CONFIG.lunc
  const endpoints = getSigningRpcEndpoints(runtime)

  for (const [index, endpoint] of endpoints.entries()) {
    try {
      return {
        client: await connectClassicEndpoint(signer, endpoint, options),
        endpointIndex: index
      }
    } catch (error) {
      lastError = error
      if (!isClassicEndpointRetryableError(error)) {
        throw error
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Classic RPC endpoint unavailable")
}

const connectClassicClientWithFallback = async (
  signer: OfflineSigner,
  options?: ClassicClientOptions
): Promise<ClassicSigningClient> => {
  const runtime = options?.runtime ?? CHAIN_RUNTIME_CONFIG.lunc
  const chainGeneration = getActiveAppChainGeneration()
  const assertSigningContext = () => {
    const active = getActiveAppChainRuntime()
    if (
      active.chain.chainId !== runtime.chain.chainId ||
      getActiveAppChainGeneration() !== chainGeneration
    ) {
      throw new Error(
        "The selected chain changed before signing. Review the transaction and try again."
      )
    }
  }

  const initial = await connectClassicEndpointWithFallback(signer, options)
  const endpoints = getSigningRpcEndpoints(runtime)
  let endpointIndex = initial.endpointIndex
  let client = initial.client

  const reconnectNext = async () => {
    let lastError: unknown

    for (let offset = 1; offset <= endpoints.length; offset += 1) {
      const nextIndex = (endpointIndex + offset) % endpoints.length
      try {
        const nextClient = await connectClassicEndpoint(
          signer,
          endpoints[nextIndex],
          options
        )
        endpointIndex = nextIndex
        client = nextClient
        return nextClient
      } catch (error) {
        lastError = error
        if (!isClassicEndpointRetryableError(error)) {
          throw error
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Classic RPC endpoint unavailable")
  }

  const withEndpointFallback = async <T>(
    action: (activeClient: typeof client) => Promise<T>
  ) => {
    let lastError: unknown

    for (let attempt = 0; attempt < endpoints.length; attempt += 1) {
      try {
        return await action(client)
      } catch (error) {
        lastError = error
        if (
          !isClassicEndpointRetryableError(error) ||
          attempt === endpoints.length - 1
        ) {
          throw error
        }
        await reconnectNext()
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Classic RPC endpoint request failed")
  }

  const chainId = runtime.chain.chainId
  const gasPrice = GasPrice.fromString(
    `${runtime.gasPriceStep.average}${options?.feeDenom ?? runtime.nativeDenom.coinMinimalDenom}`
  )

  // Never replay a write or a signature, including on another RPC. The
  // previous endpoint can accept the transaction even when its reply is lost.
  const dispatchOnce = async <T extends string | BroadcastResultLike>(tx: Uint8Array, write: () => Promise<T>) => {
    assertSigningContext()
    await options?.selection?.verifySigner()
    assertSigningContext()
    options?.selection?.assertCurrent()
    const hash = getClassicTxHash(tx)
    noteSignedTxForConfirmation(hash, chainId)
    try {
      const response = await write()
      const observed = typeof response === "string" ? response : response.transactionHash
      if (observed?.toUpperCase() !== hash) throw new Error("RPC returned a different transaction ID")
      return response
    } catch (error) {
      // Explicit CheckTx rejection is definitive. "In cache" denotes possible
      // prior acceptance, never successful inclusion. All polling/transport
      // faults remain uncertain, including Safari's generic "Load failed".
      if (error instanceof BroadcastTxError && !/already exists in cache/i.test(error.message)) {
        throw error
      }
      throw asTxConfirmationUnknown(error, hash, chainId) ?? error
    }
  }

  const signAndBroadcastOnce: ClassicSigningClient["signAndBroadcast"] = (
    signerAddress, messages, fee, memo = ""
  ) => runSerializedTransaction(`${chainId}:${signerAddress}`, async () => {
    assertSigningContext()
    // Same multiplier and rounding as the pinned CosmJS default for "auto".
    const usedFee = fee === "auto"
      ? calculateFee(Math.round(1.4 * await withEndpointFallback(active =>
          active.simulate(signerAddress, messages, memo))), gasPrice)
      : fee
    const signerState = await withEndpointFallback(active => active.getSequence(signerAddress))
    assertSigningContext()
    options?.selection?.assertCurrent()
    const signed = await client.sign(signerAddress, messages, usedFee, memo, { ...signerState, chainId })
    const bytes = TxRaw.encode(signed).finish()
    const result = await dispatchOnce(bytes, () => client.broadcastTx(bytes))
    // A nonzero DeliverTx result is a known execution failure, not uncertainty.
    return ensureBroadcastSuccess(result)
  })

  return {
    simulate: (signerAddress, messages, memo) => {
      assertSigningContext()
      return withEndpointFallback(active => active.simulate(signerAddress, messages, memo))
    },
    signAndBroadcast: signAndBroadcastOnce,
    getSequence: (address) =>
      withEndpointFallback(active => active.getSequence(address)),
    sign: (signerAddress, messages, fee, memo, signerData) => {
      assertSigningContext()
      if (signerData.chainId !== chainId) throw new Error("Signing request is for a different chain.")
      options?.selection?.assertCurrent()
      return client.sign(signerAddress, messages, fee, memo, signerData)
    },
    broadcastTx: (tx, timeoutMs, pollIntervalMs) =>
      dispatchOnce(tx, () => client.broadcastTx(tx, timeoutMs, pollIntervalMs)),
    broadcastTxSync: tx => dispatchOnce(tx, () => client.broadcastTxSync(tx)),
    delegateTokens: (delegatorAddress, validatorAddress, amount, fee, memo) =>
      signAndBroadcastOnce(delegatorAddress, [{
        typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
        value: { delegatorAddress, validatorAddress, amount }
      }], fee, memo),
    undelegateTokens: (delegatorAddress, validatorAddress, amount, fee, memo) =>
      signAndBroadcastOnce(delegatorAddress, [{
        typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate",
        value: { delegatorAddress, validatorAddress, amount }
      }], fee, memo)
  }
}

export const connectClassicSigningClient = async (signer: OfflineSigner) =>
  connectClassicClientWithFallback(signer, {
    runtime: CHAIN_RUNTIME_CONFIG.lunc,
    feeDenom: CLASSIC_DENOMS.lunc.coinMinimalDenom
  })

export const connectClassicStargateClient = async (
  signer: OfflineSigner,
  feeDenom: string = CLASSIC_DENOMS.lunc.coinMinimalDenom
) =>
  connectClassicClientWithFallback(signer, {
    runtime: CHAIN_RUNTIME_CONFIG.lunc,
    feeDenom
  })

export const connectSigningClient = async (
  signer: OfflineSigner,
  runtime: ChainRuntimeConfig
) =>
  connectClassicClientWithFallback(signer, {
    runtime,
    feeDenom: runtime.nativeDenom.coinMinimalDenom
  })

export const connectStargateClient = async (
  signer: OfflineSigner,
  runtime: ChainRuntimeConfig,
  feeDenom: string = runtime.nativeDenom.coinMinimalDenom,
  selection?: ClassicClientOptions["selection"]
) =>
  connectClassicClientWithFallback(signer, {
    runtime,
    feeDenom,
    selection
  })
