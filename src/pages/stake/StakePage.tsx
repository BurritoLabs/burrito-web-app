import { useMemo, useState, useEffect, useRef, type SyntheticEvent } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "../PageShell"
import styles from "../Stake.module.css"
import { useWallet } from "../../app/wallet/WalletContext"
import { Link } from "react-router-dom"
import {
  fetchDelegations,
  fetchRewards,
  fetchSpendableBalances,
  fetchUnbonding,
  fetchValidators,
  fetchPrices
} from "../../app/data/classic"
import {
  formatPercent,
  formatTokenAmount,
  formatUsd,
  sumAmounts,
  toUnitAmount
} from "../../app/utils/format"
import { CLASSIC_DENOMS } from "../../app/chain"
import { useAppChain } from "../../app/appChainContext"
import { KEYBASE_PROXY_URL } from "../../app/config/externalServices"
import {
  DEFAULT_VALIDATOR_LOGO,
  KEYBASE_FETCH_CONCURRENCY,
  KNOWN_VALIDATOR_LOGOS,
  cacheStoreToPictureMap,
  readKeybaseCacheStore,
  type KeybasePictureCacheStore,
  writeKeybaseCacheStore
} from "../../app/stake/keybasePictures"
import {
  buildStakeDonutSegments,
  normalizeIdentity,
  type StakeValidatorDelegation
} from "../../app/stake/stakeFormat"
import StakeManageModal from "./StakeManageModal"
import StakeValidatorRow from "./StakeValidatorRow"

const VALIDATOR_PAGE_SIZE = 30

