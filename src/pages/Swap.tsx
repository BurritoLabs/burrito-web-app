import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useQuery } from "@tanstack/react-query"
import { toBase64, toUtf8 } from "@cosmjs/encoding"
import type { OfflineSigner } from "@cosmjs/proto-signing"
import { GasPrice, SigningStargateClient } from "@cosmjs/stargate"
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx"
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx"
import PageShell from "./PageShell"
import styles from "./Swap.module.css"
import { CLASSIC_CHAIN, CLASSIC_DENOMS, KEPLR_CHAIN_CONFIG } from "../app/chain"
import { fetchBalances, fetchPrices } from "../app/data/classic"
import { CLASSIC_SWAP_DEXES } from "../app/data/dexFactories"
import { useCw20Balances } from "../app/data/cw20"
import { useCw20Whitelist } from "../app/data/terraAssets"
import { formatTokenAmount, formatUsd, toUnitAmount } from "../app/utils/format"
import { useWallet } from "../app/wallet/WalletProvider"

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

type InjectedWallet = {
  enable: (chainId: string) => Promise<void>
  experimentalSuggestChain?: (config: unknown) => Promise<void>
}

type WalletWindow = Window & {
  keplr?: InjectedWallet
  station?: InjectedWallet
  galaxyStation?: InjectedWallet
  getOfflineSigner?: (chainId: string) => OfflineSigner
  getOfflineSignerAuto?: (chainId: string) => Promise<OfflineSigner>
}

const asNativeId = (denom: string) => `native:${denom}`
const asCw20Id = (contract: string) => `cw20:${contract}`
const ASSET_URL = "https://assets.terra.dev"

const buildNativeIconCandidates = (denom: string, symbol: string) => {
  const iconDenom = denom === "uluna" ? "LUNC" : symbol
  const upper = iconDenom.toUpperCase()
  const lower = iconDenom.toLowerCase()
  const legacyClassic = upper.endsWith("TC") ? upper.slice(0, -1) : undefined
  const ustAlias = upper === "USTC" ? "UST" : undefined
  return [
    `${ASSET_URL}/icon/60/${iconDenom}.png`,
    `${ASSET_URL}/icon/svg/${iconDenom}.svg`,
    `${ASSET_URL}/icon/60/${upper}.png`,
    `${ASSET_URL}/icon/svg/${upper}.svg`,
    `${ASSET_URL}/icon/60/${lower}.png`,
    ...(legacyClassic
      ? [
          `${ASSET_URL}/icon/60/${legacyClassic}.png`,
          `${ASSET_URL}/icon/svg/${legacyClassic}.svg`,
          `${ASSET_URL}/icon/60/${legacyClassic.toLowerCase()}.png`
        ]
      : []),
    ...(ustAlias
      ? [
          `${ASSET_URL}/icon/60/${ustAlias}.png`,
          `${ASSET_URL}/icon/svg/${ustAlias}.svg`,
          "/system/ustc.png"
        ]
      : []),
    ...(upper === "LUNC" ? ["/system/lunc.svg"] : []),
    "/system/cw20.svg"
  ].filter(Boolean)
}

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
const DEFAULT_FROM_ASSET_ID = NATIVE_ASSETS[0].id
const DEFAULT_TO_ASSET_ID = NATIVE_ASSETS[1].id
const HEXXAGON_DEX_PAIRS_URL =
  "https://raw.githubusercontent.com/hexxagon-io/chain-registry/main/cw20/dex_pairs/mainnet/terra.js"
const normalizeDexName = (name: string) => name.toLowerCase().split("-")[0]
const ACTIVE_DEX_IDS = new Set(CLASSIC_SWAP_DEXES.map((item) => normalizeDexName(item.id)))

const DEXES: readonly DexConfig[] = CLASSIC_SWAP_DEXES.map((dex) => ({
  ...dex,
  mode: dex.mode ?? "terraswap"
}))

const GAS_PRICE_MICRO_LUNC = 28.325
const FALLBACK_GAS_NATIVE_SWAP = 220_000
const FALLBACK_GAS_CW20_SWAP = 300_000
const FALLBACK_GAS_NATIVE_FEE = 80_000
const FALLBACK_GAS_CW20_FEE = 120_000
const SWAP_MEMO = "Swapped via Burrito Swap"
const PLATFORM_FEE_BPS = 20n // 0.20%
const PLATFORM_FEE_RECIPIENT = "terra16x9dcx9pm9j8ykl0td4hptwule706ysjeskflu"
const DEFAULT_SLIPPAGE_BPS = 50n // 0.5%
const SLIPPAGE_OPTIONS = [
  { label: "0.1%", bps: 10n },
  { label: "0.5%", bps: 50n },
  { label: "1.0%", bps: 100n }
] as const
const FACTORY_PAIR_CACHE = new Map<string, string>()

