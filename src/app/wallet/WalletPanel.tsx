import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import styles from "./WalletPanel.module.css"
import { useWallet } from "./WalletContext"
import { useAppChain } from "../appChainContext"
import { getAddressExplorerUrl } from "../explorer"
import { CLASSIC_DENOMS } from "../chain"
import {
  fetchBurnTaxRate,
  fetchComputedBankSendTax,
  fetchTaxableTransfer
} from "../data/classic"
import ManageTokensModal from "./ManageTokensModal"
import type { ManageTokenItem } from "./ManageTokensModal"
import WalletBuyModal from "./WalletBuyModal"
import WalletAssetIcon from "./WalletAssetIcon"
import WalletPanelActions from "./WalletPanelActions"
import {
  WalletPanelAssetChains,
  WalletPanelAssetList
} from "./WalletPanelAssetList"
import WalletPanelDetails from "./WalletPanelDetails"
import { useWalletAssetVisibility } from "./useWalletAssetVisibility"
import {
  WALLET_PANEL_NAVIGATION_EVENT,
  type WalletPanelAssetSnapshot,
  type WalletPanelNavigationDetail
} from "./panelNavigation"
import {
  useWalletHiddenTokensPreference,
  useWalletHideLowBalancePreference
} from "./useWalletVisibilityPreferences"
import { useWalletAssets, type WalletAssetRow } from "./useWalletAssets"
import { getWalletSwapPath } from "./swapNavigation"
import {
  formatTokenAmount,
  formatUsd,
  toUnitAmount
} from "../utils/format"
import { formatTxError } from "../utils/txError"
import {
  readLocalStorageValue,
  removeLocalStorageValue,
  writeLocalStorageValue
} from "../utils/safeStorage"
import {
  DEFAULT_SEND_ASSET,
  FALLBACK_SEND_GAS_CW20,
  FALLBACK_SEND_GAS_NATIVE,
  RECENT_RECIPIENT_LIMIT,
  TERRA_ADDRESS_PATTERN,
  encodeJsonBytes,
  formatShortAddress,
  fromMicroAmount,
  getRecentRecipientsStorageKey,
  parseBigInt,
  sanitizeAmount,
  toMicroAmount,
  toSelectedAsset,
  type RecentRecipientEntry,
  type SelectedAsset,
  type SendAsset,
  type WalletPanelView
} from "./walletPanelUtils"
import {
  BackIcon,
  WalletCloseIcon,
  WalletCloseIconMobile,
  WalletIcon
} from "./WalletPanelIcons"

