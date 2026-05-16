import { useCallback, useEffect, useMemo, useState } from "react"
import type { SVGProps } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import styles from "./WalletPanel.module.css"
import { useWallet } from "./WalletContext"
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
import {
  formatPercent,
  formatTokenAmount,
  formatUsd,
  toUnitAmount
} from "../utils/format"
import { formatTxError } from "../utils/txError"

type IconProps = SVGProps<SVGSVGElement>

const WalletCloseIcon = (props: IconProps) => (
  <svg viewBox="0 0 8 20" width="18" height="18" aria-hidden="true" {...props}>
    <path
      d="M1.99984 0L0.589844 2.35L5.16984 10L0.589844 17.65L1.99984 20L7.99984 10L1.99984 0Z"
      fill="currentColor"
    />
  </svg>
)

const WalletCloseIconMobile = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path
      d="M6 6l12 12M18 6L6 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const WalletIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
    <path
      d="M21 18v1c0 1.1-.9 2-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14c1.1 0 2 .9 2 2v1h-9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9Zm-9-2h10V8H12v8Zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5Z"
      fill="currentColor"
    />
  </svg>
)

const BackIcon = (props: IconProps) => (
  <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" {...props}>
    <path d="M11.7 3.6L6.3 9l5.4 5.4L10.5 15.6 3.9 9l6.6-6.6 1.2 1.2Z" />
  </svg>
)

const SendIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
    <path
      d="M4 12h12M12 4l8 8-8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const ReceiveIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
    <path
      d="M20 12H8M12 20l-8-8 8-8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const ManageIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
    <path
      d="M4 7h10M4 12h16M4 17h8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
)

const BuyIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path
      d="M12 5v14M5 12h14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
)

const PriceUpIcon = (props: IconProps) => (
  <svg viewBox="0 0 14 8" width="14" height="8" aria-hidden="true" {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.60011 1.6C8.15828 1.6 7.80011 1.24183 7.80011 0.8C7.80011 0.358172 8.15828 0 8.60011 0H12.6001C13.0419 0 13.4001 0.358172 13.4001 0.8V4.8C13.4001 5.24183 13.0419 5.6 12.6001 5.6C12.1583 5.6 11.8001 5.24183 11.8001 4.8V2.73137L8.36579 6.16569C8.05337 6.47811 7.54684 6.47811 7.23442 6.16569L5.4001 4.33137L1.96578 7.76569C1.65336 8.0781 1.14683 8.0781 0.834412 7.76569C0.521993 7.45327 0.521993 6.94673 0.834412 6.63432L4.83442 2.63431C5.14684 2.3219 5.65337 2.3219 5.96579 2.63431L7.80011 4.46863L10.6687 1.6H8.60011Z"
      fill="currentColor"
    />
  </svg>
)

const PriceDownIcon = (props: IconProps) => (
  <svg viewBox="0 0 14 8" width="14" height="8" aria-hidden="true" {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.60011 6.4C8.15828 6.4 7.80011 6.75817 7.80011 7.2C7.80011 7.64183 8.15828 8 8.60011 8H12.6001C13.0419 8 13.4001 7.64183 13.4001 7.2V3.2C13.4001 2.75817 13.0419 2.4 12.6001 2.4C12.1583 2.4 11.8001 2.75817 11.8001 3.2V5.26863L8.36579 1.83431C8.05337 1.52189 7.54684 1.52189 7.23442 1.83431L5.4001 3.66863L1.96578 0.234314C1.65336 -0.078105 1.14683 -0.078105 0.834412 0.234314C0.521993 0.546734 0.521993 1.05327 0.834412 1.36568L4.83442 5.36569C5.14684 5.6781 5.65337 5.6781 5.96579 5.36569L7.80011 3.53137L10.6687 6.4H8.60011Z"
      fill="currentColor"
    />
  </svg>
)

type SelectedAsset = {
  symbol: string
  name: string
  denom: string
  decimals: number
}

type SendAsset = SelectedAsset & {
  kind: WalletAssetRow["kind"]
  amount: string
}

type RecentRecipientEntry = {
  address: string
  memoUsed: boolean
  assetDenom: string
  assetSymbol: string
  lastUsedAt: number
}

const GAS_PRICE_MICRO_LUNC = 28.325
const FALLBACK_SEND_GAS_NATIVE = 90_000
const FALLBACK_SEND_GAS_CW20 = 140_000
const RECENT_RECIPIENT_LIMIT = 4
const DEFAULT_SEND_ASSET: SelectedAsset = {
  symbol: "LUNC",
  name: "Terra Classic",
  denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
  decimals: CLASSIC_DENOMS.lunc.coinDecimals
}
const TERRA_ADDRESS_PATTERN = /^terra1[0-9a-z]{38}$/

const encodeJsonBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value))

