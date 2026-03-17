import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { CLASSIC_DENOMS } from "../chain"
import {
  fetchBalances,
  fetchFxRates,
  fetchPrices,
  fetchSwapRates,
  getCachedFxRates,
  getCachedPrices
} from "../data/classic"
import { useCw20Balances } from "../data/cw20"
import { useDexEstimatedPrices, useDirectAnchorDexPrices } from "../data/dexPrices"
import { fetchMarketDexPairs, fetchMarketPools } from "../data/market"
import {
  useCw20Whitelist,
  useResolvedCw20Whitelist,
  useResolvedNativeWhitelist,
  useResolvedIbcWhitelist
} from "../data/terraAssets"
import { toUnitAmount } from "../utils/format"
import {
  buildClassicNativeIconCandidates,
  buildCw20IconCandidates,
  buildIbcAssetIconCandidates
} from "../utils/assetIcons"

export type WalletAssetRow = {
  kind: "native" | "ibc" | "cw20"
  denom: string
  symbol: string
  name: string
  decimals: number
  amount: string
  price?: number
  change?: number
  value?: number
  chainCount: number
  whitelisted: boolean
  isBuyable: boolean
  iconCandidates: string[]
}

export type WalletTokenCatalogItem = {
  key: string
  symbol: string
  name?: string
  iconCandidates: string[]
}

const isWalletAssetRow = (
  row: WalletAssetRow | undefined
): row is WalletAssetRow => Boolean(row)

const formatWalletDenom = (denom: string, isClassic?: boolean) => {
  if (!denom) return ""
  if (denom.startsWith("u")) {
    const suffix = denom.slice(1)
    if (suffix.length > 3) {
      return suffix === "luna" ? (isClassic ? "LUNC" : "Luna") : suffix.toUpperCase()
    }
    return `${suffix.slice(0, 2).toUpperCase()}T${isClassic ? "C" : ""}`
  }
  return denom
}

const buildWalletIconCandidates = ({
  icon,
  denom,
  symbol,
  isClassic,
  fallback
}: {
  icon?: string
  denom: string
  symbol?: string
  isClassic: boolean
  fallback?: string
}) => {
  const iconDenom = symbol || (denom === "uluna" ? "LUNC" : formatWalletDenom(denom, false))
  if (fallback === "/system/ibc.svg") {
    return buildIbcAssetIconCandidates([icon], fallback, { symbol })
  }

  return buildClassicNativeIconCandidates({
    denom,
    symbol: symbol || (isClassic ? formatWalletDenom(denom, true) : iconDenom),
    primaryIcon: icon,
    fallback
  })
}

const shouldSwapForDisplay = ({
  leftId,
  rightId,
  leftIsUstc,
  rightIsLunc,
}: {
  leftId: string
  rightId: string
  leftIsUstc: boolean
  rightIsLunc: boolean
}) => {
  const leftIsCw20 = leftId.startsWith("cw20:")
  const rightIsCw20 = rightId.startsWith("cw20:")

  if (leftIsCw20 !== rightIsCw20) {
    return !leftIsCw20 && rightIsCw20
  }

  if (leftIsUstc && rightIsLunc) return true

  return false
}

const sortByValueDesc = (
  a: { value?: number; amount: string; decimals: number; symbol: string },
  b: { value?: number; amount: string; decimals: number; symbol: string }
) => {
  const aHasValue = a.value !== undefined
  const bHasValue = b.value !== undefined

  if (aHasValue !== bHasValue) {
    return aHasValue ? -1 : 1
  }

  if (aHasValue && bHasValue) {
    const aValue = a.value ?? 0
    const bValue = b.value ?? 0
    if (aValue === bValue) {
      return a.symbol.localeCompare(b.symbol)
    }
    return bValue - aValue
  }

  const aAmount = toUnitAmount(a.amount, a.decimals)
  const bAmount = toUnitAmount(b.amount, b.decimals)
  if (aAmount === bAmount) {
    return a.symbol.localeCompare(b.symbol)
  }
  return bAmount - aAmount
}

