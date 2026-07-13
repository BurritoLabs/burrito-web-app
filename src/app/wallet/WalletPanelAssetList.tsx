import styles from "./WalletPanel.module.css"
import WalletAssetIcon from "./WalletAssetIcon"
import type { WalletAssetRow } from "./useWalletAssets"
import { formatPercent, formatTokenAmount, formatUsd } from "../utils/format"
import {
  ManageIcon,
  PriceDownIcon,
  PriceUpIcon
} from "./WalletPanelIcons"
import type { SelectedAsset } from "./walletPanelUtils"
import { getActiveAppChainRuntime } from "../activeChain"

type WalletPanelAssetChainsProps = {
  accountConnected: boolean
  selectedAmountDisplay: string
  selectedAsset: SelectedAsset
  selectedValue: number | undefined
}

export const WalletPanelAssetChains = ({
  accountConnected,
  selectedAmountDisplay,
  selectedAsset,
  selectedValue
}: WalletPanelAssetChainsProps) => (
  <div className={styles.assetList}>
    <div className={styles.chainSectionContainer}>
      <div className={styles.chainSection}>
        <div className={styles.chainSectionTitle}>
          <h3>Chains</h3>
        </div>
        <div className={styles.chainSectionList}>
          {[
            {
              name: getActiveAppChainRuntime().chain.chainId,
              value: accountConnected ? formatUsd(selectedValue) : "--",
              amount: accountConnected
                ? `${selectedAmountDisplay} ${selectedAsset.symbol}`
                : "--"
            }
          ].map((row) => (
            <div key={row.name} className={styles.chainRowItem}>
              <div className={styles.chainRowHeader}>
                <span>{row.name}</span>
              </div>
              <div className={styles.chainRowValue}>{row.value}</div>
              <div className={styles.chainRowAmount}>{row.amount}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
)

type WalletPanelAssetListProps = {
  accountConnected: boolean
  assetRows: WalletAssetRow[]
  isBalanceError: boolean
  isBalanceLoading: boolean
  onAssetSelect: (asset: WalletAssetRow) => void
  onManage: () => void
  onRetryBalances: () => void
}

const LoadingAssetRows = () => (
  <div className={styles.assetLoadingRows} aria-label="Loading balances">
    {[0, 1, 2, 3, 4].map((index) => (
      <div key={index} className={styles.assetLoadingRow}>
        <span className={styles.assetLoadingIcon} />
        <span className={styles.assetLoadingText} />
        <span className={styles.assetLoadingValue} />
      </div>
    ))}
  </div>
)

export const WalletPanelAssetList = ({
  accountConnected,
  assetRows,
  isBalanceError,
  isBalanceLoading,
  onAssetSelect,
  onManage,
  onRetryBalances
}: WalletPanelAssetListProps) => (
  <div className={styles.assetList}>
    <div className={styles.assetHeader}>
      <div className={styles.assetTitle}>Assets</div>
      <button className={styles.manageButton} type="button" onClick={onManage}>
        Manage
        <ManageIcon />
      </button>
    </div>

    <div className={styles.assetRows}>
      {isBalanceLoading ? (
        <LoadingAssetRows />
      ) : isBalanceError ? (
        <div className={styles.assetEmpty}>
          <span>Balance data unavailable.</span>
          <button
            className={styles.assetRetryButton}
            type="button"
            onClick={onRetryBalances}
          >
            Retry balances
          </button>
        </div>
      ) : assetRows.length === 0 ? (
        <div className={styles.assetEmpty}>
          {accountConnected ? "No assets found" : "Connect a wallet to view assets"}
        </div>
      ) : (
        assetRows.map((asset) => {
          const hasChange = asset.change !== undefined
          const changeValue = asset.change ?? 0
          return (
            <div
              key={asset.denom}
              className={styles.assetRow}
              onClick={() => onAssetSelect(asset)}
            >
              <div className={styles.assetInfo}>
                <div
                  className={styles.assetBadge}
                  data-chain={asset.chainCount > 1 ? "multi" : "single"}
                >
                  <WalletAssetIcon
                    symbol={asset.symbol}
                    candidates={asset.iconCandidates ?? []}
                  />
                </div>
                <div className={styles.assetRowDetails}>
                  <div className={styles.assetTopRow}>
                    <div className={styles.assetSymbol}>
                      <span className={styles.assetSymbolName}>
                        {asset.symbol}
                      </span>
                      {asset.chainCount > 1 ? (
                        <span className={styles.chainCount}>
                          {asset.chainCount}
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.assetPrice}>
                      {formatUsd(asset.value)}
                    </div>
                  </div>
                  <div className={styles.assetBottomRow}>
                    <div
                      className={`${styles.assetChange} ${
                        hasChange
                          ? changeValue >= 0
                            ? styles.assetChangeUp
                            : styles.assetChangeDown
                          : styles.assetChangeMuted
                      }`}
                    >
                      {hasChange ? (
                        changeValue >= 0 ? (
                          <PriceUpIcon />
                        ) : (
                          <PriceDownIcon />
                        )
                      ) : null}
                      {hasChange ? formatPercent(changeValue) : "--"}
                    </div>
                    <div className={styles.assetAmount}>
                      {accountConnected
                        ? `${formatTokenAmount(asset.amount, asset.decimals, 2)}`
                        : "--"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  </div>
)
