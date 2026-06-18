import { useMemo, useState, useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "../PageShell"
import styles from "../WithdrawRewards.module.css"
import { useWallet } from "../../app/wallet/WalletContext"
import {
  fetchRewardsByValidator,
  fetchValidators,
  type RewardsByValidator
} from "../../app/data/classic"
import { CLASSIC_DENOMS } from "../../app/chain"
import { formatTokenAmount } from "../../app/utils/format"
import { useResolvedIbcWhitelist } from "../../app/data/terraAssets"
import {
  buildClassicNativeIconCandidates,
  buildIbcAssetIconCandidates
} from "../../app/utils/assetIcons"
import { formatTxError } from "../../app/utils/txError"
import {
  WITHDRAW_GAS_PRICE_MICRO_LUNC,
  WITHDRAW_REWARDS_DEFAULT_FEE_GAS,
  WITHDRAW_SIMULATION_FALLBACK_GAS_MULTIPLIER,
  WITHDRAW_SUBMIT_GAS_ADJUSTMENT,
  buildWithdrawTxFee,
  getRewardsFallbackGas
} from "../../app/stake/withdrawTx"

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
  if (denom.startsWith("u")) {
    const base = denom.slice(1)
    if (base.length === 3) {
      return `${base.slice(0, 2).toUpperCase()}TC`
    }
    return base.toUpperCase()
  }
  return denom.toUpperCase()
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
    coin.denom.startsWith("ibc/")
      ? ibcWhitelist?.[coin.denom.slice(4)]?.symbol
      : undefined
  )
  return `${formatTokenAmount(
    coin.amount,
    CLASSIC_DENOMS.lunc.coinDecimals,
    6
  )} ${symbol}`
}

