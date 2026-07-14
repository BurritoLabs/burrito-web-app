import { CLASSIC_CHAIN } from "../chain"
import { getActiveAppChainKey } from "../activeChain"
import {
  fetchLaunchRegistryLaunches,
  isLaunchRegistryConfigured
} from "../launchpad/registry"
import {
  ASSET_DEX_PAIRS_URL,
  LOCAL_MARKET_CANDLES_BASE_URL,
  LOCAL_MARKET_INDEX_URL
} from "../config/externalServices"
import {
  fetchBinodesDexTxDetails,
  type BinodesDexTxDetail
} from "./binodes"
import { queryContractSmart } from "./classic"
import { fetchWithEndpointFallback } from "./endpointFallback"
import { getSwapDexes, type SwapDex } from "./dexFactories"
import { pickChainAssets } from "./terraAssets"
import {
  getFactoryPairCursor,
  parseFactoryPairRecord,
  type FactoryPairRecord
} from "../market/factoryPairs"
import {
  isTerraAddress,
  normalizeSafeMarketAssetId
} from "../utils/assetIdentity"

type AssetDexPair = {
  dex?: string
  type?: string
  assets?: string[]
}

type PoolAssetInfo =
  | {
      native_token?: { denom?: string }
      token?: { contract_addr?: string }
      native?: string
      cw20?: string
    }
  | undefined

type PoolAsset = {
  amount?: string
  info?: PoolAssetInfo
}

type PoolResponse = {
  asset1?: PoolAssetInfo
  asset2?: PoolAssetInfo
  assets?: PoolAsset[]
  reserve1?: string
  reserve2?: string
}

type WesoCurveInfoResponse = {
  reserve?: string
  reserve_denom?: string
  spot_price?: string
  supply?: string
}

type Cw20TokenInfoResponse = {
  decimals?: number | string
  total_supply?: string
}

type Cw20BalanceResponse = {
  balance?: string
}

type BankBalanceResponse = {
  balance?: {
    amount?: string
  }
}

export type MarketDexPair = {
  pair: string
  dexId: string
  dexLabel: string
  type: string
  assets: [string, string]
}

export type MarketVolumeSummary = Partial<Record<"1h" | "24h" | "7d", Record<string, number>>>

export type MarketBondingSnapshot = {
  factory?: string
  liquidityAmount?: string
  liquidityAssetId?: string
  nativeDenom?: string
  protocol?: "terrapump" | "luncpump" | string
  spotPriceAmount?: string
  spotPriceAssetId?: string
  status?: string
  tokenAddress?: string
  virtualQuoteAmount?: string
}

export type MarketPoolSnapshot = {
  bonding?: MarketBondingSnapshot
  pair: string
  dexId: string
  dexLabel: string
  type: string
  volumes?: MarketVolumeSummary
  poolAssets: [
    { id: string; amount: string },
    { id: string; amount: string }
  ]
}

type TxEventAttribute = {
  key?: string
  value?: string
}

type TxEvent = {
  type?: string
  attributes?: TxEventAttribute[]
}

type TxResponse = {
  txhash?: string
  timestamp?: string
  events?: TxEvent[]
  logs?: Array<{
    events?: TxEvent[]
  }>
}

type TxListResponse = {
  tx_responses?: TxResponse[]
}

type LocalCandle = {
  bucketStart?: number
  open?: number
  high?: number
  low?: number
  close?: number
  volumeQuote?: number
}

type LocalPairCandlePayload = {
  generatedAt?: string
  candles?: Partial<Record<"1h" | "24h" | "7d", Record<string, LocalCandle[]>>>
}

type SwapTick = {
  timestamp: number
  price: number
  volumeQuote: number
}

export type PairCandle = {
  bucketStart: number
  open: number
  high: number
  low: number
  close: number
  volumeQuote: number
}

export type PairTrade = {
  txhash: string
  timestamp: number
  side: "buy" | "sell"
  price: number
  amountBase: number
  amountQuote: number
  trader: string
}

export type PairTradesResult = {
  trades: PairTrade[]
  hasMore: boolean
}

type FactoryPairsResponse = {
  pairs?: FactoryPairRecord[]
}

type CodeContractsResponse = {
  contracts?: string[]
  pagination?: {
    next_key?: string | null
  }
}

const FACTORY_PAIR_CACHE_TTL = 30 * 60 * 1000
const LOCAL_INDEX_CACHE_TTL = 5 * 60 * 1000
let factoryPairDexCache:
  | {
      at: number
      chainId: string
      map: Map<string, { dexId: string; dexLabel: string }>
    }
  | null = null
let factoryPairDexInFlight: {
  chainId: string
  promise: Promise<Map<string, { dexId: string; dexLabel: string }>>
} | null = null
let localMarketIndexCache:
  | {
      at: number
      pairs: MarketDexPair[]
      pools: Map<string, MarketPoolSnapshot>
    }
  | null = null
let localMarketIndexInFlight:
  | Promise<{
      pairs: MarketDexPair[]
      pools: Map<string, MarketPoolSnapshot>
    } | null>
  | null = null
const LOCAL_CANDLES_CACHE_TTL = 5 * 60 * 1000
const PAIR_TX_LCD_TIMEOUT_MS = 3_500
const BINODES_PAIR_TRADES_TIMEOUT_MS = 1_800
const BINODES_PAIR_TRADES_FAILURE_COOLDOWN_MS = 5 * 60 * 1000
const localPairCandlesCache = new Map<
  string,
  { at: number; payload: LocalPairCandlePayload | null }
>()
const localPairCandlesInFlight = new Map<Promise<LocalPairCandlePayload | null>, string>()
let binodesPairTradesUnavailableUntil = 0

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error("Timed out waiting for pair trades"))
    }, timeoutMs)

    promise
      .then(resolve, reject)
      .finally(() => globalThis.clearTimeout(timeoutId))
  })

const normalizeAssetKey = (value: string) => {
  if (!value) return value
  if (value.startsWith("native:")) return normalizeAssetKey(value.slice(7))
  if (value.startsWith("cw20:")) return normalizeAssetKey(value.slice(5))
  if (value.startsWith("ibc/")) return `ibc/${value.slice(4).toUpperCase()}`
  if (value.startsWith("terra1")) return value.toLowerCase()
  return value.toLowerCase()
}

const buildLcdUrl = (path: string, params: Record<string, string>) => {
  const url = new URL(`${CLASSIC_CHAIN.lcd}${path}`)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  return url.toString()
}

const buildPairSwapQuery = (pairAddress: string) =>
  `wasm._contract_address='${pairAddress}' AND wasm.action='swap'`

const buildPairContractQuery = (pairAddress: string) => `wasm._contract_address='${pairAddress}'`

const getPairTxQueryVariants = (pairAddress: string) => [
  buildPairSwapQuery(pairAddress),
  buildPairContractQuery(pairAddress)
]

const resolveTimeframeFromBucketMs = (bucketMs: number) => {
  // Pair details page uses finer buckets for better intra-window granularity.
  if (bucketMs === 60 * 1000) return "1h"
  if (bucketMs === 5 * 60 * 1000) return "1h"
  if (bucketMs === 30 * 60 * 1000) return "24h"
  if (bucketMs === 2 * 60 * 60 * 1000) return "7d"

  // Keep compatibility with legacy callers using full-window buckets.
  if (bucketMs === 60 * 60 * 1000) return "1h"
  if (bucketMs === 24 * 60 * 60 * 1000) return "24h"
  if (bucketMs === 7 * 24 * 60 * 60 * 1000) return "7d"
  return null
}

const normalizeLocalCandle = (raw: LocalCandle): PairCandle | null => {
  const bucketStart = Number(raw.bucketStart)
  const open = Number(raw.open)
  const high = Number(raw.high)
  const low = Number(raw.low)
  const close = Number(raw.close)
  const volumeQuote = Number(raw.volumeQuote ?? 0)

  if (
    !Number.isFinite(bucketStart) ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    !Number.isFinite(volumeQuote)
  ) {
    return null
  }

  return { bucketStart, open, high, low, close, volumeQuote }
}

