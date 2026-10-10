const FAILED_MARKET_ICON_LIMIT = 128
const FAILED_MARKET_ICON_TTL_MS = 5 * 60_000
const failedMarketIcons = new Map<string, number>()

const isRemoteIconSource = (source: string) => /^https?:\/\//i.test(source)

export const isFailedMarketIcon = (source: string) => {
  if (!isRemoteIconSource(source)) return false
  const failedAt = failedMarketIcons.get(source)
  if (failedAt === undefined) return false
  if (Date.now() - failedAt < FAILED_MARKET_ICON_TTL_MS) return true
  failedMarketIcons.delete(source)
  return false
}

export const rememberFailedMarketIcon = (source: string) => {
  if (!isRemoteIconSource(source)) return

  // Let a recovered host retry on a later mount; don't blacklist it all session.
  failedMarketIcons.delete(source)
  failedMarketIcons.set(source, Date.now())
  if (failedMarketIcons.size > FAILED_MARKET_ICON_LIMIT) {
    const oldest = failedMarketIcons.keys().next().value
    if (oldest) failedMarketIcons.delete(oldest)
  }
}

export const nextAvailableMarketIconIndex = (
  candidates: string[],
  startIndex = 0
) => {
  for (let index = Math.max(0, startIndex); index < candidates.length; index += 1) {
    if (!isFailedMarketIcon(candidates[index])) return index
  }
  return -1
}

export const clearFailedMarketIconCacheForTests = () => failedMarketIcons.clear()
export const getFailedMarketIconCacheSizeForTests = () => failedMarketIcons.size