const parseBigInt = (value: string | undefined) => {
  if (!value) return 0n
  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

const parseCommonJsArray = <T,>(source: string): T[] => {
  const normalized = source.replace(/^\uFEFF/, "").trim()
  if (!/^module\.exports\s*=/.test(normalized)) {
    throw new Error("Unsupported CJS format")
  }
  const expression = normalized
    .replace(/^module\.exports\s*=\s*/, "")
    .replace(/;\s*$/, "")
  // Trusted source payload from hexxagon chain-registry.
  const parsed = new Function(`return (${expression})`)() as unknown
  if (!Array.isArray(parsed)) {
    throw new Error("Unsupported CJS payload")
  }
  return parsed as T[]
}

const sanitizeAmount = (value: string) => {
  let next = value.replace(/,/g, "").replace(/[^\d.]/g, "")
  const firstDot = next.indexOf(".")
  if (firstDot >= 0) {
    next = next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, "")
  }
  return next
}

const toMicroAmount = (value: string, decimals = 6) => {
  const cleaned = sanitizeAmount(value).trim()
  if (!cleaned) return 0n
  const [wholePartRaw, fracPartRaw = ""] = cleaned.split(".")
  const wholePart = wholePartRaw || "0"
  if (!/^\d+$/.test(wholePart) || (fracPartRaw && !/^\d+$/.test(fracPartRaw))) {
    return 0n
  }
  const fracPart = fracPartRaw.slice(0, decimals).padEnd(decimals, "0")
  const merged = `${wholePart}${fracPart}`.replace(/^0+/, "") || "0"
  return parseBigInt(merged)
}

const fromMicroAmount = (value: bigint, decimals = 6) => {
  if (value <= 0n) return "0"
  if (decimals <= 0) return value.toString()
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "")
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString()
}

const bpsToMaxSpread = (bps: bigint) => {
  const asPercent = Number(bps) / 10_000
  return asPercent.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") || "0.005"
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

  const payload = encodeURIComponent(toBase64(toUtf8(JSON.stringify(query))))
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

  const payload = encodeURIComponent(toBase64(toUtf8(JSON.stringify(query))))
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
  return {
    ...dex,
    pair,
    returnAmount: parseBigInt(result.return_amount),
    spreadAmount: parseBigInt(result.spread_amount),
    commissionAmount: parseBigInt(result.commission_amount)
  } satisfies DexQuote
}

