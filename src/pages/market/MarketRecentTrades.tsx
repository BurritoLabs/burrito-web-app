import type { PairTrade } from "../../app/data/market"
import {
  formatChartDetailUsd,
  formatTradeAmount,
  formatTradePrice,
  formatTradeTime
} from "../../app/market/pairChart"
import { truncateHash } from "../../app/utils/format"
import { getAddressExplorerUrl, getTxExplorerUrl } from "../../app/explorer"
import { useAppChain } from "../../app/appChainContext"
import styles from "../MarketPairDetails.module.css"

type MarketRecentTradesProps = {
  baseSymbol: string
  hasMoreTrades: boolean
  isTradesLoading: boolean
  onLoadMore: () => void
  priceQuoteSymbol: string
  priceQuoteUsd: number | undefined
  trades: PairTrade[]
}

const MarketRecentTrades = ({
  baseSymbol,
  hasMoreTrades,
  isTradesLoading,
  onLoadMore,
  priceQuoteSymbol,
  priceQuoteUsd,
  trades
}: MarketRecentTradesProps) => {
  const { chainKey } = useAppChain()
  return (
  <section className={`card ${styles.tradesSection}`}>
    <header className={styles.tradesHeader}>
      <span className={styles.sectionTitle}>Recent trades</span>
      <span className={styles.tradesCount}>{trades.length} shown</span>
    </header>
    {isTradesLoading ? (
      <div className={styles.tradesFallback}>Loading recent swaps...</div>
    ) : !trades.length ? (
      <div className={styles.tradesFallback}>No recent swaps found for this pair.</div>
    ) : (
      <>
        <div className={styles.tradesTableWrap}>
          <table className={styles.tradesTable}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Side</th>
                <th>Price</th>
                <th>Amount</th>
                <th>Trader</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, index) => {
                const quotePrice = `${formatTradePrice(trade.price)} ${priceQuoteSymbol}`
                const usdPrice =
                  priceQuoteUsd !== undefined
                    ? formatChartDetailUsd(trade.price * priceQuoteUsd)
                    : undefined

                return (
                  <tr key={`${trade.txhash}-${trade.timestamp}-${trade.side}-${index}`}>
                    <td>{formatTradeTime(trade.timestamp)}</td>
                    <td>
                      <span
                        className={`${styles.sideBadge} ${
                          trade.side === "buy" ? styles.sideBuy : styles.sideSell
                        }`}
                      >
                        {trade.side}
                      </span>
                    </td>
                    <td>
                      <span className={styles.tradePriceCell}>
                        <span className={styles.tradePricePrimary}>
                          {usdPrice ?? quotePrice}
                        </span>
                        {usdPrice ? (
                          <span className={styles.tradePriceQuote}>≈ {quotePrice}</span>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      {formatTradeAmount(trade.amountBase)} {baseSymbol}
                    </td>
                    <td>
                      <a
                        href={getAddressExplorerUrl(chainKey, trade.trader)}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.tradesLink}
                      >
                        {truncateHash(trade.trader, 8, 6)}
                      </a>
                    </td>
                    <td>
                      <a
                        href={getTxExplorerUrl(chainKey, trade.txhash)}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.tradesLink}
                      >
                        {truncateHash(trade.txhash, 8, 6)}
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {hasMoreTrades ? (
          <div className={styles.tradesActions}>
            <button
              type="button"
              className={`uiButton uiButtonOutline ${styles.loadMoreButton}`}
              onClick={onLoadMore}
            >
              Load more
            </button>
          </div>
        ) : null}
      </>
    )}
  </section>
  )
}

export default MarketRecentTrades