const Stake = () => {
  const { account } = useWallet()
  const { chain, chainKey } = useAppChain()
  const nativeSymbol = chain.displayDenom
  const validatorExplorerUrl = (operatorAddress: string) =>
    chainKey === "luna"
      ? `https://www.mintscan.io/terra/validators/${operatorAddress}`
      : `https://finder.burrito.money/classic/validator/${operatorAddress}`

  const { data: delegations = [] } = useQuery({
    queryKey: ["delegations", chain.chainId, account?.address],
    queryFn: () => fetchDelegations(account?.address ?? ""),
    enabled: Boolean(account?.address),
    staleTime: 60_000,
    placeholderData: (previousData) => previousData
  })

  const { data: rewards = [] } = useQuery({
    queryKey: ["rewards", chain.chainId, account?.address],
    queryFn: () => fetchRewards(account?.address ?? ""),
    enabled: Boolean(account?.address),
    staleTime: 60_000,
    placeholderData: (previousData) => previousData
  })

  const { data: spendable = [] } = useQuery({
    queryKey: ["spendable-balances", chain.chainId, account?.address],
    queryFn: () => fetchSpendableBalances(account?.address ?? ""),
    enabled: Boolean(account?.address),
    staleTime: 60_000,
    placeholderData: (previousData) => previousData
  })

  const { data: unbonding = [] } = useQuery({
    queryKey: ["unbonding", chain.chainId, account?.address],
    queryFn: () => fetchUnbonding(account?.address ?? ""),
    enabled: Boolean(account?.address),
    staleTime: 60_000,
    placeholderData: (previousData) => previousData
  })

  const { data: validators = [] } = useQuery({
    queryKey: ["validators", chain.chainId],
    queryFn: fetchValidators,
    staleTime: 10 * 60_000,
    placeholderData: (previousData) => previousData
  })


  const validatorMap = useMemo(() => {
    const map = new Map<string, string>()
    validators.forEach((validator) => {
      if (validator.operator_address && validator.description?.moniker) {
        map.set(validator.operator_address, validator.description.moniker)
      }
    })
    return map
  }, [validators])

  const validatorDelegations = useMemo<StakeValidatorDelegation[]>(() => {
    if (!account) return []
    const map = new Map<string, bigint>()
    delegations.forEach((item) => {
      const denom = item.balance?.denom
      const validator = item.delegation?.validator_address
      if (!validator || denom !== CLASSIC_DENOMS.lunc.coinMinimalDenom) return
      const amount = BigInt(item.balance?.amount ?? "0")
      if (amount <= 0n) return
      map.set(validator, (map.get(validator) ?? 0n) + amount)
    })
    return Array.from(map.entries())
      .map(([validator, amount]) => {
        const validatorInfo = validators.find(
          (item) => item.operator_address === validator
        )
        const key = normalizeIdentity(validatorInfo?.description?.identity)
        const commissionRate = Number(
          validatorInfo?.commission?.commission_rates?.rate ?? 0
        )
        return {
          validator,
          moniker: validatorMap.get(validator) ?? validator,
          amount,
          commissionRate,
          identity: key || undefined
        }
      })
      .sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1))
  }, [account, delegations, validatorMap, validators])

  const totalDelegated = useMemo(() => {
    return validatorDelegations.reduce((sum, item) => sum + item.amount, 0n)
  }, [validatorDelegations])

  const delegatedAmount = useMemo(() => {
    const amounts = delegations
      .map((item) => item.balance)
      .filter((balance) => balance?.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom)
      .map((balance) => balance?.amount)
    return sumAmounts(amounts)
  }, [delegations])

  const rewardAmount = useMemo(() => {
    const reward = rewards.find(
      (coin) => coin.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
    )
    return reward?.amount
  }, [rewards])

  const rewardAmountUstc = useMemo(() => {
    const reward = rewards.find(
      (coin) => coin.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
    )
    return reward?.amount
  }, [rewards])

  const unbondingAmount = useMemo(() => {
    const amounts = unbonding.flatMap((item) =>
      item.entries?.map((entry) => entry.balance) ?? []
    )
    return sumAmounts(amounts)
  }, [unbonding])

  const availableLunc = useMemo(() => {
    const coin = spendable.find(
      (item) => item.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
    )
    return BigInt(coin?.amount ?? "0")
  }, [spendable])

  const delegationsDisplay = account
    ? `${formatTokenAmount(
        delegatedAmount,
        CLASSIC_DENOMS.lunc.coinDecimals,
        2
      )} ${nativeSymbol}`
    : "--"
  const rewardsDisplay = account
    ? `${formatTokenAmount(
        rewardAmount,
        CLASSIC_DENOMS.lunc.coinDecimals,
        2
      )} ${nativeSymbol}`
    : "--"
  const rewardsUstcDisplay = chainKey === "lunc"
    ? account
      ? `${formatTokenAmount(
        rewardAmountUstc,
        CLASSIC_DENOMS.ustc.coinDecimals,
        2
      )} USTC`
      : "--"
    : undefined
  const unbondingDisplay = account
    ? `${formatTokenAmount(
        unbondingAmount,
        CLASSIC_DENOMS.lunc.coinDecimals,
        2
      )} ${nativeSymbol}`
    : "--"

  const { data: prices } = useQuery({
    queryKey: ["prices", chain.chainId],
    queryFn: fetchPrices,
    staleTime: 300_000
  })
  const activeNativePrice =
    chainKey === "luna" ? prices?.luna?.usd : prices?.lunc?.usd

  const stakedValueDisplay = useMemo(() => {
    if (!account) return "--"
    const price = activeNativePrice
    if (!price) return "--"
    const amount = toUnitAmount(
      delegatedAmount,
      CLASSIC_DENOMS.lunc.coinDecimals
    )
    return formatUsd(amount * price)
  }, [account, activeNativePrice, delegatedAmount])

  const [activeTab, setActiveTab] = useState<"my" | "stake">("my")



  const [validatorQuery, setValidatorQuery] = useState("")
  const [activeOnly, setActiveOnly] = useState(true)

  const filteredValidators = useMemo(() => {
    const query = validatorQuery.trim().toLowerCase()
    let list = validators
    if (activeOnly) {
      list = list.filter(
        (validator) => validator.status === "BOND_STATUS_BONDED"
      )
    }
    if (!query) return list
    return list.filter((validator) => {
      const moniker = validator.description?.moniker?.toLowerCase() ?? ""
      const operator = validator.operator_address?.toLowerCase() ?? ""
      return moniker.includes(query) || operator.includes(query)
    })
  }, [activeOnly, validatorQuery, validators])

  const totalValidatorTokens = useMemo(() => {
    return validators.reduce((sum, validator) => {
      const tokens = validator.tokens ?? "0"
      try {
        return sum + BigInt(tokens)
      } catch {
        return sum
      }
    }, 0n)
  }, [validators])

  const delegationsByValidator = useMemo(() => {
    const map = new Map<string, bigint>()
    validatorDelegations.forEach((item) => {
      map.set(item.validator, item.amount)
    })
    return map
  }, [validatorDelegations])

  const [validatorSort, setValidatorSort] = useState<
    "moniker" | "votingPower" | "commission"
  >("votingPower")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  const sortedValidators = useMemo(() => {
    const list = [...filteredValidators]
      .map((validator) => {
        let tokens = 0n
        try {
          tokens = BigInt(validator.tokens ?? "0")
        } catch {
          tokens = 0n
        }
        const votingPower =
          totalValidatorTokens > 0n
            ? Number((tokens * 10000n) / totalValidatorTokens) / 100
            : 0
        return { validator, tokens, votingPower }
      })
    const dir = sortDirection === "asc" ? 1 : -1
    if (validatorSort === "votingPower") {
      list.sort((a, b) => (a.votingPower - b.votingPower) * dir)
    } else if (validatorSort === "commission") {
      list.sort((a, b) => {
        const rateA = Number(
          a.validator.commission?.commission_rates?.rate ?? 0
        )
        const rateB = Number(
          b.validator.commission?.commission_rates?.rate ?? 0
        )
        return (rateA - rateB) * dir
      })
    } else {
      list.sort((a, b) => {
        const aName = a.validator.description?.moniker ?? ""
        const bName = b.validator.description?.moniker ?? ""
        return aName.localeCompare(bName) * dir
      })
    }

    if (!validatorQuery) {
      const index = list.findIndex(
        ({ validator }) =>
          validator.description?.moniker?.toLowerCase() === "burrito node"
      )
      if (index > 0) {
        const [item] = list.splice(index, 1)
        list.unshift(item)
      }
    }
    return list
  }, [filteredValidators, sortDirection, totalValidatorTokens, validatorQuery, validatorSort])

  const [visibleValidatorCount, setVisibleValidatorCount] =
    useState(VALIDATOR_PAGE_SIZE)

  useEffect(() => {
    setVisibleValidatorCount(VALIDATOR_PAGE_SIZE)
  }, [activeOnly, sortDirection, validatorQuery, validatorSort])

  const visibleValidators = useMemo(
    () => sortedValidators.slice(0, visibleValidatorCount),
    [sortedValidators, visibleValidatorCount]
  )

  const hiddenValidatorCount = Math.max(
    sortedValidators.length - visibleValidators.length,
    0
  )

  const keybaseCacheRef = useRef<KeybasePictureCacheStore>(
    readKeybaseCacheStore()
  )

  const [keybasePictures, setKeybasePictures] = useState<Record<string, string>>(
    () => cacheStoreToPictureMap(keybaseCacheRef.current)
  )

  const inFlightIdentitiesRef = useRef<Set<string>>(new Set())

  const prioritizedIdentities = useMemo(() => {
    const result: string[] = []
    const seen = new Set<string>()
    const addIdentity = (identity?: string) => {
      const normalized = normalizeIdentity(identity).toLowerCase()
      if (!normalized || seen.has(normalized)) return
      seen.add(normalized)
      result.push(normalized)
    }

    validatorDelegations.forEach((item) => addIdentity(item.identity))

    validators
      .filter(
        (validator) =>
          validator.description?.moniker?.trim().toLowerCase() === "burrito node"
      )
      .forEach((validator) => addIdentity(validator.description?.identity))

    visibleValidators.forEach(({ validator }) =>
      addIdentity(validator.description?.identity)
    )

    return result
  }, [validatorDelegations, validators, visibleValidators])

  useEffect(() => {
    const pending = prioritizedIdentities.filter(
      (identity) =>
        !keybaseCacheRef.current[identity]?.url &&
        !inFlightIdentitiesRef.current.has(identity)
    )
    if (!pending.length) return

    let cancelled = false
    pending.forEach((identity) => inFlightIdentitiesRef.current.add(identity))

    const fetchPicture = async (identity: string) => {
      try {
        const response = await fetch(
          `${KEYBASE_PROXY_URL}/?identity=${encodeURIComponent(identity)}`
        )
        const data = await response.json()
        if (typeof data === "string") return data.trim()
        if (typeof data?.picture === "string") return data.picture.trim()
        if (typeof data?.url === "string") return data.url.trim()
      } catch {
        // Ignore; no fallback by request.
      }
      return ""
    }

    const load = async () => {
      const queue = [...pending]
      let cursor = 0

      const worker = async () => {
        while (true) {
          const index = cursor
          cursor += 1
          if (index >= queue.length) return
          const identity = queue[index]
          const picture = await fetchPicture(identity)
          inFlightIdentitiesRef.current.delete(identity)
          if (!cancelled && picture) {
            setKeybasePictures((prev) => {
              if (prev[identity] === picture) return prev
              return { ...prev, [identity]: picture }
            })
            keybaseCacheRef.current[identity] = {
              url: picture,
              updatedAt: Date.now()
            }
            writeKeybaseCacheStore(keybaseCacheRef.current)
          }
        }
      }

      await Promise.all(
        Array.from({
          length: Math.min(KEYBASE_FETCH_CONCURRENCY, queue.length)
        }).map(() => worker())
      )
    }

    load()
    return () => {
      cancelled = true
    }
  }, [prioritizedIdentities])

  const resolveValidatorLogo = (identity?: string) => {
    const normalizedIdentity = normalizeIdentity(identity).toLowerCase()
    if (!normalizedIdentity) return DEFAULT_VALIDATOR_LOGO
    if (KNOWN_VALIDATOR_LOGOS[normalizedIdentity]) {
      return KNOWN_VALIDATOR_LOGOS[normalizedIdentity]
    }
    return keybasePictures[normalizedIdentity] || DEFAULT_VALIDATOR_LOGO
  }

  const handleValidatorLogoError = (
    event: SyntheticEvent<HTMLImageElement>
  ) => {
    const target = event.currentTarget
    if (target.src.includes(DEFAULT_VALIDATOR_LOGO)) return
    target.src = DEFAULT_VALIDATOR_LOGO
  }

  const donutSegments = useMemo(
    () => buildStakeDonutSegments(validatorDelegations, totalDelegated),
    [totalDelegated, validatorDelegations]
  )

  const hasDelegations = account && totalDelegated > 0n

  const [manageOpen, setManageOpen] = useState(false)
  const [activeStake, setActiveStake] = useState<{
    validator: string
    moniker: string
    amount: bigint
  } | null>(null)

  useEffect(() => {
    if (!manageOpen) return
    if (!activeStake && validatorDelegations.length > 0) {
      setActiveStake(validatorDelegations[0])
    }
  }, [manageOpen, activeStake, validatorDelegations])

  return (
    <PageShell
      title="Stake"
      extra={
        <Link className="uiButton uiButtonPrimary" to="/rewards">
          Withdraw all rewards
        </Link>
      }
    >
      <div className={styles.summaryGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chainHeader}>
            <div className={styles.chainTitle}>Staked funds</div>
          </div>
          <div className={styles.chartContent}>
            {hasDelegations ? (
              <>
                <div className={styles.donut}>
                  <svg
                    className={styles.donutSvg}
                    viewBox="0 0 220 220"
                    role="img"
                    aria-label="Staked funds distribution"
                  >
                    <circle
                      cx="110"
                      cy="110"
                      r="80"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.08)"
                      strokeWidth="40"
                    />
                    {(() => {
                      const radius = 80
                      const circumference = 2 * Math.PI * radius
                      let offset = 0
                      return donutSegments.map((segment) => {
                        const dash = segment.ratio * circumference
                        const strokeDasharray = `${dash} ${
                          circumference - dash
                        }`
                        const circle = (
                          <circle
                            key={segment.validator}
                            cx="110"
                            cy="110"
                            r={radius}
                            fill="none"
                            stroke={segment.color}
                            strokeWidth="40"
                            strokeDasharray={strokeDasharray}
                            strokeDashoffset={-offset}
                            strokeLinecap="butt"
                          />
                        )
                        offset += dash
                        return circle
                      })
                    })()}
                  </svg>
                </div>
                <div className={styles.legend}>
                  {donutSegments.map((segment) => (
                    <div key={segment.validator} className={styles.legendRow}>
                      <span
                        className={styles.legendDot}
                        style={{ backgroundColor: segment.color }}
                      />
                      <a
                        className={styles.legendLink}
                        href={validatorExplorerUrl(segment.validator)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className={styles.legendLinkText}>
                          {segment.moniker}
                        </span>
                        <span className={styles.legendLinkArrow} aria-hidden="true">
                          ↗
                        </span>
                      </a>
                      <span className={styles.legendPercent}>
                        {segment.percentLabel}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className={styles.emptyDonut}>
                {account ? "No delegations" : "Connect a wallet to view staking."}
              </div>
            )}
          </div>
        </div>

        <div className={styles.stakedCard}>
          <div className={styles.chainHeader}>
            <div className={styles.chainTitle}>Staking overview</div>
          </div>
          <div className={styles.overviewBody}>
            <div className="list dense">
              {[
                ["Staked", delegationsDisplay],
                ["Value", stakedValueDisplay],
                ["Rewards", rewardsDisplay],
                ...(rewardsUstcDisplay
                  ? [["Rewards", rewardsUstcDisplay]]
                  : []),
                ["Unstaking", unbondingDisplay]
              ].map(([label, value], index) => (
                <div key={`${label}-${index}`} className="listRow">
                  <strong>{label}</strong>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={`card ${styles.stakeTabsCard}`}>
        <div className={styles.stakeTabs}>
          <button
            type="button"
            className={`${styles.stakeTab} ${
              activeTab === "my" ? styles.stakeTabActive : ""
            }`}
            onClick={() => setActiveTab("my")}
          >
            My Stake
          </button>
          <button
            type="button"
            className={`${styles.stakeTab} ${
              activeTab === "stake" ? styles.stakeTabActive : ""
            }`}
            onClick={() => setActiveTab("stake")}
          >
            Stake
          </button>
        </div>

        <div className={styles.stakeTabBody}>
          {activeTab === "my" ? (
            <div className={styles.myStakeCard}>
            <div className={styles.myStakeBody}>
              {!account ? (
                <div className={styles.emptyState}>
                  Connect a wallet to view your delegations.
                </div>
              ) : validatorDelegations.length === 0 ? (
                <div className={styles.emptyState}>No delegations yet.</div>
              ) : (
                <div className={styles.myStakeList}>
                  {validatorDelegations.map((item) => {
                    const logo = resolveValidatorLogo(item.identity)
                    return (
                    <div key={item.validator} className={styles.myStakeRow}>
                      <div className={styles.myStakeInfo}>
                        <div className={styles.myStakeHeaderRow}>
                          <span className={styles.validatorLogoWrap}>
                            <img
                              className={styles.validatorLogo}
                              src={logo}
                              alt={item.moniker}
                              onError={handleValidatorLogoError}
                            />
                          </span>
                          <div className={styles.validatorMeta}>
                            <a
                              className={styles.validatorNameLink}
                              href={validatorExplorerUrl(item.validator)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span className={styles.validatorNameStrong}>
                                {item.moniker}
                              </span>
                              <span
                                className={styles.validatorNameArrow}
                                aria-hidden="true"
                              >
                                ↗
                              </span>
                            </a>
                            <span className={styles.validatorCommission}>
                              Commission {formatPercent(item.commissionRate * 100)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className={styles.myStakeAmounts}>
                        <div className={styles.amountBlock}>
                          <span className={styles.amountLabel}>{nativeSymbol}</span>
                          <span className={styles.amountValue}>
                            {formatTokenAmount(
                              item.amount.toString(),
                              CLASSIC_DENOMS.lunc.coinDecimals,
                              2
                            )}
                          </span>
                        </div>
                        <div className={styles.amountBlock}>
                          <span className={styles.amountLabel}>Value</span>
                          <span className={styles.amountValue}>
                            {activeNativePrice
                              ? formatUsd(
                                  toUnitAmount(
                                    item.amount,
                                    CLASSIC_DENOMS.lunc.coinDecimals
                                  ) * activeNativePrice
                                )
                              : "--"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.manageButton}
                        onClick={() => {
                          setActiveStake(item)
                          setManageOpen(true)
                        }}
                      >
                        Manage Stake
                      </button>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
            </div>
          ) : (
            <div className={styles.validatorListCard}>
            <div className={styles.searchRow}>
              <label className={styles.searchField}>
                <span className={styles.searchIcon} aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <input
                  className={styles.searchInput}
                  type="text"
                  value={validatorQuery}
                  onChange={(event) => setValidatorQuery(event.target.value)}
                  placeholder="Search validator"
                />
              </label>
              <label className={styles.activeToggle}>
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(event) => setActiveOnly(event.target.checked)}
                />
                Active only
              </label>
            </div>
            <div className={styles.validatorListBody}>
              {filteredValidators.length ? (
                <div className={styles.validatorTable}>
                  <div className={styles.validatorHeaderRow}>
                    <button
                      type="button"
                      className={styles.sortHeader}
                      data-active={validatorSort === "moniker"}
                      onClick={() => {
                        if (validatorSort === "moniker") {
                          setSortDirection((prev) =>
                            prev === "asc" ? "desc" : "asc"
                          )
                        } else {
                          setValidatorSort("moniker")
                          setSortDirection("asc")
                        }
                      }}
                    >
                      <span className={styles.sorter}>
                        <span>Moniker</span>
                        <span className={styles.sortCarets}>
                          <svg
                            className={`${styles.sortCaret} ${
                              validatorSort === "moniker" && sortDirection === "asc"
                                ? styles.sortCaretActive
                                : ""
                            }`}
                            viewBox="0 0 10 6"
                            aria-hidden="true"
                          >
                            <path d="M0 6L5 0L10 6H0Z" />
                          </svg>
                          <svg
                            className={`${styles.sortCaret} ${
                              validatorSort === "moniker" && sortDirection === "desc"
                                ? styles.sortCaretActive
                                : ""
                            }`}
                            viewBox="0 0 10 6"
                            aria-hidden="true"
                          >
                            <path d="M0 0L5 6L10 0H0Z" />
                          </svg>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.sortHeader} ${styles.sortHeaderRight}`}
                      data-active={validatorSort === "votingPower"}
                      onClick={() => {
                        if (validatorSort === "votingPower") {
                          setSortDirection((prev) =>
                            prev === "asc" ? "desc" : "asc"
                          )
                        } else {
                          setValidatorSort("votingPower")
                          setSortDirection("desc")
                        }
                      }}
                    >
                      <span className={styles.sorter}>
                        <span>Voting power</span>
                        <span className={styles.sortCarets}>
                          <svg
                            className={`${styles.sortCaret} ${
                              validatorSort === "votingPower" &&
                              sortDirection === "asc"
                                ? styles.sortCaretActive
                                : ""
                            }`}
                            viewBox="0 0 10 6"
                            aria-hidden="true"
                          >
                            <path d="M0 6L5 0L10 6H0Z" />
                          </svg>
                          <svg
                            className={`${styles.sortCaret} ${
                              validatorSort === "votingPower" &&
                              sortDirection === "desc"
                                ? styles.sortCaretActive
                                : ""
                            }`}
                            viewBox="0 0 10 6"
                            aria-hidden="true"
                          >
                            <path d="M0 0L5 6L10 0H0Z" />
                          </svg>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.sortHeader} ${styles.sortHeaderRight}`}
                      data-active={validatorSort === "commission"}
                      onClick={() => {
                        if (validatorSort === "commission") {
                          setSortDirection((prev) =>
                            prev === "asc" ? "desc" : "asc"
                          )
                        } else {
                          setValidatorSort("commission")
                          setSortDirection("asc")
                        }
                      }}
                    >
                      <span className={styles.sorter}>
                        <span>Commission</span>
                        <span className={styles.sortCarets}>
                          <svg
                            className={`${styles.sortCaret} ${
                              validatorSort === "commission" &&
                              sortDirection === "asc"
                                ? styles.sortCaretActive
                                : ""
                            }`}
                            viewBox="0 0 10 6"
                            aria-hidden="true"
                          >
                            <path d="M0 6L5 0L10 6H0Z" />
                          </svg>
                          <svg
                            className={`${styles.sortCaret} ${
                              validatorSort === "commission" &&
                              sortDirection === "desc"
                                ? styles.sortCaretActive
                                : ""
                            }`}
                            viewBox="0 0 10 6"
                            aria-hidden="true"
                          >
                            <path d="M0 0L5 6L10 0H0Z" />
                          </svg>
                        </span>
                      </span>
                    </button>
                    <span className={styles.validatorHeaderAction}>Actions</span>
                  </div>
                  <div className={styles.validatorRows}>
                    {visibleValidators.map(({ validator, votingPower }) => {
                      const identity = normalizeIdentity(
                        validator.description?.identity
                      )
                      const icon = resolveValidatorLogo(identity)
                      const delegatedAmount =
                        delegationsByValidator.get(validator.operator_address) ?? 0n
                      const actionLabel =
                        delegatedAmount > 0n ? "Manage Stake" : "Stake"

                      return (
                        <StakeValidatorRow
                          key={validator.operator_address}
                          validator={validator}
                          votingPower={votingPower}
                          delegatedAmount={delegatedAmount}
                          icon={icon}
                          actionLabel={actionLabel}
                          onLogoError={handleValidatorLogoError}
                          onManage={(target) => {
                            setActiveStake(target)
                            setManageOpen(true)
                          }}
                        />
                      )
                    })}
                  </div>
                  {hiddenValidatorCount > 0 ? (
                    <div className={styles.validatorLoadMoreRow}>
                      <button
                        type="button"
                        className={styles.validatorLoadMoreButton}
                        onClick={() =>
                          setVisibleValidatorCount((count) =>
                            Math.min(
                              count + VALIDATOR_PAGE_SIZE,
                              sortedValidators.length
                            )
                          )
                        }
                      >
                        Load more
                        <span className={styles.validatorLoadMoreCount}>
                          {Math.min(
                            hiddenValidatorCount,
                            VALIDATOR_PAGE_SIZE
                          )}{" "}
                          of {hiddenValidatorCount}
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className={styles.emptyState}>No validators found.</div>
              )}
            </div>
            </div>
          )}
        </div>
      </div>

      <StakeManageModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        delegations={validatorDelegations.map((item) => ({
          validator: item.validator,
          moniker: item.moniker,
          amount: item.amount
        }))}
        active={activeStake}
        available={availableLunc}
      />
    </PageShell>
  )
}

export default Stake
