// A relative pair return needs both assets' returns over the same period.
// Missing token history is not a zero return (and USTC is not a $1 constant).
export const calculatePairPriceChange = (
  baseChange: number | undefined,
  quoteChange: number | undefined
) => {
  if (
    baseChange === undefined || quoteChange === undefined ||
    !Number.isFinite(baseChange) || !Number.isFinite(quoteChange) ||
    baseChange <= -100 || quoteChange <= -100
  ) return undefined
  const change = ((1 + baseChange / 100) / (1 + quoteChange / 100) - 1) * 100
  return Number.isFinite(change) ? change : undefined
}
