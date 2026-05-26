import { useCallback, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import PageShell from "../PageShell"
import styles from "../Wallet.module.css"
import { useWallet } from "../../app/wallet/WalletContext"
import { CLASSIC_DENOMS } from "../../app/chain"
import WalletBuyModal, {
  type WalletBuyAsset
} from "../../app/wallet/WalletBuyModal"
import { useWalletAssetVisibility } from "../../app/wallet/useWalletAssetVisibility"
import { openWalletPanel } from "../../app/wallet/panelNavigation"
import {
  useWalletHiddenTokensPreference,
  useWalletHideLowBalancePreference
} from "../../app/wallet/useWalletVisibilityPreferences"
import {
  useWalletAssets,
  type WalletAssetRow
} from "../../app/wallet/useWalletAssets"
import { getWalletSwapPath } from "../../app/wallet/swapNavigation"
import { CoinsSection, TokensSection } from "./WalletAssetSections"

type WalletAsset = WalletAssetRow

const Wallet = () => {
  const { account } = useWallet()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [hideLowBalance, setHideLowBalance] =
    useWalletHideLowBalancePreference()
  const [hiddenTokens] = useWalletHiddenTokensPreference()
  const [buyAsset, setBuyAsset] = useState<WalletBuyAsset>("LUNC")
  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const accountAddress = account?.address

  const { assetRows, balances, isBalanceError, isBalanceLoading } =
    useWalletAssets(accountAddress)
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

  const handleRetryBalances = useCallback(() => {
    if (!accountAddress) return
    void queryClient.invalidateQueries({
      queryKey: ["wallet", "balances", accountAddress]
    })
    void queryClient.invalidateQueries({
      queryKey: ["cw20-balances", accountAddress]
    })
  }, [accountAddress, queryClient])

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
      navigate(getWalletSwapPath(asset))
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
            onRetry={handleRetryBalances}
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
            onRetry={handleRetryBalances}
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
