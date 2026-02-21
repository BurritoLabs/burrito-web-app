import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { SigningStargateClient, GasPrice } from "@cosmjs/stargate"
import { MsgWithdrawValidatorCommission } from "cosmjs-types/cosmos/distribution/v1beta1/tx"
import PageShell from "./PageShell"
import styles from "./WithdrawCommission.module.css"
import { useWallet } from "../app/wallet/WalletProvider"
import {
  CLASSIC_CHAIN,
  CLASSIC_DENOMS,
  KEPLR_CHAIN_CONFIG
} from "../app/chain"
import {
  fetchValidator,
  fetchValidatorCommission,
  type CoinBalance
} from "../app/data/classic"
import { formatTokenAmount } from "../app/utils/format"
import { convertBech32Prefix } from "../app/utils/bech32"

const FEE_DENOM_OPTIONS = [
  CLASSIC_DENOMS.lunc.coinMinimalDenom,
  CLASSIC_DENOMS.ustc.coinMinimalDenom
] as const
const ASSET_URL = "https://assets.terra.dev"

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
    return ["/system/ibc.svg"]
  }

  const classicSymbol = formatDenom(denom, true)
  const isClassicStable = classicSymbol.endsWith("TC")
  const iconDenom = denom === "uluna" ? "LUNC" : formatDenom(denom, false)
  const upper = iconDenom.toUpperCase()
  const lower = iconDenom.toLowerCase()

  return [
    `${ASSET_URL}/icon/60/${iconDenom}.png`,
    `${ASSET_URL}/icon/svg/${iconDenom}.svg`,
    `${ASSET_URL}/icon/60/${upper}.png`,
    `${ASSET_URL}/icon/svg/${upper}.svg`,
    `${ASSET_URL}/icon/60/${lower}.png`,
    ...(iconDenom === "LUNA"
      ? [`${ASSET_URL}/icon/svg/Luna.svg`, `${ASSET_URL}/icon/60/Luna.png`]
      : []),
    ...(isClassicStable
      ? [
          `${ASSET_URL}/icon/svg/USTC.svg`,
          `${ASSET_URL}/icon/60/USTC.png`,
          `${ASSET_URL}/icon/60/ustc.png`
        ]
      : []),
    ...(upper === "LUNC" ? ["/system/lunc.svg"] : []),
    ...(upper === "USTC" ? ["/system/ustc.png"] : []),
    "/system/cw20.svg"
  ]
}

const TokenIcon = ({
  symbol,
  candidates
}: {
  symbol: string
  candidates: string[]
}) => {
  const [index, setIndex] = useState(0)
  const candidateKey = candidates.join("|")

  useEffect(() => {
    setIndex(0)
  }, [symbol, candidateKey])

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

const WithdrawCommission = () => {
  const { account, startTx, finishTx, failTx } = useWallet()
  const [feeDenom, setFeeDenom] = useState<(typeof FEE_DENOM_OPTIONS)[number]>(
    CLASSIC_DENOMS.lunc.coinMinimalDenom
  )
  const [feeOpen, setFeeOpen] = useState(false)
  const feeRef = useRef<HTMLDivElement | null>(null)
  const [fee, setFee] = useState("--")
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeError, setFeeError] = useState<string>()
  const [submitError, setSubmitError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  const valoperAddress = useMemo(() => {
    if (!account?.address) return null
    return convertBech32Prefix(
      account.address,
      `${CLASSIC_CHAIN.bech32Prefix}valoper`
    )
  }, [account?.address])

  const { data: validator } = useQuery({
    queryKey: ["validator", valoperAddress],
    queryFn: () => fetchValidator(valoperAddress ?? ""),
    enabled: Boolean(valoperAddress),
    staleTime: 60_000
  })

  const { data: commission = [] } = useQuery({
    queryKey: ["validatorCommission", valoperAddress],
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
    let cancelled = false
    let timer: number | undefined
    if (!account?.address || !valoperAddress || !validator) {
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
        const msg = {
          typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission",
          value: MsgWithdrawValidatorCommission.fromPartial({
            validatorAddress: valoperAddress
          })
        }
        const gasPrice = GasPrice.fromString(`28.325${feeDenom}`)
        const client = await SigningStargateClient.connectWithSigner(
          CLASSIC_CHAIN.rpc,
          signer,
          { gasPrice }
        )
        const gasUsed = await client.simulate(account.address, [msg], "")
        const gasPriceAmount = Number(gasPrice.amount.toString())
        const feeMicro = Math.ceil(gasUsed * gasPriceAmount).toString()
        const feeDisplay = formatTokenAmount(
          feeMicro,
          CLASSIC_DENOMS.lunc.coinDecimals,
          6
        )
        if (!cancelled) {
          setFee(feeDisplay === "--" ? "--" : feeDisplay)
        }
      } catch (error) {
        if (!cancelled) {
          setFee("--")
          setFeeError(
            error instanceof Error ? error.message : "Fee estimation failed"
          )
        }
      } finally {
        if (!cancelled) setFeeLoading(false)
      }
    }, 350)

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [account?.address, valoperAddress, validator, feeDenom])

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
      startTx("Withdraw commission")
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
        { gasPrice: GasPrice.fromString(`28.325${feeDenom}`) }
      )
      const msg = {
        typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission",
        value: MsgWithdrawValidatorCommission.fromPartial({
          validatorAddress: valoperAddress
        })
      }
      const result = await client.signAndBroadcast(account.address, [msg], "auto")
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Transaction failed")
      }
      finishTx((result as any).transactionHash ?? (result as any).txhash)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Broadcast failed"
      setSubmitError(message)
      failTx(message)
    } finally {
      setSubmitting(false)
    }
  }

  const moniker = validator?.description?.moniker?.trim() || "Validator"
  const feeSymbol = toSymbol(feeDenom)

  return (
    <PageShell title="Withdraw commission" small backTo="/stake" backLabel="">
      <div className={`card ${styles.pageCard}`}>
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
                        {FEE_DENOM_OPTIONS.map((denom) => (
                          <button
                            key={denom}
                            type="button"
                            className={`${styles.feeOption} ${
                              denom === feeDenom ? styles.feeOptionActive : ""
                            }`}
                            onClick={() => {
                              setFeeDenom(denom)
                              setFeeOpen(false)
                            }}
                          >
                            {toSymbol(denom)}
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
              disabled={submitting}
              onClick={submit}
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
            {submitError ? (
              <div className={styles.submitError}>{submitError}</div>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  )
}

export default WithdrawCommission