const parseSwapTicksFromTxResponse = ({
  response,
  pairAddress,
  leftKey,
  rightKey,
  leftDecimals,
  rightDecimals
}: {
  response: TxResponse
  pairAddress: string
  leftKey: string
  rightKey: string
  leftDecimals: number
  rightDecimals: number
}): SwapTick[] => {
  const timestamp = Date.parse(response.timestamp ?? "")
  if (!Number.isFinite(timestamp)) return []

  const ticks: SwapTick[] = []
  const pairLower = pairAddress.toLowerCase()
  const logEvents = response.logs?.flatMap((log) => log.events ?? []) ?? []
  const events = logEvents.length ? logEvents : (response.events ?? [])

  events.forEach((event) => {
    if (event.type !== "wasm") return
    const attrs = event.attributes ?? []
    const getAttr = (key: string) => attrs.find((attr) => attr.key === key)?.value

    const contractAddress = getAttr("_contract_address")?.toLowerCase()
    if (!contractAddress || contractAddress !== pairLower) return

    const action = (getAttr("action") ?? "").toLowerCase()
    const offerAsset = getAttr("offer_asset") ?? ""
    const askAsset = getAttr("ask_asset") ?? getAttr("return_asset") ?? ""
    const offerAmountRaw = Number(getAttr("offer_amount") ?? NaN)
    const returnAmountRaw = Number(getAttr("return_amount") ?? NaN)

    if (action !== "swap") return
    if (!offerAsset || !askAsset) return
    if (!Number.isFinite(offerAmountRaw) || !Number.isFinite(returnAmountRaw)) return
    if (offerAmountRaw <= 0 || returnAmountRaw <= 0) return

    const offerKey = normalizeAssetKey(offerAsset)
    const askKey = normalizeAssetKey(askAsset)

    if (offerKey === leftKey && askKey === rightKey) {
      const offerAmount = offerAmountRaw / 10 ** leftDecimals
      const returnAmount = returnAmountRaw / 10 ** rightDecimals
      if (offerAmount <= 0 || returnAmount <= 0) return
      ticks.push({
        timestamp,
        price: returnAmount / offerAmount,
        volumeQuote: returnAmount
      })
      return
    }

    if (offerKey === rightKey && askKey === leftKey) {
      const offerAmount = offerAmountRaw / 10 ** rightDecimals
      const returnAmount = returnAmountRaw / 10 ** leftDecimals
      if (offerAmount <= 0 || returnAmount <= 0) return
      ticks.push({
        timestamp,
        price: offerAmount / returnAmount,
        volumeQuote: offerAmount
      })
    }
  })

  return ticks
}

const getTxMessageSender = (events: TxEvent[]) => {
  for (const event of events) {
    if (event.type !== "message") continue
    for (const attr of event.attributes ?? []) {
      if (attr.key !== "sender" || !attr.value) continue
      if (attr.value.startsWith("terra1")) return attr.value.toLowerCase()
    }
  }
  return ""
}

const getAllResponseEvents = (response: TxResponse) => {
  const logEvents = response.logs?.flatMap((log) => log.events ?? []) ?? []
  return [...logEvents, ...(response.events ?? [])]
}

const parseSwapTradesFromTxResponse = ({
  response,
  pairAddress,
  leftKey,
  rightKey,
  leftDecimals,
  rightDecimals
}: {
  response: TxResponse
  pairAddress: string
  leftKey: string
  rightKey: string
  leftDecimals: number
  rightDecimals: number
}): PairTrade[] => {
  const timestamp = Date.parse(response.timestamp ?? "")
  if (!Number.isFinite(timestamp)) return []

  const txhash = response.txhash ?? ""
  if (!txhash) return []

  const trades: PairTrade[] = []
  const pairLower = pairAddress.toLowerCase()
  const logEvents = response.logs?.flatMap((log) => log.events ?? []) ?? []
  const events = logEvents.length ? logEvents : (response.events ?? [])
  const fallbackSender = getTxMessageSender(getAllResponseEvents(response))

  events.forEach((event) => {
    if (event.type !== "wasm") return
    const attrs = event.attributes ?? []
    const getAttr = (key: string) => attrs.find((attr) => attr.key === key)?.value

    const contractAddress = getAttr("_contract_address")?.toLowerCase()
    if (!contractAddress || contractAddress !== pairLower) return

    const action = (getAttr("action") ?? "").toLowerCase()
    const offerAsset = getAttr("offer_asset") ?? ""
    const askAsset = getAttr("ask_asset") ?? getAttr("return_asset") ?? ""
    const offerAmountRaw = Number(getAttr("offer_amount") ?? NaN)
    const returnAmountRaw = Number(getAttr("return_amount") ?? NaN)
    const sender = (getAttr("sender") ?? fallbackSender).toLowerCase()

    if (action !== "swap") return
    if (!offerAsset || !askAsset) return
    if (!Number.isFinite(offerAmountRaw) || !Number.isFinite(returnAmountRaw)) return
    if (offerAmountRaw <= 0 || returnAmountRaw <= 0) return

    const offerKey = normalizeAssetKey(offerAsset)
    const askKey = normalizeAssetKey(askAsset)

    if (offerKey === leftKey && askKey === rightKey) {
      const offerAmount = offerAmountRaw / 10 ** leftDecimals
      const returnAmount = returnAmountRaw / 10 ** rightDecimals
      if (offerAmount <= 0 || returnAmount <= 0) return
      trades.push({
        txhash,
        timestamp,
        side: "sell",
        price: returnAmount / offerAmount,
        amountBase: offerAmount,
        amountQuote: returnAmount,
        trader: sender
      })
      return
    }

    if (offerKey === rightKey && askKey === leftKey) {
      const offerAmount = offerAmountRaw / 10 ** rightDecimals
      const returnAmount = returnAmountRaw / 10 ** leftDecimals
      if (offerAmount <= 0 || returnAmount <= 0) return
      trades.push({
        txhash,
        timestamp,
        side: "buy",
        price: offerAmount / returnAmount,
        amountBase: returnAmount,
        amountQuote: offerAmount,
        trader: sender
      })
    }
  })

  return trades
}

const buildCandles = ({
  ticks,
  bucketMs,
  lookbackStart,
  maxCandles
}: {
  ticks: SwapTick[]
  bucketMs: number
  lookbackStart: number
  maxCandles: number
}) => {
  const sorted = [...ticks]
    .filter((tick) => tick.timestamp >= lookbackStart)
    .sort((a, b) => a.timestamp - b.timestamp)

  if (!sorted.length) return [] as PairCandle[]

  const buckets = new Map<number, PairCandle>()
  sorted.forEach((tick) => {
    const bucketStart = Math.floor(tick.timestamp / bucketMs) * bucketMs
    const existing = buckets.get(bucketStart)
    if (!existing) {
      buckets.set(bucketStart, {
        bucketStart,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volumeQuote: tick.volumeQuote
      })
      return
    }
    existing.high = Math.max(existing.high, tick.price)
    existing.low = Math.min(existing.low, tick.price)
    existing.close = tick.price
    existing.volumeQuote += tick.volumeQuote
  })

  return Array.from(buckets.values())
    .sort((a, b) => a.bucketStart - b.bucketStart)
    .slice(-maxCandles)
}

