import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toBase64, toUtf8 } from "@cosmjs/encoding"
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../../app/chain"
import {
  DEFAULT_SLIPPAGE_BPS,
  GAS_PRICE_MICRO_LUNC,
  SLIPPAGE_OPTIONS,
} from "../../app/config/swapConfig"
import { fetchBalances, queryContractSmart } from "../../app/data/classic"
import { fetchCw20Balance } from "../../app/data/cw20"
import type { MarketBondingSnapshot } from "../../app/data/market"
import {
  formatBaseUnitsToTokenAmount,
  parseTokenAmountToBaseUnits,
} from "../../app/launchpad/cw20"
import {
  isTxAlreadyInCacheError,
  parseSequenceMismatchExpected,
} from "../../app/tx/txDiagnostics"
import {
  buildClassicNativeIconCandidates,
  buildCw20IconCandidates,
} from "../../app/utils/assetIcons"
import { truncateHash } from "../../app/utils/format"
import { formatTxError } from "../../app/utils/txError"
import { useWallet } from "../../app/wallet/WalletContext"
import { getClassicTxHash } from "../../app/wallet/signingClient"
import type { ClassicStargateClient } from "../../app/wallet/walletAdapters"
import {
  connectClassicSigningClientForConnector,
  getSignerAddressForConnector,
} from "../../app/wallet/walletAdapters"
import swapStyles from "../Swap.module.css"
import SwapAssetIcon from "../components/swap/SwapAssetIcon"

type BondingAsset = {
  decimals: number
  iconCandidates?: string[]
  id: string
  name?: string
  symbol: string
}

type ParsedBondingAsset = BondingAsset &
  (
    | {
        contract: string
        type: "cw20"
      }
    | {
        denom: string
        type: "native"
      }
  )

type BondingCurveSwapPanelProps = {
  assets: BondingAsset[]
  bonding?: MarketBondingSnapshot
  dexId: string
  dexLabel: string
  pairAddress: string
}

type TradeMode = "buy" | "sell"

type TerraPumpConfig = {
  contract_factory?: string
  status?: string
  token?: string
}

type TerraPumpInfo = {
  native_denom?: string
  status?: string
  token_address?: string
}

type TerraPumpSimulateResponse = {
  amount_in?: string
  amount_out?: string
  message?: string
  swap_fee?: {
    amount?: string
    denom?: string
  }
}

type LuncPumpAmountOutResponse = {
  amount?: string
}

type TxMessage = Parameters<ClassicStargateClient["simulate"]>[1][number]

const LUNCPUMP_FACTORY =
  "terra1szpen6r7eqstv3qlyvgzkx9d54gzl03a70asdctnp2uz8wqzaymsrpq8ag"
const EMPTY_ICON_CANDIDATES: string[] = []
const BONDING_SWAP_MEMO = "Burrito bonding swap"
const FALLBACK_BONDING_BUY_GAS = 420_000
const FALLBACK_BONDING_SELL_GAS = 520_000
const BONDING_BROADCAST_TIMEOUT_MS = 60_000
const BONDING_BROADCAST_POLL_INTERVAL_MS = 2_000

const parseBondingAsset = (
  asset: BondingAsset | undefined,
): ParsedBondingAsset | undefined => {
  if (!asset?.id) return undefined
  if (asset.id.startsWith("cw20:")) {
    const contract = asset.id.slice("cw20:".length).toLowerCase()
    if (!contract) return undefined
    return { ...asset, contract, id: `cw20:${contract}`, type: "cw20" }
  }
  if (asset.id.startsWith("native:")) {
    const denom = asset.id.slice("native:".length)
    if (!denom) return undefined
    return { ...asset, denom, id: `native:${denom}`, type: "native" }
  }
  return undefined
}

const buildIconCandidates = (asset: ParsedBondingAsset | undefined) => {
  if (!asset) return EMPTY_ICON_CANDIDATES
  if (asset.iconCandidates?.length) return asset.iconCandidates
  if (asset.type === "native") {
    return buildClassicNativeIconCandidates({
      denom: asset.denom,
      symbol: asset.symbol,
    })
  }
  return buildCw20IconCandidates(undefined, asset.symbol)
}

const normalizeStatus = (value: string | undefined) =>
  (value ?? "").replace(/_/g, "").toLowerCase()