const normalizeWalletAssetKey = (assetKey: string) => {
  if (!assetKey) return assetKey
  if (assetKey.startsWith("ibc/")) {
    return `ibc/${assetKey.slice(4).toUpperCase()}`
  }
  return assetKey.toLowerCase()
}

export const useWalletAssets = (accountAddress?: string) => {
  const { data: marketPairs = [] } = useQuery({
    queryKey: ["market", "pairs"],
    queryFn: fetchMarketDexPairs,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 20 * 60 * 1000
  })

  const { data: marketPools = [] } = useQuery({
    queryKey: ["market", "pools", marketPairs.map((pair) => pair.pair).join(",")],
    queryFn: () => fetchMarketPools(marketPairs),
    enabled: marketPairs.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000
  })

  const { data: balances = [] } = useQuery({
    queryKey: ["wallet", "balances", accountAddress],
    queryFn: () => fetchBalances(accountAddress ?? ""),
    enabled: Boolean(accountAddress),
    staleTime: 60_000
  })

  const cachedPrices = useMemo(() => getCachedPrices(), [])
  const { data: prices } = useQuery({
    queryKey: ["prices"],
    queryFn: fetchPrices,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    initialData: cachedPrices?.data,
    initialDataUpdatedAt: cachedPrices?.ts
  })

  const cachedFxRates = useMemo(() => getCachedFxRates(), [])
  const { data: fxRates } = useQuery({
    queryKey: ["fx-rates"],
    queryFn: fetchFxRates,
    staleTime: 12 * 60 * 60 * 1000,
    refetchInterval: 12 * 60 * 60 * 1000,
    initialData: cachedFxRates?.data,
    initialDataUpdatedAt: cachedFxRates?.ts
  })

  const { data: swapRates = [] } = useQuery({
    queryKey: ["swaprates", CLASSIC_DENOMS.ustc.coinMinimalDenom],
    queryFn: () => fetchSwapRates(CLASSIC_DENOMS.ustc.coinMinimalDenom),
    staleTime: 300_000
  })
  const swapRateMap = useMemo(
    () => new Map(swapRates.map((item) => [item.denom, Number(item.swaprate)])),
    [swapRates]
  )

  const { data: cw20WhitelistBase = {} } = useCw20Whitelist()
  const nativeDenoms = useMemo(
    () =>
      balances
        .map((coin) => coin.denom)
        .filter((denom) => !denom.startsWith("ibc/")),
    [balances]
  )
  const { data: nativeWhitelist = {} } = useResolvedNativeWhitelist(nativeDenoms)
  const ibcDenoms = useMemo(
    () =>
      balances
        .map((coin) => coin.denom)
        .filter((denom) => denom.startsWith("ibc/")),
    [balances]
  )
  const { data: ibcWhitelist } = useResolvedIbcWhitelist(ibcDenoms)
  const { data: cw20BalancesBase = [] } = useCw20Balances(accountAddress, cw20WhitelistBase)
  const resolvedCw20Contracts = useMemo(
    () =>
      cw20BalancesBase
        .filter((token) => Number(token.balance) > 0)
        .map((token) => token.address),
    [cw20BalancesBase]
  )
  const { data: cw20Whitelist = cw20WhitelistBase } =
    useResolvedCw20Whitelist(resolvedCw20Contracts)
  const cw20Balances = useMemo(
    () =>
      cw20BalancesBase.map((token) => ({
        ...token,
        ...(cw20Whitelist[token.address.toLowerCase()] ?? {})
      })),
    [cw20BalancesBase, cw20Whitelist]
  )

  const dexAssetMetas = useMemo(() => {
    const map = new Map<string, number>()

    balances.forEach((coin) => {
      if (Number(coin.amount) <= 0) return
      if (coin.denom.startsWith("ibc/")) {
        const hash = coin.denom.replace("ibc/", "")
        map.set(coin.denom, ibcWhitelist?.[hash]?.decimals ?? 6)
        return
      }
      map.set(coin.denom, 6)
    })

    cw20Balances.forEach((token) => {
      if (Number(token.balance) <= 0) return
      map.set(token.address, token.decimals ?? 6)
    })

    return Array.from(map.entries()).map(([key, decimals]) => ({
      key,
      decimals
    }))
  }, [balances, cw20Balances, ibcWhitelist])

  const { data: dexEstimatedPrices } = useDexEstimatedPrices(dexAssetMetas)

  const getBalance = useMemo(() => {
    const map = new Map(balances.map((coin) => [coin.denom, coin.amount]))
    return (denom: string) => map.get(denom)
  }, [balances])

  const luncPrice = prices?.lunc?.usd
  const ustcPrice = prices?.ustc?.usd
  const luncChange = prices?.lunc?.usd_24h_change
  const ustcChange = prices?.ustc?.usd_24h_change

  const marketUsdPriceByAsset = useMemo(() => {
    const getNativeUsdSeedPrice = (denom: string) => {
      if (denom === CLASSIC_DENOMS.lunc.coinMinimalDenom) return luncPrice
      if (denom === CLASSIC_DENOMS.ustc.coinMinimalDenom) return ustcPrice
      if (denom.startsWith("ibc/")) return undefined

      const swaprate = swapRateMap.get(denom)
      if (swaprate && Number.isFinite(swaprate) && swaprate > 0) {
        const unitValue = 1 / swaprate
        const isClassicStable = formatWalletDenom(denom, true).endsWith("TC")
        if (isClassicStable) {
          return ustcPrice !== undefined ? unitValue * ustcPrice : undefined
        }
        return unitValue
      }

      const lower = denom.toLowerCase()
      const fx =
        lower === "umnt" ? fxRates?.MNT : lower === "utwd" ? fxRates?.TWD : undefined
      if (!fx || ustcPrice === undefined) return undefined
      return fx * ustcPrice
    }

    const getDecimalsForAssetKey = (assetKey: string) => {
      const normalizedKey = normalizeWalletAssetKey(assetKey)
      if (
        normalizedKey === CLASSIC_DENOMS.lunc.coinMinimalDenom ||
        normalizedKey === CLASSIC_DENOMS.ustc.coinMinimalDenom
      ) {
        return 6
      }
      if (normalizedKey.startsWith("ibc/")) {
        const hash = normalizedKey.slice(4)
        return ibcWhitelist?.[hash]?.decimals ?? 6
      }
      if (normalizedKey.startsWith("terra1")) {
        return cw20Whitelist?.[normalizedKey]?.decimals ?? 6
      }
      return nativeWhitelist[normalizedKey]?.decimals ?? 6
    }

    const poolEdges = marketPools
      .map((pool) => {
        const leftRaw = pool.poolAssets[0]
        const rightRaw = pool.poolAssets[1]
        if (!leftRaw || !rightRaw) return undefined

        const leftKey = normalizeWalletAssetKey(leftRaw.id)
        const rightKey = normalizeWalletAssetKey(rightRaw.id)
        const leftUnits = toUnitAmount(leftRaw.amount, getDecimalsForAssetKey(leftRaw.id))
        const rightUnits = toUnitAmount(rightRaw.amount, getDecimalsForAssetKey(rightRaw.id))

        if (
          !leftKey ||
          !rightKey ||
          !Number.isFinite(leftUnits) ||
          !Number.isFinite(rightUnits) ||
          leftUnits <= 0 ||
          rightUnits <= 0
        ) {
          return undefined
        }

        return { leftKey, rightKey, leftUnits, rightUnits }
      })
      .filter(
        (
          edge
        ): edge is {
          leftKey: string
          rightKey: string
          leftUnits: number
          rightUnits: number
        } => Boolean(edge)
      )

    const resolved = new Map<string, { price: number; liquidity: number }>()
    const seedNativeDenoms = new Set<string>([
      CLASSIC_DENOMS.lunc.coinMinimalDenom,
      CLASSIC_DENOMS.ustc.coinMinimalDenom
    ])
    marketPools.forEach((pool) => {
      pool.poolAssets.forEach((asset) => {
        if (asset.id.startsWith("native:")) {
          seedNativeDenoms.add(asset.id.slice("native:".length))
        }
      })
    })
    seedNativeDenoms.forEach((denom) => {
      const usdPrice = getNativeUsdSeedPrice(denom)
      if (usdPrice === undefined || !Number.isFinite(usdPrice) || usdPrice <= 0) return
      resolved.set(normalizeWalletAssetKey(denom), {
        price: usdPrice,
        liquidity: Number.POSITIVE_INFINITY
      })
    })

    const maxPasses = Math.max(4, poolEdges.length * 2)

    for (let pass = 0; pass < maxPasses; pass += 1) {
      let updated = false

      poolEdges.forEach(({ leftKey, rightKey, leftUnits, rightUnits }) => {
        const leftResolved = resolved.get(leftKey)
        const rightResolved = resolved.get(rightKey)

        if (leftResolved && !rightResolved) {
          const rightPrice = (leftUnits * leftResolved.price) / rightUnits
          const liquidity = leftUnits * leftResolved.price * 2
          if (Number.isFinite(rightPrice) && rightPrice > 0) {
            const current = resolved.get(rightKey)
            if (!current || liquidity > current.liquidity) {
              resolved.set(rightKey, { price: rightPrice, liquidity })
              updated = true
            }
          }
        }

        if (rightResolved && !leftResolved) {
          const leftPrice = (rightUnits * rightResolved.price) / leftUnits
          const liquidity = rightUnits * rightResolved.price * 2
          if (Number.isFinite(leftPrice) && leftPrice > 0) {
            const current = resolved.get(leftKey)
            if (!current || liquidity > current.liquidity) {
              resolved.set(leftKey, { price: leftPrice, liquidity })
              updated = true
            }
          }
        }
      })

      if (!updated) break
    }

    return Object.fromEntries(
      Array.from(resolved.entries()).map(([key, entry]) => [key, entry.price])
    ) as Record<string, number>
  }, [
    cw20Whitelist,
    fxRates?.MNT,
    fxRates?.TWD,
    ibcWhitelist,
    luncPrice,
    marketPools,
    nativeWhitelist,
    swapRateMap,
    ustcPrice
  ])

  const unresolvedDexAssetMetas = useMemo(
    () =>
      dexAssetMetas.filter((item) => {
        const normalizedKey = normalizeWalletAssetKey(item.key)
        if (
          normalizedKey === CLASSIC_DENOMS.lunc.coinMinimalDenom ||
          normalizedKey === CLASSIC_DENOMS.ustc.coinMinimalDenom
        ) {
          return false
        }
        if (marketUsdPriceByAsset[normalizedKey] !== undefined) return false
        if (dexEstimatedPrices?.[normalizedKey] !== undefined) return false
        return true
      }),
    [dexAssetMetas, dexEstimatedPrices, marketUsdPriceByAsset]
  )

  const { data: directAnchorDexPrices } = useDirectAnchorDexPrices(unresolvedDexAssetMetas)

  const resolveDexUsdValue = useCallback(
    (assetKey: string, amount: string, decimals: number) => {
      const normalizedKey = normalizeWalletAssetKey(assetKey)

      const derivedUsdPrice = marketUsdPriceByAsset[normalizedKey]
      if (derivedUsdPrice !== undefined) {
        return toUnitAmount(amount, decimals) * derivedUsdPrice
      }

      const estimate =
        dexEstimatedPrices?.[normalizedKey] ?? directAnchorDexPrices?.[normalizedKey]
      if (!estimate) return undefined

      const quoteUsd =
        estimate.quoteDenom === CLASSIC_DENOMS.ustc.coinMinimalDenom ? ustcPrice : luncPrice
      if (quoteUsd === undefined) return undefined

      return toUnitAmount(amount, decimals) * estimate.priceInQuote * quoteUsd
    },
    [dexEstimatedPrices, directAnchorDexPrices, luncPrice, marketUsdPriceByAsset, ustcPrice]
  )

  const marketStyleChangeByAsset = useMemo(() => {
    const resolveAssetMeta = (assetId: string) => {
      if (assetId.startsWith("native:")) {
        const denom = assetId.slice(7)
        const isIbc = denom.startsWith("ibc/")
        const hash = isIbc ? denom.slice(4) : ""
        return {
          id: assetId,
          key: denom.startsWith("ibc/") ? `ibc/${denom.slice(4).toUpperCase()}` : denom.toLowerCase(),
          decimals: isIbc ? (ibcWhitelist?.[hash]?.decimals ?? 6) : 6,
          isLunc: denom === CLASSIC_DENOMS.lunc.coinMinimalDenom,
          isUstc: denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
        }
      }

      const contract = assetId.startsWith("cw20:") ? assetId.slice(5).toLowerCase() : assetId
      return {
        id: `cw20:${contract}`,
        key: contract,
        decimals: cw20Whitelist?.[contract]?.decimals ?? 6,
        isLunc: false,
        isUstc: false
      }
    }

    const getAssetUsdPrice = (asset: ReturnType<typeof resolveAssetMeta>) => {
      if (asset.isLunc) return luncPrice
      if (asset.isUstc) return ustcPrice
      const derivedUsdPrice = marketUsdPriceByAsset[asset.key]
      if (derivedUsdPrice !== undefined) return derivedUsdPrice
      const estimate = dexEstimatedPrices?.[asset.key] ?? directAnchorDexPrices?.[asset.key]
      if (!estimate) return undefined
      const quoteUsd =
        estimate.quoteDenom === CLASSIC_DENOMS.ustc.coinMinimalDenom ? ustcPrice : luncPrice
      if (quoteUsd === undefined) return undefined
      return estimate.priceInQuote * quoteUsd
    }

    const getAssetChange = (asset: ReturnType<typeof resolveAssetMeta>) => {
      if (asset.isLunc) return luncChange
      if (asset.isUstc) return ustcChange
      return undefined
    }

    const byAsset = new Map<string, { change?: number; liquidity: number }>()

    marketPools.forEach((pool) => {
      const leftRaw = pool.poolAssets[0]
      const rightRaw = pool.poolAssets[1]
      if (!leftRaw || !rightRaw) return

      let left = resolveAssetMeta(leftRaw.id)
      let right = resolveAssetMeta(rightRaw.id)
      let leftAmount = toUnitAmount(leftRaw.amount, left.decimals)
      let rightAmount = toUnitAmount(rightRaw.amount, right.decimals)

      if (
        shouldSwapForDisplay({
          leftId: left.id,
          rightId: right.id,
          leftIsUstc: left.isUstc,
          rightIsLunc: right.isLunc
        })
      ) {
        ;[left, right] = [right, left]
        ;[leftAmount, rightAmount] = [rightAmount, leftAmount]
      }

      if (leftAmount <= 0 || rightAmount <= 0) return

      const leftUsd = getAssetUsdPrice(left)
      const rightUsd = getAssetUsdPrice(right)
      const leftValue = leftUsd !== undefined ? leftUsd * leftAmount : undefined
      const rightValue = rightUsd !== undefined ? rightUsd * rightAmount : undefined
      const liquidity =
        leftValue !== undefined && rightValue !== undefined
          ? leftValue + rightValue
          : leftValue !== undefined
            ? leftValue * 2
            : rightValue !== undefined
              ? rightValue * 2
              : 0

      const baseChange = getAssetChange(left)
      const quoteChange = getAssetChange(right)
      let pairChange: number | undefined

      if (baseChange !== undefined && quoteChange !== undefined) {
        pairChange = ((1 + baseChange / 100) / (1 + quoteChange / 100) - 1) * 100
      } else if (baseChange !== undefined) {
        pairChange = baseChange
      } else if (quoteChange !== undefined) {
        pairChange = -quoteChange
      }

      if (pairChange === undefined || liquidity <= 0) return

      const current = byAsset.get(left.id)
      if (!current || liquidity > current.liquidity) {
        byAsset.set(left.id, { change: pairChange, liquidity })
      }
    })

    return byAsset
  }, [
    cw20Whitelist,
    dexEstimatedPrices,
    directAnchorDexPrices,
    ibcWhitelist,
    luncChange,
    luncPrice,
    marketUsdPriceByAsset,
    marketPools,
    ustcChange,
    ustcPrice
  ])

  const assetRows = useMemo<WalletAssetRow[]>(() => {
    const calcValueFromSwaprate = (
      amount: string,
      swaprate?: number,
      isClassicStable?: boolean
    ) => {
      if (!swaprate) return undefined
      const base = Number(amount) / swaprate / 1e6
      if (isClassicStable) {
        return ustcPrice ? base * ustcPrice : undefined
      }
      return base
    }

    const calcFxFallback = (amount: string, denom?: string) => {
      if (!ustcPrice || !denom) return undefined
      const lower = denom.toLowerCase()
      const fx =
        lower === "umnt" ? fxRates?.MNT : lower === "utwd" ? fxRates?.TWD : undefined
      if (!fx) return undefined
      return (Number(amount) / 1e6) * fx * ustcPrice
    }

    const nativeRows = balances
      .filter((coin) => Number(coin.amount) > 0)
      .map((coin): WalletAssetRow => {
        const isClassic = true
        const swaprate = swapRateMap.get(coin.denom)
        const classicSymbol = formatWalletDenom(coin.denom, true)
        const isClassicStable = classicSymbol.endsWith("TC")
        const valueFromSwaprate =
          calcValueFromSwaprate(coin.amount, swaprate, isClassicStable) ??
          calcFxFallback(coin.amount, coin.denom)

        if (coin.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom) {
          const value =
            luncPrice !== undefined
              ? toUnitAmount(coin.amount, CLASSIC_DENOMS.lunc.coinDecimals) * luncPrice
              : valueFromSwaprate ??
                resolveDexUsdValue(
                  coin.denom,
                  coin.amount,
                  CLASSIC_DENOMS.lunc.coinDecimals
                )
          const unitAmount = toUnitAmount(coin.amount, CLASSIC_DENOMS.lunc.coinDecimals)
          const price = value !== undefined && unitAmount > 0 ? value / unitAmount : luncPrice

          return {
            kind: "native",
            denom: coin.denom,
            symbol: "LUNC",
            name: "Terra Classic",
            decimals: CLASSIC_DENOMS.lunc.coinDecimals,
            amount: coin.amount,
            price,
            change: luncChange,
            value,
            chainCount: 1,
            whitelisted: true,
            isBuyable: true,
            iconCandidates: buildWalletIconCandidates({
              denom: coin.denom,
              isClassic,
              fallback: "/system/cw20.svg"
            })
          }
        }

        if (coin.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom) {
          const value =
            ustcPrice !== undefined
              ? toUnitAmount(coin.amount, CLASSIC_DENOMS.ustc.coinDecimals) * ustcPrice
              : valueFromSwaprate ??
                resolveDexUsdValue(
                  coin.denom,
                  coin.amount,
                  CLASSIC_DENOMS.ustc.coinDecimals
                )
          const unitAmount = toUnitAmount(coin.amount, CLASSIC_DENOMS.ustc.coinDecimals)
          const price = value !== undefined && unitAmount > 0 ? value / unitAmount : ustcPrice

          return {
            kind: "native",
            denom: coin.denom,
            symbol: "USTC",
            name: "Stablecoin",
            decimals: CLASSIC_DENOMS.ustc.coinDecimals,
            amount: coin.amount,
            price,
            change: ustcChange,
            value,
            chainCount: 1,
            whitelisted: true,
            isBuyable: true,
            iconCandidates: buildWalletIconCandidates({
              denom: coin.denom,
              isClassic,
              fallback: "/system/cw20.svg"
            })
          }
        }

        if (coin.denom.startsWith("ibc/")) {
          const hash = coin.denom.replace("ibc/", "")
          const ibcToken = ibcWhitelist?.[hash]
          const symbol = ibcToken?.symbol ?? "IBC"
          const name = ibcToken?.name ?? symbol
          const decimals = ibcToken?.decimals ?? 6
          const unitAmount = toUnitAmount(coin.amount, decimals)
          const baseDenom = ibcToken?.base_denom ?? coin.denom
          const isClassicStableIbc = formatWalletDenom(baseDenom, true).endsWith("TC")
          const value =
            calcValueFromSwaprate(coin.amount, swaprate, isClassicStableIbc) ??
            calcFxFallback(coin.amount, baseDenom) ??
            resolveDexUsdValue(coin.denom, coin.amount, decimals)
          const price = value !== undefined && unitAmount > 0 ? value / unitAmount : undefined

          return {
            kind: "ibc",
            denom: coin.denom,
            symbol,
            name,
            decimals,
            amount: coin.amount,
            price,
            change: marketStyleChangeByAsset.get(`native:${coin.denom}`)?.change,
            value,
            chainCount: 1,
            whitelisted: Boolean(ibcToken),
            isBuyable: false,
            iconCandidates: buildWalletIconCandidates({
              icon: ibcToken?.icon,
              denom: baseDenom,
              isClassic,
              fallback: "/system/ibc.svg"
            })
          }
        }

        const displaySymbol = formatWalletDenom(coin.denom, true)
        const nativeToken = nativeWhitelist[coin.denom.toLowerCase()]
        const symbol = nativeToken?.symbol ?? displaySymbol
        const name = nativeToken?.name ?? symbol
        const decimals = nativeToken?.decimals ?? 6
        const unitAmount = toUnitAmount(coin.amount, decimals)
        const value =
          valueFromSwaprate ??
          calcFxFallback(coin.amount, coin.denom) ??
          resolveDexUsdValue(coin.denom, coin.amount, decimals)
        const price = value !== undefined && unitAmount > 0 ? value / unitAmount : undefined

        return {
          kind: "native",
          denom: coin.denom,
          symbol,
          name,
          decimals,
          amount: coin.amount,
          price,
          change: marketStyleChangeByAsset.get(`native:${coin.denom}`)?.change,
          value,
          chainCount: 1,
          whitelisted: false,
          isBuyable: false,
          iconCandidates: buildWalletIconCandidates({
            icon: nativeToken?.icon,
            denom: coin.denom,
            symbol,
            isClassic,
            fallback: "/system/cw20.svg"
          })
        }
      })

    const hasLunc = nativeRows.some(
      (row) => row.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
    )
    const hasUstc = nativeRows.some(
      (row) => row.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
    )

    if (!hasLunc) {
      const amount = getBalance(CLASSIC_DENOMS.lunc.coinMinimalDenom) ?? "0"
      const unitAmount = toUnitAmount(amount, CLASSIC_DENOMS.lunc.coinDecimals)
      nativeRows.push({
        kind: "native",
        denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
        symbol: "LUNC",
        name: "Terra Classic",
        decimals: CLASSIC_DENOMS.lunc.coinDecimals,
        amount,
        price: luncPrice,
        change: luncChange,
        value: luncPrice !== undefined ? unitAmount * luncPrice : undefined,
        chainCount: 1,
        whitelisted: true,
        isBuyable: true,
        iconCandidates: buildWalletIconCandidates({
          denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
          isClassic: true,
          fallback: "/system/cw20.svg"
        })
      })
    }

    if (!hasUstc) {
      const amount = getBalance(CLASSIC_DENOMS.ustc.coinMinimalDenom) ?? "0"
      const unitAmount = toUnitAmount(amount, CLASSIC_DENOMS.ustc.coinDecimals)
      nativeRows.push({
        kind: "native",
        denom: CLASSIC_DENOMS.ustc.coinMinimalDenom,
        symbol: "USTC",
        name: "Stablecoin",
        decimals: CLASSIC_DENOMS.ustc.coinDecimals,
        amount,
        price: ustcPrice,
        change: ustcChange,
        value: ustcPrice !== undefined ? unitAmount * ustcPrice : undefined,
        chainCount: 1,
        whitelisted: true,
        isBuyable: true,
        iconCandidates: buildWalletIconCandidates({
          denom: CLASSIC_DENOMS.ustc.coinMinimalDenom,
          isClassic: true,
          fallback: "/system/cw20.svg"
        })
      })
    }

    const cw20Rows = cw20Balances
      .filter((token) => Number(token.balance) > 0)
      .map((token): WalletAssetRow => {
        const decimals = token.decimals ?? 6
        const unitAmount = toUnitAmount(token.balance, decimals)
        const price =
          token.symbol === "LUNC" ? luncPrice : token.symbol === "USTC" ? ustcPrice : undefined
        const value =
          (price !== undefined && unitAmount > 0 ? unitAmount * price : undefined) ??
          resolveDexUsdValue(token.address, token.balance, decimals)
        const resolvedPrice = value !== undefined && unitAmount > 0 ? value / unitAmount : price

        return {
          kind: "cw20",
          denom: token.address,
          symbol: token.symbol,
          name: token.name ?? token.symbol,
          decimals,
          amount: token.balance,
          price: resolvedPrice,
          change: marketStyleChangeByAsset.get(`cw20:${token.address.toLowerCase()}`)?.change,
          value,
          chainCount: 1,
          whitelisted: true,
          isBuyable: false,
          iconCandidates: buildCw20IconCandidates(token.icon, token.symbol)
        }
      })

    const luncRow = nativeRows.find(
      (row) => row.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
    )
    const ustcRow = nativeRows.find(
      (row) => row.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
    )
    const nativeNonIbc = nativeRows.filter(
      (row) =>
        row.denom !== CLASSIC_DENOMS.lunc.coinMinimalDenom &&
        row.denom !== CLASSIC_DENOMS.ustc.coinMinimalDenom &&
        !row.denom.startsWith("ibc/")
    )
    const ibcRows = nativeRows.filter((row) => row.denom.startsWith("ibc/"))
    const tokenRows = [...cw20Rows, ...ibcRows].sort(sortByValueDesc)

    return [
      luncRow,
      ustcRow,
      ...nativeNonIbc.sort(sortByValueDesc),
      ...tokenRows
    ].filter(isWalletAssetRow)
  }, [
    balances,
    cw20Balances,
    fxRates?.MNT,
    fxRates?.TWD,
    getBalance,
    ibcWhitelist,
    luncChange,
    luncPrice,
    marketStyleChangeByAsset,
    nativeWhitelist,
    resolveDexUsdValue,
    swapRateMap,
    ustcChange,
    ustcPrice
  ])

  const pageCoinRows = useMemo(
    () =>
      assetRows.filter(
        (asset) => asset.kind === "native" && !asset.denom.startsWith("ibc/")
      ),
    [assetRows]
  )

  const pageTokenRows = useMemo(
    () =>
      assetRows
        .filter((asset) => asset.kind === "cw20" || asset.kind === "ibc")
        .slice()
        .sort(sortByValueDesc),
    [assetRows]
  )

  const tokenCatalog = useMemo<WalletTokenCatalogItem[]>(() => {
    const nativeItems: WalletTokenCatalogItem[] = [
      {
        key: CLASSIC_DENOMS.lunc.coinMinimalDenom,
        symbol: "LUNC",
        name: "Luna Classic",
        iconCandidates: buildWalletIconCandidates({
          denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
          isClassic: true,
          fallback: "/system/cw20.svg"
        })
      },
      {
        key: CLASSIC_DENOMS.ustc.coinMinimalDenom,
        symbol: "USTC",
        name: "TerraClassicUSD",
        iconCandidates: buildWalletIconCandidates({
          denom: CLASSIC_DENOMS.ustc.coinMinimalDenom,
          isClassic: true,
          fallback: "/system/cw20.svg"
        })
      }
    ]

    const ibcItems = Object.entries(ibcWhitelist ?? {}).map(([hash, token]) => ({
      key: `ibc/${hash}`,
      symbol: token.symbol,
      name: token.name,
      iconCandidates: buildWalletIconCandidates({
        icon: token.icon,
        denom: token.base_denom,
        isClassic: true,
        fallback: "/system/ibc.svg"
      })
    }))

    const cw20Items = Object.entries(cw20Whitelist ?? {}).map(([address, token]) => ({
      key: address,
      symbol: token.symbol,
      name: token.name ?? token.protocol,
      iconCandidates: buildCw20IconCandidates(token.icon, token.symbol)
    }))

    return [...nativeItems, ...ibcItems, ...cw20Items].sort((a, b) =>
      a.symbol.localeCompare(b.symbol)
    )
  }, [cw20Whitelist, ibcWhitelist])

  const netWorth = useMemo(
    () => assetRows.reduce((sum, asset) => sum + (asset.value ?? 0), 0),
    [assetRows]
  )

  return {
    assetRows,
    balances,
    getBalance,
    luncPrice,
    netWorth,
    pageCoinRows,
    pageTokenRows,
    tokenCatalog
  }
}

export { buildWalletIconCandidates, formatWalletDenom }