const buildCandlesFromTrades = ({
  trades,
  bucketMs,
  lookbackStart,
  maxCandles
}: {
  trades: PairTrade[]
  bucketMs: number
  lookbackStart: number
  maxCandles: number
}) => {
  const sorted = [...trades]
    .filter(
      (trade) =>
        Number.isFinite(trade.timestamp) &&
        trade.timestamp >= lookbackStart &&
        Number.isFinite(trade.price) &&
        trade.price > 0
    )
    .sort((a, b) => a.timestamp - b.timestamp)

  if (!sorted.length) return [] as PairCandle[]

  const buckets = new Map<number, PairCandle>()
  sorted.forEach((trade) => {
    const bucketStart = Math.floor(trade.timestamp / bucketMs) * bucketMs
    const existing = buckets.get(bucketStart)
    if (!existing) {
      buckets.set(bucketStart, {
        bucketStart,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volumeQuote: Number.isFinite(trade.amountQuote) && trade.amountQuote > 0 ? trade.amountQuote : 0
      })
      return
    }
    existing.high = Math.max(existing.high, trade.price)
    existing.low = Math.min(existing.low, trade.price)
    existing.close = trade.price
    if (Number.isFinite(trade.amountQuote) && trade.amountQuote > 0) {
      existing.volumeQuote += trade.amountQuote
    }
  })

  return Array.from(buckets.values())
    .sort((a, b) => a.bucketStart - b.bucketStart)
    .slice(-maxCandles)
}

const fillCandleGaps = ({
  candles,
  bucketMs,
  lookbackBuckets,
  maxCandles
}: {
  candles: PairCandle[]
  bucketMs: number
  lookbackBuckets: number
  maxCandles: number
}) => {
  if (!candles.length || bucketMs <= 0 || lookbackBuckets <= 0) return candles

  const sorted = [...candles].sort((a, b) => a.bucketStart - b.bucketStart)
  const byBucket = new Map(sorted.map((candle) => [candle.bucketStart, candle]))
  const nowBucket = Math.floor(Date.now() / bucketMs) * bucketMs
  const firstBucket = nowBucket - bucketMs * (lookbackBuckets - 1)
  const filled: PairCandle[] = []

  let previousClose =
    sorted.find((candle) => candle.bucketStart <= firstBucket)?.close ??
    sorted[0]?.open ??
    sorted[0]?.close

  for (
    let bucketStart = firstBucket;
    bucketStart <= nowBucket;
    bucketStart += bucketMs
  ) {
    const candle = byBucket.get(bucketStart)
    if (candle) {
      filled.push(candle)
      previousClose = candle.close
      continue
    }

    if (!Number.isFinite(previousClose) || previousClose <= 0) continue
    filled.push({
      bucketStart,
      open: previousClose,
      high: previousClose,
      low: previousClose,
      close: previousClose,
      volumeQuote: 0
    })
  }

  return filled.slice(-maxCandles)
}

const sanitizeSwapTicks = (ticks: SwapTick[]) => {
  const valid = ticks.filter(
    (tick) =>
      Number.isFinite(tick.timestamp) &&
      Number.isFinite(tick.price) &&
      tick.price > 0 &&
      Number.isFinite(tick.volumeQuote) &&
      tick.volumeQuote >= 0
  )
  if (!valid.length) return valid

  const prices = valid.map((tick) => tick.price).sort((a, b) => a - b)
  const median = prices[Math.floor(prices.length / 2)] ?? 0
  if (!Number.isFinite(median) || median <= 0) return valid

  // Filter extreme outliers from malformed/multi-hop event parsing.
  return valid.filter((tick) => {
    const ratio = tick.price / median
    return ratio >= 0.05 && ratio <= 20
  })
}

const candlesMatchExpectedPrice = (candles: PairCandle[], expectedPrice?: number) => {
  if (!candles.length) return false
  if (!expectedPrice || !Number.isFinite(expectedPrice) || expectedPrice <= 0) return true

  const closes = candles
    .map((candle) => candle.close)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)
  if (!closes.length) return false

  const median = closes[Math.floor(closes.length / 2)]
  const ratio = median / expectedPrice
  // Guard against inverted/invalid price orientation while allowing normal market drift.
  return ratio >= 0.2 && ratio <= 5
}

type CandleQuality = {
  score: number
  isAcceptable: boolean
  uniqueBuckets: number
  uniqueCloses: number
  nonZeroVolumeRatio: number
}

const roundForSet = (value: number) => {
  if (!Number.isFinite(value)) return 0
  return Number(value.toPrecision(12))
}

const evaluateCandleQuality = ({
  candles,
  bucketMs,
  minCandles
}: {
  candles: PairCandle[]
  bucketMs: number
  minCandles: number
}): CandleQuality => {
  if (!candles.length) {
    return {
      score: 0,
      isAcceptable: false,
      uniqueBuckets: 0,
      uniqueCloses: 0,
      nonZeroVolumeRatio: 0
    }
  }

  const sorted = [...candles].sort((a, b) => a.bucketStart - b.bucketStart)
  const uniqueBuckets = new Set(sorted.map((candle) => candle.bucketStart)).size
  const closes = sorted
    .map((candle) => candle.close)
    .filter((value) => Number.isFinite(value) && value > 0)
  const uniqueCloses = new Set(closes.map((value) => roundForSet(value))).size
  const nonZeroVolumeCount = sorted.filter((candle) => candle.volumeQuote > 0).length
  const nonZeroVolumeRatio = nonZeroVolumeCount / sorted.length

  const firstBucket = sorted[0]?.bucketStart ?? 0
  const lastBucket = sorted[sorted.length - 1]?.bucketStart ?? firstBucket
  const expectedBucketSpan = Math.max(1, Math.floor((lastBucket - firstBucket) / bucketMs) + 1)
  const coverage = Math.min(1, uniqueBuckets / expectedBucketSpan)

  const minBarsForQuality = Math.max(4, Math.min(12, minCandles || 6))
  const lengthScore = Math.min(1.5, sorted.length / minBarsForQuality)
  const bucketScore = Math.min(1.5, uniqueBuckets / minBarsForQuality)
  const closeScore = Math.min(1.5, uniqueCloses / Math.max(2, Math.floor(minBarsForQuality / 2)))
  const volumeScore = Math.min(1, nonZeroVolumeRatio / 0.2)

  const score = lengthScore * 0.35 + bucketScore * 0.25 + closeScore * 0.25 + coverage * 0.1 + volumeScore * 0.05
  const isAcceptable =
    sorted.length >= Math.max(4, Math.floor(minBarsForQuality * 0.5)) &&
    uniqueBuckets >= Math.max(4, Math.floor(minBarsForQuality * 0.5)) &&
    uniqueCloses >= 2 &&
    nonZeroVolumeRatio >= 0.03

  return {
    score,
    isAcceptable,
    uniqueBuckets,
    uniqueCloses,
    nonZeroVolumeRatio
  }
}

const ACTIVE_DEX_LABEL_BY_ID = new Map(
  [...getSwapDexes("lunc"), ...getSwapDexes("luna")].map((dex) => [
    dex.id.toLowerCase(),
    dex.label
  ])
)

const pickDexLabel = (dexId: string) => {
  const direct = ACTIVE_DEX_LABEL_BY_ID.get(dexId.toLowerCase())
  if (direct) return direct
  const normalized = dexId
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
  return normalized
}

const resolveAssetId = (info: PoolAssetInfo, fallback?: string) => {
  const nativeDenom =
    info?.native_token?.denom ??
    (typeof info?.native === "string" ? info.native : undefined)
  if (nativeDenom) return normalizeSafeMarketAssetId(`native:${nativeDenom}`)

  const cw20Contract =
    info?.token?.contract_addr ??
    (typeof info?.cw20 === "string" ? info.cw20 : undefined)
  if (cw20Contract) return normalizeSafeMarketAssetId(`cw20:${cw20Contract}`)

  if (fallback) {
    return normalizeSafeMarketAssetId(fallback)
  }
  return undefined
}

const parseBaseUnits = (value: unknown) => {
  if (!value || !/^\d+$/.test(String(value))) return 0n
  try {
    return BigInt(String(value))
  } catch {
    return 0n
  }
}

const pow10BaseUnits = (decimals: unknown) => {
  const parsed =
    typeof decimals === "number" ? decimals : Number.parseInt(String(decimals ?? 6), 10)
  const safeDecimals = Number.isFinite(parsed) && parsed >= 0 && parsed <= 30 ? parsed : 6
  return 10n ** BigInt(safeDecimals)
}