const sanitizeAmount = (value: string) => {
  let next = value.replace(/,/g, "").replace(/[^\d.]/g, "")
  const firstDot = next.indexOf(".")
  if (firstDot >= 0) {
    next = next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, "")
  }
  return next
}

const parseBigInt = (value?: string) => {
  if (!value) return 0n
  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

const toMicroAmount = (value: string, decimals = 6) => {
  const cleaned = sanitizeAmount(value).trim()
  if (!cleaned) return 0n
  const [wholePartRaw, fracPartRaw = ""] = cleaned.split(".")
  const wholePart = wholePartRaw || "0"
  if (!/^\d+$/.test(wholePart) || (fracPartRaw && !/^\d+$/.test(fracPartRaw))) {
    return 0n
  }
  const fracPart = fracPartRaw.slice(0, decimals).padEnd(decimals, "0")
  const merged = `${wholePart}${fracPart}`.replace(/^0+/, "") || "0"
  return parseBigInt(merged)
}

const fromMicroAmount = (value: bigint, decimals = 6) => {
  if (value <= 0n) return "0"
  if (decimals <= 0) return value.toString()
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "")
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString()
}

const toSelectedAsset = (
  asset: Pick<WalletAssetRow, "denom" | "symbol" | "name" | "decimals">
): SelectedAsset => ({
  symbol: asset.symbol,
  name: asset.name,
  denom: asset.denom,
  decimals: asset.decimals
})

