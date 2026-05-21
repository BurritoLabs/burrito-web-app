import { memo } from "react"
import { CLASSIC_DENOMS } from "../../app/chain"
import WalletAssetIcon from "../../app/wallet/WalletAssetIcon"
import type { WalletAssetRow } from "../../app/wallet/useWalletAssets"
import { formatTokenAmount, formatUsd } from "../../app/utils/format"
import styles from "../Wallet.module.css"

type WalletAsset = WalletAssetRow

const LoadingAssetRows = () => (
  <div className={styles.assetLoadingRows} aria-label="Loading balances">
    {[0, 1, 2].map((index) => (
      <div key={index} className={styles.assetLoadingRow}>
        <span className={styles.assetLoadingIcon} />
        <span className={styles.assetLoadingText} />
        <span className={styles.assetLoadingValue} />
      </div>
    ))}
  </div>
)

const BuyIcon = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <circle
      cx="8"
      cy="8"
      r="6.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    />
    <path
      d="M8 5v6M5 8h6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
)

const SendIcon = () => (
  <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true">
    <path
      d="M3 9.5l14-6.5-6.2 14-1.9-5.3L3 9.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <path
      d="M8.2 11.3l2.8-2.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
)

const SwapIcon = () => (
  <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true">
    <path
      d="M4 6h9l-2-2M16 14H7l2 2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11 4l2 2-2 2M9 16l-2-2 2-2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

type CoinsSectionProps = {
  hasAccount: boolean
  isError: boolean
  isLoading: boolean
  onBuyAsset: (asset: WalletAsset) => void
  onRetry: () => void
  hideLowBalance: boolean
  onSendAsset: (asset: WalletAsset) => void
  onToggle: () => void
  onSwapAsset: (asset: WalletAsset) => void
  rows: WalletAsset[]
  showWarning: boolean
}

export const CoinsSection = memo(
  ({
    hasAccount,
    isError,
    isLoading,
    onBuyAsset,
    onRetry,
    hideLowBalance,
    onSendAsset,
    onToggle,
    onSwapAsset,
    rows,
    showWarning
  }: CoinsSectionProps) => {
    return (
      <div className={`card ${styles.sectionCard}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Coins</div>
          </div>
          <label className={styles.filterToggle}>
            <input
              type="checkbox"
              checked={hideLowBalance}
              onChange={onToggle}
            />
            <span>Hide low balance</span>
          </label>
        </div>

        <div className={styles.sectionBody}>
          {showWarning ? (
            <div className={styles.coinWarning}>
              <span className={styles.coinWarningIcon}>!</span>
              Coins required to post transactions
            </div>
          ) : null}
          {!hasAccount ? (
            <div className={styles.emptyState}>Connect a wallet to view coins.</div>
          ) : isLoading ? (
            <LoadingAssetRows />
          ) : isError ? (
            <div className={styles.emptyState}>
              <span>Balance data unavailable.</span>
              <button className={styles.retryButton} type="button" onClick={onRetry}>
                Retry balances
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className={styles.emptyState}>No coins found.</div>
          ) : (
            <div className={styles.assetList}>
              {rows.map((asset) => {
                const showBuy =
                  asset.isBuyable &&
                  (asset.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom ||
                    asset.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom)
                const showSwap =
                  asset.kind === "cw20" ||
                  asset.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom ||
                  asset.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
                return (
                  <div key={asset.denom} className={styles.assetRow}>
                    <div className={styles.assetTopRow}>
                      <div className={styles.assetTopLeft}>
                        <div className={styles.assetBadge}>
                          <WalletAssetIcon
                            symbol={asset.symbol}
                            candidates={asset.iconCandidates ?? []}
                          />
                        </div>
                        <div className={styles.assetName}>{asset.symbol}</div>
                      </div>
                      <div className={styles.assetActions}>
                        {showBuy ? (
                          <button type="button" onClick={() => onBuyAsset(asset)}>
                            <BuyIcon />
                            Buy
                          </button>
                        ) : null}
                        <button type="button" onClick={() => onSendAsset(asset)}>
                          <SendIcon />
                          Send
                        </button>
                        {showSwap ? (
                          <button type="button" onClick={() => onSwapAsset(asset)}>
                            <SwapIcon />
                            Swap
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.assetBottomRow}>
                      <div className={styles.assetAmount}>
                        {formatTokenAmount(asset.amount, asset.decimals, 2)}
                      </div>
                      <div className={styles.assetValue}>
                        ≈ {formatUsd(asset.value)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }
)

CoinsSection.displayName = "CoinsSection"

type TokensSectionProps = {
  hasAccount: boolean
  isError: boolean
  isLoading: boolean
  hideLowBalance: boolean
  onRetry: () => void
  onSendAsset: (asset: WalletAsset) => void
  onToggle: () => void
  onSwapAsset: (asset: WalletAsset) => void
  rows: WalletAsset[]
}

export const TokensSection = memo(
  ({
    hasAccount,
    isError,
    isLoading,
    hideLowBalance,
    onRetry,
    onSendAsset,
    onToggle,
    onSwapAsset,
    rows
  }: TokensSectionProps) => {
    return (
      <div className={`card ${styles.sectionCard}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Tokens</div>
          </div>
          <label className={styles.filterToggle}>
            <input
              type="checkbox"
              checked={hideLowBalance}
              onChange={onToggle}
            />
            <span>Hide low balance</span>
          </label>
        </div>

        <div className={styles.sectionBody}>
          {!hasAccount ? (
            <div className={styles.emptyState}>Connect a wallet to view tokens.</div>
          ) : isLoading ? (
            <LoadingAssetRows />
          ) : isError ? (
            <div className={styles.emptyState}>
              <span>Balance data unavailable.</span>
              <button className={styles.retryButton} type="button" onClick={onRetry}>
                Retry balances
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className={styles.emptyState}>No tokens found.</div>
          ) : (
            <div className={styles.assetList}>
              {rows.map((asset) => {
                const showSwap = asset.kind === "cw20"
                return (
                  <div key={asset.denom} className={styles.assetRow}>
                    <div className={styles.assetTopRow}>
                      <div className={styles.assetTopLeft}>
                        <div className={styles.assetBadge}>
                          <WalletAssetIcon
                            symbol={asset.symbol}
                            candidates={asset.iconCandidates ?? []}
                          />
                        </div>
                        <div className={styles.assetName}>{asset.symbol}</div>
                      </div>
                      <div className={styles.assetActions}>
                        <button type="button" onClick={() => onSendAsset(asset)}>
                          <SendIcon />
                          Send
                        </button>
                        {showSwap ? (
                          <button type="button" onClick={() => onSwapAsset(asset)}>
                            <SwapIcon />
                            Swap
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.assetBottomRow}>
                      <div className={styles.assetAmount}>
                        {formatTokenAmount(asset.amount, asset.decimals, 2)}
                      </div>
                      <div className={styles.assetValue}>
                        ≈ {asset.value !== undefined ? formatUsd(asset.value) : "--"}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }
)

TokensSection.displayName = "TokensSection"
