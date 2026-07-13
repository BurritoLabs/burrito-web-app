import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import PageShell from "../PageShell"
import styles from "../WithdrawCommission.module.css"
import { useWallet } from "../../app/wallet/WalletContext"
import { useAppChain } from "../../app/appChainContext"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../../app/chain"
import {
  fetchValidator,
  fetchValidatorCommission,
  type CoinBalance
} from "../../app/data/classic"
import { formatTokenAmount } from "../../app/utils/format"
import { buildClassicNativeIconCandidates, buildIbcAssetIconCandidates } from "../../app/utils/assetIcons"
import { convertBech32Prefix } from "../../app/utils/bech32"
import { formatTxError } from "../../app/utils/txError"
import {
  WITHDRAW_COMMISSION_DEFAULT_FEE_GAS,
  WITHDRAW_SIMULATION_FALLBACK_GAS_MULTIPLIER,
  WITHDRAW_SUBMIT_GAS_ADJUSTMENT,
  buildWithdrawTxFee
} from "../../app/stake/withdrawTx"

const toSymbol = (denom: string) => {
  if (denom === CLASSIC_DENOMS.lunc.coinMinimalDenom) {
    return CLASSIC_DENOMS.lunc.coinDenom
  }
  if (denom === CLASSIC_DENOMS.ustc.coinMinimalDenom) {
    return CLASSIC_DENOMS.ustc.coinDenom
  }
  if (denom.startsWith("u")) {
    const base = denom.slice(1)
    if (base.length === 3) {
      return `${base.slice(0, 2).toUpperCase()}TC`
    }
    return base.toUpperCase()
  }
  if (denom.startsWith("ibc/")) {
    return `IBC/${denom.slice(4, 8).toUpperCase()}`
  }
  return denom.toUpperCase()
}

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

const formatCommission = (coin: CoinBalance) => {
  const raw = String(coin.amount ?? "0").split(".")[0]
  return formatTokenAmount(raw || "0", CLASSIC_DENOMS.lunc.coinDecimals, 6)
}

const parseCoinAmount = (amount?: string) => {
  const raw = String(amount ?? "0").split(".")[0].trim()
  try {
    return BigInt(raw || "0")
  } catch {
    return 0n
  }
}

const buildIconCandidates = (denom: string) => {
  if (denom.startsWith("ibc/")) {
    return buildIbcAssetIconCandidates([], "/system/ibc.svg")
  }

  const classicSymbol = formatDenom(denom, true)
  return buildClassicNativeIconCandidates({
    denom,
    symbol: classicSymbol,
    fallback: "/system/cw20.svg"
  })
}

const TokenIconInner = ({
  symbol,
  candidates
}: {
  symbol: string
  candidates: string[]
}) => {
  const [index, setIndex] = useState(0)
  const src = candidates[index]
  const hasImage = Boolean(src)

  return (
    <span
      className={`${styles.commissionIcon} ${
        hasImage ? "" : styles.commissionIconFallback
      }`}
      aria-hidden
    >
      {hasImage ? (
        <img
          src={src}
          alt=""
          onError={() => {
            setIndex((value) => value + 1)
          }}
        />
      ) : (
        symbol.slice(0, 1)
      )}
    </span>
  )
}

const TokenIcon = ({
  symbol,
  candidates
}: {
  symbol: string
  candidates: string[]
}) => <TokenIconInner key={`${symbol}:${candidates.join("|")}`} symbol={symbol} candidates={candidates} />

