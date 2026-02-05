import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import styles from "./Wallet.module.css"
import { useWallet } from "../app/wallet/WalletProvider"
import { CLASSIC_DENOMS } from "../app/chain"
import {
  fetchBalances,
  fetchFxRates,
  fetchPrices,
  fetchSwapRates
} from "../app/data/classic"
import { useCw20Balances } from "../app/data/cw20"
import { useCw20Whitelist, useIbcWhitelist } from "../app/data/terraAssets"
import { formatTokenAmount, formatUsd, toUnitAmount } from "../app/utils/format"

type WalletAsset = {
  kind: "native" | "ibc" | "cw20"
  denom: string
  symbol: string
  name: string
  decimals: number
  amount: string
  iconCandidates?: string[]
  value?: number
  isBuyable?: boolean
}

const AssetIcon = ({
  symbol,
  candidates
}: {
  symbol: string
  candidates: string[]
}) => {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)

  if (failed || !candidates.length) {
    return <span>{symbol.slice(0, 1)}</span>
  }

  return (
    <img
      src={candidates[index]}
      alt={symbol}
      onError={() => {
        if (index < candidates.length - 1) {
          setIndex(index + 1)
        } else {
          setFailed(true)
        }
      }}
    />
  )
}

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
  hideLowBalance: boolean
  onToggle: () => void
  rows: WalletAsset[]
  showWarning: boolean
}

