import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "./PageShell"
import Tabs from "../components/Tabs"
import styles from "./Stake.module.css"
import { useWallet } from "../app/wallet/WalletProvider"
import {
  fetchDelegations,
  fetchRewards,
  fetchUnbonding,
  fetchValidators
} from "../app/data/classic"
import { formatPercent, formatTokenAmount, sumAmounts } from "../app/utils/format"
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

  return (
    <PageShell
      title="Stake"
      extra={
        <button className="uiButton uiButtonPrimary" type="button">
          Withdraw all rewards
        </button>
      }
    >
      <div className={styles.summaryGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chainHeader}>
            <div className={styles.chainTitle}>Staked funds</div>
            <div className={styles.chainPills}>
              <button
                className={`${styles.chainPill} ${styles.chainPillActive} ${styles.chainPillAll}`}
                type="button"
              >
                All
              </button>
              <button className={styles.chainPill} type="button">
                <span className={styles.chainPillIcon} aria-hidden="true" />
                Terra Classic
              </button>
            </div>
          </div>
          <div className={styles.chartContent}>
            <div className={styles.donut}>
              <span />
            </div>
            <div className={styles.chartMeta}>
              <div>
                <strong>{delegationsDisplay}</strong>
                <span>Delegated</span>
              </div>
              <div>
                <strong>{rewardsDisplay}</strong>
                <span>Rewards</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`card ${styles.stakedCard}`}>
          <div className="cardHeader">
            <div className="cardTitle">Staking overview</div>
          </div>
          <div className="cardDivider" />
          <div className="list dense">
            {[
              ["Delegations", delegationsDisplay],
              ["Rewards", rewardsDisplay],
              ["Unbonding", unbondingDisplay],
              ["APR", "--"]
            ].map(([label, value]) => (
              <div key={label} className="listRow">
                <strong>{label}</strong>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} variant="page" />
    </PageShell>
  )
}

export default Stake
