import { memo, useCallback, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import PageShell from "./PageShell"
import styles from "./Wallet.module.css"
import { useWallet } from "../app/wallet/WalletContext"
import { CLASSIC_DENOMS } from "../app/chain"
import WalletAssetIcon from "../app/wallet/WalletAssetIcon"
import WalletBuyModal, {
  type WalletBuyAsset
} from "../app/wallet/WalletBuyModal"
import { useWalletAssetVisibility } from "../app/wallet/useWalletAssetVisibility"
import { openWalletPanel } from "../app/wallet/panelNavigation"
import {
  useWalletHiddenTokensPreference,
  useWalletHideLowBalancePreference
} from "../app/wallet/useWalletVisibilityPreferences"
import {
  useWalletAssets,
  type WalletAssetRow
} from "../app/wallet/useWalletAssets"
import { formatTokenAmount, formatUsd } from "../app/utils/format"

type WalletAsset = WalletAssetRow

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
  hideLowBalance: boolean
  onSendAsset: (asset: WalletAsset) => void
  onToggle: () => void
  onSwapAsset: (asset: WalletAsset) => void
  rows: WalletAsset[]
  showWarning: boolean
}

const CoinsSection = memo(
  ({
    hasAccount,
    isError,
    isLoading,
    onBuyAsset,
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
            <div className={styles.emptyState}>Loading balances...</div>
          ) : isError ? (
            <div className={styles.emptyState}>Balance data unavailable.</div>
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
  onSendAsset: (asset: WalletAsset) => void
  onToggle: () => void
  onSwapAsset: (asset: WalletAsset) => void
  rows: WalletAsset[]
}

const TokensSection = memo(
  ({
    hasAccount,
    isError,
    isLoading,
    hideLowBalance,
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
            <div className={styles.emptyState}>Loading balances...</div>
          ) : isError ? (
            <div className={styles.emptyState}>Balance data unavailable.</div>
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

const Wallet = () => {
  const { account } = useWallet()
  const navigate = useNavigate()
  const [hideLowBalance, setHideLowBalance] =
    useWalletHideLowBalancePreference()
  const [hiddenTokens] = useWalletHiddenTokensPreference()
  const [buyAsset, setBuyAsset] = useState<WalletBuyAsset>("LUNC")
  const [buyModalOpen, setBuyModalOpen] = useState(false)

  const { assetRows, balances, isBalanceError, isBalanceLoading } =
    useWalletAssets(account?.address)
  const hiddenTokenSet = useMemo(() => new Set(hiddenTokens), [hiddenTokens])
  const { visibleCoinRows: filteredCoinRows, visibleTokenRows: filteredTokenRows } =
    useWalletAssetVisibility({
      assetRows,
      hiddenKeys: hiddenTokenSet,
      hideLowBalance
    })

  const luncBalance = balances.find(
    (coin) => coin.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
  )
  const showCoinsWarning =
    Boolean(account?.address) &&
    !isBalanceLoading &&
    !isBalanceError &&
    Number(luncBalance?.amount ?? 0) === 0

  const handleToggleLowBalance = useCallback(() => {
    setHideLowBalance((prev) => !prev)
  }, [setHideLowBalance])

  const handleSendAsset = useCallback((asset: WalletAsset) => {
    openWalletPanel({
      view: "send",
      asset: {
        denom: asset.denom,
        symbol: asset.symbol,
        name: asset.name,
        decimals: asset.decimals
      }
    })
  }, [])

  const handleBuyAsset = useCallback((asset: WalletAsset) => {
    if (asset.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom) {
      setBuyAsset("LUNC")
      setBuyModalOpen(true)
      return
    }
    if (asset.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom) {
      setBuyAsset("USTC")
      setBuyModalOpen(true)
    }
  }, [])

  const handleSwapAsset = useCallback(
    (asset: WalletAsset) => {
      const fromAssetId =
        asset.kind === "cw20"
          ? `cw20:${asset.denom.toLowerCase()}`
          : `native:${asset.denom}`
      const searchParams = new URLSearchParams({ from: fromAssetId })
      navigate({
        pathname: "/swap",
        search: `?${searchParams.toString()}`
      })
    },
    [navigate]
  )

  const handleOpenStake = useCallback(() => {
    navigate("/stake")
  }, [navigate])

  return (
    <PageShell title="Wallet">
      <div className={styles.layout}>
        <div className={styles.leftColumn}>
          <CoinsSection
            hasAccount={Boolean(account)}
            isError={isBalanceError}
            isLoading={isBalanceLoading}
            onBuyAsset={handleBuyAsset}
            hideLowBalance={hideLowBalance}
            onSendAsset={handleSendAsset}
            onToggle={handleToggleLowBalance}
            onSwapAsset={handleSwapAsset}
            rows={filteredCoinRows}
            showWarning={showCoinsWarning}
          />

          <TokensSection
            hasAccount={Boolean(account)}
            isError={isBalanceError}
            isLoading={isBalanceLoading}
            hideLowBalance={hideLowBalance}
            onSendAsset={handleSendAsset}
            onToggle={handleToggleLowBalance}
            onSwapAsset={handleSwapAsset}
            rows={filteredTokenRows}
          />
        </div>

        <div className={styles.rightColumn}>
          <div className={`card ${styles.sideCard}`}>
            <div className={styles.sideIcon} aria-hidden="true">
              <svg viewBox="0 0 32 32" width="28" height="28">
                <rect
                  x="4"
                  y="6"
                  width="24"
                  height="20"
                  rx="4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle cx="16" cy="16" r="5" fill="currentColor" />
              </svg>
            </div>
            <div className={styles.sideTitle}>Staking rewards</div>
            <div className={styles.sideText}>Stake LUNC and earn rewards</div>
            <button
              className={styles.sideLink}
              type="button"
              onClick={handleOpenStake}
            >
              Delegate now →
            </button>
          </div>

          <div className={`card ${styles.sideCard}`}>
            <div className={styles.sideIcon} aria-hidden="true">
              <svg viewBox="0 0 32 32" width="28" height="28">
                <circle
                  cx="16"
                  cy="16"
                  r="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M8 16h16M16 8v16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className={styles.sideTitle}>Explore the Ecosystem</div>
            <div className={styles.sideText}>
              Try out various dApps built on Terra
            </div>
            <a
              className={styles.sideLink}
              href="https://terra-classic.io/"
              target="_blank"
              rel="noreferrer"
            >
              Learn more →
            </a>
          </div>
        </div>
      </div>
      <WalletBuyModal
        open={buyModalOpen}
        onClose={() => setBuyModalOpen(false)}
        assets={[buyAsset]}
      />
    </PageShell>
  )
}

export default Wallet
