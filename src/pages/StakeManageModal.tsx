import { useEffect, useMemo, useRef, useState } from "react"
import {
  MsgDelegate,
  MsgBeginRedelegate,
  MsgUndelegate
} from "cosmjs-types/cosmos/staking/v1beta1/tx"
import { useWallet } from "../app/wallet/WalletContext"
import styles from "./StakeManageModal.module.css"
import { CLASSIC_DENOMS } from "../app/chain"
import {
  connectClassicStargateClientForConnector,
  getSignerAddressForConnector
} from "../app/wallet/walletAdapters"
import { formatTokenAmount } from "../app/utils/format"

type DelegationItem = {
  validator: string
  moniker: string
  amount: bigint
}

type StakeManageModalProps = {
  open: boolean
  onClose: () => void
  delegations: DelegationItem[]
  active: DelegationItem | null
  available: bigint
}

const toMicroAmount = (value: string) => {
  const cleaned = value.replace(/,/g, "").trim()
  const num = Number(cleaned)
  if (!Number.isFinite(num) || num <= 0) return "0"
  return Math.floor(num * 1_000_000).toString()
}

const GAS_PRICE_MICRO_LUNC = 28.325

const FALLBACK_GAS_BY_TAB = {
  Delegate: 500_000,
  Redelegate: 560_000,
  Undelegate: 500_000
} as const

const GAS_ADJUSTMENT = 1.2
const MAX_DELEGATE_BUFFER_MICRO = 2_000_000n

const estimateFallbackFeeMicro = (
  tab: "Delegate" | "Redelegate" | "Undelegate"
) => {
  const gas = FALLBACK_GAS_BY_TAB[tab]
  return BigInt(Math.ceil(gas * GAS_PRICE_MICRO_LUNC))
}