const CoinsSection = memo(
  ({ hasAccount, hideLowBalance, onToggle, rows, showWarning }: CoinsSectionProps) => {
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
          ) : rows.length === 0 ? (
            <div className={styles.emptyState}>No coins found.</div>
          ) : (
            <div className={styles.assetList}>
              {rows.map((asset) => {
                const showBuy = asset.isBuyable
                return (
                  <div key={asset.denom} className={styles.assetRow}>
                  <div className={styles.assetTopRow}>
                    <div className={styles.assetTopLeft}>
                      <div className={styles.assetBadge}>
                        <AssetIcon
                          symbol={asset.symbol}
                          candidates={asset.iconCandidates ?? []}
                        />
                      </div>
                      <div className={styles.assetName}>{asset.symbol}</div>
                    </div>
                    <div className={styles.assetActions}>
                      {showBuy ? (
                        <button type="button">
                          <BuyIcon />
                          Buy
                        </button>
                      ) : null}
                      <button type="button">
                        <SendIcon />
                        Send
                      </button>
                      <button type="button">
                        <SwapIcon />
                        Swap
                      </button>
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
  hideLowBalance: boolean
  onToggle: () => void
  rows: WalletAsset[]
}

const TokensSection = memo(
  ({ hasAccount, hideLowBalance, onToggle, rows }: TokensSectionProps) => {
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
          ) : rows.length === 0 ? (
            <div className={styles.emptyState}>No tokens found.</div>
          ) : (
            <div className={styles.assetList}>
              {rows.map((asset) => (
                <div key={asset.denom} className={styles.assetRow}>
                  <div className={styles.assetTopRow}>
                    <div className={styles.assetTopLeft}>
                      <div className={styles.assetBadge}>
                        <AssetIcon
                          symbol={asset.symbol}
                          candidates={asset.iconCandidates ?? []}
                        />
                      </div>
                      <div className={styles.assetName}>{asset.symbol}</div>
                    </div>
                    <div className={styles.assetActions}>
                      <button type="button">
                        <SendIcon />
                        Send
                      </button>
                      <button type="button">
                        <SwapIcon />
                        Swap
                      </button>
                    </div>
                  </div>
                  <div className={styles.assetBottomRow}>
                    <div className={styles.assetAmount}>
                      {formatTokenAmount(asset.amount, asset.decimals, 2)}
                    </div>
                    <div className={styles.assetValue}>≈ --</div>
                  </div>
                </div>
              ))}
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
  const getStoredToggle = (key: string, fallbackKey?: string) => {
    if (typeof window === "undefined") return true
    const stored = window.localStorage.getItem(key)
    if (stored !== null) return stored === "true"
    if (fallbackKey) {
      const fallback = window.localStorage.getItem(fallbackKey)
      if (fallback !== null) return fallback === "true"
    }
    return true
  }

  const [hideLowBalanceCoins, setHideLowBalanceCoins] = useState(() =>
    getStoredToggle("burritoHideLowBalanceCoins", "burritoHideLowBalance")
  )
  const [hideLowBalanceTokens, setHideLowBalanceTokens] = useState(() =>
    getStoredToggle("burritoHideLowBalanceTokens", "burritoHideLowBalance")
  )

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "burritoHideLowBalanceCoins",
        String(hideLowBalanceCoins)
      )
    }
  }, [hideLowBalanceCoins])

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "burritoHideLowBalanceTokens",
        String(hideLowBalanceTokens)
      )
    }
  }, [hideLowBalanceTokens])

  const { data: balances = [] } = useQuery({
    queryKey: ["walletBalances", account?.address],
    queryFn: () => fetchBalances(account?.address ?? ""),
    enabled: Boolean(account?.address),
    staleTime: 60_000
  })

  const { data: swapRates = [] } = useQuery({
    queryKey: ["swaprates", CLASSIC_DENOMS.ustc.coinMinimalDenom],
    queryFn: () => fetchSwapRates(CLASSIC_DENOMS.ustc.coinMinimalDenom),
    staleTime: 300_000
  })

  const { data: prices } = useQuery({
    queryKey: ["prices"],
    queryFn: fetchPrices,
    staleTime: 300_000
  })

  const { data: fxRates } = useQuery({
    queryKey: ["fxRates"],
    queryFn: fetchFxRates,
    staleTime: 12 * 60 * 60 * 1000
  })

  const { data: cw20Whitelist } = useCw20Whitelist()
  const { data: ibcWhitelist } = useIbcWhitelist()
  const { data: cw20Balances = [] } = useCw20Balances(
    account?.address,
    cw20Whitelist
  )

  const luncPrice = prices?.lunc?.usd
  const ustcPrice = prices?.ustc?.usd

  const formatDenom = (denom: string, isClassic?: boolean) => {
    if (!denom) return ""
    if (denom.startsWith("u")) {
      const f = denom.slice(1)
      if (f.length > 3) {
        return f === "luna" ? (isClassic ? "LUNC" : "Luna") : f.toUpperCase()
      }
      return f.slice(0, 2).toUpperCase() + `T${isClassic ? "C" : ""}`
    }
    return denom
  }

  const ASSET_URL = "https://assets.terra.dev"
  const buildIconCandidates = ({
    icon,
    denom,
    isClassic
  }: {
    icon?: string
    denom: string
    isClassic: boolean
  }) => {
    const isClassicStable = isClassic && formatDenom(denom, true).endsWith("TC")
    const iconDenom = denom === "uluna" ? "LUNC" : formatDenom(denom, false)
    return [
      icon,
      `${ASSET_URL}/icon/60/${iconDenom}.png`,
      `${ASSET_URL}/icon/svg/${iconDenom}.svg`,
      `${ASSET_URL}/icon/60/${String(iconDenom).toUpperCase()}.png`,
      `${ASSET_URL}/icon/svg/${String(iconDenom).toUpperCase()}.svg`,
      `${ASSET_URL}/icon/60/${String(iconDenom).toLowerCase()}.png`,
      ...(iconDenom === "LUNA"
        ? [`${ASSET_URL}/icon/svg/Luna.svg`, `${ASSET_URL}/icon/60/Luna.png`]
        : []),
      ...(isClassicStable
        ? [
            `${ASSET_URL}/icon/svg/USTC.svg`,
            `${ASSET_URL}/icon/60/USTC.png`,
            `${ASSET_URL}/icon/60/ustc.png`
          ]
        : [])
    ].filter(Boolean) as string[]
  }

  const coinRows = useMemo(() => {
    const swapRateMap = new Map(
      swapRates.map((item) => [item.denom, Number(item.swaprate)])
    )

    const calcValueFromSwaprate = (
      amount: string,
      swaprate?: number,
      isClassicStable?: boolean
    ) => {
      if (!swaprate) return undefined
      const base = Number(amount) / swaprate / 1e6
      if (isClassicStable) {
        return ustcPrice ? base * ustcPrice : undefined
      }
      return base
    }

    const calcFxFallback = (amount: string, denom?: string) => {
      if (!ustcPrice || !denom) return undefined
      const lower = denom.toLowerCase()
      const fx =
        lower === "umnt"
          ? fxRates?.MNT
          : lower === "utwd"
          ? fxRates?.TWD
          : undefined
      if (!fx) return undefined
      return (Number(amount) / 1e6) * fx * ustcPrice
    }

    const baseRows =
      balances
        ?.filter((coin) => Number(coin.amount) > 0)
        .map((coin) => {
          const isClassic = true
          const swaprate = swapRateMap.get(coin.denom)
          const classicSymbol = formatDenom(coin.denom, true)
          const isClassicStable = classicSymbol.endsWith("TC")
          const valueFromSwaprate =
            calcValueFromSwaprate(coin.amount, swaprate, isClassicStable) ??
            calcFxFallback(coin.amount, coin.denom)

          if (coin.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom) {
            const value =
              luncPrice !== undefined
                ? toUnitAmount(coin.amount, CLASSIC_DENOMS.lunc.coinDecimals) *
                  luncPrice
                : valueFromSwaprate
            const unitAmount = toUnitAmount(
              coin.amount,
              CLASSIC_DENOMS.lunc.coinDecimals
            )
            const price =
              value !== undefined && unitAmount > 0
                ? value / unitAmount
                : luncPrice

            return {
              kind: "native" as const,
              denom: coin.denom,
              symbol: "LUNC",
              name: "Terra Classic",
              decimals: CLASSIC_DENOMS.lunc.coinDecimals,
              amount: coin.amount,
              price,
              value,
              isBuyable: true,
              iconCandidates: buildIconCandidates({
                icon: undefined,
                denom: coin.denom,
                isClassic
              })
            }
          }

          if (coin.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom) {
            const value =
              ustcPrice !== undefined
                ? toUnitAmount(coin.amount, CLASSIC_DENOMS.ustc.coinDecimals) *
                  ustcPrice
                : valueFromSwaprate
            const unitAmount = toUnitAmount(
              coin.amount,
              CLASSIC_DENOMS.ustc.coinDecimals
            )
            const price =
              value !== undefined && unitAmount > 0
                ? value / unitAmount
                : ustcPrice

            return {
              kind: "native" as const,
              denom: coin.denom,
              symbol: "USTC",
              name: "Stablecoin",
              decimals: CLASSIC_DENOMS.ustc.coinDecimals,
              amount: coin.amount,
              price,
              value,
              isBuyable: true,
              iconCandidates: buildIconCandidates({
                icon: undefined,
                denom: coin.denom,
                isClassic
              })
            }
          }

          if (coin.denom.startsWith("ibc/")) {
            const hash = coin.denom.replace("ibc/", "")
            const ibcToken = ibcWhitelist?.[hash]
            const symbol = ibcToken?.symbol ?? "IBC"
            const name = ibcToken?.name ?? symbol
            const decimals = ibcToken?.decimals ?? 6
            const unitAmount = toUnitAmount(coin.amount, decimals)
            const baseDenom = ibcToken?.base_denom ?? coin.denom
            const isClassicStableIbc =
              formatDenom(baseDenom, true).endsWith("TC")
            const value =
              calcValueFromSwaprate(coin.amount, swaprate, isClassicStableIbc) ??
              calcFxFallback(coin.amount, baseDenom)
            const price =
              value !== undefined && unitAmount > 0
                ? value / unitAmount
                : undefined

            return {
              kind: "ibc" as const,
              denom: coin.denom,
              symbol,
              name,
              decimals,
              amount: coin.amount,
              price,
              value,
              isBuyable: false,
              iconCandidates: ibcToken
                ? [
                    ...buildIconCandidates({
                      icon: ibcToken?.icon,
                      denom: ibcToken?.base_denom ?? coin.denom,
                      isClassic
                    }).filter((item) => item !== "/system/cw20.svg"),
                    "/system/ibc.svg"
                  ]
                : ["/system/ibc.svg"]
            }
          }

          const displaySymbol = formatDenom(coin.denom, true)
          const unitAmount = toUnitAmount(coin.amount, 6)
          const value = valueFromSwaprate ?? calcFxFallback(coin.amount, coin.denom)
          const price =
            value !== undefined && unitAmount > 0 ? value / unitAmount : undefined

          return {
            kind: "native" as const,
            denom: coin.denom,
            symbol: displaySymbol,
            name: displaySymbol,
            decimals: 6,
            amount: coin.amount,
            price,
            value,
            isBuyable: false,
            iconCandidates: buildIconCandidates({
              icon: undefined,
              denom: coin.denom,
              isClassic
            })
          }
        }) ?? []

    const hasLunc = baseRows.some(
      (row) => row.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
    )
    const hasUstc = baseRows.some(
      (row) => row.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
    )

    if (!hasLunc) {
      const amount = balances.find(
        (coin) => coin.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
      )?.amount ?? "0"
      const unitAmount = toUnitAmount(
        amount,
        CLASSIC_DENOMS.lunc.coinDecimals
      )
      baseRows.unshift({
        kind: "native" as const,
        denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
        symbol: "LUNC",
        name: "Terra Classic",
        decimals: CLASSIC_DENOMS.lunc.coinDecimals,
        amount,
        price: luncPrice,
        value: luncPrice !== undefined ? unitAmount * luncPrice : undefined,
        isBuyable: true,
        iconCandidates: buildIconCandidates({
          icon: undefined,
          denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
          isClassic: true
        })
      })
    }

    if (!hasUstc) {
      const amount = balances.find(
        (coin) => coin.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
      )?.amount ?? "0"
      const unitAmount = toUnitAmount(
        amount,
        CLASSIC_DENOMS.ustc.coinDecimals
      )
      baseRows.splice(1, 0, {
        kind: "native" as const,
        denom: CLASSIC_DENOMS.ustc.coinMinimalDenom,
        symbol: "USTC",
        name: "Stablecoin",
        decimals: CLASSIC_DENOMS.ustc.coinDecimals,
        amount,
        price: ustcPrice,
        value: ustcPrice !== undefined ? unitAmount * ustcPrice : undefined,
        isBuyable: true,
        iconCandidates: buildIconCandidates({
          icon: undefined,
          denom: CLASSIC_DENOMS.ustc.coinMinimalDenom,
          isClassic: true
        })
      })
    }

    return baseRows
  }, [balances, fxRates?.MNT, fxRates?.TWD, ibcWhitelist, luncPrice, swapRates, ustcPrice])

  const ibcTokenRows = useMemo(
    () => coinRows.filter((asset) => asset.kind === "ibc"),
    [coinRows]
  )

  const nativeCoinRows = useMemo(
    () => coinRows.filter((asset) => asset.kind !== "ibc"),
    [coinRows]
  )

  const tokenRows = useMemo(() => {
    const cw20Rows =
      cw20Balances
        ?.filter((token) => Number(token.balance) > 0)
        .map((token) => ({
          kind: "cw20" as const,
          denom: token.address,
          symbol: token.symbol,
          name: token.name ?? token.symbol,
          decimals: token.decimals ?? 6,
          amount: token.balance,
          iconCandidates: [token.icon, "/system/cw20.svg"].filter(
            Boolean
          ) as string[]
        })) ?? []
    const list = [...ibcTokenRows, ...cw20Rows]
    return list.sort((a, b) => {
      const aAmount = toUnitAmount(a.amount, a.decimals)
      const bAmount = toUnitAmount(b.amount, b.decimals)
      if (aAmount === bAmount) {
        return a.symbol.localeCompare(b.symbol)
      }
      return bAmount - aAmount
    })
  }, [cw20Balances, ibcTokenRows])

  const filteredCoinRows = useMemo(() => {
    const list = hideLowBalanceCoins
      ? nativeCoinRows.filter((asset) => {
          if (
            asset.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom ||
            asset.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
          ) {
            return true
          }
          return asset.value !== undefined && asset.value >= 1
        })
      : nativeCoinRows

    return list.slice().sort((a, b) => {
      const aValue = a.value ?? 0
      const bValue = b.value ?? 0
      if (aValue === bValue) {
        return a.symbol.localeCompare(b.symbol)
      }
      return bValue - aValue
    })
  }, [nativeCoinRows, hideLowBalanceCoins])

  const luncBalance = balances.find(
    (coin) => coin.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
  )
  const showCoinsWarning =
    Boolean(account?.address) && Number(luncBalance?.amount ?? 0) === 0

  const handleToggleCoins = useCallback(() => {
    setHideLowBalanceCoins((prev) => !prev)
  }, [])

  const handleToggleTokens = useCallback(() => {
    setHideLowBalanceTokens((prev) => !prev)
  }, [])

  const filteredTokenRows = useMemo(() => {
    if (!hideLowBalanceTokens) return tokenRows
    return tokenRows.filter(
      (asset) => toUnitAmount(asset.amount, asset.decimals) >= 0.01
    )
  }, [tokenRows, hideLowBalanceTokens])

  return (
    <PageShell title="Wallet">
      <div className={styles.layout}>
        <div className={styles.leftColumn}>
          <CoinsSection
            hasAccount={Boolean(account)}
            hideLowBalance={hideLowBalanceCoins}
            onToggle={handleToggleCoins}
            rows={filteredCoinRows}
            showWarning={showCoinsWarning}
          />

          <TokensSection
            hasAccount={Boolean(account)}
            hideLowBalance={hideLowBalanceTokens}
            onToggle={handleToggleTokens}
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
            <button className={styles.sideLink} type="button">
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
            <button className={styles.sideLink} type="button">
              Learn more →
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

export default Wallet