const WalletPanel = () => {
  const {
    account,
    connectorId,
    prepareWalletForTx,
    walletPreparingForTx,
    startTx,
    finishTx,
    failTx
  } = useWallet()
  const { chain, chainKey } = useAppChain()
  const isClassic = chainKey === "lunc"
  const nativeSymbol = chain.displayDenom
  const gasPrice = chain.runtime.gasPriceStep.average
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return false
    return readLocalStorageValue("burritoWalletOpen") === "true"
  })
  const [view, setView] = useState<WalletPanelView>("wallet")
  const [manageOpen, setManageOpen] = useState(false)
  const [manageSearch, setManageSearch] = useState("")
  const [hideNonWhitelisted, setHideNonWhitelisted] = useState(false)
  const [hideLowBalance, setHideLowBalance] =
    useWalletHideLowBalancePreference()
  const [hiddenTokens, setHiddenTokens] = useWalletHiddenTokensPreference()
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset>({
    ...DEFAULT_SEND_ASSET
  })
  const [sendRecipient, setSendRecipient] = useState("")
  const [sendAmount, setSendAmount] = useState("")
  const [sendMemo, setSendMemo] = useState("")
  const [sendError, setSendError] = useState<string>()
  const [sendSubmitting, setSendSubmitting] = useState(false)
  const [recentRecipients, setRecentRecipients] = useState<RecentRecipientEntry[]>([])
  const [receiveCopied, setReceiveCopied] = useState(false)
  const [receiveQrDataUrl, setReceiveQrDataUrl] = useState("")
  const [receiveQrError, setReceiveQrError] = useState(false)
  const [buyModalOpen, setBuyModalOpen] = useState(false)

  const {
    assetRows,
    getBalance,
    hasBalanceSnapshot,
    isBalanceError,
    isBalanceLoading,
    netWorth,
    tokenCatalog
  } = useWalletAssets(account?.address)
  const { data: burnTaxRate = 0 } = useQuery({
    queryKey: ["burn-tax-rate", chain.chainId],
    queryFn: fetchBurnTaxRate,
    enabled: isClassic,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000
  })

  const resetSendForm = useCallback(() => {
    setSendRecipient("")
    setSendAmount("")
    setSendMemo("")
    setSendError(undefined)
    setSendSubmitting(false)
  }, [])

  useEffect(() => {
    setSelectedAsset({
      symbol: chain.displayDenom,
      name: chain.name,
      denom: chain.nativeDenom,
      decimals: chain.runtime.nativeDenom.coinDecimals
    })
    resetSendForm()
  }, [
    chain.chainId,
    chain.displayDenom,
    chain.name,
    chain.nativeDenom,
    chain.runtime.nativeDenom.coinDecimals,
    resetSendForm
  ])

  const handleRetryBalances = useCallback(() => {
    if (!account?.address) return
    void queryClient.invalidateQueries({
      queryKey: ["wallet", chain.chainId, "balances", account.address]
    })
    void queryClient.invalidateQueries({
      queryKey: ["cw20-balances", chain.chainId, account.address]
    })
  }, [account?.address, chain.chainId, queryClient])

  const openSendView = useCallback(
    (asset?: WalletAssetRow | WalletPanelAssetSnapshot | SelectedAsset) => {
      if (asset) {
        setSelectedAsset(toSelectedAsset(asset))
      }
      resetSendForm()
      setView("send")
      setIsOpen(true)
    },
    [resetSendForm]
  )

  const openReceiveView = useCallback(
    (asset?: WalletAssetRow | WalletPanelAssetSnapshot | SelectedAsset) => {
      if (asset) {
        setSelectedAsset(toSelectedAsset(asset))
      }
      setView("receive")
      setIsOpen(true)
    },
    []
  )

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleNavigation = (event: Event) => {
      const detail = (event as CustomEvent<WalletPanelNavigationDetail>).detail
      if (!detail) return
      if (detail.view === "send") {
        openSendView(detail.asset)
        return
      }
      if (detail.asset) {
        setSelectedAsset(toSelectedAsset(detail.asset))
      }
      setView(detail.view)
      setIsOpen(true)
    }

    window.addEventListener(WALLET_PANEL_NAVIGATION_EVENT, handleNavigation as EventListener)
    return () =>
      window.removeEventListener(
        WALLET_PANEL_NAVIGATION_EVENT,
        handleNavigation as EventListener
      )
  }, [openSendView])

  useEffect(() => {
    if (typeof window !== "undefined") {
      writeLocalStorageValue("burritoWalletOpen", String(isOpen))
      const offset =
        window.innerWidth >= 992 && isOpen ? "var(--wallet-width)" : "0px"
      document.documentElement.style.setProperty("--wallet-offset", offset)
    }
  }, [isOpen])

  useEffect(() => {
    if (typeof window === "undefined") return
    const handleResize = () => {
      const offset =
        window.innerWidth >= 992 && isOpen ? "var(--wallet-width)" : "0px"
      document.documentElement.style.setProperty("--wallet-offset", offset)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [isOpen])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!account?.address) {
      setRecentRecipients([])
      return
    }

    const stored = readLocalStorageValue(
      getRecentRecipientsStorageKey(account.address, chain.chainId)
    )
    if (!stored) {
      setRecentRecipients([])
      return
    }

    try {
      const parsed = JSON.parse(stored) as RecentRecipientEntry[]
      if (!Array.isArray(parsed)) {
        setRecentRecipients([])
        return
      }
      setRecentRecipients(
        parsed
          .filter((entry) => typeof entry?.address === "string" && entry.address)
          .sort((left, right) => (right.lastUsedAt ?? 0) - (left.lastUsedAt ?? 0))
          .slice(0, RECENT_RECIPIENT_LIMIT)
      )
    } catch {
      setRecentRecipients([])
    }
  }, [account?.address, chain.chainId])

  useEffect(() => {
    if (typeof window === "undefined" || !account?.address) return
    writeLocalStorageValue(
      getRecentRecipientsStorageKey(account.address, chain.chainId),
      JSON.stringify(recentRecipients.slice(0, RECENT_RECIPIENT_LIMIT))
    )
  }, [account?.address, chain.chainId, recentRecipients])

  useEffect(() => {
    let isMounted = true

    const buildQr = async () => {
      const address = account?.address ?? ""
      if (view !== "receive" || !address) {
        setReceiveQrDataUrl("")
        setReceiveQrError(false)
        return
      }

      try {
        const { default: QRCode } = await import("qrcode")
        const dataUrl = await QRCode.toDataURL(address, {
          width: 220,
          margin: 0,
          color: {
            dark: "#52C41A",
            light: "#00000000"
          }
        })
        if (isMounted) {
          setReceiveQrDataUrl(dataUrl)
          setReceiveQrError(false)
        }
      } catch {
        if (isMounted) {
          setReceiveQrDataUrl("")
          setReceiveQrError(true)
        }
      }
    }

    buildQr()

    return () => {
      isMounted = false
    }
  }, [account?.address, view])

  useEffect(() => {
    if (view !== "receive" || !receiveCopied) return
    const timeoutId = window.setTimeout(() => setReceiveCopied(false), 1800)
    return () => window.clearTimeout(timeoutId)
  }, [receiveCopied, view])

  const toggleHiddenToken = (key: string) => {
    if (
      key === CLASSIC_DENOMS.lunc.coinMinimalDenom ||
      key === CLASSIC_DENOMS.ustc.coinMinimalDenom
    ) {
      return
    }
    setHiddenTokens((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    )
  }

  const luncAmount = getBalance(CLASSIC_DENOMS.lunc.coinMinimalDenom)

  const hiddenTokenSet = useMemo(
    () => new Set(hiddenTokens),
    [hiddenTokens]
  )
  const { visibleAssetRows: filteredAssetRows } = useWalletAssetVisibility({
    assetRows,
    hiddenKeys: hiddenTokenSet,
    hideLowBalance,
    hideUnknownAssets: hideNonWhitelisted
  })

  const manageItems = useMemo<ManageTokenItem[]>(() => {
    return tokenCatalog.map((item) => ({
      ...item,
      enabled: !hiddenTokenSet.has(item.key)
    }))
  }, [hiddenTokenSet, tokenCatalog])

  const netWorthValue =
    !account || !account.address
      ? "$0.00"
      : isBalanceLoading || (!hasBalanceSnapshot && isBalanceError)
      ? "--"
      : formatUsd(netWorth)

  const selectedAssetRow = assetRows.find(
    (asset) => asset.denom === selectedAsset.denom
  )
  const selectedBalance =
    selectedAssetRow?.amount ?? getBalance(selectedAsset.denom) ?? "0"
  const selectedDecimals = selectedAssetRow?.decimals ?? selectedAsset.decimals
  const selectedPrice = selectedAssetRow?.price
  const selectedSymbol = selectedAssetRow?.symbol ?? selectedAsset.symbol
  const selectedIconCandidates = selectedAssetRow?.iconCandidates ?? []
  const selectedValue =
    selectedAssetRow?.value !== undefined
      ? selectedAssetRow.value
      : selectedPrice !== undefined
      ? toUnitAmount(selectedBalance, selectedDecimals) * selectedPrice
      : undefined
  const selectedAmountDisplay = formatTokenAmount(
    selectedBalance,
    selectedDecimals,
    2
  )
  const receiveAddress = account?.address ?? ""
  const receiveFinderUrl = receiveAddress
    ? getAddressExplorerUrl(chainKey, receiveAddress)
    : undefined
  const receiveAddressPreview = receiveAddress
    ? formatShortAddress(receiveAddress)
    : "Connect wallet"
  const receiveAddressStatus = receiveAddress
    ? `${chain.name} wallet address`
    : "Connect a wallet to generate your address"
  const sendAsset = useMemo<SendAsset>(() => {
    if (selectedAssetRow) {
      return {
        kind: selectedAssetRow.kind,
        denom: selectedAssetRow.denom,
        symbol: selectedAssetRow.symbol,
        name: selectedAssetRow.name,
        decimals: selectedAssetRow.decimals,
        amount: selectedAssetRow.amount
      }
    }

    const fallbackKind =
      selectedAsset.denom.startsWith("terra1")
        ? "cw20"
        : selectedAsset.denom.startsWith("ibc/")
          ? "ibc"
          : "native"

    return {
      kind: fallbackKind,
      ...selectedAsset,
      amount: getBalance(selectedAsset.denom) ?? "0"
    }
  }, [getBalance, selectedAsset, selectedAssetRow])
  const handleAssetSwap = useCallback(() => {
    navigate(getWalletSwapPath(selectedAssetRow ?? selectedAsset))
    setIsOpen(false)
  }, [navigate, selectedAsset, selectedAssetRow])
  const sendBalanceMicro = useMemo(
    () => parseBigInt(sendAsset.amount),
    [sendAsset.amount]
  )
  const sendAmountMicro = useMemo(
    () => toMicroAmount(sendAmount, sendAsset.decimals),
    [sendAmount, sendAsset.decimals]
  )
  const sendFeeMicro = useMemo(
    () =>
      BigInt(
        Math.ceil(
          (sendAsset.kind === "cw20" ? FALLBACK_SEND_GAS_CW20 : FALLBACK_SEND_GAS_NATIVE) *
            gasPrice
        )
      ),
    [gasPrice, sendAsset.kind]
  )
  const sendFeeDisplay = useMemo(
    () =>
      `${formatTokenAmount(sendFeeMicro.toString(), 6, 6)} ${nativeSymbol}`,
    [nativeSymbol, sendFeeMicro]
  )
  const luncBalanceMicro = useMemo(() => parseBigInt(luncAmount), [luncAmount])
  const requiresLuncFee = sendAsset.denom !== CLASSIC_DENOMS.lunc.coinMinimalDenom
  const recipient = sendRecipient.trim()
  const recipientIsValid = TERRA_ADDRESS_PATTERN.test(recipient)
  const canQuerySendTaxable =
    isClassic &&
    Boolean(account?.address) &&
    recipientIsValid &&
    sendAsset.kind !== "cw20"
  const {
    data: sendTaxable,
    isFetching: sendTaxableFetching,
    isError: sendTaxableError
  } = useQuery({
    queryKey: [
      "send-taxable",
      chain.chainId,
      account?.address,
      recipient,
      sendAsset.kind
    ],
    queryFn: () => fetchTaxableTransfer(account!.address, recipient),
    enabled: canQuerySendTaxable,
    staleTime: 30 * 1000
  })
  const canQueryComputedTax = canQuerySendTaxable && sendAmountMicro > 0n
  const {
    data: computedSendTaxAmount = "0",
    isFetching: computedSendTaxFetching,
    isError: computedSendTaxError
  } = useQuery({
    queryKey: [
      "send-compute-tax",
      chain.chainId,
      account?.address,
      recipient,
      sendAsset.denom,
      sendAmountMicro.toString()
    ],
    queryFn: () =>
      fetchComputedBankSendTax({
        fromAddress: account!.address,
        toAddress: recipient,
        denom: sendAsset.denom,
        amount: sendAmountMicro.toString()
      }),
    enabled: canQueryComputedTax,
    staleTime: 30 * 1000
  })
  const sendMaxMicro = useMemo(() => {
    if (sendAsset.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom) {
      return sendBalanceMicro > sendFeeMicro ? sendBalanceMicro - sendFeeMicro : 0n
    }
    return sendBalanceMicro
  }, [sendAsset.denom, sendBalanceMicro, sendFeeMicro])
  const canCoverSendFee = useMemo(() => {
    if (requiresLuncFee) return luncBalanceMicro >= sendFeeMicro
    return sendBalanceMicro > sendFeeMicro
  }, [luncBalanceMicro, requiresLuncFee, sendBalanceMicro, sendFeeMicro])
  const sendAvailableDisplay = useMemo(
    () => `${formatTokenAmount(sendAsset.amount, sendAsset.decimals, 2)} ${sendAsset.symbol}`,
    [sendAsset.amount, sendAsset.decimals, sendAsset.symbol]
  )
  const taxRatePercentDisplay = useMemo(() => {
    const percent = burnTaxRate * 100
    return `${percent.toFixed(percent > 0 && percent < 0.01 ? 4 : 2)}%`
  }, [burnTaxRate])
  const sendBurnTaxMode = useMemo<
    "pending" | "taxed" | "exempt" | "no-tax" | "cw20" | "error"
  >(() => {
    if (!isClassic) return "no-tax"
    if (sendAsset.kind === "cw20") return "cw20"
    if (!account?.address || !recipient) return "pending"
    if (!recipientIsValid) return "pending"
    if (sendTaxableError || computedSendTaxError) return "error"
    if (sendTaxableFetching && sendTaxable === undefined) return "pending"
    if (sendAmountMicro <= 0n) return "pending"
    if (computedSendTaxFetching && computedSendTaxAmount === "0") return "pending"
    if (sendTaxable === false) return "exempt"
    return parseBigInt(computedSendTaxAmount) > 0n ? "taxed" : "no-tax"
  }, [
    account?.address,
    computedSendTaxAmount,
    computedSendTaxError,
    computedSendTaxFetching,
    recipient,
    recipientIsValid,
    sendAsset.kind,
    sendAmountMicro,
    sendTaxable,
    sendTaxableError,
    sendTaxableFetching,
    isClassic
  ])
  const sendAssetIconCandidates = selectedAssetRow?.iconCandidates ?? selectedIconCandidates
  const sendPrice = selectedAssetRow?.price ?? selectedPrice
  const sendBalanceValue = selectedAssetRow?.value ?? selectedValue
  const sendAmountValue = useMemo(() => {
    if (sendPrice === undefined || sendAmountMicro <= 0n) return undefined
    return toUnitAmount(sendAmountMicro.toString(), sendAsset.decimals) * sendPrice
  }, [sendAmountMicro, sendAsset.decimals, sendPrice])
  const sendBurnTaxMicro = useMemo(
    () => parseBigInt(computedSendTaxAmount),
    [computedSendTaxAmount]
  )
  const sendRecipientReceivesMicro = useMemo(() => {
    if (sendAsset.kind === "cw20") return sendAmountMicro
    const netAmount = sendAmountMicro - sendBurnTaxMicro
    return netAmount > 0n ? netAmount : 0n
  }, [sendAmountMicro, sendAsset.kind, sendBurnTaxMicro])
  const sendRecipientReceivesValue = useMemo(() => {
    if (sendPrice === undefined || sendRecipientReceivesMicro <= 0n) return undefined
    return (
      toUnitAmount(sendRecipientReceivesMicro.toString(), sendAsset.decimals) * sendPrice
    )
  }, [sendAsset.decimals, sendPrice, sendRecipientReceivesMicro])
  const sendRemainingMicro = useMemo(() => {
    const feeReserve =
      sendAsset.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom ? sendFeeMicro : 0n
    const remaining = sendBalanceMicro - sendAmountMicro - feeReserve
    return remaining > 0n ? remaining : 0n
  }, [sendAmountMicro, sendAsset.denom, sendBalanceMicro, sendFeeMicro])
  const sendRemainingValue = useMemo(() => {
    if (sendPrice === undefined || sendRemainingMicro <= 0n) return undefined
    return toUnitAmount(sendRemainingMicro.toString(), sendAsset.decimals) * sendPrice
  }, [sendAsset.decimals, sendPrice, sendRemainingMicro])
  const sendRemainingDisplay = useMemo(
    () => `${formatTokenAmount(sendRemainingMicro.toString(), sendAsset.decimals, 2)} ${sendAsset.symbol}`,
    [sendAsset.decimals, sendAsset.symbol, sendRemainingMicro]
  )
  const sendBurnTaxDisplay = useMemo(
    () => `${formatTokenAmount(sendBurnTaxMicro.toString(), sendAsset.decimals, 6)} ${sendAsset.symbol}`,
    [sendAsset.decimals, sendAsset.symbol, sendBurnTaxMicro]
  )
  const sendRecipientReceivesDisplay = useMemo(
    () =>
      `${formatTokenAmount(sendRecipientReceivesMicro.toString(), sendAsset.decimals, 4)} ${sendAsset.symbol}`,
    [sendAsset.decimals, sendAsset.symbol, sendRecipientReceivesMicro]
  )
  const recipientStatusText = useMemo(() => {
    if (!sendRecipient.trim()) return `Only ${chain.name} addresses are supported.`
    return TERRA_ADDRESS_PATTERN.test(sendRecipient.trim())
      ? `Valid ${chain.name} address.`
      : "Address must start with terra1."
  }, [chain.name, sendRecipient])
  const recipientStatusLabel = useMemo(() => {
    if (!sendRecipient.trim()) return "Waiting"
    return recipientIsValid ? "Ready" : "Invalid"
  }, [recipientIsValid, sendRecipient])
  const recipientStatusClass = useMemo(() => {
    if (!sendRecipient.trim()) return styles.fieldHintNeutral
    return recipientIsValid ? styles.fieldHintValid : styles.fieldHintError
  }, [recipientIsValid, sendRecipient])
  const recentRecipientMatch = useMemo(
    () => recentRecipients.find((entry) => entry.address === recipient),
    [recentRecipients, recipient]
  )
  const visibleRecentRecipients = useMemo(
    () =>
      recentRecipients.filter((entry) => entry.address !== recipient).slice(0, RECENT_RECIPIENT_LIMIT),
    [recentRecipients, recipient]
  )
  const sendFlowLabel =
    sendAsset.kind === "cw20"
      ? "CW20 transfer"
      : sendAsset.kind === "ibc"
        ? "IBC bank send"
        : "Bank send"
  const memoHintToneClass = useMemo(() => {
    if (!recipient) return styles.memoHintNeutral
    if (sendMemo.trim()) return styles.memoHintValid
    if (recentRecipientMatch?.memoUsed) return styles.memoHintWarning
    return styles.memoHintNeutral
  }, [recentRecipientMatch?.memoUsed, recipient, sendMemo])
  const memoHintTitle = useMemo(() => {
    if (!recipient) return "Memo optional"
    if (sendMemo.trim()) return "Memo included"
    if (recentRecipientMatch?.memoUsed) return "This address previously used a memo"
    return "No memo attached"
  }, [recentRecipientMatch?.memoUsed, recipient, sendMemo])
  const memoHintText = useMemo(() => {
    if (!recipient) {
      return "Add a memo only if the recipient service explicitly asks for one."
    }
    if (sendMemo.trim()) {
      return "This transaction will include your memo in the signed message."
    }
    if (recentRecipientMatch?.memoUsed) {
      return "You previously sent to this address with a memo. Confirm the recipient still accepts a blank memo before broadcasting."
    }
    return "Leave memo blank only if the destination wallet or exchange does not require it."
  }, [recentRecipientMatch?.memoUsed, recipient, sendMemo])
  const sendTaxMetricDisplay = useMemo(() => {
    if (burnTaxRate <= 0) return "0.00%"
    switch (sendBurnTaxMode) {
      case "taxed":
        return taxRatePercentDisplay
      case "exempt":
        return "Exempt"
      case "no-tax":
      case "cw20":
        return "Not applied"
      case "error":
        return "Unavailable"
      default:
        return taxRatePercentDisplay
    }
  }, [burnTaxRate, sendBurnTaxMode, taxRatePercentDisplay])
  const sendTaxStateLabel = useMemo(() => {
    if (!isClassic) return "Not used on Terra"
    if (burnTaxRate <= 0) return "Burn tax disabled"
    switch (sendBurnTaxMode) {
      case "taxed":
        return "Taxable route"
      case "exempt":
        return "Tax-exempt route"
      case "no-tax":
        return "No tax on this asset"
      case "cw20":
        return "Not applied to CW20"
      case "error":
        return "Tax check unavailable"
      default:
        return "Enter recipient to evaluate"
    }
  }, [burnTaxRate, isClassic, sendBurnTaxMode])
  const sendNoticeTitle = useMemo(() => {
    switch (sendBurnTaxMode) {
      case "taxed":
        return "Burn tax applies"
      case "exempt":
        return "Route is exempt"
      case "no-tax":
        return "No burn tax charged"
      case "cw20":
        return "CW20 transfer route"
      case "error":
        return "Tax check unavailable"
      default:
        return "Route check pending"
    }
  }, [sendBurnTaxMode])
  const sendTaxWarningText = useMemo(() => {
    if (!isClassic) {
      return "Phoenix transactions do not use the Terra Classic burn tax module."
    }
    if (burnTaxRate <= 0) {
      return "Burn tax is currently disabled on-chain."
    }
    switch (sendBurnTaxMode) {
      case "taxed":
        return "This route is taxable on-chain, so the recipient will receive the net amount after burn tax."
      case "exempt":
        return "This route is currently tax-exempt by on-chain zone rules."
      case "no-tax":
        return "This asset/message path currently does not incur burn tax on-chain."
      case "cw20":
        return "Burn tax does not apply to this CW20 transfer message."
      case "error":
        return "Burn tax status could not be confirmed from the chain right now."
      default:
        return "Enter a valid Terra recipient to check whether burn tax applies on this route."
    }
  }, [burnTaxRate, isClassic, sendBurnTaxMode])
  const sendBurnTaxSummaryDisplay = useMemo(() => {
    switch (sendBurnTaxMode) {
      case "taxed":
        return sendBurnTaxDisplay
      case "exempt":
        return "Exempt"
      case "no-tax":
        return "Not applied"
      case "cw20":
        return "Not applied"
      case "error":
        return "--"
      default:
        return "--"
    }
  }, [sendBurnTaxDisplay, sendBurnTaxMode])
  const sendRecipientReceivesSummaryDisplay = useMemo(() => {
    if (sendAmountMicro <= 0n) return "--"
    if (sendBurnTaxMode === "pending" || sendBurnTaxMode === "error") {
      return sendAsset.kind === "cw20" ? sendRecipientReceivesDisplay : "--"
    }
    return sendRecipientReceivesDisplay
  }, [
    sendAmountMicro,
    sendAsset.kind,
    sendBurnTaxMode,
    sendRecipientReceivesDisplay
  ])
  const sendNoticeToneClass = useMemo(() => {
    switch (sendBurnTaxMode) {
      case "taxed":
        return styles.formNoticeTaxed
      case "exempt":
        return styles.formNoticeExempt
      case "error":
        return styles.formNoticeError
      default:
        return styles.formNoticeNeutral
    }
  }, [sendBurnTaxMode])
  const sendSubmitDisabledReason = useMemo(() => {
    if (!account?.address) return "Please connect a wallet first."
    if (!recipient) return `Enter a ${chain.name} recipient.`
    if (!recipientIsValid) return `Enter a valid ${chain.name} address.`
    if (sendAmountMicro <= 0n) return "Enter an amount greater than zero."
    if (!canCoverSendFee) {
      return `Need at least ${sendFeeDisplay} to cover the network fee.`
    }
    if (sendAmountMicro > sendBalanceMicro) {
      return `Insufficient ${sendAsset.symbol} balance.`
    }
    if (
      sendAsset.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom &&
      sendAmountMicro + sendFeeMicro > sendBalanceMicro
    ) {
      return `Leave at least ${sendFeeDisplay} for network fees.`
    }
    if (sendBurnTaxMode === "pending" && sendAsset.kind !== "cw20") {
      return "Checking on-chain tax rules..."
    }
    if (sendBurnTaxMode === "error" && sendAsset.kind !== "cw20") {
      return "Tax status could not be verified right now."
    }
    return undefined
  }, [
    account?.address,
    canCoverSendFee,
    chain.name,
    recipient,
    recipientIsValid,
    sendAmountMicro,
    sendAsset.denom,
    sendAsset.kind,
    sendAsset.symbol,
    sendBalanceMicro,
    sendBurnTaxMode,
    sendFeeDisplay,
    sendFeeMicro
  ])
  const canSubmitSend =
    !sendSubmitting && !walletPreparingForTx && !sendSubmitDisabledReason

  const handleReceiveCopy = useCallback(async () => {
    if (!receiveAddress || !navigator?.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(receiveAddress)
      setReceiveCopied(true)
    } catch {
      setReceiveCopied(false)
    }
  }, [receiveAddress])

  const handlePasteRecipient = useCallback(async () => {
    if (!navigator?.clipboard?.readText) return
    try {
      const value = (await navigator.clipboard.readText()).trim()
      if (!value) return
      setSendRecipient(value)
      setSendError(undefined)
    } catch {
      // ignore clipboard failures
    }
  }, [])

  const handleRecentRecipientSelect = useCallback((address: string) => {
    setSendRecipient(address)
    setSendError(undefined)
  }, [])

  const handleSendMax = useCallback(() => {
    setSendAmount(fromMicroAmount(sendMaxMicro, sendAsset.decimals))
    setSendError(undefined)
  }, [sendAsset.decimals, sendMaxMicro])

  const handleSendSubmit = useCallback(async () => {
    if (!account?.address) {
      setSendError("Please connect a wallet first.")
      return
    }

    if (!TERRA_ADDRESS_PATTERN.test(recipient)) {
      setSendError(`Enter a valid ${chain.name} address.`)
      return
    }

    if (sendAmountMicro <= 0n) {
      setSendError("Enter an amount greater than zero.")
      return
    }

    if (!canCoverSendFee) {
      setSendError(`Need at least ${sendFeeDisplay} to cover the network fee.`)
      return
    }

    if (sendAmountMicro > sendBalanceMicro) {
      setSendError(`Insufficient ${sendAsset.symbol} balance.`)
      return
    }

    if (
      sendAsset.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom &&
      sendAmountMicro + sendFeeMicro > sendBalanceMicro
    ) {
      setSendError(`Leave at least ${sendFeeDisplay} for network fees.`)
      return
    }

    setSendSubmitting(true)
    setSendError(undefined)

    try {
      const walletReady = await prepareWalletForTx()
      if (!walletReady) {
        setSendError("Wallet is still syncing. Wait a moment, then submit again.")
        return
      }
      startTx(`Send ${sendAsset.symbol}`)
      if (!connectorId) throw new Error("Wallet not connected")
      const [
        { connectSigningClientForConnector },
        { MsgExecuteContract },
        { MsgSend }
      ] = await Promise.all([
        import("./walletAdapters"),
        import("cosmjs-types/cosmwasm/wasm/v1/tx"),
        import("cosmjs-types/cosmos/bank/v1beta1/tx")
      ])
      const signerAddress = account.address
      const client = await connectSigningClientForConnector(connectorId)
      const msg =
        sendAsset.kind === "cw20"
          ? {
              typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
              value: MsgExecuteContract.fromPartial({
                sender: signerAddress,
                contract: sendAsset.denom,
                msg: encodeJsonBytes({
                  transfer: {
                    recipient,
                    amount: sendAmountMicro.toString()
                  }
                }),
                funds: []
              })
            }
          : {
              typeUrl: "/cosmos.bank.v1beta1.MsgSend",
              value: MsgSend.fromPartial({
                fromAddress: signerAddress,
                toAddress: recipient,
                amount: [
                  {
                    denom: sendAsset.denom,
                    amount: sendAmountMicro.toString()
                  }
                ]
              })
            }

      const result = await client.signAndBroadcast(
        signerAddress,
        [msg],
        "auto",
        sendMemo.trim()
      )
      if (result.code !== 0) {
        throw new Error(result.rawLog || "Send failed")
      }

      if (typeof window !== "undefined") {
        removeLocalStorageValue(
          `cw20balance:${account.address}:${chain.chainId}`
        )
      }
      setRecentRecipients((prev) => {
        const nextEntry: RecentRecipientEntry = {
          address: recipient,
          memoUsed: Boolean(sendMemo.trim()),
          assetDenom: sendAsset.denom,
          assetSymbol: sendAsset.symbol,
          lastUsedAt: Date.now()
        }
        return [nextEntry, ...prev.filter((entry) => entry.address !== recipient)].slice(
          0,
          RECENT_RECIPIENT_LIMIT
        )
      })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["wallet", chain.chainId, "balances", account.address]
        }),
        queryClient.invalidateQueries({
          queryKey: ["cw20-balances", chain.chainId, account.address]
        }),
        queryClient.invalidateQueries({
          queryKey: ["swap-balances", chain.chainId, account.address]
        })
      ])

      finishTx(result.transactionHash)
      resetSendForm()
      setView("wallet")
    } catch (error) {
      const message = formatTxError(error, "Send failed")
      setSendError(message)
      failTx(message)
    } finally {
      setSendSubmitting(false)
    }
  }, [
    account?.address,
    canCoverSendFee,
    chain.chainId,
    chain.name,
    connectorId,
    failTx,
    finishTx,
    prepareWalletForTx,
    queryClient,
    recipient,
    resetSendForm,
    sendAmountMicro,
    sendAsset.denom,
    sendAsset.kind,
    sendAsset.symbol,
    sendBalanceMicro,
    sendFeeDisplay,
    sendFeeMicro,
    sendMemo,
    startTx
  ])

  const handleBack = () => {
    if (view !== "wallet") {
      setView("wallet")
      return
    }
    setIsOpen(false)
  }

  const handleOpenBuyModal = useCallback(() => {
    setBuyModalOpen(true)
  }, [])

  const renderBody = () => {
    if (view === "send") {
      return (
        <div className={`${styles.formPanel} ${styles.sendPanel}`}>
          <div className={styles.formHeaderWrapper}>
            <h1>Send</h1>
          </div>
          <div className={styles.formContainer}>
            <div className={styles.sendHeroCard}>
              <div className={styles.sendHeroTop}>
                <div className={styles.sendHeroIdentity}>
                  <div className={styles.sendHeroBadge}>
                    <WalletAssetIcon
                      symbol={sendAsset.symbol}
                      candidates={sendAssetIconCandidates}
                    />
                  </div>
                  <div className={styles.sendHeroText}>
                    <span className={styles.sendHeroKicker}>Sending</span>
                    <strong className={styles.sendHeroSymbol}>{sendAsset.symbol}</strong>
                    <span className={styles.sendHeroName}>{sendAsset.name}</span>
                  </div>
                </div>
                <span className={styles.sendChainBadge}>{chain.shortName}</span>
              </div>
              <div className={styles.sendHeroMeta}>
                <div className={styles.sendHeroMetric}>
                  <span>Available</span>
                  <strong>{account ? sendAvailableDisplay : "--"}</strong>
                  <small>{account && sendBalanceValue !== undefined ? formatUsd(sendBalanceValue) : "--"}</small>
                </div>
                <div className={styles.sendHeroMetric}>
                  <span>Network fee</span>
                  <strong>{sendFeeDisplay}</strong>
                  <small>Paid in {nativeSymbol}</small>
                </div>
                <div className={styles.sendHeroMetric}>
                  <span>{isClassic ? "Burn tax" : "Network tax"}</span>
                  <strong>{sendTaxMetricDisplay}</strong>
                  <small>{sendTaxStateLabel}</small>
                </div>
              </div>
            </div>
            <div className={styles.formField}>
              <div className={styles.fieldHeader}>
                <label>Recipient</label>
                <button
                  className={styles.inlineActionButton}
                  type="button"
                  onClick={handlePasteRecipient}
                >
                  Paste
                </button>
              </div>
              <input
                placeholder="terra..."
                aria-label="Recipient"
                value={sendRecipient}
                onChange={(event) => {
                  setSendRecipient(event.target.value)
                  if (sendError) setSendError(undefined)
                }}
              />
              <div className={`${styles.fieldHintRow} ${recipientStatusClass}`}>
                <span className={styles.fieldHintBadge}>{recipientStatusLabel}</span>
                <span className={styles.fieldHintText}>{recipientStatusText}</span>
              </div>
              {visibleRecentRecipients.length ? (
                <div className={styles.recentRecipients}>
                  <span className={styles.recentRecipientsLabel}>Recent</span>
                  <div className={styles.recentRecipientsList}>
                    {visibleRecentRecipients.map((entry) => (
                      <button
                        key={entry.address}
                        className={styles.recentRecipientButton}
                        type="button"
                        onClick={() => handleRecentRecipientSelect(entry.address)}
                      >
                        <span className={styles.recentRecipientAddress}>
                          {formatShortAddress(entry.address)}
                        </span>
                        <span className={styles.recentRecipientMeta}>
                          {entry.assetSymbol}
                          {entry.memoUsed ? " • memo" : " • no memo"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className={styles.formField}>
              <div className={styles.fieldHeader}>
                <label>Amount</label>
                <button
                  className={styles.maxButton}
                  type="button"
                  onClick={handleSendMax}
                >
                  Max
                </button>
              </div>
              <div className={styles.sendAmountCard}>
                <div className={styles.amountRow}>
                  <input
                    className={styles.sendAmountInput}
                    placeholder="0.0"
                    aria-label="Amount"
                    inputMode="decimal"
                    value={sendAmount}
                    onChange={(event) => {
                      setSendAmount(sanitizeAmount(event.target.value))
                      if (sendError) setSendError(undefined)
                    }}
                  />
                  <span className={styles.sendAssetChip}>
                    {sendAsset.symbol}
                  </span>
                </div>
                <div className={styles.sendAmountMeta}>
                  <span>{sendAmountValue !== undefined ? formatUsd(sendAmountValue) : "≈ --"}</span>
                  <span>{account ? `Remaining ${sendRemainingDisplay}` : "Remaining --"}</span>
                </div>
              </div>
              <div className={styles.fieldHint}>
                Available: {account ? sendAvailableDisplay : "--"}
              </div>
            </div>
            <div className={styles.formField}>
              <label>Memo (optional)</label>
              <input
                placeholder="Optional"
                aria-label="Memo"
                value={sendMemo}
                onChange={(event) => setSendMemo(event.target.value)}
              />
              <div className={`${styles.memoHint} ${memoHintToneClass}`}>
                <strong>{memoHintTitle}</strong>
                <span>{memoHintText}</span>
              </div>
            </div>
            <div className={`${styles.formNotice} ${sendNoticeToneClass}`}>
              <span className={styles.warningIcon} aria-hidden="true" />
              <div className={styles.formNoticeContent}>
                <div className={styles.formNoticeHeader}>
                  <strong>{sendNoticeTitle}</strong>
                  <span>{sendTaxStateLabel}</span>
                </div>
                <span className={styles.formNoticeText}>
                  Check whether the recipient requires a memo. Network fees are paid in {nativeSymbol}.
                  {isClassic ? ` Current on-chain burn tax rate: ${taxRatePercentDisplay}. ` : " "}
                  {sendTaxWarningText}
                </span>
              </div>
            </div>
            {sendError ? (
              <div className={styles.formError}>{sendError}</div>
            ) : null}
            <div className={styles.formSummary}>
              <div className={styles.summarySection}>
                <span className={styles.summarySectionLabel}>You pay</span>
                <div className={styles.summaryPrimaryRow}>
                  <span className={styles.summaryPrimaryLabel}>Send amount</span>
                  <div className={styles.summaryPrimaryValue}>
                    <strong>
                      {sendAmountMicro > 0n
                        ? `${formatTokenAmount(sendAmountMicro.toString(), sendAsset.decimals, 4)} ${sendAsset.symbol}`
                        : "--"}
                    </strong>
                    <small>
                      {sendAmountValue !== undefined ? formatUsd(sendAmountValue) : "≈ --"}
                    </small>
                  </div>
                </div>
                <div className={styles.detailRow}>
                  <span>Network fee</span>
                  <strong>{sendFeeDisplay}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>
                    {isClassic
                      ? `Burn tax (${taxRatePercentDisplay})`
                      : "Network tax"}
                  </span>
                  <strong>{sendBurnTaxSummaryDisplay}</strong>
                </div>
              </div>
              <div className={styles.summaryDivider} />
              <div className={styles.summarySection}>
                <span className={styles.summarySectionLabel}>Recipient gets</span>
                <div className={`${styles.summaryPrimaryRow} ${styles.summaryPrimaryAccent}`}>
                  <span className={styles.summaryPrimaryLabel}>Recipient receives</span>
                  <div className={styles.summaryPrimaryValue}>
                    <strong>{sendRecipientReceivesSummaryDisplay}</strong>
                    <small>
                      {sendRecipientReceivesValue !== undefined
                        ? formatUsd(sendRecipientReceivesValue)
                        : "≈ --"}
                    </small>
                  </div>
                </div>
                <div className={styles.detailRow}>
                  <span>After send</span>
                  <strong>{account ? sendRemainingDisplay : "--"}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Portfolio after</span>
                  <strong>
                    {sendRemainingValue !== undefined ? formatUsd(sendRemainingValue) : "--"}
                  </strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Delivery</span>
                  <strong>{sendFlowLabel}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Estimated time</span>
                  <strong>~10 sec</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (view === "receive") {
      return (
        <div className={`${styles.formPanel} ${styles.receivePanel}`}>
          <div className={styles.formHeaderWrapper}>
            <h1>Receive</h1>
          </div>
          <div className={styles.formContainer}>
            <div className={`${styles.sendHeroCard} ${styles.receiveHeroCard}`}>
              <div className={styles.sendHeroTop}>
                <div className={styles.sendHeroIdentity}>
                  <div className={styles.sendHeroBadge}>
                    <WalletAssetIcon
                      symbol={selectedSymbol}
                      candidates={selectedIconCandidates}
                    />
                  </div>
                  <div className={styles.sendHeroText}>
                    <span className={styles.sendHeroKicker}>Receiving</span>
                    <strong className={styles.sendHeroSymbol}>{selectedSymbol}</strong>
                    <span className={styles.sendHeroName}>{selectedAsset.name}</span>
                  </div>
                </div>
                <span className={styles.sendChainBadge}>{chain.shortName}</span>
              </div>
              <div className={styles.sendHeroMeta}>
                <div className={styles.sendHeroMetric}>
                  <span>Your balance</span>
                  <strong>{account ? `${selectedAmountDisplay} ${selectedSymbol}` : "--"}</strong>
                  <small>{account && selectedValue !== undefined ? formatUsd(selectedValue) : "--"}</small>
                </div>
                <div className={styles.sendHeroMetric}>
                  <span>Network</span>
                  <strong>{chain.name}</strong>
                  <small>Same address format, different network</small>
                </div>
                <div className={styles.sendHeroMetric}>
                  <span>Address</span>
                  <strong>{receiveAddressPreview}</strong>
                  <small>{receiveAddressStatus}</small>
                </div>
              </div>
            </div>

            <div className={styles.receiveQrCard}>
              <div className={styles.receiveQrHeader}>
                <div>
                  <div className={styles.receiveQrTitle}>Wallet address QR</div>
                  <div className={styles.receiveQrSubtitle}>
                    Scan from another device or copy the full address below.
                  </div>
                </div>
              </div>
              <div className={styles.receiveQrFrame}>
                <div className={styles.receiveQrBox}>
                  {receiveAddress ? (
                    receiveQrDataUrl ? (
                      <img src={receiveQrDataUrl} alt="Wallet address QR code" />
                    ) : (
                      <div className={styles.receiveQrStatus}>
                        {receiveQrError ? "QR code unavailable" : "Loading QR code..."}
                      </div>
                    )
                  ) : (
                    <div className={styles.receiveQrStatus}>Connect wallet to show QR</div>
                  )}
                </div>
              </div>
              <div className={styles.receiveActionRow}>
                <button
                  className={`${styles.receiveActionButton} ${styles.receiveActionPrimary}`}
                  type="button"
                  onClick={handleReceiveCopy}
                  disabled={!receiveAddress}
                >
                  {receiveCopied ? "Copied" : "Copy address"}
                </button>
                <a
                  className={styles.receiveActionButton}
                  href={receiveFinderUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!receiveFinderUrl}
                  onClick={(event) => {
                    if (!receiveFinderUrl) event.preventDefault()
                  }}
                >
                  Open in Finder
                </a>
              </div>
            </div>

            <div className={styles.receiveAddressCard}>
              <span className={styles.receiveSectionLabel}>Address</span>
              <div className={styles.receiveAddressValue}>
                {receiveAddress || `Connect wallet to reveal your ${chain.name} address.`}
              </div>
            </div>

            <div className={`${styles.formNotice} ${styles.formNoticeNeutral}`}>
              <span className={styles.warningIcon} aria-hidden="true" />
              <div className={styles.formNoticeContent}>
                <div className={styles.formNoticeHeader}>
                  <strong>Receive on {chain.name} only</strong>
                  <span>Memo-sensitive routes</span>
                </div>
                <span className={styles.formNoticeText}>
                  Only send {chain.name} assets supported by the sending wallet or exchange.
                  Some services require a memo to credit deposits. When in doubt, confirm the
                  destination instructions before transferring funds.
                </span>
              </div>
            </div>

            <div className={styles.receiveFacts}>
              <span className={styles.receiveSectionLabel}>Quick checks</span>
              <div className={styles.detailRow}>
                <span>Address format</span>
                <strong>terra1...</strong>
              </div>
              <div className={styles.detailRow}>
                <span>Selected asset</span>
                <strong>{selectedSymbol}</strong>
              </div>
              <div className={styles.detailRow}>
                <span>Contract tokens</span>
                <strong>Only if sender supports {chain.shortName} CW20</strong>
              </div>
              <div className={styles.detailRow}>
                <span>Exchange deposits</span>
                <strong>Check memo requirement first</strong>
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (view === "asset") {
      return (
        <WalletPanelAssetChains
          accountConnected={Boolean(account)}
          selectedAmountDisplay={selectedAmountDisplay}
          selectedAsset={selectedAsset}
          selectedValue={selectedValue}
        />
      )
    }

    return (
      <WalletPanelAssetList
        accountConnected={Boolean(account)}
        assetRows={filteredAssetRows}
        isBalanceError={isBalanceError}
        isBalanceLoading={isBalanceLoading}
        onAssetSelect={(asset) => {
          setSelectedAsset({
            symbol: asset.symbol,
            name: asset.name,
            denom: asset.denom,
            decimals: asset.decimals
          })
          setView("asset")
        }}
        onManage={() => setManageOpen(true)}
        onRetryBalances={handleRetryBalances}
      />
    )
  }

  return (
    <>
      <aside className={`${styles.wallet} ${!isOpen ? styles.closed : ""}`}>
        <button
          className={styles.close}
          onClick={() => setIsOpen((open) => !open)}
          aria-label="Toggle wallet"
          type="button"
        >
          {isOpen ? (
            <>
              <WalletCloseIcon className={styles.closeIcon} />
              <WalletCloseIconMobile className={styles.closeIconMobile} />
            </>
          ) : (
            <>
              <span aria-hidden="true">Wallet</span>
              <WalletIcon className={styles.walletIcon} />
            </>
          )}
        </button>
        {isOpen && view !== "wallet" ? (
          <button
            className={styles.backButton}
            type="button"
            onClick={handleBack}
            aria-label="Back to wallet"
          >
            <BackIcon className={styles.backIcon} />
          </button>
        ) : null}
        <WalletPanelDetails
          view={view}
          accountConnected={Boolean(account)}
          netWorthValue={netWorthValue}
          selectedSymbol={selectedSymbol}
          selectedIconCandidates={selectedIconCandidates}
          selectedValue={selectedValue}
          selectedAmountDisplay={selectedAmountDisplay}
          onSend={() => openSendView(selectedAssetRow ?? selectedAsset)}
          onReceive={() => openReceiveView(selectedAssetRow ?? selectedAsset)}
          onBuy={handleOpenBuyModal}
        />
        {renderBody()}
        <WalletPanelActions
          view={view}
          canSubmitSend={canSubmitSend}
          sendSubmitting={sendSubmitting}
          walletPreparingForTx={walletPreparingForTx}
          sendSymbol={sendAsset.symbol}
          sendSubmitDisabledReason={sendSubmitDisabledReason}
          sendRecipientReceivesSummaryDisplay={
            sendRecipientReceivesSummaryDisplay
          }
          onSendSubmit={handleSendSubmit}
          onAssetSend={() => openSendView(selectedAssetRow ?? selectedAsset)}
          onAssetReceive={() =>
            openReceiveView(selectedAssetRow ?? selectedAsset)
          }
          onAssetSwap={handleAssetSwap}
        />
      </aside>
      <ManageTokensModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        items={manageItems}
        search={manageSearch}
        onSearchChange={setManageSearch}
        hideNonWhitelisted={hideNonWhitelisted}
        onToggleHideNonWhitelisted={() =>
          setHideNonWhitelisted((value) => !value)
        }
        hideLowBalance={hideLowBalance}
        onToggleHideLowBalance={() => setHideLowBalance((value) => !value)}
        onToggleToken={toggleHiddenToken}
      />
      <WalletBuyModal
        open={buyModalOpen}
        onClose={() => setBuyModalOpen(false)}
        assets={isClassic ? ["LUNC", "USTC"] : ["LUNA"]}
      />
    </>
  )
}

export default WalletPanel