const formatShortAddress = (value: string) => {
  if (value.length <= 16) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

const getRecentRecipientsStorageKey = (address: string) =>
  `burritoRecentRecipients:${address}:classic`

const WalletPanel = () => {
  const { account, connectorId, startTx, finishTx, failTx } = useWallet()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem("burritoWalletOpen") === "true"
  })
  const [view, setView] = useState<"wallet" | "send" | "receive" | "asset">(
    "wallet"
  )
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
    queryKey: ["burn-tax-rate"],
    queryFn: fetchBurnTaxRate,
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

  const handleRetryBalances = useCallback(() => {
    if (!account?.address) return
    void queryClient.invalidateQueries({
      queryKey: ["wallet", "balances", account.address]
    })
    void queryClient.invalidateQueries({
      queryKey: ["cw20-balances", account.address]
    })
  }, [account?.address, queryClient])

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
      window.localStorage.setItem("burritoWalletOpen", String(isOpen))
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

    const stored = window.localStorage.getItem(
      getRecentRecipientsStorageKey(account.address)
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
  }, [account?.address])

  useEffect(() => {
    if (typeof window === "undefined" || !account?.address) return
    window.localStorage.setItem(
      getRecentRecipientsStorageKey(account.address),
      JSON.stringify(recentRecipients.slice(0, RECENT_RECIPIENT_LIMIT))
    )
  }, [account?.address, recentRecipients])

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
    ? `https://finder.burrito.money/classic/address/${receiveAddress}`
    : undefined
  const receiveAddressPreview = receiveAddress
    ? formatShortAddress(receiveAddress)
    : "Connect wallet"
  const receiveAddressStatus = receiveAddress
    ? "Terra Classic wallet address"
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
            GAS_PRICE_MICRO_LUNC
        )
      ),
    [sendAsset.kind]
  )
  const sendFeeDisplay = useMemo(
    () => `${formatTokenAmount(sendFeeMicro.toString(), 6, 6)} LUNC`,
    [sendFeeMicro]
  )
  const luncBalanceMicro = useMemo(() => parseBigInt(luncAmount), [luncAmount])
  const requiresLuncFee = sendAsset.denom !== CLASSIC_DENOMS.lunc.coinMinimalDenom
  const recipient = sendRecipient.trim()
  const recipientIsValid = TERRA_ADDRESS_PATTERN.test(recipient)
  const canQuerySendTaxable =
    Boolean(account?.address) && recipientIsValid && sendAsset.kind !== "cw20"
  const {
    data: sendTaxable,
    isFetching: sendTaxableFetching,
    isError: sendTaxableError
  } = useQuery({
    queryKey: ["send-taxable", account?.address, recipient, sendAsset.kind],
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
    sendTaxableFetching
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
    if (!sendRecipient.trim()) return "Only Terra Classic addresses are supported."
    return TERRA_ADDRESS_PATTERN.test(sendRecipient.trim())
      ? "Valid Terra Classic address."
      : "Address must start with terra1."
  }, [sendRecipient])
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
  }, [burnTaxRate, sendBurnTaxMode])
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
  }, [burnTaxRate, sendBurnTaxMode])
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
    if (!recipient) return "Enter a Terra Classic recipient."
    if (!recipientIsValid) return "Enter a valid Terra Classic address."
    if (sendAmountMicro <= 0n) return "Enter an amount greater than zero."
    if (!canCoverSendFee) {
      return `Need at least ${sendFeeDisplay} in LUNC to cover the network fee.`
    }
    if (sendAmountMicro > sendBalanceMicro) {
      return `Insufficient ${sendAsset.symbol} balance.`
    }
    if (
      sendAsset.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom &&
      sendAmountMicro + sendFeeMicro > sendBalanceMicro
    ) {
      return `Leave at least ${sendFeeDisplay} in LUNC for network fees.`
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
  const canSubmitSend = !sendSubmitting && !sendSubmitDisabledReason

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
      setSendError("Enter a valid Terra Classic address.")
      return
    }

    if (sendAmountMicro <= 0n) {
      setSendError("Enter an amount greater than zero.")
      return
    }

    if (!canCoverSendFee) {
      setSendError(`Need at least ${sendFeeDisplay} in LUNC to cover the network fee.`)
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
      setSendError(`Leave at least ${sendFeeDisplay} in LUNC for network fees.`)
      return
    }

    setSendSubmitting(true)
    setSendError(undefined)

    try {
      startTx(`Send ${sendAsset.symbol}`)
      if (!connectorId) throw new Error("Wallet not connected")
      const [
        { connectClassicSigningClientForConnector, getSignerAddressForConnector },
        { MsgExecuteContract },
        { MsgSend }
      ] = await Promise.all([
        import("./walletAdapters"),
        import("cosmjs-types/cosmwasm/wasm/v1/tx"),
        import("cosmjs-types/cosmos/bank/v1beta1/tx")
      ])
      const signerAddress = await getSignerAddressForConnector(connectorId)
      const client = await connectClassicSigningClientForConnector(connectorId)
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
        window.localStorage.removeItem(`cw20balance:${account.address}:classic`)
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
        queryClient.invalidateQueries({ queryKey: ["wallet", "balances", account.address] }),
        queryClient.invalidateQueries({ queryKey: ["cw20-balances", account.address] }),
        queryClient.invalidateQueries({ queryKey: ["swap-balances", account.address] })
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
    connectorId,
    failTx,
    finishTx,
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

  const renderDetails = () => {
    if (view === "asset") {
      return (
        <div className={styles.details}>
          <div className={styles.assetDetails}>
            <div className={styles.assetBadgeLarge}>
              <WalletAssetIcon
                symbol={selectedSymbol}
                candidates={selectedIconCandidates}
              />
            </div>
            <div className={styles.assetDetailValue}>
              {account ? formatUsd(selectedValue) : "--"}
            </div>
            <div className={styles.assetDetailAmount}>
              {account ? `${selectedAmountDisplay} ${selectedSymbol}` : "--"}
            </div>
          </div>
        </div>
      )
    }

    if (view !== "wallet") return null

    return (
      <div className={styles.details}>
        <div className={styles.networthHeader}>
          <div>
            <div className={styles.kicker}>Portfolio value</div>
            <div className={styles.networthValue}>
              {netWorthValue}
            </div>
          </div>
        </div>

        <div className={styles.networthActions}>
          <div className={styles.actionItem}>
            <button
              className={`${styles.actionButton} ${styles.actionPrimary}`}
              type="button"
              onClick={() => openSendView(selectedAssetRow ?? selectedAsset)}
            >
              <SendIcon />
            </button>
            <span>Send</span>
          </div>
          <div className={styles.actionItem}>
            <button
              className={styles.actionButton}
              type="button"
              onClick={() => openReceiveView(selectedAssetRow ?? selectedAsset)}
            >
              <ReceiveIcon />
            </button>
            <span>Receive</span>
          </div>
          <div className={styles.actionItem}>
            <button
              className={styles.actionButton}
              type="button"
              onClick={handleOpenBuyModal}
            >
              <BuyIcon />
            </button>
            <span>Buy</span>
          </div>
        </div>
      </div>
    )
  }

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
                <span className={styles.sendChainBadge}>Classic</span>
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
                  <small>Paid in LUNC</small>
                </div>
                <div className={styles.sendHeroMetric}>
                  <span>Burn tax</span>
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
                  Check whether the recipient requires a memo. Network fees are paid in
                  LUNC. Current on-chain burn tax rate: {taxRatePercentDisplay}.{" "}
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
                  <span>Burn tax ({taxRatePercentDisplay})</span>
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
                <span className={styles.sendChainBadge}>Classic</span>
              </div>
              <div className={styles.sendHeroMeta}>
                <div className={styles.sendHeroMetric}>
                  <span>Your balance</span>
                  <strong>{account ? `${selectedAmountDisplay} ${selectedSymbol}` : "--"}</strong>
                  <small>{account && selectedValue !== undefined ? formatUsd(selectedValue) : "--"}</small>
                </div>
                <div className={styles.sendHeroMetric}>
                  <span>Network</span>
                  <strong>Terra Classic</strong>
                  <small>Same address for Classic assets</small>
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
                {receiveAddress || "Connect wallet to reveal your Terra Classic address."}
              </div>
            </div>

            <div className={`${styles.formNotice} ${styles.formNoticeNeutral}`}>
              <span className={styles.warningIcon} aria-hidden="true" />
              <div className={styles.formNoticeContent}>
                <div className={styles.formNoticeHeader}>
                  <strong>Receive on Terra Classic only</strong>
                  <span>Memo-sensitive routes</span>
                </div>
                <span className={styles.formNoticeText}>
                  Only send Terra Classic assets supported by the sending wallet or exchange.
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
                <strong>Only if sender supports Classic CW20</strong>
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
        <div className={styles.assetList}>
          <div className={styles.chainSectionContainer}>
            <div className={styles.chainSection}>
              <div className={styles.chainSectionTitle}>
                <h3>Chains</h3>
              </div>
              <div className={styles.chainSectionList}>
                {[
                  {
                    name: "columbus-5",
                    value: account ? formatUsd(selectedValue) : "--",
                    amount: account
                      ? `${selectedAmountDisplay} ${selectedAsset.symbol}`
                      : "--"
                  }
                ].map((row) => (
                  <div key={row.name} className={styles.chainRowItem}>
                    <div className={styles.chainRowHeader}>
                      <span>{row.name}</span>
                    </div>
                    <div className={styles.chainRowValue}>{row.value}</div>
                    <div className={styles.chainRowAmount}>{row.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className={styles.assetList}>
        <div className={styles.assetHeader}>
          <div className={styles.assetTitle}>Assets</div>
          <button
            className={styles.manageButton}
            type="button"
            onClick={() => setManageOpen(true)}
          >
            Manage
            <ManageIcon />
          </button>
        </div>

        <div className={styles.assetRows}>
          {isBalanceLoading ? (
            <div className={styles.assetEmpty}>Loading balances...</div>
          ) : isBalanceError ? (
            <div className={styles.assetEmpty}>
              <span>Balance data unavailable.</span>
              <button
                className={styles.assetRetryButton}
                type="button"
                onClick={handleRetryBalances}
              >
                Retry balances
              </button>
            </div>
          ) : filteredAssetRows.length === 0 ? (
            <div className={styles.assetEmpty}>
              {account ? "No assets found" : "Connect a wallet to view assets"}
            </div>
          ) : (
            filteredAssetRows.map((asset) => {
              const hasChange = asset.change !== undefined
              const changeValue = asset.change ?? 0
              return (
                <div
                  key={asset.denom}
                  className={styles.assetRow}
                  onClick={() => {
                    setSelectedAsset({
                      symbol: asset.symbol,
                      name: asset.name,
                      denom: asset.denom,
                      decimals: asset.decimals
                    })
                    setView("asset")
                  }}
                >
                  <div className={styles.assetInfo}>
                    <div
                      className={styles.assetBadge}
                      data-chain={asset.chainCount > 1 ? "multi" : "single"}
                    >
                      <WalletAssetIcon
                        symbol={asset.symbol}
                        candidates={asset.iconCandidates ?? []}
                      />
                    </div>
                    <div className={styles.assetRowDetails}>
                      <div className={styles.assetTopRow}>
                        <div className={styles.assetSymbol}>
                          <span className={styles.assetSymbolName}>
                            {asset.symbol}
                          </span>
                          {asset.chainCount > 1 ? (
                            <span className={styles.chainCount}>
                              {asset.chainCount}
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.assetPrice}>
                          {formatUsd(asset.value)}
                        </div>
                      </div>
                      <div className={styles.assetBottomRow}>
                        <div
                          className={`${styles.assetChange} ${
                            hasChange
                              ? changeValue >= 0
                                ? styles.assetChangeUp
                                : styles.assetChangeDown
                              : styles.assetChangeMuted
                          }`}
                        >
                          {hasChange ? (
                            changeValue >= 0 ? (
                              <PriceUpIcon />
                            ) : (
                              <PriceDownIcon />
                            )
                          ) : null}
                          {hasChange ? formatPercent(changeValue) : "--"}
                        </div>
                        <div className={styles.assetAmount}>
                          {account
                            ? `${formatTokenAmount(
                                asset.amount,
                                asset.decimals,
                                2
                              )}`
                            : "--"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  const renderActions = () => {
    if (view === "send") {
      return (
        <div className={styles.actions}>
          <button
            className="uiButton uiButtonPrimary"
            type="button"
            onClick={handleSendSubmit}
            disabled={!canSubmitSend}
          >
            {sendSubmitting ? "Sending..." : `Send ${sendAsset.symbol}`}
          </button>
          <div className={styles.actionHint}>
            {sendSubmitDisabledReason ??
              `Recipient receives ${sendRecipientReceivesSummaryDisplay}`}
          </div>
        </div>
      )
    }

    if (view === "asset") {
      return (
        <div className={styles.actions}>
          <button
            className="uiButton uiButtonPrimary"
            type="button"
            onClick={() => openSendView(selectedAssetRow ?? selectedAsset)}
          >
            Send
          </button>
          <button
            className="uiButton uiButtonOutline"
            type="button"
            onClick={() => openReceiveView(selectedAssetRow ?? selectedAsset)}
          >
            Receive
          </button>
        </div>
      )
    }

    return null
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
              <span>Wallet</span>
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
        {renderDetails()}
        {renderBody()}
        {renderActions()}
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
        assets={["LUNC", "USTC"]}
      />
    </>
  )
}

export default WalletPanel
