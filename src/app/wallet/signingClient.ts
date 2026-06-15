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
import { CLASSIC_READ_ENDPOINTS_CONFIG } from "../config/chainConfig"

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
}

const unique = <T,>(items: readonly T[]) => Array.from(new Set(items))

export const CLASSIC_SIGNING_RPC_ENDPOINTS = unique([
  CLASSIC_CHAIN.rpc,
  ...CLASSIC_READ_ENDPOINTS_CONFIG.rpc
])

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

export const getClassicRegistry = () => {
  return new Registry([...defaultRegistryTypes, ...wasmTypes])
}

export const getClassicAminoTypes = () =>
  new AminoTypes({
    ...createDefaultAminoConverters(),
    ...createWasmAminoConverters()
  })

const getClassicClientOptions = ({
  feeDenom = CLASSIC_DENOMS.lunc.coinMinimalDenom
}: ClassicClientOptions = {}) => ({
  gasPrice: GasPrice.fromString(`28.325${feeDenom}`),
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

  for (const [index, endpoint] of CLASSIC_SIGNING_RPC_ENDPOINTS.entries()) {
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
  let endpointIndex = initial.endpointIndex
  let client = initial.client

  const reconnectNext = async () => {
    let lastError: unknown

    for (let offset = 1; offset <= CLASSIC_SIGNING_RPC_ENDPOINTS.length; offset += 1) {
      const nextIndex = (endpointIndex + offset) % CLASSIC_SIGNING_RPC_ENDPOINTS.length
      try {
        const nextClient = await connectClassicEndpoint(
          signer,
          CLASSIC_SIGNING_RPC_ENDPOINTS[nextIndex],
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

    for (let attempt = 0; attempt < CLASSIC_SIGNING_RPC_ENDPOINTS.length; attempt += 1) {
      try {
        return await action(client)
      } catch (error) {
        lastError = error
        if (
          !isClassicEndpointRetryableError(error) ||
          attempt === CLASSIC_SIGNING_RPC_ENDPOINTS.length - 1
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
    signAndBroadcast: async (signerAddress, messages, fee, memo = "") => {
      if (fee === "auto") {
        return client.signAndBroadcast(signerAddress, messages, fee, memo)
      }

      let signingClient = client
      const { accountNumber, sequence } = await withEndpointFallback(
        async (activeClient) => {
          signingClient = activeClient
          return activeClient.getSequence(signerAddress)
        }
      )
      const txRaw = await signingClient.sign(signerAddress, messages, fee, memo, {
        accountNumber,
        sequence,
        chainId: CLASSIC_CHAIN.chainId
      })
      const txBytes = Uint8Array.from(TxRaw.encode(txRaw).finish())
      return withEndpointFallback((activeClient) => activeClient.broadcastTx(txBytes))
    },
    getSequence: (address) =>
      withEndpointFallback((activeClient) => activeClient.getSequence(address)),
    sign: (signerAddress, messages, fee, memo, signerData) =>
      client.sign(signerAddress, messages, fee, memo, signerData),
    broadcastTx: (tx, timeoutMs, pollIntervalMs) =>
      withEndpointFallback((activeClient) =>
        activeClient.broadcastTx(tx, timeoutMs, pollIntervalMs)
      ),
    broadcastTxSync: (tx) =>
      withEndpointFallback((activeClient) => activeClient.broadcastTxSync(tx)),
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
    feeDenom: CLASSIC_DENOMS.lunc.coinMinimalDenom
  })

export const connectClassicStargateClient = async (
  signer: OfflineSigner,
  feeDenom: string = CLASSIC_DENOMS.lunc.coinMinimalDenom
) =>
  connectClassicClientWithFallback(signer, {
    feeDenom
  })