const multiplyBaseUnits = (value: unknown, multiplier: number) =>
  (parseBaseUnits(value) * BigInt(multiplier)).toString()

const multiplyDivideBaseUnits = (
  value: unknown,
  multiplier: unknown,
  divisor: bigint
) => {
  if (divisor <= 0n) return "0"
  return ((parseBaseUnits(value) * parseBaseUnits(multiplier)) / divisor).toString()
}

const fetchNativeBalance = async (address: string, denom: string) => {
  try {
    const url = new URL(
      `${CLASSIC_CHAIN.lcd}/cosmos/bank/v1beta1/balances/${address}/by_denom`
    )
    url.searchParams.set("denom", denom)
    const response = await fetchWithEndpointFallback(url.toString())
    if (!response.ok) return "0"
    const payload = (await response.json()) as BankBalanceResponse
    return payload.balance?.amount ?? "0"
  } catch {
    return "0"
  }
}

const fetchWesoCurvePoolForPair = async (
  pair: MarketDexPair
): Promise<MarketPoolSnapshot | null> => {
  if (pair.dexId !== "weso-defi") return null

  try {
    const [curveInfo, tokenInfo, contractBalance] = await Promise.all([
      queryContractSmart<WesoCurveInfoResponse>(pair.pair, { curve_info: {} }),
      queryContractSmart<Cw20TokenInfoResponse>(pair.pair, { token_info: {} }),
      queryContractSmart<Cw20BalanceResponse>(pair.pair, {
        balance: { address: pair.pair }
      })
    ])

    const reserveDenom = curveInfo.reserve_denom ?? ""
    if (!reserveDenom) return null

    const tokenScale = pow10BaseUnits(tokenInfo.decimals)
    const tokenReserveAmount =
      parseBaseUnits(contractBalance.balance) > 0n
        ? (contractBalance.balance ?? "0")
        : (curveInfo.supply ?? tokenInfo.total_supply ?? "0")
    const hasSpotPrice = parseBaseUnits(curveInfo.spot_price) > 0n
    const computedReserveAmount =
      hasSpotPrice && parseBaseUnits(tokenReserveAmount) > 0n
        ? multiplyDivideBaseUnits(tokenReserveAmount, curveInfo.spot_price, tokenScale)
        : (curveInfo.reserve ?? "0")
    const bankReserveAmount = await fetchNativeBalance(pair.pair, reserveDenom)
    const reserveAmount =
      parseBaseUnits(bankReserveAmount) > 0n ? bankReserveAmount : computedReserveAmount
    const isNativeWrapper = parseBaseUnits(curveInfo.spot_price) === tokenScale

    return {
      bonding: {
        liquidityAmount: multiplyBaseUnits(reserveAmount, 2),
        liquidityAssetId: `native:${reserveDenom}`,
        nativeDenom: reserveDenom,
        protocol: "weso-defi",
        spotPriceAmount: curveInfo.spot_price,
        spotPriceAssetId: `native:${reserveDenom}`,
        status: "open",
        tokenAddress: pair.pair.toLowerCase()
      },
      pair: pair.pair,
      dexId: pair.dexId,
      dexLabel: pair.dexLabel,
      type: isNativeWrapper ? "weso-pool" : "bonding-weso-defi",
      poolAssets: [
        {
          id: `cw20:${pair.pair.toLowerCase()}`,
          amount: tokenReserveAmount
        },
        {
          id: `native:${reserveDenom}`,
          amount: reserveAmount
        }
      ]
    }
  } catch {
    return null
  }
}

const toFallbackAsset = (assetId: string) => {
  if (assetId.startsWith("native:")) return assetId.slice("native:".length)
  if (assetId.startsWith("cw20:")) return assetId.slice("cw20:".length)
  return assetId
}

const normalizeMarketAssetId = (value: string) => normalizeSafeMarketAssetId(value)

type MarketIndexPayload = {
  generatedAt?: string
  pairs?: Array<{
    pair?: string
    dexId?: string
    dexLabel?: string
    type?: string
    volumes?: Partial<Record<"1h" | "24h" | "7d", Record<string, number>>>
    assets?: string[]
    bonding?: MarketBondingSnapshot
    poolAssets?: Array<{ id?: string; amount?: string }>
  }>
}

const parseMarketVolumeSummary = (
  raw: Partial<Record<"1h" | "24h" | "7d", Record<string, number>>> | undefined
): MarketVolumeSummary | undefined => {
  if (!raw) return undefined

  const parsed: MarketVolumeSummary = {}
  ;(["1h", "24h", "7d"] as const).forEach((timeframe) => {
    const entry = raw[timeframe]
    if (!entry || typeof entry !== "object") return

    const normalized = Object.entries(entry).reduce<Record<string, number>>((acc, [key, value]) => {
      const amount = Number(value)
      if (!key || !Number.isFinite(amount) || amount < 0) return acc
      acc[key] = amount
      return acc
    }, {})

    if (Object.keys(normalized).length) {
      parsed[timeframe] = normalized
    }
  })

  return Object.keys(parsed).length ? parsed : undefined
}

const hasMarketVolume = (volumes: MarketVolumeSummary | undefined) =>
  Boolean(
    volumes &&
      Object.values(volumes).some((entry) =>
        Object.values(entry ?? {}).some((amount) => amount > 0)
      )
  )

const shouldRefreshLocalPoolSnapshot = (pool: MarketPoolSnapshot) => {
  const bothSidesEmpty = pool.poolAssets.every((asset) => {
    const amount = Number(asset.amount)
    return !Number.isFinite(amount) || amount <= 0
  })
  return bothSidesEmpty && hasMarketVolume(pool.volumes)
}

const parseLocalMarketIndex = (payload: MarketIndexPayload) => {
  const entries = payload?.pairs ?? []
  const pairs: MarketDexPair[] = []
  const pools = new Map<string, MarketPoolSnapshot>()

  entries.forEach((entry) => {
    const pair = typeof entry?.pair === "string" ? entry.pair.toLowerCase() : ""
    if (!isTerraAddress(pair)) return

    const poolAssets = Array.isArray(entry.poolAssets) ? entry.poolAssets : []
    if (poolAssets.length < 2) return

    const leftId = normalizeMarketAssetId(poolAssets[0]?.id ?? "")
    const rightId = normalizeMarketAssetId(poolAssets[1]?.id ?? "")
    if (!leftId || !rightId || leftId === rightId) return
    const leftAmount = poolAssets[0]?.amount ?? "0"
    const rightAmount = poolAssets[1]?.amount ?? "0"

    const dexId = (entry.dexId ?? "unknown").toLowerCase()
    const dexLabel = entry.dexLabel ?? pickDexLabel(dexId)
    const type = entry.type ?? "xyk"
    const volumes = parseMarketVolumeSummary(entry.volumes)
    const bonding =
      entry.bonding && typeof entry.bonding === "object"
        ? ({
            ...entry.bonding,
            factory:
              typeof entry.bonding.factory === "string"
                ? entry.bonding.factory.toLowerCase()
                : undefined,
            liquidityAmount:
              typeof entry.bonding.liquidityAmount === "string"
                ? entry.bonding.liquidityAmount
                : undefined,
            liquidityAssetId:
              typeof entry.bonding.liquidityAssetId === "string"
                ? normalizeMarketAssetId(entry.bonding.liquidityAssetId)
                : undefined,
            nativeDenom:
              typeof entry.bonding.nativeDenom === "string"
                ? entry.bonding.nativeDenom
                : undefined,
            spotPriceAmount:
              typeof entry.bonding.spotPriceAmount === "string"
                ? entry.bonding.spotPriceAmount
                : undefined,
            spotPriceAssetId:
              typeof entry.bonding.spotPriceAssetId === "string"
                ? normalizeMarketAssetId(entry.bonding.spotPriceAssetId)
                : undefined,
            status:
              typeof entry.bonding.status === "string"
                ? entry.bonding.status
                : undefined,
            tokenAddress:
              typeof entry.bonding.tokenAddress === "string"
                ? entry.bonding.tokenAddress.toLowerCase()
                : undefined,
            virtualQuoteAmount:
              typeof entry.bonding.virtualQuoteAmount === "string"
                ? entry.bonding.virtualQuoteAmount
                : undefined
          } satisfies MarketBondingSnapshot)
        : undefined
    const fallbackAssets =
      Array.isArray(entry.assets) && entry.assets.length >= 2
        ? [entry.assets[0], entry.assets[1]]
        : [toFallbackAsset(leftId), toFallbackAsset(rightId)]

    const pairRecord: MarketDexPair = {
      pair,
      dexId,
      dexLabel,
      type,
      assets: [fallbackAssets[0] ?? "", fallbackAssets[1] ?? ""]
    }
    const poolRecord: MarketPoolSnapshot = {
      pair,
      bonding,
      dexId,
      dexLabel,
      type,
      volumes,
      poolAssets: [
        { id: leftId, amount: leftAmount },
        { id: rightId, amount: rightAmount }
      ]
    }

    pairs.push(pairRecord)
    pools.set(pair, poolRecord)
  })

  return { pairs, pools }
}