const parseBaseUnits = (value: string | undefined) => {
  if (!value || !/^\d+$/.test(value)) return 0n
  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

const applySlippageBps = (amount: string | undefined, bps: bigint) => {
  const base = parseBaseUnits(amount)
  if (base <= 0n) return "0"
  const multiplier = 10_000n - bps
  if (multiplier <= 0n) return "0"
  return ((base * multiplier) / 10_000n).toString()
}

const encodeJsonBytes = (value: unknown) => toUtf8(JSON.stringify(value))
const encodeHookMsg = (value: unknown) =>
  toBase64(toUtf8(JSON.stringify(value)))

const buildFee = (gasLimit: number) => ({
  amount: [
    {
      amount: Math.max(
        1,
        Math.ceil(gasLimit * GAS_PRICE_MICRO_LUNC),
      ).toString(),
      denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
    },
  ],
  gas: String(gasLimit),
})

const estimateFee = async ({
  client,
  fallbackGas,
  messages,
  signerAddress,
}: {
  client: ClassicStargateClient
  fallbackGas: number
  messages: readonly TxMessage[]
  signerAddress: string
}) => {
  let gasLimit = fallbackGas
  try {
    const simulatedGas = await client.simulate(
      signerAddress,
      messages,
      BONDING_SWAP_MEMO,
    )
    gasLimit = Math.max(fallbackGas, Math.ceil(simulatedGas * 1.45))
  } catch {
    gasLimit = Math.ceil(fallbackGas * 1.15)
  }

  return buildFee(gasLimit)
}

const signAndBroadcastFast = async ({
  client,
  fallbackGas,
  messages,
  signerAddress,
}: {
  client: ClassicStargateClient
  fallbackGas: number
  messages: readonly TxMessage[]
  signerAddress: string
}) => {
  let sequenceHint: number | undefined

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const fee = await estimateFee({
        client,
        fallbackGas,
        messages,
        signerAddress,
      })
      const signerState = await client.getSequence(signerAddress)
      const signed = await client.sign(
        signerAddress,
        messages,
        fee,
        BONDING_SWAP_MEMO,
        {
          accountNumber: signerState.accountNumber,
          sequence: sequenceHint ?? signerState.sequence,
          chainId: CLASSIC_CHAIN.chainId,
        },
      )
      const txBytes = TxRaw.encode(signed).finish()
      const result = await client.broadcastTx(
        txBytes,
        BONDING_BROADCAST_TIMEOUT_MS,
        BONDING_BROADCAST_POLL_INTERVAL_MS,
      ).catch((broadcastError) => {
        if (isTxAlreadyInCacheError(broadcastError)) {
          return {
            code: 0,
            rawLog: "Transaction already exists in cache",
            transactionHash: getClassicTxHash(txBytes),
          }
        }
        throw broadcastError
      })
      if (result.code !== 0) {
        throw new Error(
          result.rawLog || `Bonding swap failed with code ${result.code}`,
        )
      }
      if (!result.transactionHash) throw new Error("Bonding swap broadcast failed")
      return result.transactionHash
    } catch (error) {
      const expectedSequence = parseSequenceMismatchExpected(
        error instanceof Error ? error.message : String(error),
      )
      if (expectedSequence === undefined || attempt === 2) {
        throw error
      }
      sequenceHint = expectedSequence
    }
  }

  throw new Error("Bonding swap broadcast failed")
}

const formatBalance = (amount: string | undefined, decimals: number) =>
  amount ? formatBaseUnitsToTokenAmount(amount, decimals, 6) : "0"

const toInputAmount = (amount: string, decimals: number) =>
  amount !== "0"
    ? formatBaseUnitsToTokenAmount(amount, decimals, decimals).replace(/,/g, "")
    : ""

const getAmountClass = (value: string) => {
  const length = value.replace(/[^\d]/g, "").length
  if (length >= 15)
    return `${swapStyles.amountInput} ${swapStyles.amountInputTiny}`
  if (length >= 10)
    return `${swapStyles.amountInput} ${swapStyles.amountInputCompact}`
  return swapStyles.amountInput
}

const getReadonlyAmountClass = (value: string) => {
  const length = value.replace(/[^\d]/g, "").length
  if (length >= 13)
    return `${swapStyles.readonlyAmount} ${swapStyles.readonlyAmountTiny}`
  if (length >= 9)
    return `${swapStyles.readonlyAmount} ${swapStyles.readonlyAmountCompact}`
  return swapStyles.readonlyAmount
}

