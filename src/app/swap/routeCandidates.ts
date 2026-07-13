export type SwapRoutePair = {
  pair: string
  dexId: string
  dexLabel: string
  assets: readonly string[]
}

export type SwapRouteHopCandidate = {
  pair: string
  dexId: string
  dexLabel: string
  offerAssetKey: string
  askAssetKey: string
}

export type SwapRouteCandidate = {
  id: string
  bridgeAssetKey?: string
  hops: readonly SwapRouteHopCandidate[]
}

const normalizeAssetKey = (value: string) => value.trim().toLowerCase()

export const normalizeDexFamily = (value: string) =>
  value.trim().toLowerCase().split("-")[0]

const normalizePairAssets = (pair: SwapRoutePair) =>
  Array.from(
    new Set(pair.assets.map(normalizeAssetKey).filter(Boolean))
  ).slice(0, 2)

const getOtherAsset = (pair: SwapRoutePair, assetKey: string) => {
  const assets = normalizePairAssets(pair)
  if (assets.length !== 2 || !assets.includes(assetKey)) return undefined
  return assets[0] === assetKey ? assets[1] : assets[0]
}

const toHop = (
  pair: SwapRoutePair,
  offerAssetKey: string,
  askAssetKey: string
): SwapRouteHopCandidate => ({
  pair: pair.pair.toLowerCase(),
  dexId: pair.dexId.toLowerCase(),
  dexLabel: pair.dexLabel,
  offerAssetKey,
  askAssetKey
})

export const buildSwapRouteCandidates = ({
  activeDexIds,
  askAssetKey,
  maxTwoHopRoutes = 6,
  offerAssetKey,
  pairs
}: {
  activeDexIds: ReadonlySet<string>
  askAssetKey: string
  maxTwoHopRoutes?: number
  offerAssetKey: string
  pairs: readonly SwapRoutePair[]
}): SwapRouteCandidate[] => {
  const offerKey = normalizeAssetKey(offerAssetKey)
  const askKey = normalizeAssetKey(askAssetKey)
  if (!offerKey || !askKey || offerKey === askKey) return []

  const activePairs = pairs.filter((pair) => {
    const dexFamily = normalizeDexFamily(pair.dexId)
    return (
      Boolean(pair.pair) &&
      activeDexIds.has(dexFamily) &&
      normalizePairAssets(pair).length === 2
    )
  })

  const directIds = new Set<string>()
  const direct = activePairs
    .filter((pair) => {
      const assets = normalizePairAssets(pair)
      return assets.includes(offerKey) && assets.includes(askKey)
    })
    .map((pair) => ({
      id: `${pair.dexId.toLowerCase()}:${pair.pair.toLowerCase()}`,
      hops: [toHop(pair, offerKey, askKey)]
    }))
    .filter((candidate) => {
      if (directIds.has(candidate.id)) return false
      directIds.add(candidate.id)
      return true
    })

  if (maxTwoHopRoutes <= 0) return direct

  const assetFrequency = new Map<string, number>()
  activePairs.forEach((pair) => {
    normalizePairAssets(pair).forEach((asset) => {
      assetFrequency.set(asset, (assetFrequency.get(asset) ?? 0) + 1)
    })
  })

  const firstPairs = activePairs
    .map((pair) => ({ pair, bridge: getOtherAsset(pair, offerKey) }))
    .filter(
      (entry): entry is { pair: SwapRoutePair; bridge: string } =>
        Boolean(entry.bridge && entry.bridge !== askKey)
    )
  const secondPairs = activePairs
    .map((pair) => ({ pair, bridge: getOtherAsset(pair, askKey) }))
    .filter(
      (entry): entry is { pair: SwapRoutePair; bridge: string } =>
        Boolean(entry.bridge && entry.bridge !== offerKey)
    )

  const twoHop = firstPairs.flatMap((first) =>
    secondPairs
      .filter(
        (second) =>
          second.bridge === first.bridge &&
          second.pair.pair.toLowerCase() !== first.pair.pair.toLowerCase()
      )
      .map((second) => {
        const sameDex =
          normalizeDexFamily(first.pair.dexId) ===
          normalizeDexFamily(second.pair.dexId)
        const score =
          (first.bridge === "uluna" ? 10_000 : 0) +
          (sameDex ? 1_000 : 0) +
          (assetFrequency.get(first.bridge) ?? 0) * 10
        return {
          candidate: {
            id: `${first.pair.dexId.toLowerCase()}:${first.pair.pair.toLowerCase()}>${second.pair.dexId.toLowerCase()}:${second.pair.pair.toLowerCase()}`,
            bridgeAssetKey: first.bridge,
            hops: [
              toHop(first.pair, offerKey, first.bridge),
              toHop(second.pair, first.bridge, askKey)
            ]
          } satisfies SwapRouteCandidate,
          score
        }
      })
  )

  const seen = new Set<string>()
  const rankedTwoHop = twoHop
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
    .filter(({ candidate }) => {
      if (seen.has(candidate.id)) return false
      seen.add(candidate.id)
      return true
    })
    .slice(0, maxTwoHopRoutes)
    .map(({ candidate }) => candidate)

  return [...direct, ...rankedTwoHop]
}