const formatRewardSymbol = (
  denom: string,
  ibcSymbol?: string
) => {
  if (denom.startsWith("ibc/") && !ibcSymbol) {
    const hash = denom.slice(4)
    if (hash.length > 10) {
      return `IBC/${hash.slice(0, 4).toUpperCase()}…${hash.slice(-4).toUpperCase()}`
    }
    return `IBC/${hash.toUpperCase()}`
  }
  return getSymbol(denom, ibcSymbol)
}

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
  if (denom.startsWith("ibc/")) {
    return buildIbcAssetIconCandidates([icon], "/system/ibc.svg")
  }
  return buildClassicNativeIconCandidates({
    denom,
    symbol: denom === "uluna" ? "LUNC" : formatDenom(denom),
    primaryIcon: icon
  })
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
      style={{ borderRadius: "50%", objectFit: "cover", display: "block" }}
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
  const {
    account,
    connectorId,
    prepareWalletForTx,
    walletPreparingForTx,
    startTx,
    finishTx,
    failTx
  } = useWallet()
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
  const ibcDenoms = useMemo(
    () =>
      (rewardData?.rewards ?? [])
        .flatMap((item) => item.reward ?? [])
        .map((coin) => coin.denom)
        .filter((denom) => denom.startsWith("ibc/")),
    [rewardData?.rewards]
  )
  const { data: ibcWhitelist = {} } = useResolvedIbcWhitelist(ibcDenoms)

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
      if (a.amount !== b.amount) return a.amount > b.amount ? -1 : 1
      return a.index - b.index
    })

  const [feeDenom, setFeeDenom] = useState<string>(
    CLASSIC_DENOMS.lunc.coinMinimalDenom
  )
  const [feeOpen, setFeeOpen] = useState(false)
  const feeRef = useRef<HTMLDivElement | null>(null)
  const [fee, setFee] = useState("--")
  const [feeGas, setFeeGas] = useState(WITHDRAW_REWARDS_DEFAULT_FEE_GAS)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeError, setFeeError] = useState<string>()
  const [submitError, setSubmitError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!feeOpen) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (feeRef.current && !feeRef.current.contains(target)) {
        setFeeOpen(false)
      }
    }
    window.addEventListener("mousedown", handleClick)
    return () => window.removeEventListener("mousedown", handleClick)
  }, [feeOpen])

  useEffect(() => {
    if (!accountAddress || !selected.length) {
      setFee("--")
      setFeeGas(WITHDRAW_REWARDS_DEFAULT_FEE_GAS)
      setFeeLoading(false)
      setFeeError(undefined)
      return undefined
    }

    const gasWanted = getRewardsFallbackGas(selected.length)
    const feeMicro = Math.ceil(
      gasWanted * WITHDRAW_GAS_PRICE_MICRO_LUNC
    ).toString()
    const feeDisplay = formatTokenAmount(
      feeMicro,
      CLASSIC_DENOMS.lunc.coinDecimals,
      6
    )
    setFeeGas(gasWanted)
    setFee(feeDisplay === "--" ? "--" : feeDisplay)
    setFeeLoading(false)
    setFeeError(undefined)
    return undefined
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
      const walletReady = await prepareWalletForTx()
      if (!walletReady) {
        setSubmitError("Wallet is still syncing. Wait a moment, then submit again.")
        return
      }
      startTx("Withdraw rewards")
      if (!connectorId) throw new Error("Wallet not connected")
      const [
        {
          connectClassicStargateClientForConnector,
          getSignerAddressForConnector
        },
        { MsgWithdrawDelegatorReward }
      ] = await Promise.all([
        import("../../app/wallet/walletAdapters"),
        import("cosmjs-types/cosmos/distribution/v1beta1/tx")
      ])
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicStargateClientForConnector(
        connectorId,
        feeDenom
      )
      const msgs = selected.map((validator) => ({
        typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
        value: MsgWithdrawDelegatorReward.fromPartial({
          delegatorAddress: signerAddress,
          validatorAddress: validator
        })
      }))
      const fallbackGas = Math.max(feeGas, getRewardsFallbackGas(selected.length))
      let txGas = fallbackGas
      try {
        const simulatedGas = await client.simulate(signerAddress, msgs, "")
        txGas = Math.max(
          fallbackGas,
          Math.ceil(simulatedGas * WITHDRAW_SUBMIT_GAS_ADJUSTMENT)
        )
      } catch {
        txGas = Math.ceil(
          fallbackGas * WITHDRAW_SIMULATION_FALLBACK_GAS_MULTIPLIER
        )
      }
      const result = await client.signAndBroadcast(
        signerAddress,
        msgs,
        buildWithdrawTxFee(txGas, feeDenom)
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Transaction failed")
      }
      finishTx(result.transactionHash)
    } catch (err) {
      const message = formatTxError(err, "Submit failed")
      failTx(err)
      setSubmitError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell title="Withdraw rewards" backTo="/stake" backLabel="">
      <div className={styles.pageLayout}>
      <div className={`card ${styles.pageShellCard}`}>
        <div className={styles.pageCard}>
        {rewards.length ? (
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
        ) : null}

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

        {totalsList.length ? (
          <>
            <div className={styles.summaryDivider} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12 4a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5.01 5a1 1 0 0 1-1.4 0l-5.01-5a1 1 0 1 1 1.42-1.42L11 15.59V5a1 1 0 0 1 1-1z"
                />
              </svg>
            </div>

            <div className={styles.summaryGrid}>
              {totalsList.map(({ denom, amount }) => {
                const ibcToken =
                  denom.startsWith("ibc/")
                    ? ibcWhitelist?.[denom.slice(4)]
                    : undefined
                return (
                  <div key={denom} className={`card ${styles.summaryCard}`}>
                    <div className={styles.summaryHeader}>
                      <TokenIcon
                        symbol={getSymbol(
                          denom,
                          denom.startsWith("ibc/") ? ibcToken?.symbol : undefined
                        )}
                        candidates={buildIconCandidates(
                          denom,
                          denom.startsWith("ibc/")
                            ? ibcToken?.icon ?? "/system/ibc.svg"
                            : undefined
                        )}
                      />
                      <span className={styles.summarySymbol}>
                        {formatRewardSymbol(
                          denom,
                          denom.startsWith("ibc/") ? ibcToken?.symbol : undefined
                        )}
                      </span>
                    </div>
                    <div className={styles.summaryDividerLine} />
                    <div className={styles.summaryAmount}>
                      {formatTokenAmount(
                        amount.toString(),
                        CLASSIC_DENOMS.lunc.coinDecimals,
                        6
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : null}

        {rewards.length ? (
          <>
            <div className={`card ${styles.feeCard}`}>
              <div className={styles.feeRow}>
                <div className={styles.feeLeft} ref={feeRef}>
                  <span className={styles.feeLabel}>Fee</span>
                  <div className={styles.feeSelectWrap}>
                    <button
                      type="button"
                      className={styles.feeSelectButton}
                      onClick={() => setFeeOpen((prev) => !prev)}
                    >
                      {getSymbol(feeDenom)}
                      <span className={styles.feeCaret} aria-hidden="true" />
                    </button>
                    {feeOpen ? (
                      <div className={styles.feeDropdown}>
                        <button
                          type="button"
                          className={`${styles.feeOption} ${
                            feeDenom === CLASSIC_DENOMS.lunc.coinMinimalDenom
                              ? styles.feeOptionActive
                              : ""
                          }`}
                          onClick={() => {
                            setFeeDenom(CLASSIC_DENOMS.lunc.coinMinimalDenom)
                            setFeeOpen(false)
                          }}
                        >
                          LUNC
                        </button>
                        <button
                          type="button"
                          className={`${styles.feeOption} ${
                            feeDenom === CLASSIC_DENOMS.ustc.coinMinimalDenom
                              ? styles.feeOptionActive
                              : ""
                          }`}
                          onClick={() => {
                            setFeeDenom(CLASSIC_DENOMS.ustc.coinMinimalDenom)
                            setFeeOpen(false)
                          }}
                        >
                          USTC
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <span className={styles.feeValue}>
                  {feeLoading
                    ? "Estimating..."
                    : fee === "--"
                    ? "--"
                    : `${fee} ${getSymbol(feeDenom)}`}
                </span>
              </div>
              {feeError ? <div className={styles.feeError}>{feeError}</div> : null}
            </div>

            {submitError ? (
              <div className={styles.submitError}>{submitError}</div>
            ) : null}
            <button
              type="button"
              className={`${styles.submit} ${
                !accountAddress ||
                !selected.length ||
                submitting ||
                walletPreparingForTx
                  ? styles.disabled
                  : ""
              }`}
              disabled={
                !accountAddress ||
                !selected.length ||
                submitting ||
                walletPreparingForTx
              }
              onClick={submit}
            >
              {walletPreparingForTx
                ? "Preparing wallet..."
                : submitting
                ? "Submitting..."
                : "Submit"}
            </button>
          </>
        ) : null}
        </div>
      </div>
      </div>
    </PageShell>
  )
}

export default WithdrawRewards