const buildSwapMessage = (
  sender: string,
  pair: string,
  offerAsset: SwapAsset,
  amountMicro: bigint,
  maxSpread: string,
  mode: DexQueryMode = "terraswap"
) => {
  if (offerAsset.type === "native" && offerAsset.denom) {
    const msg =
      mode === "garuda"
        ? {
            swap: {
              offer_asset: toGarudaAsset(offerAsset),
              offer_amount: amountMicro.toString(),
              max_spread: maxSpread
            }
          }
        : {
            swap: {
              offer_asset: {
                info: toAssetInfo(offerAsset),
                amount: amountMicro.toString()
              },
              max_spread: maxSpread
            }
          }

    return {
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: MsgExecuteContract.fromPartial({
        sender,
        contract: pair,
        msg: toUtf8(JSON.stringify(msg)),
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
    const hookMsg = toBase64(
      toUtf8(
        JSON.stringify({
          swap: {
            max_spread: maxSpread
          }
        })
      )
    )
    return {
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: MsgExecuteContract.fromPartial({
        sender,
        contract: offerAsset.contract,
        msg: toUtf8(
          JSON.stringify({
            send: {
              contract: pair,
              amount: amountMicro.toString(),
              msg: hookMsg
            }
          })
        ),
        funds: []
      })
    }
  }

  throw new Error("unsupported swap asset")
}

const buildPlatformFeeMessage = (
  sender: string,
  offerAsset: SwapAsset,
  feeAmountMicro: bigint
) => {
  if (feeAmountMicro <= 0n) return undefined

  if (offerAsset.type === "native" && offerAsset.denom) {
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
    return {
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: MsgExecuteContract.fromPartial({
        sender,
        contract: offerAsset.contract,
        msg: toUtf8(
          JSON.stringify({
            transfer: {
              recipient: PLATFORM_FEE_RECIPIENT,
              amount: feeAmountMicro.toString()
            }
          })
        ),
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

const getWalletInstance = () => {
  if (typeof window === "undefined") return undefined
  const walletWindow = window as WalletWindow
  return walletWindow.keplr ?? walletWindow.station ?? walletWindow.galaxyStation
}

const getOfflineSigner = async (): Promise<OfflineSigner | undefined> => {
  if (typeof window === "undefined") return undefined
  const walletWindow = window as WalletWindow
  if (walletWindow.getOfflineSignerAuto) {
    return await walletWindow.getOfflineSignerAuto(KEPLR_CHAIN_CONFIG.chainId)
  }
  if (walletWindow.getOfflineSigner) {
    return walletWindow.getOfflineSigner(KEPLR_CHAIN_CONFIG.chainId)
  }
  return undefined
}

const AssetIcon = ({
  symbol,
  candidates,
  size = 20
}: {
  symbol: string
  candidates: string[]
  size?: number
}) => {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setIndex(0)
    setFailed(false)
  }, [candidates, symbol])

  if (failed || !candidates.length) {
    return (
      <span className={styles.assetIconFallback} style={{ width: size, height: size }}>
        {symbol.slice(0, 1)}
      </span>
    )
  }

  return (
    <img
      src={candidates[index]}
      alt={symbol}
      width={size}
      height={size}
      style={{ borderRadius: "50%", objectFit: "cover", display: "block" }}
      onError={() => {
        if (index < candidates.length - 1) {
          setIndex(index + 1)
        } else {
          setFailed(true)
        }
      }}
    />
  )
}

const Swap = () => {
  const {
    account,
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

  const { data: cw20Whitelist = {} } = useCw20Whitelist()

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

  const assets = useMemo<SwapAsset[]>(() => {
    const cw20Rows = Object.entries(cw20Whitelist)
      .map(([contract, token]) => {
        const decimals = Number(token.decimals ?? 6)
        return {
          id: asCw20Id(contract),
          type: "cw20" as const,
          symbol: token.symbol || token.name || contract.slice(0, 6).toUpperCase(),
          name: token.name || token.symbol || contract,
          decimals: Number.isFinite(decimals) ? decimals : 6,
          contract,
          iconCandidates: [token.icon, "/system/cw20.svg"].filter(
            (item): item is string => Boolean(item)
          )
        } satisfies SwapAsset
      })
      .sort((a, b) => {
        const aTradable = !tradableCw20Set.size || tradableCw20Set.has(a.contract ?? "")
        const bTradable = !tradableCw20Set.size || tradableCw20Set.has(b.contract ?? "")
        if (aTradable !== bTradable) return aTradable ? -1 : 1
        return a.symbol.localeCompare(b.symbol)
      })

    return [...NATIVE_ASSETS, ...cw20Rows]
  }, [cw20Whitelist, tradableCw20Set])

  const { data: cw20Balances = [] } = useCw20Balances(accountAddress, cw20Whitelist)

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

  const fromAsset = useMemo(
    () => assets.find((asset) => asset.id === fromAssetId) ?? assets[0] ?? NATIVE_ASSETS[0],
    [assets, fromAssetId]
  )

  const toAsset = useMemo(() => {
    const candidate = assets.find((asset) => asset.id === toAssetId && asset.id !== fromAsset.id)
    if (candidate) return candidate
    return assets.find((asset) => asset.id !== fromAsset.id) ?? NATIVE_ASSETS[1]
  }, [assets, toAssetId, fromAsset.id])

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

  const { data: balances = [] } = useQuery({
    queryKey: ["swap-balances", accountAddress],
    queryFn: () => fetchBalances(accountAddress ?? ""),
    enabled: Boolean(accountAddress),
    staleTime: 15_000,
    refetchInterval: 20_000
  })

  const { data: prices } = useQuery({
    queryKey: ["swap-prices"],
    queryFn: fetchPrices,
    staleTime: 30_000,
    refetchInterval: 60_000
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
        const tokenBalance = cw20Balances.find((item) => item.address === asset.contract)
        map.set(asset.id, parseBigInt(tokenBalance?.balance))
      }
    }

    return map
  }, [assets, balances, cw20Balances])

  const fromBalanceMicro = useMemo(() => {
    return assetBalanceMap.get(fromAsset.id) ?? 0n
  }, [assetBalanceMap, fromAsset.id])

  const getAssetUsdText = (asset: SwapAsset, amountMicro: bigint) => {
    const price =
      asset.type === "native"
        ? asset.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
          ? prices?.lunc?.usd
          : asset.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
            ? prices?.ustc?.usd
            : undefined
        : undefined

    if (price === undefined) return "≈ --"
    const unitAmount = toUnitAmount(amountMicro, asset.decimals)
    return `≈ ${formatUsd(unitAmount * price)}`
  }

  const fromAmountUsdText = useMemo(
    () => getAssetUsdText(fromAsset, amountInMicro),
    [fromAsset, amountInMicro, prices?.lunc?.usd, prices?.ustc?.usd]
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

  const toAmountUsdText = useMemo(
    () => getAssetUsdText(toAsset, selectedQuote?.returnAmount ?? 0n),
    [toAsset, selectedQuote?.returnAmount, prices?.lunc?.usd, prices?.ustc?.usd]
  )

  const minReceiveMicro = useMemo(() => {
    if (!selectedQuote) return 0n
    const basis = 10_000n - slippageBps
    return (selectedQuote.returnAmount * basis) / 10_000n
  }, [selectedQuote, slippageBps])

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
    let timer: number | undefined

    if (swapAmountMicro <= 0n) {
      setQuotes([])
      setQuoteError(undefined)
      setQuoteLoading(false)
      return undefined
    }

    timer = window.setTimeout(async () => {
      setQuoteLoading(true)
      setQuoteError(undefined)
      try {
        const settled = await Promise.allSettled(
          DEXES.map((dex) => simulateSwapQuote(dex, fromAsset, toAsset, swapAmountMicro))
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
      if (timer) window.clearTimeout(timer)
    }
  }, [fromAsset, swapAmountMicro, toAsset])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    if (!selectedQuote || swapAmountMicro <= 0n) {
      setFeeDisplay("--")
      setFeeLoading(false)
      return undefined
    }

    const fallbackFee = `${formatTokenAmount(
      estimateFallbackFeeMicro(fromAsset, platformFeeMicro > 0n).toString(),
      6,
      6
    )} LUNC`

    if (!accountAddress) {
      setFeeDisplay(fallbackFee)
      setFeeLoading(false)
      return undefined
    }

    timer = window.setTimeout(async () => {
      setFeeLoading(true)
      try {
        const wallet = getWalletInstance()
        if (!wallet) throw new Error("Wallet extension not available")
        const signer = await getOfflineSigner()
        if (!signer) throw new Error("Wallet signer not available")
        const client = await SigningStargateClient.connectWithSigner(
          CLASSIC_CHAIN.rpc,
          signer,
          {
            gasPrice: GasPrice.fromString(`28.325${CLASSIC_DENOMS.lunc.coinMinimalDenom}`)
          }
        )
        const feeMsg = buildPlatformFeeMessage(accountAddress, fromAsset, platformFeeMicro)
        const msg = buildSwapMessage(
          accountAddress,
          selectedQuote.pair,
          fromAsset,
          swapAmountMicro,
          maxSpread,
          selectedQuote.mode ?? "terraswap"
        )
        const gasUsed = await client.simulate(
          accountAddress,
          feeMsg ? [feeMsg, msg] : [msg],
          ""
        )
        const feeMicro = BigInt(Math.ceil(gasUsed * GAS_PRICE_MICRO_LUNC))
        if (!cancelled) {
          setFeeDisplay(`${formatTokenAmount(feeMicro.toString(), 6, 6)} LUNC`)
        }
      } catch {
        if (!cancelled) setFeeDisplay(fallbackFee)
      } finally {
        if (!cancelled) setFeeLoading(false)
      }
    }, 280)

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [
    accountAddress,
    fromAsset,
    maxSpread,
    platformFeeMicro,
    selectedQuote,
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
      const wallet = getWalletInstance()
      if (!wallet) throw new Error("Wallet extension not available")
      const signer = await getOfflineSigner()
      if (!signer) throw new Error("Wallet signer not available")

      const client = await SigningStargateClient.connectWithSigner(
        CLASSIC_CHAIN.rpc,
        signer,
        {
          gasPrice: GasPrice.fromString(`28.325${CLASSIC_DENOMS.lunc.coinMinimalDenom}`)
        }
      )

      const feeMsg = buildPlatformFeeMessage(accountAddress, fromAsset, platformFeeMicro)
      const msg = buildSwapMessage(
        accountAddress,
        selectedQuote.pair,
        fromAsset,
        swapAmountMicro,
        maxSpread,
        selectedQuote.mode ?? "terraswap"
      )
      const messages = feeMsg ? [feeMsg, msg] : [msg]
      const result = await client.signAndBroadcast(accountAddress, messages, "auto", SWAP_MEMO)
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Swap failed")
      }
      const hash = result.transactionHash
      finishTx(hash)
      setLastTxHash(hash)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Swap failed"
      failTx(message)
      setSubmitError(message)
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <PageShell title="Swap">
      <div className={styles.swapLayout}>
        <section className={`card ${styles.swapCard}`}>
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
                      <AssetIcon
                        symbol={fromAsset.symbol}
                        candidates={fromAsset.iconCandidates}
                        size={22}
                      />
                      <span>{fromAsset.symbol}</span>
                    </span>
                    <span className={styles.assetPickerCaret}>▾</span>
                  </button>
                  <input
                    className={styles.amountInput}
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
                >
                  ↕
                </button>
              </div>

              <div className={styles.fieldCard}>
                <div className={styles.fieldHeader}>
                  <span>To</span>
                  <span className={styles.routeLabel}>Best: {bestQuote?.label ?? "--"}</span>
                </div>
                <div className={styles.fieldBody}>
                  <button
                    type="button"
                    className={styles.assetPickerButton}
                    onClick={() => setPickerTarget("to")}
                  >
                    <span className={styles.assetPickerValue}>
                      <AssetIcon
                        symbol={toAsset.symbol}
                        candidates={toAsset.iconCandidates}
                        size={22}
                      />
                      <span>{toAsset.symbol}</span>
                    </span>
                    <span className={styles.assetPickerCaret}>▾</span>
                  </button>
                  <div className={styles.readonlyAmount}>
                    {selectedQuote
                      ? formatTokenAmount(
                          selectedQuote.returnAmount.toString(),
                          toAsset.decimals,
                          6
                        )
                      : "--"}
                  </div>
                </div>
                <div className={styles.fieldFooter}>
                  <span>
                    Minimum receive:{" "}
                    {selectedQuote
                      ? `${formatTokenAmount(minReceiveMicro.toString(), toAsset.decimals, 6)} ${
                          toAsset.symbol
                        }`
                      : "--"}
                  </span>
                  <span className={styles.usdHint}>{toAmountUsdText}</span>
                </div>
              </div>
            </div>

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
                        {amountInMicro > 0n
                          ? `${formatTokenAmount(
                              platformFeeMicro.toString(),
                              fromAsset.decimals,
                              6
                            )} ${fromAsset.symbol}`
                          : "--"}
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

            {pickerTarget && typeof document !== "undefined"
              ? createPortal(
                  <div
                    className={styles.pickerBackdrop}
                    role="dialog"
                    aria-modal="true"
                    onClick={closePicker}
                  >
                    <div className={styles.pickerModal} onClick={(event) => event.stopPropagation()}>
                      <div className={styles.pickerHeader}>
                        <h3>Select token</h3>
                        <button type="button" onClick={closePicker} aria-label="Close">
                          ×
                        </button>
                      </div>
                      <div className={styles.pickerSearchRow}>
                        <input
                          type="text"
                          value={pickerQuery}
                          onChange={(event) => setPickerQuery(event.target.value)}
                          placeholder="Search token or address"
                          autoFocus
                        />
                      </div>
                      <div className={styles.pickerList}>
                        {pickerAssets.map((asset) => {
                          const isSelected =
                            (pickerTarget === "from" && asset.id === fromAsset.id) ||
                            (pickerTarget === "to" && asset.id === toAsset.id)
                          return (
                            <button
                              key={asset.id}
                              type="button"
                              className={`${styles.pickerItem} ${
                                isSelected ? styles.pickerItemSelected : ""
                              }`}
                              onClick={() => handlePickAsset(asset.id)}
                            >
                              <div className={styles.pickerItemLeft}>
                                <span className={styles.pickerItemIcon}>
                                  <AssetIcon
                                    symbol={asset.symbol}
                                    candidates={asset.iconCandidates}
                                    size={22}
                                  />
                                </span>
                                <span className={styles.pickerItemText}>
                                  <strong>{asset.symbol}</strong>
                                  <small>
                                    {asset.type === "native" ? "Native" : "CW20"} · Balance{" "}
                                    {formatTokenAmount(
                                      (assetBalanceMap.get(asset.id) ?? 0n).toString(),
                                      asset.decimals,
                                      6
                                    )}{" "}
                                    {asset.symbol}
                                  </small>
                                </span>
                              </div>
                              {isSelected ? <span className={styles.pickerCheck}>✓</span> : null}
                            </button>
                          )
                        })}
                        {!pickerAssets.length ? (
                          <div className={styles.pickerEmpty}>No token found.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>,
                  document.body
                )
              : null}

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
      </div>
    </PageShell>
  )
}

export default Swap
