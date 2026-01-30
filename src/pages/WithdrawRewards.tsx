import { useMemo, useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { SigningStargateClient, GasPrice } from "@cosmjs/stargate"
import { MsgWithdrawDelegatorReward } from "cosmjs-types/cosmos/distribution/v1beta1/tx"
import PageShell from "./PageShell"
import styles from "./WithdrawRewards.module.css"
import { useWallet } from "../app/wallet/WalletProvider"
import {
  fetchRewardsByValidator,
  fetchValidators,
  type RewardsByValidator
} from "../app/data/classic"
import { CLASSIC_CHAIN, CLASSIC_DENOMS, KEPLR_CHAIN_CONFIG } from "../app/chain"
import { formatTokenAmount } from "../app/utils/format"
import { useIbcWhitelist } from "../app/data/terraAssets"

const getWalletInstance = () => {
  if (typeof window === "undefined") return undefined
  const anyWindow = window as Window & {
    keplr?: any
    station?: any
    galaxyStation?: any
    getOfflineSigner?: any
    getOfflineSignerAuto?: any
  }
  return anyWindow.keplr ?? anyWindow.station ?? anyWindow.galaxyStation
}

const getOfflineSigner = async () => {
  if (typeof window === "undefined") return undefined
  const anyWindow = window as Window & {
    getOfflineSigner?: any
    getOfflineSignerAuto?: any
  }
  if (anyWindow.getOfflineSignerAuto) {
    return await anyWindow.getOfflineSignerAuto(KEPLR_CHAIN_CONFIG.chainId)
  }
  if (anyWindow.getOfflineSigner) {
    return anyWindow.getOfflineSigner(KEPLR_CHAIN_CONFIG.chainId)
  }
  return undefined
}

const sumRewards = (rewards: RewardsByValidator[], selected: string[]) => {
  const totals = new Map<string, bigint>()
  rewards.forEach((item) => {
    if (!selected.includes(item.validator_address)) return
    item.reward?.forEach((coin) => {
      const raw = (coin.amount ?? "0").split(".")[0]
      let amount = 0n
      try {
        amount = BigInt(raw || "0")
      } catch {
        amount = 0n
      }
      totals.set(coin.denom, (totals.get(coin.denom) ?? 0n) + amount)
    })
  })
  return totals
}

const getSymbol = (denom: string, ibcSymbol?: string) => {
  if (denom === CLASSIC_DENOMS.lunc.coinMinimalDenom)
    return CLASSIC_DENOMS.lunc.coinDenom
  if (denom === CLASSIC_DENOMS.ustc.coinMinimalDenom)
    return CLASSIC_DENOMS.ustc.coinDenom
  if (denom.startsWith("ibc/") && ibcSymbol) return ibcSymbol
  return denom.replace(/^u/, "").toUpperCase()
}

const formatRewardSummary = (
  rewards: RewardsByValidator["reward"],
  ibcWhitelist?: Record<string, { symbol?: string }>
) => {
  if (!rewards?.length) return "--"
  const lunc = rewards.find(
    (coin) => coin.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
  )
  const ustc = rewards.find(
    (coin) => coin.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
  )
  const coin = lunc ?? ustc ?? rewards[0]
  const symbol = getSymbol(
    coin.denom,
    coin.denom.startsWith("ibc/") ? ibcWhitelist?.[coin.denom]?.symbol : undefined
  )
  return `${formatTokenAmount(
    coin.amount,
    CLASSIC_DENOMS.lunc.coinDecimals,
    6
  )} ${symbol}`
}

const ASSET_URL = "https://assets.terra.dev"
const buildIconCandidates = (denom: string, icon?: string) => {
  const formatDenom = (value: string) => {
    if (!value) return value
    if (value.startsWith("u")) {
      const base = value.slice(1)
      if (base.length > 3) return base.toUpperCase()
      return base.slice(0, 2).toUpperCase() + "T"
    }
    return value
  }
  const iconDenom = denom === "uluna" ? "LUNC" : formatDenom(denom)
  return [
    icon,
    `${ASSET_URL}/icon/60/${iconDenom}.png`,
    `${ASSET_URL}/icon/svg/${iconDenom}.svg`,
    `${ASSET_URL}/icon/60/${String(iconDenom).toUpperCase()}.png`,
    `${ASSET_URL}/icon/svg/${String(iconDenom).toUpperCase()}.svg`,
    `${ASSET_URL}/icon/60/${String(iconDenom).toLowerCase()}.png`
  ].filter(Boolean) as string[]
}

const TokenIcon = ({
  symbol,
  candidates
}: {
  symbol: string
  candidates: string[]
}) => {
  const [first, ...rest] = candidates
  const image = first ? (
    <img
      src={first}
      alt={symbol}
      onError={(event) => {
        const target = event.currentTarget
        const next = rest.shift()
        if (next) {
          target.src = next
        } else {
          target.style.display = "none"
          target.parentElement?.classList.add(styles.rewardIconFallback)
        }
      }}
    />
  ) : null

  return <span className={styles.rewardIcon}>{image || symbol.slice(0, 1)}</span>
}

const WithdrawRewards = () => {
  const { account } = useWallet()
  const accountAddress = account?.address
  const { data: rewardData } = useQuery({
    queryKey: ["rewardsByValidator", accountAddress],
    queryFn: () => fetchRewardsByValidator(accountAddress ?? ""),
    enabled: Boolean(accountAddress)
  })
  const { data: validators = [] } = useQuery({
    queryKey: ["validators"],
    queryFn: fetchValidators,
    staleTime: 60_000
  })
  const { data: ibcWhitelist = {} } = useIbcWhitelist()

  const validatorMap = useMemo(() => {
    const map = new Map<string, string>()
    validators.forEach((validator) => {
      if (validator.operator_address && validator.description?.moniker) {
        map.set(validator.operator_address, validator.description.moniker)
      }
    })
    return map
  }, [validators])

  const rewards = useMemo(() => {
    const list = rewardData?.rewards ?? []
    return list.filter((item) =>
      item.reward?.some((coin) => {
        const raw = (coin.amount ?? "0").split(".")[0]
        try {
          return BigInt(raw || "0") > 0n
        } catch {
          return false
        }
      })
    )
  }, [rewardData?.rewards])

  const [selected, setSelected] = useState<string[]>([])
  useEffect(() => {
    setSelected(rewards.map((item) => item.validator_address))
  }, [rewards])

  const selectedTotals = useMemo(
    () => sumRewards(rewards, selected),
    [rewards, selected]
  )

  const totalsList = Array.from(selectedTotals.entries())
    .map(([denom, amount], index) => ({
      denom,
      amount,
      index
    }))
    .sort((a, b) => {
      const lunc = CLASSIC_DENOMS.lunc.coinMinimalDenom
      const ustc = CLASSIC_DENOMS.ustc.coinMinimalDenom
      const rank = (value: string) =>
        value === lunc ? 0 : value === ustc ? 1 : 2
      const rankDiff = rank(a.denom) - rank(b.denom)
      if (rankDiff !== 0) return rankDiff
      return a.index - b.index
    })

  const [fee, setFee] = useState("--")
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeError, setFeeError] = useState<string>()
  const [submitError, setSubmitError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    if (!accountAddress || !selected.length) {
      setFee("--")
      setFeeError(undefined)
      return undefined
    }

    timer = window.setTimeout(async () => {
      setFeeLoading(true)
      setFeeError(undefined)
      try {
        const wallet = getWalletInstance()
        if (!wallet) throw new Error("Wallet extension not available")
        if (wallet.experimentalSuggestChain) {
          await wallet.experimentalSuggestChain(KEPLR_CHAIN_CONFIG)
        }
        if (wallet.enable) {
          await wallet.enable(KEPLR_CHAIN_CONFIG.chainId)
        }
        const signer = await getOfflineSigner()
        if (!signer) throw new Error("Wallet signer not available")
        const msgs = selected.map((validator) => ({
          typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
          value: MsgWithdrawDelegatorReward.fromPartial({
            delegatorAddress: accountAddress,
            validatorAddress: validator
          })
        }))
        const client = await SigningStargateClient.connectWithSigner(
          CLASSIC_CHAIN.rpc,
          signer,
          { gasPrice: GasPrice.fromString("28.325uluna") }
        )
        const gasUsed = await client.simulate(accountAddress, msgs, "")
        const gasPrice = GasPrice.fromString("28.325uluna")
        const gasPriceAmount = Number(gasPrice.amount.toString())
        const feeMicro = Math.ceil(gasUsed * gasPriceAmount).toString()
        const feeDisplay = formatTokenAmount(
          feeMicro,
          CLASSIC_DENOMS.lunc.coinDecimals,
          6
        )
        if (!cancelled) {
          setFee(feeDisplay === "--" ? "--" : `${feeDisplay} LUNC`)
        }
      } catch (err) {
        if (!cancelled) {
          setFee("--")
          setFeeError(
            err instanceof Error ? err.message : "Fee estimation failed"
          )
        }
      } finally {
        if (!cancelled) setFeeLoading(false)
      }
    }, 500)

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [accountAddress, selected])

  const toggleAll = (value: boolean) => {
    setSelected(value ? rewards.map((item) => item.validator_address) : [])
  }

  const toggleValidator = (validator: string) => {
    setSelected((prev) =>
      prev.includes(validator)
        ? prev.filter((item) => item !== validator)
        : [...prev, validator]
    )
  }

  const submit = async () => {
    setSubmitError(undefined)
    if (!accountAddress) {
      setSubmitError("Please connect a wallet.")
      return
    }
    if (!selected.length) return
    try {
      setSubmitting(true)
      const wallet = getWalletInstance()
      if (!wallet) throw new Error("Wallet extension not available")
      if (wallet.experimentalSuggestChain) {
        await wallet.experimentalSuggestChain(KEPLR_CHAIN_CONFIG)
      }
      if (wallet.enable) {
        await wallet.enable(KEPLR_CHAIN_CONFIG.chainId)
      }
      const signer = await getOfflineSigner()
      if (!signer) throw new Error("Wallet signer not available")
      const client = await SigningStargateClient.connectWithSigner(
        CLASSIC_CHAIN.rpc,
        signer,
        { gasPrice: GasPrice.fromString("28.325uluna") }
      )
      const msgs = selected.map((validator) => ({
        typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
        value: MsgWithdrawDelegatorReward.fromPartial({
          delegatorAddress: accountAddress,
          validatorAddress: validator
        })
      }))
      await client.signAndBroadcast(accountAddress, msgs, "auto")
      setSubmitting(false)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submit failed")
      setSubmitting(false)
    }
  }

  return (
    <PageShell title="Withdraw rewards" backTo="/stake" backLabel="" small>
      <div className={`card ${styles.pageCard}`}>
        <div className={styles.actions}>
          {selected.length !== rewards.length ? (
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => toggleAll(true)}
            >
              Select All
            </button>
          ) : (
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => toggleAll(false)}
            >
              Deselect All
            </button>
          )}
        </div>

        <div className={`card ${styles.validatorCard}`}>
          <dl className={styles.validatorHeader}>
            <dt>Validators</dt>
            <dd>Rewards</dd>
          </dl>
          <div className={styles.validatorList}>
            {rewards.length ? (
              rewards.map((item) => {
                const checked = selected.includes(item.validator_address)
                return (
                  <label
                    key={item.validator_address}
                    className={styles.validatorRow}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleValidator(item.validator_address)}
                    />
                    <dl className={styles.validatorItem}>
                      <dt className={styles.validatorName}>
                        {validatorMap.get(item.validator_address) ??
                          item.validator_address}
                      </dt>
                      <dd className={styles.validatorReward}>
                        {formatRewardSummary(item.reward, ibcWhitelist)}
                      </dd>
                    </dl>
                  </label>
                )
              })
            ) : (
              <div className={styles.empty}>No rewards on selected chain</div>
            )}
          </div>
        </div>

        <div className={styles.summaryDivider} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M12 4a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5.01 5a1 1 0 0 1-1.4 0l-5.01-5a1 1 0 1 1 1.42-1.42L11 15.59V5a1 1 0 0 1 1-1z"
            />
          </svg>
        </div>

        <div className={styles.summaryGrid}>
          {totalsList.map(({ denom, amount }) => (
            <div key={denom} className={`card ${styles.summaryCard}`}>
              <div className={styles.summaryHeader}>
                <TokenIcon
                  symbol={getSymbol(
                    denom,
                    denom.startsWith("ibc/") ? ibcWhitelist?.[denom]?.symbol : undefined
                  )}
                  candidates={buildIconCandidates(
                    denom,
                    denom.startsWith("ibc/") ? ibcWhitelist?.[denom]?.icon : undefined
                  )}
                />
                <span className={styles.summarySymbol}>
                  {getSymbol(
                    denom,
                    denom.startsWith("ibc/") ? ibcWhitelist?.[denom]?.symbol : undefined
                  )}
                </span>
              </div>
              <div className={styles.summaryAmount}>
                {formatTokenAmount(
                  amount.toString(),
                  CLASSIC_DENOMS.lunc.coinDecimals,
                  6
                )}
              </div>
            </div>
          ))}
        </div>

        <div className={`card ${styles.feeCard}`}>
          <dl>
            <dt>Fee</dt>
            <dd>{feeLoading ? "Estimating..." : fee}</dd>
          </dl>
          {feeError ? <div className={styles.feeError}>{feeError}</div> : null}
        </div>

        {submitError ? (
          <div className={styles.submitError}>{submitError}</div>
        ) : null}
        <button
          type="button"
          className={`${styles.submit} ${
            !accountAddress || !selected.length || submitting
              ? styles.disabled
              : ""
          }`}
          disabled={!accountAddress || !selected.length || submitting}
          onClick={submit}
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </div>
    </PageShell>
  )
}

export default WithdrawRewards
