export const supportsReserveRatioPricing = (poolType: string) =>
  !/(concentrated|bonding)/.test(poolType.trim().toLowerCase())

const normalizeAssetId = (value: string) => value.trim().toLowerCase()

export const resolveBondingSpotPrice = ({
  priceBaseId,
  priceQuoteId,
  spotPriceAmount,
  spotPriceAssetId
}: {
  priceBaseId: string
  priceQuoteId: string
  spotPriceAmount?: string
  spotPriceAssetId?: string
}) => {
  if (!spotPriceAmount || !spotPriceAssetId) return undefined
  const spot = Number(spotPriceAmount)
  if (!Number.isFinite(spot) || spot <= 0) return undefined

  const spotAsset = normalizeAssetId(spotPriceAssetId)
  if (normalizeAssetId(priceQuoteId) === spotAsset) return spot
  if (normalizeAssetId(priceBaseId) === spotAsset) return 1 / spot
  return undefined
}
