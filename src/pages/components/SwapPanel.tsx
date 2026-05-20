import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import styles from "../Swap.module.css"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../../app/chain"
import {
  cacheNativeBalances,
  fetchBalances,
  fetchPrices,
  getCachedNativeBalances
} from "../../app/data/classic"
import { CLASSIC_SWAP_DEXES } from "../../app/data/dexFactories"
import {
  fetchCw20Balance,
  getCachedCw20ContractBalances,
  useCw20Balances
} from "../../app/data/cw20"
import { useResolvedCw20Whitelist, type Cw20Token } from "../../app/data/terraAssets"
import { formatTokenAmount, formatUsd, toUnitAmount } from "../../app/utils/format"
import { formatTxError } from "../../app/utils/txError"
import { buildClassicNativeIconCandidates, buildCw20IconCandidates } from "../../app/utils/assetIcons"
import { parseCommonJsArray } from "../../app/utils/cjsRegistry"
import {
  fromMicroAmount,
  parseBigInt,
  sanitizeAmount,
  toMicroAmount
} from "../../app/swap/amount"
import { useWallet } from "../../app/wallet/WalletContext"
import { HEXXAGON_DEX_PAIRS_URL } from "../../app/config/externalServices"
import {
  DEFAULT_SLIPPAGE_BPS,
  FALLBACK_GAS_CW20_FEE,
  FALLBACK_GAS_CW20_SWAP,
  FALLBACK_GAS_NATIVE_FEE,
  FALLBACK_GAS_NATIVE_SWAP,
  GAS_PRICE_MICRO_LUNC,
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_RECIPIENT,
  SLIPPAGE_OPTIONS,
  SWAP_MEMO
} from "../../app/config/swapConfig"
import SwapAssetPickerModal from "./swap/SwapAssetPickerModal"
import SwapAssetIcon from "./swap/SwapAssetIcon"

type AssetType = "native" | "cw20"
type DexId = string
type DexQueryMode = "terraswap" | "garuda"

type SwapAsset = {
  id: string
  type: AssetType
  symbol: string
  name: string
  decimals: number
  denom?: string
  contract?: string
  iconCandidates: string[]
}

const EMPTY_BALANCES: Array<{ denom: string; amount: string }> = []

type SwapAssetOverride = {
  id: string
  symbol?: string
  name?: string
  decimals?: number
  iconCandidates?: string[]
}

type DexConfig = {
  id: DexId
  label: string
  factory: string
  mode?: DexQueryMode
}

type DexQuote = DexConfig & {
  pair: string
  returnAmount: bigint
  spreadAmount: bigint
  commissionAmount: bigint
  beliefPrice: string | undefined
}

type SmartSimulateResponse = {
  return_amount?: string
  spread_amount?: string
  commission_amount?: string
}

type PairQueryResponse = {
  contract_addr?: string
  contract?: string
}

type DexPairAsset = {
  dex?: string
  type?: string
  assets?: string[]
}

type HexxagonDexPair = {
  token?: string
  dex?: string
  type?: string
  assets?: string[]
}

const asNativeId = (denom: string) => `native:${denom}`
const asCw20Id = (contract: string) => `cw20:${contract}`
const buildNativeIconCandidates = (denom: string, symbol: string) =>
  buildClassicNativeIconCandidates({ denom, symbol })

const NATIVE_ASSETS: readonly SwapAsset[] = [
  {
    id: asNativeId(CLASSIC_DENOMS.lunc.coinMinimalDenom),
    type: "native",
    symbol: CLASSIC_DENOMS.lunc.coinDenom,
    name: CLASSIC_DENOMS.lunc.coinDenom,
    denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
    decimals: CLASSIC_DENOMS.lunc.coinDecimals,
    iconCandidates: buildNativeIconCandidates(
      CLASSIC_DENOMS.lunc.coinMinimalDenom,
      CLASSIC_DENOMS.lunc.coinDenom
    )
  },
  {
    id: asNativeId(CLASSIC_DENOMS.ustc.coinMinimalDenom),
    type: "native",
    symbol: CLASSIC_DENOMS.ustc.coinDenom,
    name: CLASSIC_DENOMS.ustc.coinDenom,
    denom: CLASSIC_DENOMS.ustc.coinMinimalDenom,
    decimals: CLASSIC_DENOMS.ustc.coinDecimals,
    iconCandidates: buildNativeIconCandidates(
      CLASSIC_DENOMS.ustc.coinMinimalDenom,
      CLASSIC_DENOMS.ustc.coinDenom
    )
  }
]

type SwapPanelProps = {
  defaultFromAssetId?: string
  defaultToAssetId?: string
  embedded?: boolean
  assetOverrides?: SwapAssetOverride[]
}
const DEFAULT_FROM_ASSET_ID = NATIVE_ASSETS[0].id
const DEFAULT_TO_ASSET_ID = NATIVE_ASSETS[1].id
const normalizeDexName = (name: string) => name.toLowerCase().split("-")[0]
const ACTIVE_DEX_IDS = new Set(CLASSIC_SWAP_DEXES.map((item) => normalizeDexName(item.id)))

const DEXES: readonly DexConfig[] = CLASSIC_SWAP_DEXES.map((dex) => ({
  ...dex,
  mode: dex.mode ?? "terraswap"
}))

const FACTORY_PAIR_CACHE = new Map<string, string>()

const encodeJsonBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value))

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return window.btoa(binary)
}

const encodeSmartQueryPayload = (value: unknown) =>
  encodeURIComponent(bytesToBase64(encodeJsonBytes(value)))

const encodeBase64Json = (value: unknown) => bytesToBase64(encodeJsonBytes(value))

const formatAssetUsdText = ({
  asset,
  amountMicro,
  luncUsd,
  ustcUsd
}: {
  asset: SwapAsset
  amountMicro: bigint
  luncUsd?: number
  ustcUsd?: number
}) => {
  const price =
    asset.type === "native"
      ? asset.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
        ? luncUsd
        : asset.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
          ? ustcUsd
          : undefined
      : undefined

  if (price === undefined) return "≈ --"
  const unitAmount = toUnitAmount(amountMicro, asset.decimals)
  return `≈ ${formatUsd(unitAmount * price)}`
}