const WithdrawCommission = () => {
  const {
    account,
    connectorId,
    prepareWalletForTx,
    walletPreparingForTx,
    startTx,
    finishTx,
    failTx
  } = useWallet()
  const { chain } = useAppChain()
  const gasPrice = chain.runtime.gasPriceStep.average
  const feeDenomOptions = chain.runtime.feeDenoms
  const [feeDenom, setFeeDenom] = useState<string>(chain.nativeDenom)
  const [feeOpen, setFeeOpen] = useState(false)
  const feeRef = useRef<HTMLDivElement | null>(null)
  const [fee, setFee] = useState("--")
  const [feeGas, setFeeGas] = useState(WITHDRAW_COMMISSION_DEFAULT_FEE_GAS)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeError, setFeeError] = useState<string>()
  const [submitError, setSubmitError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setFeeDenom(chain.nativeDenom)
  }, [chain.chainId, chain.nativeDenom])

  const valoperAddress = account?.address
    ? convertBech32Prefix(
        account.address,
        `${CLASSIC_CHAIN.bech32Prefix}valoper`
      )
    : null

  const { data: validator } = useQuery({
    queryKey: ["validator", chain.chainId, valoperAddress],
    queryFn: () => fetchValidator(valoperAddress ?? ""),
    enabled: Boolean(valoperAddress),
    staleTime: 60_000
  })

  const { data: commission = [] } = useQuery({
    queryKey: ["validatorCommission", chain.chainId, valoperAddress],
    queryFn: () => fetchValidatorCommission(valoperAddress ?? ""),
    enabled: Boolean(valoperAddress && validator),
    staleTime: 20_000
  })

  const commissionItems = useMemo(() => {
    return [...commission]
      .map((item, index) => ({
        ...item,
        amountValue: parseCoinAmount(item.amount),
        index
      }))
      .filter((item) => item.amountValue > 0n)
      .sort((a, b) => {
        if (a.amountValue === b.amountValue) return a.index - b.index
        return a.amountValue > b.amountValue ? -1 : 1
      })
  }, [commission])

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
    if (!account?.address || !valoperAddress || !validator) {
      setFee("--")
      setFeeGas(WITHDRAW_COMMISSION_DEFAULT_FEE_GAS)
      setFeeLoading(false)
      setFeeError(undefined)
      return undefined
    }

    const feeMicro = Math.ceil(
      WITHDRAW_COMMISSION_DEFAULT_FEE_GAS * gasPrice
    ).toString()
    const feeDisplay = formatTokenAmount(
      feeMicro,
      CLASSIC_DENOMS.lunc.coinDecimals,
      6
    )
    setFeeGas(WITHDRAW_COMMISSION_DEFAULT_FEE_GAS)
    setFee(feeDisplay === "--" ? "--" : feeDisplay)
    setFeeLoading(false)
    setFeeError(undefined)
    return undefined
  }, [account?.address, gasPrice, valoperAddress, validator])

  const submit = async () => {
    setSubmitError(undefined)
    if (!account?.address) {
      setSubmitError("Please connect a wallet.")
      return
    }
    if (!valoperAddress || !validator) {
      setSubmitError("Validator account not connected.")
      return
    }

    try {
      setSubmitting(true)
      const walletReady = await prepareWalletForTx()
      if (!walletReady) {
        setSubmitError("Wallet is still syncing. Wait a moment, then submit again.")
        return
      }
      startTx("Withdraw commission")
      if (!connectorId) throw new Error("Wallet not connected")
      const [
        {
          connectSigningClientForConnector,
          connectStargateClientForConnector,
          getSignerAddressForConnector
        },
        { MsgWithdrawValidatorCommission }
      ] = await Promise.all([
        import("../../app/wallet/walletAdapters"),
        import("cosmjs-types/cosmos/distribution/v1beta1/tx")
      ])
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const signerValoperAddress = convertBech32Prefix(
        signerAddress,
        `${CLASSIC_CHAIN.bech32Prefix}valoper`
      )
      if (!signerValoperAddress) {
        throw new Error("Validator account not connected.")
      }
      const client =
        connectorId === "keplr-mobile"
          ? await connectSigningClientForConnector(connectorId)
          : await connectStargateClientForConnector(connectorId, feeDenom)
      const msg = {
        typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission",
        value: MsgWithdrawValidatorCommission.fromPartial({
          validatorAddress: signerValoperAddress
        })
      }
      const fallbackGas = Math.max(
        feeGas,
        WITHDRAW_COMMISSION_DEFAULT_FEE_GAS
      )
      let txGas = fallbackGas
      try {
        const simulatedGas = await client.simulate(signerAddress, [msg], "")
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
        [msg],
        buildWithdrawTxFee(txGas, feeDenom, gasPrice)
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Transaction failed")
      }
      finishTx(result.transactionHash)
    } catch (error) {
      const message = formatTxError(error, "Broadcast failed")
      setSubmitError(message)
      failTx(error)
    } finally {
      setSubmitting(false)
    }
  }

  const moniker = validator?.description?.moniker?.trim() || "Validator"
  const feeSymbol = toSymbol(feeDenom)

  return (
    <PageShell title="Withdraw commission" backTo="/stake" backLabel="">
      <div className={styles.pageLayout}>
      <div className={`card ${styles.pageShellCard}`}>
        <div className={styles.pageCard}>
        {!account?.address ? (
          <div className={styles.emptyState}>Connect wallet to continue.</div>
        ) : !validator || !valoperAddress ? (
          <div className={styles.emptyState}>Validator account not connected.</div>
        ) : (
          <>
            <div className={styles.header}>
              <div className={styles.moniker}>{moniker}</div>
              <div className={styles.valoper}>{valoperAddress}</div>
            </div>

            <div className={styles.sectionTitle}>Available commission</div>
            <div className={styles.commissionList}>
              {commissionItems.length ? (
                commissionItems.map((coin) => (
                  <div className={styles.commissionRow} key={coin.denom}>
                    <div className={styles.commissionLeft}>
                      <TokenIcon
                        symbol={toSymbol(coin.denom)}
                        candidates={buildIconCandidates(coin.denom)}
                      />
                      <span>{toSymbol(coin.denom)}</span>
                    </div>
                    <strong>{formatCommission(coin)}</strong>
                  </div>
                ))
              ) : (
                <div className={styles.emptyState}>No commission available.</div>
              )}
            </div>

            {commissionItems.length ? (
              <>
                <div className={styles.feeCard}>
                  <div className={styles.feeRow}>
                    <div className={styles.feeLeft}>
                      <span className={styles.feeLabel}>Fee</span>
                      <div className={styles.feeSelectWrap} ref={feeRef}>
                        <button
                          type="button"
                          className={styles.feeSelectButton}
                          onClick={() => setFeeOpen((open) => !open)}
                          disabled={feeLoading}
                        >
                          <span>{feeSymbol}</span>
                          <span className={styles.feeCaret} />
                        </button>
                        {feeOpen ? (
                          <div className={styles.feeDropdown}>
                            {feeDenomOptions.map((denom) => (
                              <button
                                key={denom.coinMinimalDenom}
                                type="button"
                                className={`${styles.feeOption} ${
                                  denom.coinMinimalDenom === feeDenom
                                    ? styles.feeOptionActive
                                    : ""
                                }`}
                                onClick={() => {
                                  setFeeDenom(denom.coinMinimalDenom)
                                  setFeeOpen(false)
                                }}
                              >
                                {denom.coinDenom}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.feeValue}>
                      {feeLoading ? "Estimating..." : `${fee} ${feeSymbol}`}
                    </div>
                  </div>
                  {feeError ? <div className={styles.feeError}>{feeError}</div> : null}
                </div>

                <button
                  type="button"
                  className={styles.submit}
                  disabled={submitting || walletPreparingForTx}
                  onClick={submit}
                >
                  {walletPreparingForTx
                    ? "Preparing wallet..."
                    : submitting
                    ? "Submitting..."
                    : "Submit"}
                </button>
                {submitError ? (
                  <div className={styles.submitError}>{submitError}</div>
                ) : null}
              </>
            ) : null}
          </>
        )}
        </div>
      </div>
      </div>
    </PageShell>
  )
}

export default WithdrawCommission
