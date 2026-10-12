export type MarketSupplyCandidate = {
  priceBase: { id: string; isLunc: boolean; isUstc: boolean }
  marketCapUsd?: number
  priceConfidenceUsd?: number
  priceUsd?: number
}

export const selectCw20MarketSupplyContracts = (
  cards: readonly MarketSupplyCandidate[]
): string[] => {
  const contracts = new Set<string>()
  for (const card of cards) {
    // Match getCardMarketCapUsd's existing short circuits, including zero values.
    // This selects reads only; it must not add new valuation/precision rules.
    if (card.priceBase.isLunc || card.priceBase.isUstc) continue
    if (card.marketCapUsd !== undefined) continue
    if ((card.priceConfidenceUsd ?? 0) < 1_000) continue
    if (!card.priceBase.id.startsWith("cw20:")) continue
    if (card.priceUsd === undefined) continue
    contracts.add(card.priceBase.id.slice(5).toLowerCase())
  }
  // The caller supplies all filtered cards for Market Cap sorting, not a page.
  return Array.from(contracts)
}
