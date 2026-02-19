import { useMemo, useState, useEffect, type SyntheticEvent } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import styles from "./Stake.module.css"
import { useWallet } from "../app/wallet/WalletProvider"
import { Link } from "react-router-dom"
import {
  fetchDelegations,
  fetchRewards,
  fetchSpendableBalances,
  fetchUnbonding,
  fetchValidators,
  fetchPrices
} from "../app/data/classic"
import {
  formatPercent,
  formatTokenAmount,
  formatUsd,
  sumAmounts,
  toUnitAmount
} from "../app/utils/format"
import { CLASSIC_DENOMS } from "../app/chain"
import StakeManageModal from "./StakeManageModal"

const KEYBASE_PROXY_URL = "https://keybase.burrito.money"
const KEYBASE_FETCH_CONCURRENCY = 6
const DEFAULT_VALIDATOR_LOGO = "/system/validator.png"

const normalizeIdentity = (value?: string) => value?.trim() || ""

const Stake = () => {
  const { account } = useWallet()

  const { data: delegations = [] } = useQuery({
    queryKey: ["delegations", account?.address],
    queryFn: () => fetchDelegations(account?.address ?? ""),
    enabled: Boolean(account?.address)
  })

  const { data: rewards = [] } = useQuery({
    queryKey: ["rewards", account?.address],
    queryFn: () => fetchRewards(account?.address ?? ""),
    enabled: Boolean(account?.address)
  })

  const { data: spendable = [] } = useQuery({
    queryKey: ["spendable-balances", account?.address],
    queryFn: () => fetchSpendableBalances(account?.address ?? ""),
    enabled: Boolean(account?.address)
  })

  const { data: unbonding = [] } = useQuery({
    queryKey: ["unbonding", account?.address],
    queryFn: () => fetchUnbonding(account?.address ?? ""),
    enabled: Boolean(account?.address)
  })

  const { data: validators = [] } = useQuery({
    queryKey: ["validators"],
    queryFn: fetchValidators,
    staleTime: 60_000
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

  const validatorDelegations = useMemo(() => {
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

  const [keybasePictures, setKeybasePictures] = useState<Record<string, string>>(
    {}
  )

  useEffect(() => {
    const identities = Array.from(
      new Set(
        validators
          .map((item) => normalizeIdentity(item.description?.identity))
          .filter((id): id is string => Boolean(id))
      )
    )
    const pending = identities.filter((id) => !(id in keybasePictures))
    if (!pending.length) return

    let cancelled = false

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
      const results: Array<readonly [string, string]> = []
      let cursor = 0

      const worker = async () => {
        while (true) {
          const index = cursor
          cursor += 1
          if (index >= queue.length) return
          const identity = queue[index]
          const picture = await fetchPicture(identity)
          if (picture) {
            results.push([identity, picture] as const)
          }
        }
      }

      await Promise.all(
        Array.from({
          length: Math.min(KEYBASE_FETCH_CONCURRENCY, queue.length)
        }).map(() => worker())
      )

      if (cancelled || !results.length) return

      setKeybasePictures((prev) => {
        const next = { ...prev }
        results.forEach(([identity, picture]) => {
          next[identity] = picture
          next[identity.toUpperCase()] = picture
          next[identity.toLowerCase()] = picture
        })
        return next
      })
    }

    load()
    return () => {
      cancelled = true
    }
  }, [keybasePictures, validators])

  const resolveValidatorLogo = (identity?: string) => {
    const normalizedIdentity = normalizeIdentity(identity)
    if (!normalizedIdentity) return DEFAULT_VALIDATOR_LOGO
    return (
      keybasePictures[normalizedIdentity] ||
      keybasePictures[normalizedIdentity.toUpperCase()] ||
      keybasePictures[normalizedIdentity.toLowerCase()] ||
      DEFAULT_VALIDATOR_LOGO
    )
  }

  const handleValidatorLogoError = (
    event: SyntheticEvent<HTMLImageElement>
  ) => {
    const target = event.currentTarget
    if (target.src.includes(DEFAULT_VALIDATOR_LOGO)) return
    target.src = DEFAULT_VALIDATOR_LOGO
  }

  const totalDelegated = useMemo(() => {
    return validatorDelegations.reduce((sum, item) => sum + item.amount, 0n)
  }, [validatorDelegations])

  const DONUT_COLORS = [
    "#7893F5",
    "#7C1AE5",
    "#FF7940",
    "#FF9F40",
    "#ACACAC",
    "#52C41A",
    "#36CFC9",
    "#FAAD14"
  ]

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
      )} LUNC`
    : "--"
  const rewardsDisplay = account
    ? `${formatTokenAmount(
        rewardAmount,
        CLASSIC_DENOMS.lunc.coinDecimals,
        2
      )} LUNC`
    : "--"
  const rewardsUstcDisplay = account
    ? `${formatTokenAmount(
        rewardAmountUstc,
        CLASSIC_DENOMS.ustc.coinDecimals,
        2
      )} USTC`
    : "--"
  const unbondingDisplay = account
    ? `${formatTokenAmount(
        unbondingAmount,
        CLASSIC_DENOMS.lunc.coinDecimals,
        2
      )} LUNC`
    : "--"

  const { data: prices } = useQuery({
    queryKey: ["prices"],
    queryFn: fetchPrices,
    staleTime: 300_000
  })

  const stakedValueDisplay = useMemo(() => {
    if (!account) return "--"
    const price = prices?.lunc?.usd
    if (!price) return "--"
    const amount = toUnitAmount(
      delegatedAmount,
      CLASSIC_DENOMS.lunc.coinDecimals
    )
    return formatUsd(amount * price)
  }, [account, delegatedAmount, prices?.lunc?.usd])

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

  const formatPercentPlain = (value: number) => {
    const raw = formatPercent(value)
    return raw.startsWith("+") ? raw.slice(1) : raw
  }

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

  const donutSegments = useMemo(() => {
    const total = totalDelegated
    if (!total || total === 0n) return []
    const single = validatorDelegations.length === 1
    return validatorDelegations.map((item, index) => {
      const ratio = Number(item.amount) / Number(total)
      const percent = ratio * 100
      const percentLabel =
        percent > 0 && percent < 1 ? "< 1" : Math.round(percent).toString()
      return {
        ...item,
        color: single
          ? "#52C41A"
          : index === 0
          ? "#52C41A"
          : DONUT_COLORS[index % DONUT_COLORS.length],
        ratio,
        percentLabel
      }
    })
  }, [totalDelegated, validatorDelegations])

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
                        href={`https://finder.burrito.money/classic/validator/${segment.validator}`}
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
                ["Rewards", rewardsUstcDisplay],
                ["Unstaking", unbondingDisplay]
              ].map(([label, value]) => (
                <div key={label} className="listRow">
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
                            <span className={styles.validatorNameStrong}>
                              {item.moniker}
                            </span>
                            <span className={styles.validatorCommission}>
                              Commission {formatPercent(item.commissionRate * 100)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className={styles.myStakeAmounts}>
                        <div className={styles.amountBlock}>
                          <span className={styles.amountLabel}>LUNC</span>
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
                            {prices?.lunc?.usd
                              ? formatUsd(
                                  toUnitAmount(
                                    item.amount,
                                    CLASSIC_DENOMS.lunc.coinDecimals
                                  ) * prices.lunc.usd
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
                    {sortedValidators.map(({ validator, votingPower }, index) => {
                      const rate = Number(
                        validator.commission?.commission_rates?.rate ?? 0
                      )
                      const identity = normalizeIdentity(
                        validator.description?.identity
                      )
                      const icon = resolveValidatorLogo(identity)
                      const delegatedAmount =
                        delegationsByValidator.get(validator.operator_address) ?? 0n
                      const actionLabel =
                        delegatedAmount > 0n ? "Manage Stake" : "Stake"
                      if (index === 0 && !validatorQuery) {
                        return (
                          <div
                            key={validator.operator_address}
                            className={styles.validatorRow}
                          >
                            <div className={styles.validatorMonikerCell}>
                              <span className={styles.validatorRowIconWrap}>
                                <img
                                  className={styles.validatorRowIcon}
                                  src={icon}
                                  alt={validator.description?.moniker ?? "validator"}
                                  onError={handleValidatorLogoError}
                                />
                              </span>
                              <a
                                className={styles.validatorRowLink}
                                href={`https://finder.burrito.money/classic/validator/${validator.operator_address}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <span className={styles.validatorRowLinkText}>
                                  {validator.description?.moniker ?? "--"}
                                </span>
                                <span
                                  className={styles.validatorRowLinkArrow}
                                  aria-hidden="true"
                                >
                                  ↗
                                </span>
                              </a>
                            </div>
                            <div className={styles.validatorCell}>
                              {formatPercentPlain(votingPower)}
                            </div>
                            <div className={styles.validatorCell}>
                              {formatPercentPlain(rate * 100)}
                            </div>
                            <div className={styles.validatorActionCell}>
                              <button
                                type="button"
                                className={styles.validatorActionButton}
                                onClick={() => {
                                  setActiveStake({
                                    validator: validator.operator_address,
                                    moniker: validator.description?.moniker ?? validator.operator_address,
                                    amount: delegatedAmount
                                  })
                                  setManageOpen(true)
                                }}
                              >
                                {actionLabel}
                              </button>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div
                          key={validator.operator_address}
                          className={styles.validatorRow}
                        >
                          <div className={styles.validatorMonikerCell}>
                            <span className={styles.validatorRowIconWrap}>
                              <img
                                className={styles.validatorRowIcon}
                                src={icon}
                                alt={validator.description?.moniker ?? "validator"}
                                onError={handleValidatorLogoError}
                              />
                            </span>
                            <a
                              className={styles.validatorRowLink}
                              href={`https://finder.burrito.money/classic/validator/${validator.operator_address}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span className={styles.validatorRowLinkText}>
                                {validator.description?.moniker ?? "--"}
                              </span>
                              <span
                                className={styles.validatorRowLinkArrow}
                                aria-hidden="true"
                              >
                                ↗
                              </span>
                            </a>
                          </div>
                          <div className={styles.validatorCell}>
                            {formatPercentPlain(votingPower)}
                          </div>
                          <div className={styles.validatorCell}>
                            {formatPercentPlain(rate * 100)}
                          </div>
                          <div className={styles.validatorActionCell}>
                            <button
                              type="button"
                              className={styles.validatorActionButton}
                              onClick={() => {
                                setActiveStake({
                                  validator: validator.operator_address,
                                  moniker: validator.description?.moniker ?? validator.operator_address,
                                  amount: delegatedAmount
                                })
                                setManageOpen(true)
                              }}
                            >
                              {actionLabel}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
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