const StakeManageModal = ({
  open,
  onClose,
  delegations,
  active,
  available
}: StakeManageModalProps) => {
  const { account, connectorId, startTx, finishTx, failTx } = useWallet()
  const accountAddress = account?.address
  const [tab, setTab] = useState<"Delegate" | "Redelegate" | "Undelegate">(
    "Delegate"
  )
  const [amount, setAmount] = useState("")
  const [source, setSource] = useState<string>("")
  const [sourceOpen, setSourceOpen] = useState(false)
  const sourceRef = useRef<HTMLDivElement | null>(null)
  const [fee, setFee] = useState("--")
  const [feeMicro, setFeeMicro] = useState<bigint>(0n)
  const [gasWanted, setGasWanted] = useState<number>(FALLBACK_GAS_BY_TAB.Delegate)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeError, setFeeError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string>()

  useEffect(() => {
    if (!open) return
    setTab("Delegate")
    setAmount("")
    setSource(active?.validator ?? delegations[0]?.validator ?? "")
    setSubmitError(undefined)
  }, [open, active, delegations])

  const activeValidator = useMemo(() => {
    if (!active) return undefined
    return delegations.find((item) => item.validator === active.validator) ?? active
  }, [active, delegations])

  const hasDelegation = (activeValidator?.amount ?? 0n) > 0n

  const sourceValidator = useMemo(() => {
    if (tab !== "Redelegate") return undefined
    return delegations.find((item) => item.validator === source)
  }, [delegations, source, tab])

  const redelegateOptions = useMemo(() => {
    if (tab !== "Redelegate") return []
    return delegations.filter(
      (item) => item.validator !== activeValidator?.validator
    )
  }, [delegations, activeValidator?.validator, tab])

  useEffect(() => {
    if (tab !== "Redelegate") {
      setSourceOpen(false)
      return
    }
    if (redelegateOptions.length === 0) {
      setSource("")
      setSourceOpen(false)
      return
    }
    if (!redelegateOptions.some((item) => item.validator === source)) {
      setSource(redelegateOptions[0].validator)
    }
  }, [redelegateOptions, source, tab])

  useEffect(() => {
    if (!sourceOpen) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (sourceRef.current && !sourceRef.current.contains(target)) {
        setSourceOpen(false)
      }
    }
    window.addEventListener("mousedown", handleClick)
    return () => window.removeEventListener("mousedown", handleClick)
  }, [sourceOpen])

  const availableAmount = useMemo(() => {
    if (tab === "Delegate") return available
    if (tab === "Redelegate") return sourceValidator?.amount ?? 0n
    return activeValidator?.amount ?? 0n
  }, [activeValidator?.amount, available, sourceValidator?.amount, tab])

  const amountMicroValue = useMemo(() => BigInt(toMicroAmount(amount)), [amount])
  const effectiveFeeMicro = useMemo(
    () => (feeMicro > 0n ? feeMicro : estimateFallbackFeeMicro(tab)),
    [feeMicro, tab]
  )
  const maxDelegateReserveMicro = effectiveFeeMicro + MAX_DELEGATE_BUFFER_MICRO
  const maxAmount = useMemo(() => {
    if (tab !== "Delegate") return availableAmount
    return available > maxDelegateReserveMicro
      ? available - maxDelegateReserveMicro
      : 0n
  }, [available, availableAmount, maxDelegateReserveMicro, tab])
  const amountWarning = useMemo(() => {
    if (amountMicroValue <= 0n) return undefined
    if (amountMicroValue > availableAmount) {
      return `Amount exceeds available ${tab === "Delegate" ? "wallet balance" : "stake"}.`
    }
    const requiredLunc =
      tab === "Delegate" ? amountMicroValue + effectiveFeeMicro : effectiveFeeMicro
    if (requiredLunc > available) {
      return tab === "Delegate"
        ? "Insufficient funds after network fee. Use Max or reduce the amount."
        : "Insufficient LUNC for network fee."
    }
    return undefined
  }, [amountMicroValue, available, availableAmount, effectiveFeeMicro, tab])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    if (!accountAddress) {
      setFee("--")
      setFeeMicro(0n)
      setFeeError(undefined)
      return undefined
    }

    const microAmount = toMicroAmount(amount)
    const validator = activeValidator?.validator
    const sourceValidatorAddress = source
    if (!validator || microAmount === "0") {
      setFee("--")
      setFeeMicro(0n)
      setFeeError(undefined)
      return undefined
    }

    if (tab === "Redelegate" && !sourceValidatorAddress) {
      setFee("--")
      setFeeMicro(0n)
      setFeeError(undefined)
      return undefined
    }

    const timer = window.setTimeout(async () => {
      setFeeLoading(true)
      setFeeError(undefined)
      const fallbackFeeMicro = estimateFallbackFeeMicro(tab)
      const fallbackFee = formatTokenAmount(
        fallbackFeeMicro.toString(),
        CLASSIC_DENOMS.lunc.coinDecimals,
        6
      )
      if (!cancelled) {
        setGasWanted(FALLBACK_GAS_BY_TAB[tab])
        setFee(fallbackFee === "--" ? "--" : fallbackFee)
        setFeeMicro(fallbackFeeMicro)
      }
      try {
        if (!connectorId) throw new Error("Wallet not connected")
        const signerAddress = await getSignerAddressForConnector(connectorId)
        const client = await connectClassicStargateClientForConnector(connectorId)

        const msg =
          tab === "Redelegate"
            ? {
                typeUrl: "/cosmos.staking.v1beta1.MsgBeginRedelegate",
                value: MsgBeginRedelegate.fromPartial({
                  delegatorAddress: signerAddress,
                  validatorSrcAddress: sourceValidatorAddress,
                  validatorDstAddress: validator,
                  amount: {
                    denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
                    amount: microAmount
                  }
                })
              }
            : tab === "Undelegate"
            ? {
                typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate",
                value: MsgUndelegate.fromPartial({
                  delegatorAddress: signerAddress,
                  validatorAddress: validator,
                  amount: {
                    denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
                    amount: microAmount
                  }
                })
              }
            : {
                typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
                value: MsgDelegate.fromPartial({
                  delegatorAddress: signerAddress,
                  validatorAddress: validator,
                  amount: {
                    denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
                    amount: microAmount
                  }
                })
              }

        const gasUsed = await client.simulate(signerAddress, [msg], "")
        const nextGasWanted = Math.max(
          FALLBACK_GAS_BY_TAB[tab],
          Math.ceil(gasUsed * GAS_ADJUSTMENT)
        )
        const feeMicro = Math.ceil(nextGasWanted * GAS_PRICE_MICRO_LUNC).toString()
        const feeDisplay = formatTokenAmount(
          feeMicro,
          CLASSIC_DENOMS.lunc.coinDecimals,
          6
        )
        if (!cancelled) {
          setGasWanted(nextGasWanted)
          setFee(feeDisplay === "--" ? "--" : feeDisplay)
          setFeeMicro(BigInt(feeMicro))
        }
      } catch {
        if (!cancelled) {
          // Keep fallback fee when simulation fails to avoid blank fee UI.
          setGasWanted(FALLBACK_GAS_BY_TAB[tab])
          setFeeError(undefined)
        }
      } finally {
        if (!cancelled) setFeeLoading(false)
      }
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    accountAddress,
    activeValidator?.validator,
    amount,
    connectorId,
    open,
    source,
    tab
  ])

  const balanceAfter = useMemo(() => {
    const spend =
      amountMicroValue > 0n
        ? tab === "Delegate"
          ? amountMicroValue + effectiveFeeMicro
          : effectiveFeeMicro
        : 0n
    if (available <= spend) return 0n
    return available - spend
  }, [amountMicroValue, available, effectiveFeeMicro, tab])

  const submit = async () => {
    if (!accountAddress) {
      setSubmitError("Please connect a wallet.")
      return
    }
    const validator = activeValidator?.validator
    if (!validator) {
      setSubmitError("Validator not selected.")
      return
    }
    const microAmount = toMicroAmount(amount)
    if (microAmount === "0") {
      setSubmitError("Enter amount.")
      return
    }
    const microAmountValue = BigInt(microAmount)
    if (microAmountValue > availableAmount) {
      setSubmitError(
        `Amount exceeds available ${tab === "Delegate" ? "wallet balance" : "stake"}.`
      )
      return
    }
    const txFeeMicro = feeMicro > 0n ? feeMicro : estimateFallbackFeeMicro(tab)
    const txGasWanted = feeMicro > 0n ? gasWanted : FALLBACK_GAS_BY_TAB[tab]
    const requiredLunc =
      tab === "Delegate" ? microAmountValue + txFeeMicro : txFeeMicro
    if (requiredLunc > available) {
      setSubmitError(
        tab === "Delegate"
          ? "Insufficient funds after network fee. Use Max or reduce the amount."
          : "Insufficient LUNC for network fee."
      )
      return
    }
    if (tab === "Redelegate" && !source) {
      setSubmitError("Select source validator.")
      return
    }
    try {
      setSubmitting(true)
      setSubmitError(undefined)
      startTx(`${tab} stake`)
      if (!connectorId) throw new Error("Wallet not connected")
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicStargateClientForConnector(connectorId)

      const msg =
        tab === "Redelegate"
          ? {
              typeUrl: "/cosmos.staking.v1beta1.MsgBeginRedelegate",
              value: MsgBeginRedelegate.fromPartial({
                delegatorAddress: signerAddress,
                validatorSrcAddress: source,
                validatorDstAddress: validator,
                amount: {
                  denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
                  amount: microAmount
                }
              })
            }
          : tab === "Undelegate"
          ? {
              typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate",
              value: MsgUndelegate.fromPartial({
                delegatorAddress: signerAddress,
                validatorAddress: validator,
                amount: {
                  denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
                  amount: microAmount
                }
              })
            }
          : {
              typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
              value: MsgDelegate.fromPartial({
                delegatorAddress: signerAddress,
                validatorAddress: validator,
                amount: {
                  denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
                  amount: microAmount
                }
              })
            }

      const result = await client.signAndBroadcast(signerAddress, [msg], {
        amount: [
          {
            amount: txFeeMicro.toString(),
            denom: CLASSIC_DENOMS.lunc.coinMinimalDenom
          }
        ],
        gas: String(txGasWanted)
      })
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Transaction failed")
      }
      finishTx(result.transactionHash)
      onClose()
    } catch (err) {
      failTx(err instanceof Error ? err.message : "Transaction failed")
      setSubmitError(
        err instanceof Error ? err.message : "Transaction failed"
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Manage stake</div>
          <button className={styles.close} type="button" onClick={onClose}>
            <span />
            <span />
          </button>
        </div>

        <div className={styles.tabs}>
          {(["Delegate", "Redelegate", "Undelegate"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`${styles.tabButton} ${
                tab === item ? styles.tabActive : ""
              } ${item === "Undelegate" && !hasDelegation ? styles.tabDisabled : ""}`}
              onClick={() => setTab(item)}
              disabled={item === "Undelegate" && !hasDelegation}
            >
              {item}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {tab === "Redelegate" ? (
            <div className={styles.field}>
              <label>From validator</label>
              <div className={styles.dropdown} ref={sourceRef}>
                <button
                  type="button"
                  className={`${styles.dropdownButton} ${
                    redelegateOptions.length === 0 ? styles.dropdownDisabled : ""
                  }`}
                  onClick={() => {
                    if (redelegateOptions.length === 0) return
                    setSourceOpen((prev) => !prev)
                  }}
                  disabled={redelegateOptions.length === 0}
                >
                  <span className={styles.dropdownLabel}>
                    {redelegateOptions.find(
                      (item) => item.validator === source
                    )?.moniker ?? "No other validators"}
                  </span>
                  <span className={styles.dropdownCaret} aria-hidden="true" />
                </button>
                {sourceOpen ? (
                  <div className={styles.dropdownMenu}>
                    {redelegateOptions.map((item) => (
                      <button
                        key={item.validator}
                        type="button"
                        className={`${styles.dropdownOption} ${
                          item.validator === source
                            ? styles.dropdownOptionActive
                            : ""
                        }`}
                        onClick={() => {
                          setSource(item.validator)
                          setSourceOpen(false)
                        }}
                      >
                        {item.moniker}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className={styles.field}>
            <label>Validator</label>
            <div className={styles.readonly}>
              {activeValidator?.moniker ?? active?.validator ?? "--"}
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label>Amount</label>
              <button
                type="button"
                className={styles.maxButton}
                onClick={() => {
                  setAmount(
                    formatTokenAmount(
                      maxAmount.toString(),
                      CLASSIC_DENOMS.lunc.coinDecimals,
                      6
                    ).replace(/,/g, "")
                  )
                }}
              >
                Max
              </button>
            </div>
            <div className={styles.amountRow}>
              <input
                placeholder="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <span className={styles.amountDenom}>LUNC</span>
            </div>
            <div className={styles.amountHint}>
              {tab === "Delegate" ? "Max delegate: " : "Available: "}
              {`${formatTokenAmount(
                maxAmount.toString(),
                CLASSIC_DENOMS.lunc.coinDecimals,
                2
              )} LUNC`}
              {tab === "Delegate" ? (
                <span>
                  Fee reserve:{" "}
                  {formatTokenAmount(
                    maxDelegateReserveMicro.toString(),
                    CLASSIC_DENOMS.lunc.coinDecimals,
                    2
                  )}{" "}
                  LUNC
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.feeRow}>
            <span>Fee</span>
            <span>
              {feeLoading ? "..." : fee === "--" ? "--" : `${fee} LUNC`}
            </span>
          </div>
          <div className={styles.balanceRow}>
            <span>Balance</span>
            <span>
              {formatTokenAmount(
                available.toString(),
                CLASSIC_DENOMS.lunc.coinDecimals,
                2
              )}{" "}
              LUNC
            </span>
          </div>
          <div className={styles.balanceRow}>
            <span>Balance after tx</span>
            <span>
              {formatTokenAmount(
                balanceAfter.toString(),
                CLASSIC_DENOMS.lunc.coinDecimals,
                2
              )}{" "}
              LUNC
            </span>
          </div>
          {feeError ? <div className={styles.feeError}>{feeError}</div> : null}
          {amountWarning ? (
            <div className={styles.feeError}>{amountWarning}</div>
          ) : null}
          {submitError ? (
            <div className={styles.feeError}>{submitError}</div>
          ) : null}
          <button
            className={styles.submit}
            type="button"
            onClick={submit}
            disabled={submitting || Boolean(amountWarning)}
          >
            {submitting ? "Submitting..." : tab}
          </button>
        </div>
      </div>
    </div>
  )
}

export default StakeManageModal