const bpsToMaxSpread = (bps: bigint) => {
  const asPercent = Number(bps) / 10_000
  return asPercent.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") || "0.005"
}

const ratioToDecimal = (numerator: bigint, denominator: bigint, precision = 18) => {
  if (numerator <= 0n || denominator <= 0n) return undefined
  const scale = 10n ** BigInt(precision)
  const whole = numerator / denominator
  const fraction = ((numerator % denominator) * scale) / denominator
  const fractionText = fraction.toString().padStart(precision, "0").replace(/0+$/, "")
  return fractionText ? `${whole.toString()}.${fractionText}` : whole.toString()
}

const toAssetInfo = (asset: SwapAsset) => {
  if (asset.type === "native" && asset.denom) {
    return { native_token: { denom: asset.denom } }
  }
  if (asset.type === "cw20" && asset.contract) {
    return { token: { contract_addr: asset.contract } }
  }
  throw new Error("invalid asset")
}

const toGarudaAsset = (asset: SwapAsset) => {
  if (asset.type === "native" && asset.denom) {
    return { native: asset.denom }
  }
  if (asset.type === "cw20" && asset.contract) {
    return { cw20: asset.contract }
  }
  throw new Error("invalid asset")
}

const resolveFactoryPair = async (
  dex: DexConfig,
  offerAsset: SwapAsset,
  askAsset: SwapAsset
) => {
  const cacheKey = `${dex.id}:${dex.factory}:${offerAsset.id}:${askAsset.id}`
  const cached = FACTORY_PAIR_CACHE.get(cacheKey)
  if (cached) return cached

  const query =
    dex.mode === "garuda"
      ? {
          pair: {
            asset1: toGarudaAsset(offerAsset),
            asset2: toGarudaAsset(askAsset)
          }
        }
      : {
          pair: {
            asset_infos: [toAssetInfo(offerAsset), toAssetInfo(askAsset)]
          }
        }

  const payload = encodeSmartQueryPayload(query)
  const url = `${CLASSIC_CHAIN.lcd}/cosmwasm/wasm/v1/contract/${dex.factory}/smart/${payload}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`pair lookup failed: ${response.status}`)
  }
  const data = (await response.json()) as { data?: PairQueryResponse }
  const pair = data?.data?.contract_addr ?? data?.data?.contract
  if (!pair) {
    throw new Error("pair lookup unavailable")
  }
  FACTORY_PAIR_CACHE.set(cacheKey, pair)
  return pair
}

const simulateSwapQuote = async (
  dex: DexConfig,
  offerAsset: SwapAsset,
  askAsset: SwapAsset,
  amount: bigint
) => {
  const pair = await resolveFactoryPair(dex, offerAsset, askAsset)
  const query =
    dex.mode === "garuda"
      ? {
          simulate_swap: {
            offer_asset: toGarudaAsset(offerAsset),
            offer_amount: amount.toString()
          }
        }
      : {
          simulation: {
            offer_asset: {
              info: toAssetInfo(offerAsset),
              amount: amount.toString()
            }
          }
        }

  const payload = encodeSmartQueryPayload(query)
  const url = `${CLASSIC_CHAIN.lcd}/cosmwasm/wasm/v1/contract/${pair}/smart/${payload}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${dex.label} quote failed: ${response.status}`)
  }
  const data = (await response.json()) as { data?: SmartSimulateResponse }
  const result = data?.data
  if (!result?.return_amount) {
    throw new Error(`${dex.label} quote unavailable`)
  }
  const returnAmount = parseBigInt(result.return_amount)
  const beliefPrice =
    dex.mode === "garuda" ? undefined : ratioToDecimal(amount, returnAmount)
  return {
    ...dex,
    pair,
    returnAmount,
    spreadAmount: parseBigInt(result.spread_amount),
    commissionAmount: parseBigInt(result.commission_amount),
    beliefPrice
  } satisfies DexQuote
}

const usesMinReceiveExecute = (dexId: string, mode: DexQueryMode = "terraswap") =>
  mode === "garuda" || dexId.startsWith("terraport")

const buildSwapMessage = async (
  sender: string,
  pair: string,
  offerAsset: SwapAsset,
  amountMicro: bigint,
  maxSpread: string,
  minReceiveMicro: bigint,
  dexId: string,
  mode: DexQueryMode = "terraswap",
  beliefPrice?: string
) => {
  const { MsgExecuteContract } = await import("cosmjs-types/cosmwasm/wasm/v1/tx")
  const minReceive = minReceiveMicro.toString()
  const useMinReceive = usesMinReceiveExecute(dexId, mode)

  if (offerAsset.type === "native" && offerAsset.denom) {
    const msg =
      mode === "garuda"
        ? {
            swap: {
              offer_asset: toGarudaAsset(offerAsset),
              offer_amount: amountMicro.toString(),
              min_receive: minReceive
            }
          }
        : useMinReceive
        ? {
            swap: {
              offer_asset: {
                info: toAssetInfo(offerAsset),
                amount: amountMicro.toString()
              },
              min_receive: minReceive
            }
          }
        : {
            swap: {
              offer_asset: {
                info: toAssetInfo(offerAsset),
                amount: amountMicro.toString()
              },
              ...(beliefPrice ? { belief_price: beliefPrice } : {}),
              max_spread: maxSpread
            }
          }

    return {
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: MsgExecuteContract.fromPartial({
        sender,
        contract: pair,
        msg: encodeJsonBytes(msg),
        funds: [
          {
            denom: offerAsset.denom,
            amount: amountMicro.toString()
          }
        ]
      })
    }
  }

  if (offerAsset.type === "cw20" && offerAsset.contract) {
    const hookMsg = encodeBase64Json(
      useMinReceive
        ? {
            swap: {
              min_receive: minReceive
            }
          }
        : {
            swap: {
              ...(beliefPrice ? { belief_price: beliefPrice } : {}),
              max_spread: maxSpread
            }
          }
    )
    return {
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: MsgExecuteContract.fromPartial({
        sender,
        contract: offerAsset.contract,
        msg: encodeJsonBytes({
          send: {
            contract: pair,
            amount: amountMicro.toString(),
            msg: hookMsg
          }
        }),
        funds: []
      })
    }
  }

  throw new Error("unsupported swap asset")
}

const buildPlatformFeeMessage = async (
  sender: string,
  offerAsset: SwapAsset,
  feeAmountMicro: bigint
) => {
  if (feeAmountMicro <= 0n) return undefined

  if (offerAsset.type === "native" && offerAsset.denom) {
    const { MsgSend } = await import("cosmjs-types/cosmos/bank/v1beta1/tx")
    return {
      typeUrl: "/cosmos.bank.v1beta1.MsgSend",
      value: MsgSend.fromPartial({
        fromAddress: sender,
        toAddress: PLATFORM_FEE_RECIPIENT,
        amount: [
          {
            denom: offerAsset.denom,
            amount: feeAmountMicro.toString()
          }
        ]
      })
    }
  }

  if (offerAsset.type === "cw20" && offerAsset.contract) {
    const { MsgExecuteContract } = await import("cosmjs-types/cosmwasm/wasm/v1/tx")
    return {
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: MsgExecuteContract.fromPartial({
        sender,
        contract: offerAsset.contract,
        msg: encodeJsonBytes({
          transfer: {
            recipient: PLATFORM_FEE_RECIPIENT,
            amount: feeAmountMicro.toString()
          }
        }),
        funds: []
      })
    }
  }

  throw new Error("unsupported fee asset")
}

const estimateFallbackFeeMicro = (offerAsset: SwapAsset, includePlatformFee: boolean) => {
  const swapGas =
    offerAsset.type === "cw20" ? FALLBACK_GAS_CW20_SWAP : FALLBACK_GAS_NATIVE_SWAP
  const feeGas = includePlatformFee
    ? offerAsset.type === "cw20"
      ? FALLBACK_GAS_CW20_FEE
      : FALLBACK_GAS_NATIVE_FEE
    : 0
  return BigInt(Math.ceil((swapGas + feeGas) * GAS_PRICE_MICRO_LUNC))
}

const getAmountDensity = (value?: string) => {
  const text = String(value ?? "").trim()
  if (!text || text === "--") return "default" as const
  const digits = text.replace(/\D/g, "").length
  if (text.length >= 14 || digits >= 12) return "tiny" as const
  if (text.length >= 10 || digits >= 8) return "compact" as const
  return "default" as const
}

const SwapPanel = ({
  defaultFromAssetId = DEFAULT_FROM_ASSET_ID,
  defaultToAssetId = DEFAULT_TO_ASSET_ID,
  embedded = false,
  assetOverrides = []
}: SwapPanelProps) => {
  const {
    account,
    connectorId,
    connectors,
    connect,
    startTx,
    finishTx,
    failTx
  } = useWallet()
  const accountAddress = account?.address

  const [fromAssetId, setFromAssetId] = useState<string>(DEFAULT_FROM_ASSET_ID)
  const [toAssetId, setToAssetId] = useState<string>(DEFAULT_TO_ASSET_ID)
  const [amountIn, setAmountIn] = useState("")
  const [slippageBps, setSlippageBps] = useState<bigint>(DEFAULT_SLIPPAGE_BPS)
  const [quotes, setQuotes] = useState<DexQuote[]>([])
  const [selectedDexId, setSelectedDexId] = useState<DexId>()
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string>()
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeDisplay, setFeeDisplay] = useState("--")
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const [lastTxHash, setLastTxHash] = useState<string>()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [pickerTarget, setPickerTarget] = useState<"from" | "to" | null>(null)
  const [pickerQuery, setPickerQuery] = useState("")
  const appliedDefaultPairRef = useRef<string | null>(null)

  const { data: dexPairs = {} } = useQuery({
    queryKey: ["swap-dex-pairs", "classic"],
    queryFn: async () => {
      const response = await fetch(HEXXAGON_DEX_PAIRS_URL)
      if (!response.ok) {
        throw new Error(`Failed to load DEX pairs: ${response.status}`)
      }
      const source = await response.text()
      const pairs = parseCommonJsArray<HexxagonDexPair>(source)
      return pairs.reduce<Record<string, DexPairAsset>>((acc, pair, index) => {
        const key = pair.token || `${pair.dex ?? "dex"}:${index}`
        acc[key] = {
          dex: pair.dex,
          type: pair.type,
          assets: pair.assets ?? []
        }
        return acc
      }, {})
    },
    staleTime: 60 * 60 * 1000
  })

  const tradableCw20Set = useMemo(() => {
    const set = new Set<string>()
    Object.values(dexPairs).forEach((entry) => {
      const dexName = entry.dex ? normalizeDexName(entry.dex) : undefined
      if (dexName && !ACTIVE_DEX_IDS.has(dexName)) return
      ;(entry.assets ?? []).forEach((asset) => {
        if (asset.startsWith("terra1")) {
          set.add(asset)
        }
      })
    })
    return set
  }, [dexPairs])

  const { data: cw20Whitelist = {} } = useResolvedCw20Whitelist(
    Array.from(tradableCw20Set)
  )

  const overrideCw20Whitelist = useMemo<Record<string, Cw20Token>>(() => {
    const records: Record<string, Cw20Token> = {}
    assetOverrides.forEach((asset) => {
      if (!asset.id.startsWith("cw20:")) return
      const contract = asset.id.slice("cw20:".length).toLowerCase()
      if (!contract) return
      records[contract] = {
        token: contract,
        symbol: asset.symbol || contract.slice(0, 6).toUpperCase(),
        name: asset.name || asset.symbol || contract,
        decimals: asset.decimals ?? 6,
        icon: asset.iconCandidates?.[0]
      }
    })
    return records
  }, [assetOverrides])
  const overrideCw20Contracts = useMemo(
    () => Object.keys(overrideCw20Whitelist),
    [overrideCw20Whitelist]
  )

  const swapCw20Whitelist = useMemo(
    () => ({ ...cw20Whitelist, ...overrideCw20Whitelist }),
    [cw20Whitelist, overrideCw20Whitelist]
  )

  const assetOverrideMap = useMemo(
    () => new Map(assetOverrides.map((asset) => [asset.id, asset])),
    [assetOverrides]
  )

  const assets = useMemo<SwapAsset[]>(() => {
    const applyOverride = (asset: SwapAsset): SwapAsset => {
      const override = assetOverrideMap.get(asset.id)
      if (!override) return asset
      return {
        ...asset,
        symbol: override.symbol ?? asset.symbol,
        name: override.name ?? asset.name,
        decimals: override.decimals ?? asset.decimals,
        iconCandidates:
          override.iconCandidates && override.iconCandidates.length > 0
            ? override.iconCandidates
            : asset.iconCandidates
      }
    }

    const cw20Rows = Object.entries(swapCw20Whitelist)
      .map(([contract, token]) => {
        const decimals = Number(token.decimals ?? 6)
        return applyOverride({
          id: asCw20Id(contract),
          type: "cw20" as const,
          symbol: token.symbol || token.name || contract.slice(0, 6).toUpperCase(),
          name: token.name || token.symbol || contract,
          decimals: Number.isFinite(decimals) ? decimals : 6,
          contract,
          iconCandidates: buildCw20IconCandidates(token.icon, token.symbol)
        } satisfies SwapAsset)
      })
      .sort((a, b) => {
        const aTradable = !tradableCw20Set.size || tradableCw20Set.has(a.contract ?? "")
        const bTradable = !tradableCw20Set.size || tradableCw20Set.has(b.contract ?? "")
        if (aTradable !== bTradable) return aTradable ? -1 : 1
        return a.symbol.localeCompare(b.symbol)
      })

    return [...NATIVE_ASSETS.map(applyOverride), ...cw20Rows]
  }, [assetOverrideMap, swapCw20Whitelist, tradableCw20Set])

  const { data: cw20Balances = [] } = useCw20Balances(
    accountAddress,
    swapCw20Whitelist,
    { forceContracts: overrideCw20Contracts }
  )

  useEffect(() => {
    if (!assets.length) return
    if (!assets.some((asset) => asset.id === fromAssetId)) {
      setFromAssetId(assets[0].id)
    }
    if (!assets.some((asset) => asset.id === toAssetId) || toAssetId === fromAssetId) {
      const nextTo = assets.find((asset) => asset.id !== fromAssetId)
      if (nextTo) {
        setToAssetId(nextTo.id)
      }
    }
  }, [assets, fromAssetId, toAssetId])

  useEffect(() => {
    if (!assets.length) return

    const defaultPairKey = `${defaultFromAssetId}:${defaultToAssetId}`
    if (appliedDefaultPairRef.current === defaultPairKey) return

    const hasDefaultFrom = assets.some((asset) => asset.id === defaultFromAssetId)
    const hasDefaultTo = assets.some(
      (asset) => asset.id === defaultToAssetId && asset.id !== defaultFromAssetId
    )

    if (!hasDefaultFrom || !hasDefaultTo) return

    appliedDefaultPairRef.current = defaultPairKey
    setFromAssetId(defaultFromAssetId)
    setToAssetId(defaultToAssetId)
    setQuotes([])
    setSelectedDexId(undefined)
    setQuoteError(undefined)
  }, [assets, defaultFromAssetId, defaultToAssetId])

  const fromAsset = useMemo(
    () => assets.find((asset) => asset.id === fromAssetId) ?? assets[0] ?? NATIVE_ASSETS[0],
    [assets, fromAssetId]
  )

  const toAsset = useMemo(() => {
    const candidate = assets.find((asset) => asset.id === toAssetId && asset.id !== fromAsset.id)
    if (candidate) return candidate
    return assets.find((asset) => asset.id !== fromAsset.id) ?? NATIVE_ASSETS[1]
  }, [assets, toAssetId, fromAsset.id])

  const quoteFromAsset = useMemo(
    () =>
      ({
        id: fromAsset.id,
        type: fromAsset.type,
        symbol: fromAsset.symbol,
        name: fromAsset.name,
        decimals: fromAsset.decimals,
        denom: fromAsset.denom,
        contract: fromAsset.contract,
        iconCandidates: []
      }) satisfies SwapAsset,
    [
      fromAsset.contract,
      fromAsset.decimals,
      fromAsset.denom,
      fromAsset.id,
      fromAsset.name,
      fromAsset.symbol,
      fromAsset.type
    ]
  )

  const quoteToAsset = useMemo(
    () =>
      ({
        id: toAsset.id,
        type: toAsset.type,
        symbol: toAsset.symbol,
        name: toAsset.name,
        decimals: toAsset.decimals,
        denom: toAsset.denom,
        contract: toAsset.contract,
        iconCandidates: []
      }) satisfies SwapAsset,
    [
      toAsset.contract,
      toAsset.decimals,
      toAsset.denom,
      toAsset.id,
      toAsset.name,
      toAsset.symbol,
      toAsset.type
    ]
  )

  const amountInMicro = useMemo(
    () => toMicroAmount(amountIn, fromAsset.decimals),
    [amountIn, fromAsset.decimals]
  )
  const platformFeeMicro = useMemo(
    () => (amountInMicro * PLATFORM_FEE_BPS) / 10_000n,
    [amountInMicro]
  )
  const swapAmountMicro = useMemo(
    () => amountInMicro - platformFeeMicro,
    [amountInMicro, platformFeeMicro]
  )

  const cachedNativeBalances = useMemo(
    () => getCachedNativeBalances(accountAddress),
    [accountAddress]
  )
  const balancesQuery = useQuery({
    queryKey: ["swap-balances", accountAddress],
    queryFn: () => fetchBalances(accountAddress ?? ""),
    enabled: Boolean(accountAddress),
    initialData: cachedNativeBalances?.data,
    initialDataUpdatedAt: cachedNativeBalances?.updatedAt,
    placeholderData: (previousData) => previousData,
    staleTime: 15_000,
    refetchInterval: 20_000
  })
  const balances = balancesQuery.data ?? EMPTY_BALANCES

  useEffect(() => {
    cacheNativeBalances(accountAddress, balancesQuery.data)
  }, [accountAddress, balancesQuery.data])

  const { data: prices } = useQuery({
    queryKey: ["prices"],
    queryFn: fetchPrices,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000
  })

  const focusedCw20Contracts = useMemo(() => {
    const contracts = [fromAsset, toAsset]
      .filter((asset) => asset.type === "cw20" && asset.contract)
      .map((asset) => asset.contract!.toLowerCase())
    return Array.from(new Set(contracts))
  }, [fromAsset, toAsset])

  const cachedFocusedCw20Balances = useMemo(
    () => getCachedCw20ContractBalances(accountAddress, focusedCw20Contracts),
    [accountAddress, focusedCw20Contracts]
  )
  const { data: focusedCw20Balances = {} } = useQuery({
    queryKey: [
      "swap-focused-cw20-balances",
      accountAddress,
      focusedCw20Contracts.join(",")
    ],
    queryFn: async () => {
      const entries = await Promise.all(
        focusedCw20Contracts.map(async (contract) => [
          contract,
          await fetchCw20Balance(accountAddress ?? "", contract)
        ])
      )
      return Object.fromEntries(entries) as Record<string, string>
    },
    enabled: Boolean(accountAddress && focusedCw20Contracts.length),
    initialData: cachedFocusedCw20Balances?.data,
    initialDataUpdatedAt: cachedFocusedCw20Balances?.updatedAt,
    placeholderData: (previousData) => previousData,
    staleTime: 15_000,
    refetchOnMount: true
  })

  const assetBalanceMap = useMemo(() => {
    const map = new Map<string, bigint>()

    for (const asset of assets) {
      if (asset.type === "native" && asset.denom) {
        const coin = balances.find((item) => item.denom === asset.denom)
        map.set(asset.id, parseBigInt(coin?.amount))
        continue
      }
      if (asset.type === "cw20" && asset.contract) {
        const contract = asset.contract.toLowerCase()
        const tokenBalance = cw20Balances.find((item) => item.address === contract)
        map.set(asset.id, parseBigInt(focusedCw20Balances[contract] ?? tokenBalance?.balance))
      }
    }

    return map
  }, [assets, balances, cw20Balances, focusedCw20Balances])

  const fromBalanceMicro = useMemo(() => {
    return assetBalanceMap.get(fromAsset.id) ?? 0n
  }, [assetBalanceMap, fromAsset.id])
  const luncUsd = prices?.lunc?.usd
  const ustcUsd = prices?.ustc?.usd

  const fromAmountUsdText = useMemo(
    () =>
      formatAssetUsdText({
        asset: fromAsset,
        amountMicro: amountInMicro,
        luncUsd,
        ustcUsd
      }),
    [fromAsset, amountInMicro, luncUsd, ustcUsd]
  )

  const insufficientBalance = amountInMicro > 0n && amountInMicro > fromBalanceMicro
  const invalidSwapAmount = amountInMicro > 0n && swapAmountMicro <= 0n

  const bestQuote = useMemo(() => {
    if (!quotes.length) return undefined
    return [...quotes].sort((a, b) =>
      b.returnAmount > a.returnAmount ? 1 : b.returnAmount < a.returnAmount ? -1 : 0
    )[0]
  }, [quotes])

  const selectedQuote = useMemo(() => {
    if (!quotes.length) return undefined
    if (!selectedDexId) return bestQuote
    return quotes.find((item) => item.id === selectedDexId) ?? bestQuote
  }, [bestQuote, quotes, selectedDexId])

  const selectedQuotePair = selectedQuote?.pair ?? ""
  const selectedQuoteMode = selectedQuote?.mode ?? "terraswap"

  const feeQuote = useMemo(
    () =>
      selectedQuotePair
        ? {
            pair: selectedQuotePair,
            mode: selectedQuoteMode,
            beliefPrice: selectedQuote?.beliefPrice
          }
        : undefined,
    [selectedQuote?.beliefPrice, selectedQuoteMode, selectedQuotePair]
  )

  const hasAmountInput = amountInMicro > 0n
  const hasQuotePreview = hasAmountInput && Boolean(selectedQuote)
  const previewPending = hasAmountInput && quoteLoading && !selectedQuote

  const toAmountUsdText = useMemo(
    () =>
      formatAssetUsdText({
        asset: toAsset,
        amountMicro: selectedQuote?.returnAmount ?? 0n,
        luncUsd,
        ustcUsd
      }),
    [toAsset, selectedQuote?.returnAmount, luncUsd, ustcUsd]
  )

  const toAmountDisplay = useMemo(
    () =>
      selectedQuote
        ? formatTokenAmount(selectedQuote.returnAmount.toString(), toAsset.decimals, 6)
        : "--",
    [selectedQuote, toAsset.decimals]
  )

  const quotePlaceholderText = useMemo(() => {
    if (!hasAmountInput) return "Enter amount to preview rate, fee, and route details."
    if (previewPending) return "Fetching quotes across Classic DEX routes..."
    return "Route details will appear here once a quote is available."
  }, [hasAmountInput, previewPending])

  const amountInDensity = useMemo(() => getAmountDensity(amountIn), [amountIn])
  const toAmountDensity = useMemo(() => getAmountDensity(toAmountDisplay), [toAmountDisplay])

  const minReceiveMicro = useMemo(() => {
    if (!selectedQuote) return 0n
    const basis = 10_000n - slippageBps
    return (selectedQuote.returnAmount * basis) / 10_000n
  }, [selectedQuote, slippageBps])

  const toFooterText = useMemo(() => {
    if (hasQuotePreview) {
      return `${formatTokenAmount(minReceiveMicro.toString(), toAsset.decimals, 6)} ${toAsset.symbol}`
    }
    if (previewPending) return "Fetching routes..."
    return "Enter amount to preview"
  }, [hasQuotePreview, minReceiveMicro, previewPending, toAsset.decimals, toAsset.symbol])

  const maxSpread = useMemo(() => bpsToMaxSpread(slippageBps), [slippageBps])

  const selectedConnector = useMemo(
    () => connectors.find((item) => item.available),
    [connectors]
  )

  const rateDisplay = useMemo(() => {
    if (!selectedQuote || amountInMicro <= 0n) return "--"
    const rate = Number(selectedQuote.returnAmount) / Number(amountInMicro)
    if (!Number.isFinite(rate) || rate <= 0) return "--"
    return `1 ${fromAsset.symbol} ≈ ${rate.toFixed(6)} ${toAsset.symbol}`
  }, [amountInMicro, fromAsset.symbol, selectedQuote, toAsset.symbol])

  const priceImpactDisplay = useMemo(() => {
    if (!selectedQuote || !bestQuote || bestQuote.returnAmount === 0n) return "--"
    if (selectedQuote.id === bestQuote.id) return "Best"
    const ratio =
      Number(bestQuote.returnAmount - selectedQuote.returnAmount) /
      Number(bestQuote.returnAmount)
    if (!Number.isFinite(ratio) || ratio <= 0) return "--"
    return `-${(ratio * 100).toFixed(2)}%`
  }, [bestQuote, selectedQuote])

  const routeRows = useMemo(() => {
    if (!quotes.length || !bestQuote || bestQuote.returnAmount <= 0n) return []
    return quotes.map((quote) => {
      const lossBps =
        quote.id === bestQuote.id
          ? 0
          : Number(
              ((bestQuote.returnAmount - quote.returnAmount) * 10_000n) /
                bestQuote.returnAmount
            )
      return {
        ...quote,
        lossBps
      }
    })
  }, [bestQuote, quotes])

  const pickerAssets = useMemo(() => {
    if (!pickerTarget) return []
    const query = pickerQuery.trim().toLowerCase()
    return assets
      .filter((asset) => {
        if (pickerTarget === "to" && asset.id === fromAsset.id) return false
        if (!query) return true
        const source = `${asset.symbol} ${asset.name} ${asset.contract ?? asset.denom ?? ""}`.toLowerCase()
        return source.includes(query)
      })
      .sort((a, b) => {
        const aBalance = assetBalanceMap.get(a.id) ?? 0n
        const bBalance = assetBalanceMap.get(b.id) ?? 0n
        const aHas = aBalance > 0n
        const bHas = bBalance > 0n
        if (aHas !== bHas) return aHas ? -1 : 1
        if (a.type !== b.type) return a.type === "native" ? -1 : 1
        if (aBalance !== bBalance) return bBalance > aBalance ? 1 : -1
        return a.symbol.localeCompare(b.symbol)
      })
  }, [assetBalanceMap, assets, fromAsset.id, pickerQuery, pickerTarget])

  const closePicker = () => {
    setPickerTarget(null)
    setPickerQuery("")
  }

  const handlePickAsset = (assetId: string) => {
    if (pickerTarget === "from") {
      handleFromAssetChange(assetId)
    } else if (pickerTarget === "to") {
      handleToAssetChange(assetId)
    }
    closePicker()
  }

  useEffect(() => {
    if (!pickerTarget) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [pickerTarget])

  useEffect(() => {
    if (!pickerTarget) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [pickerTarget])

  useEffect(() => {
    let cancelled = false

    if (swapAmountMicro <= 0n) {
      setQuotes((current) => (current.length ? [] : current))
      setQuoteError(undefined)
      setQuoteLoading(false)
      return undefined
    }

    const timer = window.setTimeout(async () => {
      setQuoteLoading(true)
      setQuoteError(undefined)
      try {
        const settled = await Promise.allSettled(
          DEXES.map((dex) =>
            simulateSwapQuote(dex, quoteFromAsset, quoteToAsset, swapAmountMicro)
          )
        )
        const nextQuotes = settled
          .filter((item): item is PromiseFulfilledResult<DexQuote> => item.status === "fulfilled")
          .map((item) => item.value)
          .sort((a, b) =>
            b.returnAmount > a.returnAmount ? 1 : b.returnAmount < a.returnAmount ? -1 : 0
          )

        if (cancelled) return
        if (!nextQuotes.length) {
          setQuotes([])
          setQuoteError("No on-chain quote available from supported DEXes.")
          return
        }

        setQuotes(nextQuotes)
        setSelectedDexId((current) => {
          if (current && nextQuotes.some((quote) => quote.id === current)) {
            return current
          }
          return nextQuotes[0].id
        })
      } catch (error) {
        if (cancelled) return
        setQuotes([])
        setQuoteError(error instanceof Error ? error.message : "Failed to fetch quote.")
      } finally {
        if (!cancelled) {
          setQuoteLoading(false)
        }
      }
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [quoteFromAsset, quoteToAsset, swapAmountMicro])

  useEffect(() => {
    if (!feeQuote || swapAmountMicro <= 0n) {
      setFeeDisplay((current) => (current === "--" ? current : "--"))
      setFeeLoading(false)
      return undefined
    }

    const fallbackFee = `${formatTokenAmount(
      estimateFallbackFeeMicro(quoteFromAsset, platformFeeMicro > 0n).toString(),
      6,
      6
    )} LUNC`

    setFeeDisplay((current) => (current === fallbackFee ? current : fallbackFee))
    setFeeLoading(false)
  }, [
    feeQuote,
    platformFeeMicro,
    quoteFromAsset,
    swapAmountMicro
  ])

  const handleSwapDirection = () => {
    setFromAssetId(toAsset.id)
    setToAssetId(fromAsset.id)
    setQuotes([])
    setSelectedDexId(undefined)
    setQuoteError(undefined)
  }

  const handleFromAssetChange = (nextId: string) => {
    setFromAssetId(nextId)
    if (nextId === toAsset.id) {
      const fallback = assets.find((asset) => asset.id !== nextId)
      if (fallback) setToAssetId(fallback.id)
    }
    setQuotes([])
    setSelectedDexId(undefined)
    setQuoteError(undefined)
  }

  const handleToAssetChange = (nextId: string) => {
    if (nextId === fromAsset.id) return
    setToAssetId(nextId)
    setQuotes([])
    setSelectedDexId(undefined)
    setQuoteError(undefined)
  }

  const handleConnect = async () => {
    if (!selectedConnector) return
    setSubmitError(undefined)
    await connect(selectedConnector.id)
  }

  const handleSubmit = async () => {
    if (!accountAddress) {
      setSubmitError("Connect wallet first.")
      return
    }
    if (!selectedQuote) {
      setSubmitError("Quote unavailable.")
      return
    }
    if (amountInMicro <= 0n) {
      setSubmitError("Enter amount.")
      return
    }
    if (swapAmountMicro <= 0n) {
      setSubmitError("Amount too small after platform fee.")
      return
    }
    if (insufficientBalance) {
      setSubmitError(`Insufficient ${fromAsset.symbol} balance.`)
      return
    }

    setSubmitError(undefined)
    setSubmitLoading(true)
    try {
      startTx("Swap")
      if (!connectorId) throw new Error("Wallet not connected")
      const {
        connectClassicSigningClientForConnector,
        getSignerAddressForConnector
      } = await import("../../app/wallet/walletAdapters")
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)

      const feeMsg = await buildPlatformFeeMessage(signerAddress, fromAsset, platformFeeMicro)
      const msg = await buildSwapMessage(
        signerAddress,
        selectedQuote.pair,
        fromAsset,
        swapAmountMicro,
        maxSpread,
        minReceiveMicro,
        selectedQuote.id,
        selectedQuote.mode ?? "terraswap",
        selectedQuote.beliefPrice
      )
      const messages = feeMsg ? [feeMsg, msg] : [msg]
      const result = await client.signAndBroadcast(signerAddress, messages, "auto", SWAP_MEMO)
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Swap failed")
      }
      const hash = result.transactionHash
      finishTx(hash)
      setLastTxHash(hash)
    } catch (error) {
      const message = formatTxError(error, "Swap failed")
      failTx(message)
      setSubmitError(message)
    } finally {
      setSubmitLoading(false)
    }
  }

  const swapCardClassName = embedded
    ? `card ${styles.swapCard} ${styles.swapCardEmbedded}`
    : `card ${styles.swapCard}`

  const content = (
    <section className={swapCardClassName}>
      <div className={styles.swapCardBody}>
            <div className={styles.topMeta}>
              <p className={styles.formHint}>
                Aggregated on-chain quotes across Classic DEX routes.
              </p>
              <div className={styles.slippageControl}>
                {SLIPPAGE_OPTIONS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`${styles.slippageButton} ${
                      slippageBps === item.bps ? styles.slippageButtonActive : ""
                    }`}
                    onClick={() => setSlippageBps(item.bps)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.swapPanel}>
              <div className={styles.fieldCard}>
                <div className={styles.fieldHeader}>
                  <span>From</span>
                  <button
                    className={styles.maxButton}
                    type="button"
                    onClick={() =>
                      setAmountIn(fromMicroAmount(fromBalanceMicro, fromAsset.decimals))
                    }
                  >
                    Max
                  </button>
                </div>
                <div className={styles.fieldBody}>
                  <button
                    type="button"
                    className={styles.assetPickerButton}
                    onClick={() => setPickerTarget("from")}
                  >
                    <span className={styles.assetPickerValue}>
                      <SwapAssetIcon
                        symbol={fromAsset.symbol}
                        candidates={fromAsset.iconCandidates}
                        size={22}
                      />
                      <span>{fromAsset.symbol}</span>
                    </span>
                    <span className={styles.assetPickerCaret}>▾</span>
                  </button>
                  <input
                    className={[
                      styles.amountInput,
                      amountInDensity === "compact"
                        ? styles.amountInputCompact
                        : amountInDensity === "tiny"
                          ? styles.amountInputTiny
                          : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    inputMode="decimal"
                    value={amountIn}
                    onChange={(event) => setAmountIn(sanitizeAmount(event.target.value))}
                    placeholder="0.00"
                  />
                </div>
                <div className={styles.fieldFooter}>
                  <span>
                    Balance:{" "}
                    {formatTokenAmount(
                      fromBalanceMicro.toString(),
                      fromAsset.decimals,
                      6
                    )}
                  </span>
                  <span className={styles.usdHint}>{fromAmountUsdText}</span>
                </div>
              </div>

              <div className={styles.switchRow}>
                <button
                  className={styles.switchButton}
                  type="button"
                  onClick={handleSwapDirection}
                  aria-label="Switch assets"
                >
                  <svg
                    className={styles.switchIcon}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M9 5.5v11"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                    <path
                      d="M6.75 7.75L9 5.5l2.25 2.25"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M15 18.5v-11"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                    <path
                      d="M12.75 16.25L15 18.5l2.25-2.25"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <div className={styles.fieldCard}>
                <div className={styles.fieldHeader}>
                  <span>To</span>
                  {hasQuotePreview || previewPending ? (
                    <span className={styles.routeLabel}>
                      {previewPending ? "Fetching routes..." : `Best: ${bestQuote?.label ?? "--"}`}
                    </span>
                  ) : null}
                </div>
                <div className={styles.fieldBody}>
                  <button
                    type="button"
                    className={styles.assetPickerButton}
                    onClick={() => setPickerTarget("to")}
                  >
                    <span className={styles.assetPickerValue}>
                      <SwapAssetIcon
                        symbol={toAsset.symbol}
                        candidates={toAsset.iconCandidates}
                        size={22}
                      />
                      <span>{toAsset.symbol}</span>
                    </span>
                    <span className={styles.assetPickerCaret}>▾</span>
                  </button>
                  <div
                    className={[
                      styles.readonlyAmount,
                      toAmountDensity === "compact"
                        ? styles.readonlyAmountCompact
                        : toAmountDensity === "tiny"
                          ? styles.readonlyAmountTiny
                          : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {toAmountDisplay}
                  </div>
                </div>
                <div className={styles.fieldFooter}>
                  <span>
                    Minimum receive: {toFooterText}
                  </span>
                  {hasQuotePreview ? (
                    <span className={styles.usdHint}>{toAmountUsdText}</span>
                  ) : null}
                </div>
              </div>
            </div>

            {hasQuotePreview ? (
              <section className={styles.quoteAccordion}>
                <button
                  type="button"
                  className={styles.quoteAccordionHeader}
                  onClick={() => setAdvancedOpen((current) => !current)}
                  aria-expanded={advancedOpen}
                >
                  <span className={styles.quoteAccordionMain}>{rateDisplay}</span>
                  <span className={styles.quoteAccordionMeta}>
                    {bestQuote?.label ?? "--"} · Impact {priceImpactDisplay}
                  </span>
                  <span className={styles.quoteAccordionMeta}>
                    Fee {feeLoading ? "Estimating..." : feeDisplay}
                  </span>
                  <span className={styles.quoteAccordionToggle}>
                    {advancedOpen ? "Hide details ▴" : "Show details ▾"}
                  </span>
                </button>

                {advancedOpen ? (
                  <div className={styles.quoteAccordionBody}>
                    <div className={styles.detailsGrid}>
                      <div>
                        <label>Rate</label>
                        <strong>{rateDisplay}</strong>
                      </div>
                      <div>
                        <label>Best route</label>
                        <strong>{bestQuote?.label ?? "--"}</strong>
                      </div>
                      <div>
                        <label>Price impact</label>
                        <strong>{priceImpactDisplay}</strong>
                      </div>
                      <div>
                        <label>Slippage</label>
                        <strong>{(Number(slippageBps) / 100).toFixed(2)}%</strong>
                      </div>
                      <div>
                        <label>Estimated fee</label>
                        <strong>{feeLoading ? "Estimating..." : feeDisplay}</strong>
                      </div>
                      <div>
                        <label>Platform fee ({(Number(PLATFORM_FEE_BPS) / 100).toFixed(2)}%)</label>
                        <strong>
                          {`${formatTokenAmount(
                            platformFeeMicro.toString(),
                            fromAsset.decimals,
                            6
                          )} ${fromAsset.symbol}`}
                        </strong>
                      </div>
                      <div>
                        <label>Route path</label>
                        <strong>
                          {fromAsset.symbol} → {toAsset.symbol}
                        </strong>
                      </div>
                    </div>

                    <div className={styles.routesCard}>
                      <div className={styles.routesHeader}>
                        <h3>Liquidity routes</h3>
                        <span>{quoteLoading ? "Updating..." : "Best price auto-detected"}</span>
                      </div>
                      <div className={styles.routeList}>
                        {routeRows.map((quote, index) => {
                          const selected = selectedQuote?.id === quote.id
                          return (
                            <button
                              key={quote.id}
                              type="button"
                              className={`${styles.routeItem} ${selected ? styles.routeItemActive : ""}`}
                              onClick={() => setSelectedDexId(quote.id)}
                            >
                              <div className={styles.routeName}>
                                {quote.label}
                                {index === 0 ? <span className={styles.bestTag}>Best price</span> : null}
                              </div>
                              <div className={styles.routeValue}>
                                {formatTokenAmount(quote.returnAmount.toString(), toAsset.decimals, 6)}{" "}
                                {toAsset.symbol}
                              </div>
                              <div className={styles.routeMeta}>
                                {quote.lossBps > 0
                                  ? `-${(quote.lossBps / 100).toFixed(2)}% vs best`
                                  : "Best"}
                                {" · "}
                                Fee:{" "}
                                {formatTokenAmount(
                                  quote.commissionAmount.toString(),
                                  toAsset.decimals,
                                  6
                                )}{" "}
                                {toAsset.symbol}
                              </div>
                            </button>
                          )
                        })}
                        {!routeRows.length && !quoteLoading ? (
                          <div className={styles.routeEmpty}>
                            Enter amount and choose assets to fetch routes.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : (
              <section className={styles.quotePlaceholder}>
                <span>{quotePlaceholderText}</span>
              </section>
            )}

            {insufficientBalance ? (
              <p className={styles.error}>Insufficient {fromAsset.symbol} balance.</p>
            ) : null}
            {invalidSwapAmount ? (
              <p className={styles.error}>Amount too small after platform fee.</p>
            ) : null}
            {quoteError ? <p className={styles.error}>{quoteError}</p> : null}
            {submitError ? <p className={styles.error}>{submitError}</p> : null}
            {lastTxHash ? (
              <p className={styles.success}>
                Submitted:{" "}
                <a
                  href={`https://finder.burrito.money/classic/tx/${lastTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {lastTxHash.slice(0, 10)}...
                </a>
              </p>
            ) : null}

            <SwapAssetPickerModal
              assetBalanceMap={assetBalanceMap}
              fromAssetId={fromAsset.id}
              onClose={closePicker}
              onPickAsset={handlePickAsset}
              onQueryChange={setPickerQuery}
              pickerAssets={pickerAssets}
              pickerQuery={pickerQuery}
              pickerTarget={pickerTarget}
              toAssetId={toAsset.id}
            />

            {!accountAddress ? (
              <button
                className={`uiButton uiButtonPrimary ${styles.submitButton}`}
                type="button"
                onClick={handleConnect}
                disabled={!selectedConnector}
              >
                {selectedConnector ? `Connect ${selectedConnector.label}` : "Wallet unavailable"}
              </button>
            ) : (
              <button
                className={`uiButton uiButtonPrimary ${styles.submitButton}`}
                type="button"
                onClick={handleSubmit}
                disabled={
                  submitLoading ||
                  quoteLoading ||
                  !selectedQuote ||
                  amountInMicro <= 0n ||
                  invalidSwapAmount ||
                  insufficientBalance
                }
              >
                {submitLoading ? "Submitting..." : `Swap ${fromAsset.symbol} to ${toAsset.symbol}`}
              </button>
            )}
      </div>
    </section>
  )

  if (embedded) return content

  return <div className={styles.swapLayout}>{content}</div>
}

export default SwapPanel
