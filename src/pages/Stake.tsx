import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import Tabs from "../components/Tabs"
import styles from "./Stake.module.css"
import { useWallet } from "../app/wallet/WalletProvider"
import { Link } from "react-router-dom"
import {
  fetchDelegations,
  fetchRewards,
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
      .map(([validator, amount]) => ({
        validator,
        moniker: validatorMap.get(validator) ?? validator,
        amount
      }))
      .sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1))
  }, [account, delegations, validatorMap])

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

  const unbondingAmount = useMemo(() => {
    const amounts = unbonding.flatMap((item) =>
      item.entries?.map((entry) => entry.balance) ?? []
    )
    return sumAmounts(amounts)
  }, [unbonding])

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

  const quickValidators = validators.slice(0, 3)
  const manualValidators = validators.slice(0, 6)
  const tabs = [
    {
      key: "quick",
      label: "Quick stake",
      content: (
        <div className={styles.tabContent}>
          <div className="card">
            <div className="cardHeader">
              <div className="cardTitle">Quick stake</div>
            </div>
            <div className="cardDivider" />
            <div className="list dense">
              {quickValidators.length
                ? quickValidators.map((validator) => {
                    const rate = Number(
                      validator.commission?.commission_rates?.rate ?? 0
                    )
                    return (
                      <div
                        key={validator.operator_address}
                        className="listRow"
                      >
                        <strong>{validator.description?.moniker ?? "--"}</strong>
                        <span>Commission {formatPercent(rate * 100)}</span>
                      </div>
                    )
                  })
                : ["Burrito Node", "Allnodes", "Classic Labs"].map((name) => (
                    <div key={name} className="listRow">
                      <strong>{name}</strong>
                      <span>Commission --</span>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )
    },
    {
      key: "manual",
      label: "Manual stake",
      content: (
        <div className={styles.tabContent}>
          <div className="card">
            <div className="cardHeader">
              <div className="cardTitle">Validator list</div>
            </div>
            <div className="cardDivider" />
            <div className="list dense">
              {manualValidators.length
                ? manualValidators.map((validator) => {
                    const rate = Number(
                      validator.commission?.commission_rates?.rate ?? 0
                    )
                    return (
                      <div
                        key={validator.operator_address}
                        className="listRow"
                      >
                        <strong>{validator.description?.moniker ?? "--"}</strong>
                        <span>Commission {formatPercent(rate * 100)}</span>
                      </div>
                    )
                  })
                : ["Validator A", "Validator B", "Validator C"].map((name) => (
                    <div key={name} className="listRow">
                      <strong>{name}</strong>
                      <span>Commission --</span>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )
    }
  ]

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
        color: single ? "#52C41A" : DONUT_COLORS[index % DONUT_COLORS.length],
        ratio,
        percentLabel
      }
    })
  }, [totalDelegated, validatorDelegations])

  const hasDelegations = account && totalDelegated > 0n

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
                      <span className={styles.legendName}>{segment.moniker}</span>
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

      <Tabs tabs={tabs} variant="page" />
    </PageShell>
  )
}

export default Stake