const BondingCurveSwapPanel = ({
  assets,
  bonding,
  dexId,
  dexLabel,
  pairAddress,
}: BondingCurveSwapPanelProps) => {
  const { account, connectorId, failTx, finishTx, startTx } = useWallet()
  const queryClient = useQueryClient()
  const [tradeMode, setTradeMode] = useState<TradeMode>("buy")
  const [amount, setAmount] = useState("")
  const [slippageBps, setSlippageBps] = useState<bigint>(DEFAULT_SLIPPAGE_BPS)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string>()
  const [quoteAmount, setQuoteAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [txHash, setTxHash] = useState("")
  const [submitError, setSubmitError] = useState<string>()

  const protocol = bonding?.protocol
  const normalizedDexId = dexId.toLowerCase()
  const isTerraPump =
    protocol === "terrapump" || normalizedDexId === "terra-pump"
  const isLuncPump = protocol === "luncpump" || normalizedDexId === "luncpump"
  const normalizedPairAddress = pairAddress.toLowerCase()
  const tokenAsset = useMemo(
    () => assets.map(parseBondingAsset).find((asset) => asset?.type === "cw20"),
    [assets],
  )
  const nativeAsset = useMemo(
    () =>
      assets.map(parseBondingAsset).find((asset) => asset?.type === "native"),
    [assets],
  )
  const tokenIconCandidates = useMemo(
    () => buildIconCandidates(tokenAsset),
    [tokenAsset],
  )
  const nativeIconCandidates = useMemo(
    () => buildIconCandidates(nativeAsset),
    [nativeAsset],
  )
  const accountAddress = account?.address ?? ""
  const tokenAddress =
    bonding?.tokenAddress?.toLowerCase() ??
    (tokenAsset?.type === "cw20" ? tokenAsset.contract : "")
  const nativeDenom =
    bonding?.nativeDenom ??
    (nativeAsset?.type === "native"
      ? nativeAsset.denom
      : CLASSIC_DENOMS.lunc.coinMinimalDenom)
  const factoryAddress =
    bonding?.factory?.toLowerCase() ?? (isLuncPump ? LUNCPUMP_FACTORY : "")
  const fromAsset = tradeMode === "buy" ? nativeAsset : tokenAsset
  const toAsset = tradeMode === "buy" ? tokenAsset : nativeAsset
  const fromIconCandidates =
    tradeMode === "buy" ? nativeIconCandidates : tokenIconCandidates
  const toIconCandidates =
    tradeMode === "buy" ? tokenIconCandidates : nativeIconCandidates
  const minReceive = applySlippageBps(quoteAmount, slippageBps)

  const { data: terraPumpConfig } = useQuery({
    queryKey: ["bonding", "terrapump", "config", normalizedPairAddress],
    queryFn: () =>
      queryContractSmart<TerraPumpConfig>(normalizedPairAddress, {
        config: {},
      }),
    enabled: isTerraPump && Boolean(normalizedPairAddress),
    staleTime: 60_000,
  })

  const { data: terraPumpInfo } = useQuery({
    queryKey: ["bonding", "terrapump", "info", normalizedPairAddress],
    queryFn: () =>
      queryContractSmart<TerraPumpInfo>(normalizedPairAddress, { info: {} }),
    enabled: isTerraPump && Boolean(normalizedPairAddress),
    staleTime: 60_000,
    refetchInterval: 90_000,
  })

  const resolvedFactoryAddress =
    factoryAddress || terraPumpConfig?.contract_factory?.toLowerCase() || ""
  const resolvedTokenAddress =
    tokenAddress ||
    terraPumpInfo?.token_address?.toLowerCase() ||
    terraPumpConfig?.token?.toLowerCase() ||
    ""
  const resolvedNativeDenom = terraPumpInfo?.native_denom ?? nativeDenom
  const bondingStatus = normalizeStatus(
    terraPumpInfo?.status ?? terraPumpConfig?.status ?? bonding?.status,
  )
  const isTradingDisabled =
    bondingStatus.includes("closed") || bondingStatus.includes("matured")
  const supportsBondingSwap =
    Boolean(fromAsset && toAsset && resolvedTokenAddress) &&
    ((isTerraPump &&
      Boolean(resolvedFactoryAddress && normalizedPairAddress)) ||
      (isLuncPump && Boolean(resolvedFactoryAddress)))

  const { data: nativeBalances = {}, refetch: refetchNativeBalances } =
    useQuery({
      queryKey: ["bonding", "native-balances", accountAddress],
      queryFn: async () => {
        const balances = await fetchBalances(accountAddress)
        return Object.fromEntries(
          balances.map((balance) => [balance.denom, balance.amount]),
        ) as Record<string, string>
      },
      enabled: Boolean(accountAddress),
      staleTime: 30_000,
    })

  const { data: tokenBalance = "0", refetch: refetchTokenBalance } = useQuery({
    queryKey: ["bonding", "cw20-balance", accountAddress, resolvedTokenAddress],
    queryFn: () => fetchCw20Balance(accountAddress, resolvedTokenAddress),
    enabled: Boolean(accountAddress && resolvedTokenAddress),
    staleTime: 30_000,
  })

  const nativeBalance = nativeBalances[resolvedNativeDenom] ?? "0"
  const fromBalance = tradeMode === "buy" ? nativeBalance : tokenBalance
  const toBalance = tradeMode === "buy" ? tokenBalance : nativeBalance
  const fromDecimals = fromAsset?.decimals ?? 6
  const toDecimals = toAsset?.decimals ?? 6
  const inputBaseAmount = useMemo(() => {
    if (!amount.trim() || !fromAsset) return "0"
    try {
      return parseTokenAmountToBaseUnits(
        amount,
        fromDecimals,
        `${fromAsset.symbol} amount`,
      )
    } catch {
      return "0"
    }
  }, [amount, fromAsset, fromDecimals])
  const balanceIssue =
    inputBaseAmount !== "0" &&
    parseBaseUnits(inputBaseAmount) > parseBaseUnits(fromBalance)
      ? `Insufficient ${fromAsset?.symbol ?? "asset"} balance.`
      : undefined

  const refreshBalances = useCallback(async () => {
    await Promise.all([
      refetchNativeBalances(),
      refetchTokenBalance(),
      queryClient.invalidateQueries({ queryKey: ["market"] }),
    ])
  }, [queryClient, refetchNativeBalances, refetchTokenBalance])

  useEffect(() => {
    let cancelled = false

    setQuoteAmount("")
    setQuoteError(undefined)

    if (!supportsBondingSwap || parseBaseUnits(inputBaseAmount) <= 0n) {
      setQuoteLoading(false)
      return undefined
    }

    const timer = window.setTimeout(async () => {
      setQuoteLoading(true)
      try {
        if (isTerraPump) {
          const result = await queryContractSmart<TerraPumpSimulateResponse>(
            normalizedPairAddress,
            {
              simulate: {
                offer:
                  tradeMode === "buy"
                    ? resolvedNativeDenom
                    : resolvedTokenAddress,
                amount: inputBaseAmount,
              },
            },
          )
          if (cancelled) return
          if (!result.amount_out && result.message) {
            setQuoteError(result.message)
            return
          }
          setQuoteAmount(result.amount_out ?? "0")
          return
        }

        const result = await queryContractSmart<LuncPumpAmountOutResponse>(
          resolvedFactoryAddress,
          tradeMode === "buy"
            ? {
                get_buy_amount_out: {
                  token_address: resolvedTokenAddress,
                  lunc_amount: inputBaseAmount,
                },
              }
            : {
                get_sell_amount_out: {
                  token_address: resolvedTokenAddress,
                  token_amount: inputBaseAmount,
                },
              },
        )
        if (cancelled) return
        setQuoteAmount(result.amount ?? "0")
      } catch (error) {
        if (!cancelled) {
          setQuoteError(
            error instanceof Error ? error.message : "Quote unavailable.",
          )
        }
      } finally {
        if (!cancelled) setQuoteLoading(false)
      }
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    inputBaseAmount,
    isTerraPump,
    normalizedPairAddress,
    resolvedFactoryAddress,
    resolvedNativeDenom,
    resolvedTokenAddress,
    supportsBondingSwap,
    tradeMode,
  ])

  const setMax = () => {
    setAmount(toInputAmount(fromBalance, fromDecimals))
  }

  const handleSwapDirection = () => {
    setTradeMode((current) => (current === "buy" ? "sell" : "buy"))
    setAmount("")
    setQuoteAmount("")
    setSubmitError(undefined)
    setQuoteError(undefined)
  }

  const buildTradeMessage = async (sender: string): Promise<TxMessage> => {
    const minAmountOut = minReceive
    if (
      !fromAsset ||
      !toAsset ||
      !resolvedTokenAddress ||
      !resolvedFactoryAddress
    ) {
      throw new Error("Bonding pair information is not available.")
    }

    if (isTerraPump) {
      if (tradeMode === "buy") {
        return {
          typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
          value: MsgExecuteContract.fromPartial({
            sender,
            contract: resolvedFactoryAddress,
            msg: encodeJsonBytes({
              swap_buy: {
                contract_address: normalizedPairAddress,
                min_amount_out: minAmountOut,
              },
            }),
            funds: [
              {
                denom: resolvedNativeDenom,
                amount: inputBaseAmount,
              },
            ],
          }),
        }
      }

      return {
        typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
        value: MsgExecuteContract.fromPartial({
          sender,
          contract: resolvedTokenAddress,
          msg: encodeJsonBytes({
            send: {
              contract: resolvedFactoryAddress,
              amount: inputBaseAmount,
              msg: encodeHookMsg({
                swap_sell: {
                  min_amount_out: minAmountOut,
                },
              }),
            },
          }),
          funds: [],
        }),
      }
    }

    const deadline = Date.now() + 60 * 60 * 1000
    if (tradeMode === "buy") {
      return {
        typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
        value: MsgExecuteContract.fromPartial({
          sender,
          contract: resolvedFactoryAddress,
          msg: encodeJsonBytes({
            buy: {
              deadline,
              minimum_receive: minAmountOut,
              token_address: resolvedTokenAddress,
            },
          }),
          funds: [
            {
              denom: resolvedNativeDenom,
              amount: inputBaseAmount,
            },
          ],
        }),
      }
    }

    return {
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: MsgExecuteContract.fromPartial({
        sender,
        contract: resolvedTokenAddress,
        msg: encodeJsonBytes({
          send: {
            amount: inputBaseAmount,
            contract: resolvedFactoryAddress,
            msg: encodeHookMsg({
              deadline,
              minimum_receive: minAmountOut,
            }),
          },
        }),
        funds: [],
      }),
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!connectorId || !accountAddress) {
      setSubmitError("Connect a wallet first.")
      return
    }
    if (isTradingDisabled) {
      setSubmitError("Trading is disabled for this bonding curve.")
      return
    }
    if (!supportsBondingSwap || parseBaseUnits(inputBaseAmount) <= 0n) {
      setSubmitError("Enter an amount first.")
      return
    }
    if (balanceIssue) {
      setSubmitError(balanceIssue)
      return
    }
    if (parseBaseUnits(quoteAmount) <= 0n) {
      setSubmitError("Quote is not available yet.")
      return
    }

    try {
      setSubmitting(true)
      setSubmitError(undefined)
      setTxHash("")
      startTx(
        `Swap ${fromAsset?.symbol ?? "asset"} for ${toAsset?.symbol ?? "asset"}`,
      )
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
      const message = await buildTradeMessage(signerAddress)
      const hash = await signAndBroadcastFast({
        client,
        fallbackGas:
          tradeMode === "buy"
            ? FALLBACK_BONDING_BUY_GAS
            : FALLBACK_BONDING_SELL_GAS,
        messages: [message],
        signerAddress,
      })
      setTxHash(hash)
      setAmount("")
      setQuoteAmount("")
      await refreshBalances()
      finishTx(hash)
    } catch (error) {
      const message = formatTxError(error, "Bonding swap failed.")
      setSubmitError(message)
      failTx(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!isTerraPump && !isLuncPump) {
    return (
      <div className={swapStyles.quotePlaceholder}>
        <span>Bonding curve trading is not available for {dexLabel} yet.</span>
      </div>
    )
  }

  const quoteText =
    parseBaseUnits(quoteAmount) > 0n
      ? formatBaseUnitsToTokenAmount(quoteAmount, toDecimals, 4)
      : "--"

  return (
    <section
      className={`card ${swapStyles.swapCard} ${swapStyles.swapCardEmbedded}`}
    >
      <form className={swapStyles.swapCardBody} onSubmit={handleSubmit}>
        <div className={swapStyles.topMeta}>
          <p className={swapStyles.formHint}>
            Swap directly through this pool.
          </p>
          <div className={swapStyles.slippageControl}>
            {SLIPPAGE_OPTIONS.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`${swapStyles.slippageButton} ${
                  slippageBps === item.bps
                    ? swapStyles.slippageButtonActive
                    : ""
                }`}
                onClick={() => setSlippageBps(item.bps)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className={swapStyles.swapPanel}>
          <div className={swapStyles.fieldCard}>
            <div className={swapStyles.fieldHeader}>
              <span>From</span>
              <button
                type="button"
                className={swapStyles.maxButton}
                disabled={!accountAddress || fromBalance === "0"}
                onClick={setMax}
              >
                Max
              </button>
            </div>
            <div className={swapStyles.fieldBody}>
              <button
                type="button"
                className={`${swapStyles.assetPickerButton} ${swapStyles.assetPickerButtonStatic}`}
                disabled
              >
                <span className={swapStyles.assetPickerValue}>
                  <SwapAssetIcon
                    symbol={fromAsset?.symbol ?? "Asset"}
                    candidates={fromIconCandidates}
                    size={22}
                  />
                  <span>{fromAsset?.symbol ?? "Asset"}</span>
                </span>
              </button>
              <input
                className={getAmountClass(amount)}
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                value={amount}
              />
            </div>
            <div className={swapStyles.fieldFooter}>
              <span>Balance: {formatBalance(fromBalance, fromDecimals)}</span>
            </div>
          </div>

          <div className={swapStyles.switchRow}>
            <button
              className={swapStyles.switchButton}
              type="button"
              onClick={handleSwapDirection}
              aria-label="Switch assets"
            >
              <svg
                className={swapStyles.switchIcon}
                viewBox="0 0 24 24"
                focusable="false"
              >
                <path
                  d="M9 5.5v11"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.7"
                />
                <path
                  d="M6.75 7.75 9 5.5l2.25 2.25"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
                <path
                  d="M15 18.5v-11"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.7"
                />
                <path
                  d="M12.75 16.25 15 18.5l2.25-2.25"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
              </svg>
            </button>
          </div>

          <div className={swapStyles.fieldCard}>
            <div className={swapStyles.fieldHeader}>
              <span>To</span>
              <span>{quoteLoading ? "Quoting..." : "Estimated"}</span>
            </div>
            <div className={swapStyles.fieldBody}>
              <button
                type="button"
                className={`${swapStyles.assetPickerButton} ${swapStyles.assetPickerButtonStatic}`}
                disabled
              >
                <span className={swapStyles.assetPickerValue}>
                  <SwapAssetIcon
                    symbol={toAsset?.symbol ?? "Asset"}
                    candidates={toIconCandidates}
                    size={22}
                  />
                  <span>{toAsset?.symbol ?? "Asset"}</span>
                </span>
              </button>
              <div className={getReadonlyAmountClass(quoteText)}>
                {quoteText}
              </div>
            </div>
            <div className={swapStyles.fieldFooter}>
              <span>Balance: {formatBalance(toBalance, toDecimals)}</span>
            </div>
          </div>
        </div>

        {quoteError ? <p className={swapStyles.error}>{quoteError}</p> : null}
        {!quoteError ? (
          <section className={swapStyles.quotePlaceholder}>
            <span>
              {quoteLoading
                ? "Fetching quote..."
                : parseBaseUnits(quoteAmount) > 0n
                  ? "Minimum receive updates with slippage."
                  : "Enter an amount to preview this pool swap."}
            </span>
          </section>
        ) : null}

        {submitError || balanceIssue ? (
          <p className={swapStyles.error}>{submitError ?? balanceIssue}</p>
        ) : null}
        {txHash ? (
          <p className={swapStyles.success}>
            Tx{" "}
            <a
              href={`https://finder.burrito.money/classic/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {truncateHash(txHash)}
            </a>
          </p>
        ) : null}

        <button
          className={`uiButton uiButtonPrimary ${swapStyles.submitButton}`}
          disabled={
            submitting ||
            !connectorId ||
            !accountAddress ||
            !supportsBondingSwap ||
            isTradingDisabled ||
            parseBaseUnits(inputBaseAmount) <= 0n ||
            parseBaseUnits(quoteAmount) <= 0n ||
            Boolean(balanceIssue)
          }
          type="submit"
        >
          {submitting
            ? "Broadcasting..."
            : !connectorId || !accountAddress
              ? "Connect wallet first"
              : isTradingDisabled
                ? "Trading disabled"
                : "Swap"}
        </button>
      </form>
    </section>
  )
}

export default BondingCurveSwapPanel