const fetchLocalMarketIndex = async () => {
  if (CLASSIC_CHAIN.chainId !== "columbus-5") return null
  if (localMarketIndexCache && Date.now() - localMarketIndexCache.at < LOCAL_INDEX_CACHE_TTL) {
    return localMarketIndexCache
  }
  if (localMarketIndexInFlight) return localMarketIndexInFlight

  const cacheBuster = Math.floor(Date.now() / LOCAL_INDEX_CACHE_TTL)
  localMarketIndexInFlight = fetch(`${LOCAL_MARKET_INDEX_URL}?v=${cacheBuster}`, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return null
      const payload = (await response.json()) as MarketIndexPayload
      const parsed = parseLocalMarketIndex(payload)
      if (!parsed.pairs.length) return null
      const next = { at: Date.now(), ...parsed }
      localMarketIndexCache = next
      return next
    })
    .catch(() => null)
    .finally(() => {
      localMarketIndexInFlight = null
    })

  return localMarketIndexInFlight
}

const fetchLaunchpadMarketPairs = async (): Promise<MarketDexPair[]> => {
  if (!isLaunchRegistryConfigured()) return []

  try {
    const launches = await fetchLaunchRegistryLaunches()
    return launches
      .filter(
        (launch) =>
          launch.status !== "hidden" &&
          launch.pair_contract &&
          launch.token_contract
      )
      .map((launch) => ({
        pair: launch.pair_contract.toLowerCase(),
        dexId: "terraswap",
        dexLabel: "Terraswap",
        type: "xyk",
        assets: [launch.token_contract.toLowerCase(), "uluna"] as [string, string]
      }))
  } catch {
    return []
  }
}

const mergeMarketPairs = (
  base: MarketDexPair[],
  additions: MarketDexPair[]
) => {
  const map = new Map<string, MarketDexPair>()
  ;[...base, ...additions].forEach((pair) => {
    const address = pair.pair.trim().toLowerCase()
    const leftId = normalizeSafeMarketAssetId(pair.assets[0] ?? "")
    const rightId = normalizeSafeMarketAssetId(pair.assets[1] ?? "")
    if (!isTerraAddress(address) || !leftId || !rightId || leftId === rightId) return
    map.set(address, {
      ...pair,
      pair: address,
      assets: [toFallbackAsset(leftId), toFallbackAsset(rightId)]
    })
  })
  return Array.from(map.values())
}

const loadLocalPairCandlesFile = async (pairAddress: string) => {
  const normalizedPair = pairAddress.toLowerCase()
  const cached = localPairCandlesCache.get(normalizedPair)
  if (cached && Date.now() - cached.at < LOCAL_CANDLES_CACHE_TTL) {
    return cached.payload
  }

  for (const [inFlight, key] of localPairCandlesInFlight.entries()) {
    if (key === normalizedPair) return inFlight
  }

  const fetchPromise = fetch(
    `${LOCAL_MARKET_CANDLES_BASE_URL}/${encodeURIComponent(normalizedPair)}.json`,
    { cache: "no-store" }
  )
    .then(async (response) => {
      if (!response.ok) return null
      return (await response.json()) as LocalPairCandlePayload
    })
    .catch(() => null)
    .then((payload) => {
      localPairCandlesCache.set(normalizedPair, { at: Date.now(), payload })
      return payload
    })
    .finally(() => {
      localPairCandlesInFlight.delete(fetchPromise)
    })

  localPairCandlesInFlight.set(fetchPromise, normalizedPair)
  return fetchPromise
}

const fetchPairCandlesFromLocal = async ({
  pairAddress,
  timeframe,
  leftAssetKey,
  rightAssetKey,
  maxCandles,
  minLatestBucketStart
}: {
  pairAddress: string
  timeframe: "1h" | "24h" | "7d"
  leftAssetKey: string
  rightAssetKey: string
  maxCandles: number
  minLatestBucketStart?: number
}) => {
  if (CLASSIC_CHAIN.chainId !== "columbus-5") return null
  const payload = await loadLocalPairCandlesFile(pairAddress)
  if (!payload?.candles) return null

  const normalizedLeft = normalizeAssetKey(leftAssetKey)
  const normalizedRight = normalizeAssetKey(rightAssetKey)
  const directKey = `${normalizedLeft}|${normalizedRight}`
  const reverseKey = `${normalizedRight}|${normalizedLeft}`

  const directRaw = payload.candles?.[timeframe]?.[directKey]
  const reverseRaw = payload.candles?.[timeframe]?.[reverseKey]

  const useReverse =
    (!Array.isArray(directRaw) || !directRaw.length) &&
    Array.isArray(reverseRaw) &&
    reverseRaw.length > 0

  const raw = useReverse ? reverseRaw : directRaw
  if (!Array.isArray(raw) || !raw.length) return null

  const candles = raw
    .map((item) => normalizeLocalCandle(item))
    .filter((item): item is PairCandle => item !== null)
    .map((item) => {
      if (!useReverse) return item

      // Reverse candles are stored as right/left; invert OHLC into left/right.
      if (item.open <= 0 || item.high <= 0 || item.low <= 0 || item.close <= 0) return null
      return {
        bucketStart: item.bucketStart,
        open: 1 / item.open,
        high: 1 / item.low,
        low: 1 / item.high,
        close: 1 / item.close,
        volumeQuote: item.volumeQuote
      } satisfies PairCandle
    })
    .filter((item): item is PairCandle => item !== null)
    .sort((a, b) => a.bucketStart - b.bucketStart)

  const freshCandles =
    minLatestBucketStart !== undefined
      ? candles.filter((item) => item.bucketStart >= minLatestBucketStart)
      : candles

  if (!freshCandles.length) return null
  return freshCandles.slice(-maxCandles)
}

