import type { MarketPoolSnapshot } from "../data/market"
import { normalizeAssetKey } from "../utils/assetIdentity"
import { toUnitAmount } from "../utils/format"

type PriceGraphEntry = {
  price: number
  liquidity: number
}

type PriceGraphOptions = {
  pools: MarketPoolSnapshot[]
  seedAssetIds?: string[]
  getDecimals: (assetId: string, normalizedKey: string) => number
  getSeedUsdPrice: (assetId: string, normalizedKey: string) => number | undefined
}

export const normalizeMarketPriceAssetKey = (assetId: string) => {
  const trimmed = assetId.trim()
  const raw = trimmed.startsWith("native:")
    ? trimmed.slice("native:".length)
    : trimmed.startsWith("cw20:")
      ? trimmed.slice("cw20:".length)
      : trimmed
  return normalizeAssetKey(raw)
}

export const deriveUsdPricesFromPools = ({
  pools,
  seedAssetIds = [],
  getDecimals,
  getSeedUsdPrice
}: PriceGraphOptions) => {
  const poolEdges = pools
    .map((pool) => {
      const leftRaw = pool.poolAssets[0]
      const rightRaw = pool.poolAssets[1]
      if (!leftRaw || !rightRaw) return undefined

      const leftKey = normalizeMarketPriceAssetKey(leftRaw.id)
      const rightKey = normalizeMarketPriceAssetKey(rightRaw.id)
      const leftUnits = toUnitAmount(leftRaw.amount, getDecimals(leftRaw.id, leftKey))
      const rightUnits = toUnitAmount(rightRaw.amount, getDecimals(rightRaw.id, rightKey))

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

  const resolved = new Map<string, PriceGraphEntry>()
  const seedIds = new Set<string>(seedAssetIds)
  pools.forEach((pool) => {
    pool.poolAssets.forEach((asset) => seedIds.add(asset.id))
  })

  seedIds.forEach((assetId) => {
    const normalizedKey = normalizeMarketPriceAssetKey(assetId)
    const usdPrice = getSeedUsdPrice(assetId, normalizedKey)
    if (usdPrice === undefined || !Number.isFinite(usdPrice) || usdPrice <= 0) return
    resolved.set(normalizedKey, {
      price: usdPrice,
      liquidity: Number.POSITIVE_INFINITY
    })
  })

  const maxPasses = Math.max(4, poolEdges.length * 2)
  const shouldUseCandidate = (
    current: PriceGraphEntry | undefined,
    candidate: PriceGraphEntry
  ) =>
    Number.isFinite(candidate.price) &&
    candidate.price > 0 &&
    Number.isFinite(candidate.liquidity) &&
    candidate.liquidity > 0 &&
    (!current || candidate.liquidity > current.liquidity)

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let updated = false

    poolEdges.forEach(({ leftKey, rightKey, leftUnits, rightUnits }) => {
      const leftResolved = resolved.get(leftKey)
      const rightResolved = resolved.get(rightKey)

      if (leftResolved) {
        const rightPrice = (leftUnits * leftResolved.price) / rightUnits
        const poolLiquidity = leftUnits * leftResolved.price * 2
        const candidate = {
          price: rightPrice,
          liquidity: Math.min(leftResolved.liquidity, poolLiquidity)
        }
        if (shouldUseCandidate(rightResolved, candidate)) {
          resolved.set(rightKey, candidate)
          updated = true
        }
      }

      if (rightResolved) {
        const leftPrice = (rightUnits * rightResolved.price) / leftUnits
        const poolLiquidity = rightUnits * rightResolved.price * 2
        const candidate = {
          price: leftPrice,
          liquidity: Math.min(rightResolved.liquidity, poolLiquidity)
        }
        if (shouldUseCandidate(leftResolved, candidate)) {
          resolved.set(leftKey, candidate)
          updated = true
        }
      }
    })

    if (!updated) break
  }

  return Object.fromEntries(
    Array.from(resolved.entries()).map(([key, entry]) => [key, entry.price])
  ) as Record<string, number>
}
