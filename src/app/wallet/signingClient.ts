import { sha256 } from "@cosmjs/crypto"
import { toHex } from "@cosmjs/encoding"
import { Registry, type OfflineSigner } from "@cosmjs/proto-signing"
import {
  createWasmAminoConverters,
  wasmTypes
} from "@cosmjs/cosmwasm-stargate"
import {
  AminoTypes,
  GasPrice,
  SigningStargateClient,
  createDefaultAminoConverters,
  defaultRegistryTypes
} from "@cosmjs/stargate"
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"
import {
  CHAIN_RUNTIME_CONFIG,
  CLASSIC_READ_ENDPOINTS_CONFIG,
  type ChainRuntimeConfig
} from "../config/chainConfig"
import {
  isTxAlreadyInCacheError,
  parseSequenceMismatchExpected
} from "../tx/txDiagnostics"
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

const createAlreadySubmittedResult = (txBytes: Uint8Array) => ({
  code: 0,
  rawLog: "Transaction already exists in cache",
  transactionHash: getClassicTxHash(txBytes)
})

const createBroadcastResultError = (result: BroadcastResultLike) =>
  new Error(result.rawLog || `Classic transaction failed with code ${result.code}`)

const ensureBroadcastSuccess = (result: BroadcastResultLike) => {
  if (result.code !== 0) {
    throw createBroadcastResultError(result)
  }
  return result
}

const waitBeforeSequenceRetry = () =>
  new Promise((resolve) => setTimeout(resolve, 220))

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

const connectClassicEndpoint = (
  signer: OfflineSigner,
  endpoint: string,
  options?: ClassicClientOptions
) =>
  SigningStargateClient.connectWithSigner(endpoint, signer, {
    ...getClassicClientOptions(options)
  })

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
  const initial = await connectClassicEndpointWithFallback(signer, options)
  const runtime = options?.runtime ?? CHAIN_RUNTIME_CONFIG.lunc
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

  return {
    simulate: (signerAddress, messages, memo) =>
      withEndpointFallback((activeClient) =>
        activeClient.simulate(signerAddress, messages, memo)
      ),
    signAndBroadcast: (signerAddress, messages, fee, memo = "") =>
      runSerializedTransaction(
        `${runtime.chain.chainId}:${signerAddress}`,
        async () => {
          if (fee === "auto") {
            for (let attempt = 0; attempt < 3; attempt += 1) {
              try {
                return await withEndpointFallback(async (activeClient) =>
                  ensureBroadcastSuccess(
                    await activeClient.signAndBroadcast(
                      signerAddress,
                      messages,
                      fee,
                      memo
                    )
                  )
                )
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                const expectedSequence = parseSequenceMismatchExpected(message)
                if (expectedSequence !== undefined && attempt < 2) {
                  await waitBeforeSequenceRetry()
                  continue
                }
                throw error
              }
            }

            throw new Error("Classic transaction broadcast failed")
          }

          let sequenceHint: number | undefined

          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              let signingClient = client
              const { accountNumber, sequence } = await withEndpointFallback(
                async (activeClient) => {
                  signingClient = activeClient
                  return activeClient.getSequence(signerAddress)
                }
              )
              const txRaw = await signingClient.sign(
                signerAddress,
                messages,
                fee,
                memo,
                {
                  accountNumber,
                  sequence: sequenceHint ?? sequence,
                  chainId: runtime.chain.chainId
                }
              )
              const txBytes = Uint8Array.from(TxRaw.encode(txRaw).finish())
              try {
                const result = await withEndpointFallback(async (activeClient) =>
                  ensureBroadcastSuccess(await activeClient.broadcastTx(txBytes))
                )
                return result
              } catch (broadcastError) {
                if (isTxAlreadyInCacheError(broadcastError)) {
                  return createAlreadySubmittedResult(txBytes)
                }
                throw broadcastError
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              const expectedSequence = parseSequenceMismatchExpected(message)
              if (expectedSequence !== undefined && attempt < 2) {
                sequenceHint = expectedSequence
                await waitBeforeSequenceRetry()
                continue
              }
              throw error
            }
          }

          throw new Error("Classic transaction broadcast failed")
        }
      ),
    getSequence: (address) =>
      withEndpointFallback((activeClient) => activeClient.getSequence(address)),
    sign: (signerAddress, messages, fee, memo, signerData) =>
      client.sign(signerAddress, messages, fee, memo, signerData),
    broadcastTx: async (tx, timeoutMs, pollIntervalMs) => {
      try {
        return await withEndpointFallback((activeClient) =>
          activeClient.broadcastTx(tx, timeoutMs, pollIntervalMs)
        )
      } catch (error) {
        if (isTxAlreadyInCacheError(error)) {
          return createAlreadySubmittedResult(tx)
        }
        throw error
      }
    },
    broadcastTxSync: async (tx) => {
      try {
        return await withEndpointFallback((activeClient) =>
          activeClient.broadcastTxSync(tx)
        )
      } catch (error) {
        if (isTxAlreadyInCacheError(error)) {
          return getClassicTxHash(tx)
        }
        throw error
      }
    },
    delegateTokens: (delegatorAddress, validatorAddress, amount, fee, memo) =>
      fee === "auto"
        ? client.delegateTokens(delegatorAddress, validatorAddress, amount, fee, memo)
        : withEndpointFallback((activeClient) =>
            activeClient.delegateTokens(
              delegatorAddress,
              validatorAddress,
              amount,
              fee,
              memo
            )
          ),
    undelegateTokens: (delegatorAddress, validatorAddress, amount, fee, memo) =>
      fee === "auto"
        ? client.undelegateTokens(
            delegatorAddress,
            validatorAddress,
            amount,
            fee,
            memo
          )
        : withEndpointFallback((activeClient) =>
            activeClient.undelegateTokens(
              delegatorAddress,
              validatorAddress,
              amount,
              fee,
              memo
            )
          )
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
  feeDenom: string = runtime.nativeDenom.coinMinimalDenom
) =>
  connectClassicClientWithFallback(signer, {
    runtime,
    feeDenom
  })