const loadFactoryPairsForDex = async (dex: SwapDex) => {
  const pairContracts = new Set<string>()
  const limit = 30

  const loadContractsByCodeId = async (codeId: number) => {
    let nextKey = ""

    for (let page = 0; page < 120; page += 1) {
      try {
        const url = new URL(`${CLASSIC_CHAIN.lcd}/cosmwasm/wasm/v1/code/${codeId}/contracts`)
        url.searchParams.set("pagination.limit", "200")
        if (nextKey) url.searchParams.set("pagination.key", nextKey)

        const response = await fetchWithEndpointFallback(url.toString())
        if (!response.ok) break
        const data = (await response.json()) as CodeContractsResponse
        ;(data.contracts ?? []).forEach((contract) => {
          if (contract?.startsWith("terra1")) pairContracts.add(contract.toLowerCase())
        })

        const rawNext = data.pagination?.next_key
        if (!rawNext) break
        nextKey = rawNext
      } catch {
        break
      }
    }
  }

  if (
    dex.mode === "code-id" ||
    dex.mode === "terrapump" ||
    dex.mode === "luncpump" ||
    dex.mode === "weso-defi"
  ) {
    await Promise.all((dex.pairCodeIds ?? []).map((codeId) => loadContractsByCodeId(codeId)))
    return pairContracts
  }

  if (dex.mode === "garuda") {
    if (dex.factory) {
      try {
        const data = await queryContractSmart<FactoryPairsResponse>(dex.factory, {
          pairs: { limit: 1000 }
        })
        ;(data?.pairs ?? []).forEach((pair) => {
          const contract = "contract" in pair ? pair.contract : undefined
          if (contract) pairContracts.add(contract.toLowerCase())
        })
      } catch {
        // Ignore single dex failures.
      }
    }
    await Promise.all((dex.pairCodeIds ?? []).map((codeId) => loadContractsByCodeId(codeId)))
    return pairContracts
  }

  if (!dex.factory) return pairContracts

  let startAfter: unknown[] | undefined
  const seenCursors = new Set<string>()

  for (let page = 0; page < 100; page += 1) {
    try {
      const query = startAfter
        ? { pairs: { limit, start_after: startAfter } }
        : { pairs: { limit } }
      const data = await queryContractSmart<FactoryPairsResponse>(dex.factory, query)
      const pairs = data?.pairs ?? []
      if (!pairs.length) break

      pairs.forEach((pair) => {
        const contract = "contract_addr" in pair ? pair.contract_addr : undefined
        if (contract) pairContracts.add(contract.toLowerCase())
      })

      const last = pairs[pairs.length - 1]
      const nextStartAfter = "asset_infos" in last ? last.asset_infos : undefined
      if (!nextStartAfter || pairs.length < limit) break

      const cursorKey = JSON.stringify(nextStartAfter)
      if (seenCursors.has(cursorKey)) break
      seenCursors.add(cursorKey)
      startAfter = nextStartAfter
    } catch {
      break
    }
  }

  return pairContracts
}

const loadFactoryMarketPairsForDex = async (
  dex: SwapDex
): Promise<MarketDexPair[]> => {
  if (!dex.factory || (dex.mode && dex.mode !== "terraswap")) return []

  const pairsByAddress = new Map<string, MarketDexPair>()
  const seenCursors = new Set<string>()
  let startAfter: FactoryPairRecord["asset_infos"]

  for (let page = 0; page < 100; page += 1) {
    try {
      const query = startAfter
        ? { pairs: { limit: 30, start_after: startAfter } }
        : { pairs: { limit: 30 } }
      const data = await queryContractSmart<FactoryPairsResponse>(dex.factory, query)
      const records = data?.pairs ?? []
      if (!records.length) break

      records.forEach((record) => {
        const pair = parseFactoryPairRecord(record, dex)
        if (pair) pairsByAddress.set(pair.pair, pair)
      })

      const nextCursor = getFactoryPairCursor(records[records.length - 1])
      if (!nextCursor || records.length < 30) break

      const cursorKey = JSON.stringify(nextCursor)
      if (seenCursors.has(cursorKey)) break
      seenCursors.add(cursorKey)
      startAfter = nextCursor
    } catch {
      break
    }
  }

  return Array.from(pairsByAddress.values())
}

const fetchPhoenixFactoryMarketPairs = async () => {
  if (getActiveAppChainKey() !== "luna") return []
  const results = await Promise.all(
    getSwapDexes("luna").map(loadFactoryMarketPairsForDex)
  )
  return results.flat()
}

const fetchPairDexMapFromFactories = async () => {
  const map = new Map<string, { dexId: string; dexLabel: string }>()
  const dexes = getSwapDexes(getActiveAppChainKey())
  await Promise.all(
    dexes.map(async (dex) => {
      const pairs = await loadFactoryPairsForDex(dex)
      pairs.forEach((pairAddress) => {
        map.set(pairAddress, { dexId: dex.id, dexLabel: dex.label })
      })
    })
  )
  return map
}

const getPairDexMap = async () => {
  const chainId = CLASSIC_CHAIN.chainId
  if (
    factoryPairDexCache &&
    factoryPairDexCache.chainId === chainId &&
    Date.now() - factoryPairDexCache.at < FACTORY_PAIR_CACHE_TTL
  ) {
    return factoryPairDexCache.map
  }
  if (factoryPairDexInFlight?.chainId === chainId) {
    return factoryPairDexInFlight.promise
  }

  const promise = fetchPairDexMapFromFactories()
    .then((map) => {
      factoryPairDexCache = { at: Date.now(), chainId, map }
      return map
    })
    .finally(() => {
      if (factoryPairDexInFlight?.promise === promise) {
        factoryPairDexInFlight = null
      }
    })
  factoryPairDexInFlight = { chainId, promise }

  return promise
}

export const fetchMarketDexPairs = async (): Promise<MarketDexPair[]> => {
  const [local, launchpadPairs] = await Promise.all([
    fetchLocalMarketIndex(),
    fetchLaunchpadMarketPairs()
  ])
  if (local?.pairs.length) {
    return mergeMarketPairs(local.pairs, launchpadPairs)
  }

  const [response, factoryPairs] = await Promise.all([
    fetch(ASSET_DEX_PAIRS_URL),
    fetchPhoenixFactoryMarketPairs()
  ])
  if (!response.ok) {
    throw new Error(`Failed to load DEX pairs: ${response.status}`)
  }

  const registry = (await response.json()) as Record<
    string,
    Record<string, AssetDexPair>
  >
  const payload =
    pickChainAssets(registry, CLASSIC_CHAIN.name, CLASSIC_CHAIN.chainId) ?? {}

  const externalPairs = Object.entries(payload)
    .filter(([pair, item]) => {
      if (!pair || !item?.dex || !item?.assets || item.assets.length < 2) {
        return false
      }
      return true
    })
    .map(([pair, item]) => ({
      pair: pair.toLowerCase(),
      dexId: item.dex!.toLowerCase(),
      dexLabel: pickDexLabel(item.dex!),
      type: item.type ?? "xyk",
      assets: [item.assets![0], item.assets![1]] as [string, string]
    }))

  return mergeMarketPairs(
    mergeMarketPairs(externalPairs, factoryPairs),
    launchpadPairs
  )
}

const fetchPoolForPair = async (
  pair: MarketDexPair,
  pairDexMap: Map<string, { dexId: string; dexLabel: string }>
): Promise<MarketPoolSnapshot | null> => {
  const wesoCurvePool = await fetchWesoCurvePoolForPair(pair)
  if (wesoCurvePool) return wesoCurvePool

  try {
    const data = await queryContractSmart<PoolResponse>(pair.pair, { pool: {} })
    const assets = data?.assets
    if (!Array.isArray(assets) || assets.length < 2) {
      if (!data?.asset1 || !data?.asset2) return null

      const matchedDex = pairDexMap.get(pair.pair.toLowerCase())
      const leftId = resolveAssetId(data.asset1, pair.assets[0])
      const rightId = resolveAssetId(data.asset2, pair.assets[1])
      if (!leftId || !rightId || leftId === rightId) return null
      return {
        pair: pair.pair,
        dexId: matchedDex?.dexId ?? pair.dexId,
        dexLabel: matchedDex?.dexLabel ?? pair.dexLabel,
        type: pair.type,
        poolAssets: [
          {
            id: leftId,
            amount: data.reserve1 ?? "0"
          },
          {
            id: rightId,
            amount: data.reserve2 ?? "0"
          }
        ]
      }
    }

    const left = assets[0]
    const right = assets[1]
    const leftFallback = pair.assets[0]
    const rightFallback = pair.assets[1]

    const matchedDex = pairDexMap.get(pair.pair.toLowerCase())
    const leftId = resolveAssetId(left?.info, leftFallback)
    const rightId = resolveAssetId(right?.info, rightFallback)
    if (!leftId || !rightId || leftId === rightId) return null

    return {
      pair: pair.pair,
      dexId: matchedDex?.dexId ?? pair.dexId,
      dexLabel: matchedDex?.dexLabel ?? pair.dexLabel,
      type: pair.type,
      poolAssets: [
        {
          id: leftId,
          amount: left?.amount ?? "0"
        },
        {
          id: rightId,
          amount: right?.amount ?? "0"
        }
      ]
    }
  } catch {
    return null
  }
}

export const fetchMarketPool = async (pair: MarketDexPair) => {
  const pairDexMap = await getPairDexMap()
  return fetchPoolForPair(pair, pairDexMap)
}

export const fetchMarketPoolLive = async (pair: MarketDexPair) =>
  fetchPoolForPair(pair, new Map())

export const fetchMarketPools = async (pairs: MarketDexPair[]) => {
  const local = await fetchLocalMarketIndex()
  const snapshots: MarketPoolSnapshot[] = []
  const staleLocalVolumes = new Map<string, MarketVolumeSummary | undefined>()
  let pairsToFetch = pairs

  if (local?.pools.size) {
    pairsToFetch = []
    pairs.forEach((pair) => {
      const localPool = local.pools.get(pair.pair.toLowerCase())
      if (localPool && !shouldRefreshLocalPoolSnapshot(localPool)) {
        snapshots.push(localPool)
      } else {
        if (localPool) {
          staleLocalVolumes.set(pair.pair.toLowerCase(), localPool.volumes)
        }
        pairsToFetch.push(pair)
      }
    })
    if (!pairsToFetch.length) return snapshots
  }

  const chunkSize = 8
  const pairDexMap = await getPairDexMap()

  for (let index = 0; index < pairsToFetch.length; index += chunkSize) {
    const chunk = pairsToFetch.slice(index, index + chunkSize)
    const resolved = await Promise.all(chunk.map((pair) => fetchPoolForPair(pair, pairDexMap)))
    resolved.forEach((item) => {
      if (!item) return
      const volumes = staleLocalVolumes.get(item.pair.toLowerCase())
      snapshots.push(volumes && !item.volumes ? { ...item, volumes } : item)
    })
  }

  return snapshots
}

export const getMarketPoolIbcDenoms = (pairs: MarketDexPair[]) => {
  const denoms = new Set<string>()
  pairs.forEach((pair) => {
    pair.assets.forEach((asset) => {
      if (asset.startsWith("ibc/")) denoms.add(asset)
    })
  })
  return Array.from(denoms)
}

export const fetchPairCandles = async ({
  pairAddress,
  leftAssetKey,
  rightAssetKey,
  leftDecimals,
  rightDecimals,
  expectedPrice,
  bucketMs,
  lookbackBuckets = 120,
  maxCandles = 120,
  maxPages = 80,
  minCandles = 0,
  expandedLookbackMultiplier = 12,
  includeLocalFallback = false
}: {
  pairAddress: string
  leftAssetKey: string
  rightAssetKey: string
  leftDecimals: number
  rightDecimals: number
  expectedPrice?: number
  bucketMs: number
  lookbackBuckets?: number
  maxCandles?: number
  maxPages?: number
  minCandles?: number
  expandedLookbackMultiplier?: number
  includeLocalFallback?: boolean
}): Promise<PairCandle[]> => {
  const maxLookbackBuckets = Math.max(
    lookbackBuckets,
    expandedLookbackMultiplier > 1
      ? Math.floor(lookbackBuckets * expandedLookbackMultiplier)
      : lookbackBuckets
  )
  const lookbackStartForFallback = Date.now() - bucketMs * maxLookbackBuckets

  const fetchFromTx = async (effectiveLookbackBuckets: number) => {
    const now = Date.now()
    const lookbackStart = now - bucketMs * effectiveLookbackBuckets
    const normalizedLeftKey = normalizeAssetKey(leftAssetKey)
    const normalizedRightKey = normalizeAssetKey(rightAssetKey)

    for (const txQuery of getPairTxQueryVariants(pairAddress)) {
      const ticks: SwapTick[] = []
      let stop = false

      for (let page = 1; page <= maxPages && !stop; page += 1) {
        const url = buildLcdUrl("/cosmos/tx/v1beta1/txs", {
          query: txQuery,
          order_by: "2",
          page: String(page),
          limit: "100"
        })

        let data: TxListResponse
        try {
          const response = await fetchWithEndpointFallback(url, {
            timeoutMs: PAIR_TX_LCD_TIMEOUT_MS
          })
          if (!response.ok) break
          data = (await response.json()) as TxListResponse
        } catch {
          break
        }

        const responses = data.tx_responses ?? []
        if (!responses.length) break

        for (const response of responses) {
          const timestamp = Date.parse(response.timestamp ?? "")
          if (Number.isFinite(timestamp) && timestamp < lookbackStart) {
            stop = true
            break
          }

          ticks.push(
            ...parseSwapTicksFromTxResponse({
              response,
              pairAddress,
              leftKey: normalizedLeftKey,
              rightKey: normalizedRightKey,
              leftDecimals,
              rightDecimals
            })
          )
        }

        if (responses.length < 100) break
      }

      const candles = buildCandles({
        ticks: sanitizeSwapTicks(ticks),
        bucketMs,
        lookbackStart,
        maxCandles
      })
      if (candles.length > 0) return candles
    }

    return []
  }

  const timeframe = resolveTimeframeFromBucketMs(bucketMs)

  // Prioritize on-chain tx-derived candles when they already have enough bars.
  const txCandles = await fetchFromTx(lookbackBuckets)
  const txCandlesValid = candlesMatchExpectedPrice(txCandles, expectedPrice)
  if (txCandlesValid && txCandles.length >= minCandles) {
    return fillCandleGaps({
      candles: txCandles,
      bucketMs,
      lookbackBuckets,
      maxCandles
    })
  }

  const candidates: PairCandle[][] = []
  if (txCandlesValid && txCandles.length > 0) candidates.push(txCandles)

  if (expandedLookbackMultiplier > 1) {
    const expandedLookbackBuckets = Math.max(
      lookbackBuckets,
      Math.floor(lookbackBuckets * expandedLookbackMultiplier)
    )

    if (expandedLookbackBuckets > lookbackBuckets) {
      const expandedTxCandles = await fetchFromTx(expandedLookbackBuckets)
      if (candlesMatchExpectedPrice(expandedTxCandles, expectedPrice) && expandedTxCandles.length > 0) {
        candidates.push(expandedTxCandles)
      }
    }
  }

  // Second fallback: build candles from parsed recent trades if swap-tick parsing is sparse.
  try {
    const tradeWindowLimit = Math.max(maxCandles * 8, 320)
    const tradesForCandles = await fetchPairTrades({
      pairAddress,
      leftAssetKey,
      rightAssetKey,
      leftDecimals,
      rightDecimals,
      offset: 0,
      limit: tradeWindowLimit,
      maxPages
    })
    const tradeCandles = buildCandlesFromTrades({
      trades: tradesForCandles.trades,
      bucketMs,
      lookbackStart: lookbackStartForFallback,
      maxCandles
    })
    if (candlesMatchExpectedPrice(tradeCandles, expectedPrice) && tradeCandles.length > 0) {
      candidates.push(tradeCandles)
    }
  } catch {
    // Keep chart resilient even if trade-derived fallback fails.
  }

  // Optional fallback to static precomputed candles when on-chain tx data is sparse.
  if (includeLocalFallback && timeframe) {
    const localCandles = await fetchPairCandlesFromLocal({
      pairAddress,
      timeframe,
      leftAssetKey,
      rightAssetKey,
      maxCandles,
      minLatestBucketStart: Date.now() - bucketMs * (lookbackBuckets + 1)
    })
    if (localCandles?.length && candlesMatchExpectedPrice(localCandles, expectedPrice)) {
      candidates.push(localCandles)
    }
  }

  if (!candidates.length) return []

  const rankedCandidates = candidates
    .map((candles) => ({
      candles,
      quality: evaluateCandleQuality({
        candles,
        bucketMs,
        minCandles
      })
    }))
    .sort((a, b) => {
      if (b.quality.score !== a.quality.score) return b.quality.score - a.quality.score
      if (b.candles.length !== a.candles.length) return b.candles.length - a.candles.length
      const bLatest = b.candles[b.candles.length - 1]?.bucketStart ?? 0
      const aLatest = a.candles[a.candles.length - 1]?.bucketStart ?? 0
      return bLatest - aLatest
    })

  const acceptable = rankedCandidates.filter((candidate) => candidate.quality.isAcceptable)
  const selection = acceptable.length ? acceptable : rankedCandidates
  return fillCandleGaps({
    candles: selection[0]?.candles ?? [],
    bucketMs,
    lookbackBuckets,
    maxCandles
  })
}

const amountFromBinodes = ({
  actual,
  raw,
  decimals
}: {
  actual?: number
  raw?: string
  decimals: number
}) => {
  if (Number.isFinite(actual) && Number(actual) > 0) return Number(actual)
  const rawAmount = Number(raw ?? NaN)
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return 0
  return rawAmount / 10 ** decimals
}

const normalizeBinodesPairTrade = ({
  item,
  pairAddress,
  leftKey,
  rightKey,
  leftDecimals,
  rightDecimals
}: {
  item: BinodesDexTxDetail
  pairAddress: string
  leftKey: string
  rightKey: string
  leftDecimals: number
  rightDecimals: number
}): PairTrade | null => {
  if (item.code !== undefined && item.code !== 0) return null
  if (item.pair_addr?.toLowerCase() !== pairAddress.toLowerCase()) return null

  const timestamp = Date.parse(item.timestamp_utc ?? "")
  if (!Number.isFinite(timestamp)) return null

  const txhash = item.tx_hash ?? ""
  if (!txhash) return null

  const offerKey = normalizeAssetKey(item.offer_denom ?? "")
  const askKey = normalizeAssetKey(item.ask_denom ?? "")
  const trader = (item.sender_addr || item.receiver_addr || "").toLowerCase()

  if (offerKey === leftKey && askKey === rightKey) {
    const offerAmount = amountFromBinodes({
      actual: item.offer_amt_actual,
      raw: item.offer_amt_raw,
      decimals: leftDecimals
    })
    const askAmount = amountFromBinodes({
      actual: item.ask_amt_actual,
      raw: item.ask_amt_raw,
      decimals: rightDecimals
    })
    if (offerAmount <= 0 || askAmount <= 0) return null
    return {
      txhash,
      timestamp,
      side: "sell",
      price: askAmount / offerAmount,
      amountBase: offerAmount,
      amountQuote: askAmount,
      trader
    }
  }

  if (offerKey === rightKey && askKey === leftKey) {
    const offerAmount = amountFromBinodes({
      actual: item.offer_amt_actual,
      raw: item.offer_amt_raw,
      decimals: rightDecimals
    })
    const askAmount = amountFromBinodes({
      actual: item.ask_amt_actual,
      raw: item.ask_amt_raw,
      decimals: leftDecimals
    })
    if (offerAmount <= 0 || askAmount <= 0) return null
    return {
      txhash,
      timestamp,
      side: "buy",
      price: offerAmount / askAmount,
      amountBase: askAmount,
      amountQuote: offerAmount,
      trader
    }
  }

  return null
}

const fetchPairTradesFromBinodes = async ({
  pairAddress,
  leftKey,
  rightKey,
  leftDecimals,
  rightDecimals,
  targetCount
}: {
  pairAddress: string
  leftKey: string
  rightKey: string
  leftDecimals: number
  rightDecimals: number
  targetCount: number
}) => {
  const items = await fetchBinodesDexTxDetails({
    pairAddress,
    limit: targetCount
  })

  const trades = items
    .map((item) =>
      normalizeBinodesPairTrade({
        item,
        pairAddress,
        leftKey,
        rightKey,
        leftDecimals,
        rightDecimals
      })
    )
    .filter((trade): trade is PairTrade => trade !== null)

  trades.sort((a, b) => {
    if (a.timestamp === b.timestamp) return b.txhash.localeCompare(a.txhash)
    return b.timestamp - a.timestamp
  })

  return trades
}

export const fetchPairTrades = async ({
  pairAddress,
  leftAssetKey,
  rightAssetKey,
  leftDecimals,
  rightDecimals,
  offset = 0,
  limit = 25,
  maxPages = 120
}: {
  pairAddress: string
  leftAssetKey: string
  rightAssetKey: string
  leftDecimals: number
  rightDecimals: number
  offset?: number
  limit?: number
  maxPages?: number
}): Promise<PairTradesResult> => {
  const targetCount = Math.max(0, offset) + Math.max(1, limit) + 1
  const normalizedLeftKey = normalizeAssetKey(leftAssetKey)
  const normalizedRightKey = normalizeAssetKey(rightAssetKey)

  if (
    CLASSIC_CHAIN.chainId === "columbus-5" &&
    Date.now() >= binodesPairTradesUnavailableUntil
  ) {
    try {
      const binodesTrades = await withTimeout(
        fetchPairTradesFromBinodes({
          pairAddress,
          leftKey: normalizedLeftKey,
          rightKey: normalizedRightKey,
          leftDecimals,
          rightDecimals,
          targetCount
        }),
        BINODES_PAIR_TRADES_TIMEOUT_MS
      )

      if (binodesTrades.length > 0) {
        const start = Math.max(0, offset)
        const end = start + Math.max(1, limit)
        return {
          trades: binodesTrades.slice(start, end),
          hasMore: binodesTrades.length > end
        }
      }
    } catch {
      binodesPairTradesUnavailableUntil =
        Date.now() + BINODES_PAIR_TRADES_FAILURE_COOLDOWN_MS
      // Fall back to LCD event parsing if Binode is unavailable or blocked by the browser.
    }
  }

  let bestTrades: PairTrade[] = []
  let bestReachedEnd = false

  for (const txQuery of getPairTxQueryVariants(pairAddress)) {
    const trades: PairTrade[] = []
    let reachedEnd = false

    for (let page = 1; page <= maxPages; page += 1) {
      const url = buildLcdUrl("/cosmos/tx/v1beta1/txs", {
        query: txQuery,
        order_by: "2",
        page: String(page),
        limit: "100"
      })

      let data: TxListResponse
      try {
        const response = await fetchWithEndpointFallback(url, {
          timeoutMs: PAIR_TX_LCD_TIMEOUT_MS
        })
        if (!response.ok) break
        data = (await response.json()) as TxListResponse
      } catch {
        break
      }

      const responses = data.tx_responses ?? []
      if (!responses.length) {
        reachedEnd = true
        break
      }

      for (const response of responses) {
        trades.push(
          ...parseSwapTradesFromTxResponse({
            response,
            pairAddress,
            leftKey: normalizedLeftKey,
            rightKey: normalizedRightKey,
            leftDecimals,
            rightDecimals
          })
        )

        if (trades.length >= targetCount) break
      }

      if (trades.length >= targetCount) break
      if (responses.length < 100) {
        reachedEnd = true
        break
      }
    }

    if (trades.length > 0 || !bestTrades.length) {
      bestTrades = trades
      bestReachedEnd = reachedEnd
    }

    if (trades.length >= targetCount || trades.length > 0) {
      if (trades.length >= targetCount) break
      break
    }
  }

  // Keep a deterministic order for pagination slices.
  bestTrades.sort((a, b) => {
    if (a.timestamp === b.timestamp) return b.txhash.localeCompare(a.txhash)
    return b.timestamp - a.timestamp
  })

  const start = Math.max(0, offset)
  const end = start + Math.max(1, limit)
  return {
    trades: bestTrades.slice(start, end),
    hasMore: !bestReachedEnd || bestTrades.length > end
  }
}

export const getMarketEndpointInfo = () => ({
  lcd: CLASSIC_CHAIN.lcd,
  chainId: CLASSIC_CHAIN.chainId
})
