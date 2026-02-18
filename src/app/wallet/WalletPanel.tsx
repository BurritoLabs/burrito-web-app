import { useEffect, useMemo, useRef, useState } from "react"
import type { SVGProps } from "react"
import styles from "./WalletPanel.module.css"
import { useWallet } from "./WalletProvider"
import { useQuery } from "@tanstack/react-query"
import { CLASSIC_DENOMS } from "../chain"
import {
  fetchBalances,
  fetchFxRates,
  fetchPrices,
  fetchSwapRates,
  getCachedFxRates,
  getCachedPrices
} from "../data/classic"
import { useCw20Balances } from "../data/cw20"
import {
  useCw20Whitelist,
  useResolvedIbcWhitelist
} from "../data/terraAssets"
import ManageTokensModal from "./ManageTokensModal"
import type { ManageTokenItem } from "./ManageTokensModal"
import {
  formatPercent,
  formatTokenAmount,
  formatUsd,
  toUnitAmount
} from "../utils/format"

type IconProps = SVGProps<SVGSVGElement>

const ASSET_URL = "https://assets.terra.dev"

type AssetRow = {
  kind: "native" | "ibc" | "cw20"
  denom: string
  symbol: string
  name: string
  decimals: number
  amount: string
  price?: number
  change?: number
  value?: number
  chainCount: number
  whitelisted: boolean
  iconCandidates: string[]
}

const isAssetRow = (row: AssetRow | undefined): row is AssetRow => Boolean(row)

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

const buildIconCandidates = ({
  icon,
  denom,
  isClassic
}: {
  icon?: string
  denom: string
  isClassic: boolean
}) => {
  const isClassicStable = isClassic && formatDenom(denom, true).endsWith("TC")
  const iconDenom = denom === "uluna" ? "LUNC" : formatDenom(denom, false)
  const candidates = [
    icon,
    `${ASSET_URL}/icon/60/${iconDenom}.png`,
    `${ASSET_URL}/icon/svg/${iconDenom}.svg`,
    `${ASSET_URL}/icon/60/${String(iconDenom).toUpperCase()}.png`,
    `${ASSET_URL}/icon/svg/${String(iconDenom).toUpperCase()}.svg`,
    `${ASSET_URL}/icon/60/${String(iconDenom).toLowerCase()}.png`,
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
    "/system/cw20.svg"
  ].filter(Boolean) as string[]

  return candidates
}

const AssetIcon = ({
  symbol,
  candidates
}: {
  symbol: string
  candidates: string[]
}) => {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)

  if (failed || !candidates.length) {
    return <span>{symbol.slice(0, 1)}</span>
  }

  return (
    <img
      src={candidates[index]}
      alt={symbol}
      style={{ borderRadius: "50%", objectFit: "cover", display: "block" }}
      onError={() => {
        if (index < candidates.length - 1) {
          setIndex(index + 1)
        } else {
          setFailed(true)
        }
      }}
    />
  )
}

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

const WalletPanel = () => {
  const { account } = useWallet()
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem("burritoWalletOpen") === "true"
  })
  const [animateOpen, setAnimateOpen] = useState(false)
  const hasAnimatedRef = useRef(false)
  const [view, setView] = useState<"wallet" | "send" | "receive" | "asset">(
    "wallet"
  )
  const [manageOpen, setManageOpen] = useState(false)
  const [manageSearch, setManageSearch] = useState("")
  const [hideNonWhitelisted, setHideNonWhitelisted] = useState(false)
  const [hideLowBalance, setHideLowBalance] = useState(() => {
    if (typeof window === "undefined") return true
    const stored = window.localStorage.getItem("burritoHideLowBalance")
    return stored ? stored === "true" : true
  })
  const [hiddenTokens, setHiddenTokens] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    const stored = window.localStorage.getItem("burritoHiddenTokens")
    if (!stored) return []
    try {
      const parsed = JSON.parse(stored) as string[]
      if (!Array.isArray(parsed)) return []
      return parsed.filter(
        (key) =>
          key !== CLASSIC_DENOMS.lunc.coinMinimalDenom &&
          key !== CLASSIC_DENOMS.ustc.coinMinimalDenom
      )
    } catch {
      return []
    }
  })
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset>({
    symbol: "LUNC",
    name: "Terra Classic",
    denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
    decimals: CLASSIC_DENOMS.lunc.coinDecimals
  })

  const { data: balances = [] } = useQuery({
    queryKey: ["balances", account?.address],
    queryFn: () => fetchBalances(account?.address ?? ""),
    enabled: Boolean(account?.address)
  })

  const cachedPrices = useMemo(() => getCachedPrices(), [])
  const { data: prices } = useQuery({
    queryKey: ["prices"],
    queryFn: fetchPrices,
    staleTime: 60_000,
    refetchInterval: 120_000,
    initialData: cachedPrices?.data,
    initialDataUpdatedAt: cachedPrices?.ts
  })
  const cachedFxRates = useMemo(() => getCachedFxRates(), [])
  const { data: fxRates } = useQuery({
    queryKey: ["fx-rates"],
    queryFn: fetchFxRates,
    staleTime: 12 * 60 * 60 * 1000,
    refetchInterval: 12 * 60 * 60 * 1000,
    initialData: cachedFxRates?.data,
    initialDataUpdatedAt: cachedFxRates?.ts
  })

  const { data: swapRates = [] } = useQuery({
    queryKey: ["swaprates", CLASSIC_DENOMS.ustc.coinMinimalDenom],
    queryFn: () => fetchSwapRates(CLASSIC_DENOMS.ustc.coinMinimalDenom),
    staleTime: 300_000
  })

  const { data: cw20Whitelist } = useCw20Whitelist()
  const ibcDenoms = useMemo(
    () =>
      (balances ?? [])
        .map((coin) => coin.denom)
        .filter((denom) => denom.startsWith("ibc/")),
    [balances]
  )
  const { data: ibcWhitelist } = useResolvedIbcWhitelist(ibcDenoms)
  const { data: cw20Balances = [] } = useCw20Balances(
    account?.address,
    cw20Whitelist
  )

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "burritoHiddenTokens",
        JSON.stringify(hiddenTokens)
      )
    }
  }, [hiddenTokens])

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "burritoHideLowBalance",
        String(hideLowBalance)
      )
    }
  }, [hideLowBalance])

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
    if (hasAnimatedRef.current) return
    hasAnimatedRef.current = true
    if (!isOpen) return
    setAnimateOpen(true)
    const timer = window.setTimeout(() => setAnimateOpen(false), 450)
    return () => window.clearTimeout(timer)
  }, [isOpen])

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

  const getBalance = useMemo(() => {
    const map = new Map(balances.map((coin) => [coin.denom, coin.amount]))
    return (denom: string) => map.get(denom)
  }, [balances])

  const luncAmount = getBalance(CLASSIC_DENOMS.lunc.coinMinimalDenom)
  const luncPrice = prices?.lunc?.usd
  const ustcPrice = prices?.ustc?.usd
  const luncChange = prices?.lunc?.usd_24h_change
  const ustcChange = prices?.ustc?.usd_24h_change

  const assetRows = useMemo<AssetRow[]>(() => {
    const swapRateMap = new Map(
      swapRates.map((item) => [item.denom, Number(item.swaprate)])
    )
    const calcValueFromSwaprate = (
      amount: string,
      swaprate?: number,
      isClassicStable?: boolean
    ) => {
      if (!swaprate) return undefined
      const base = Number(amount) / swaprate / 1e6
      if (isClassicStable) {
        return ustcPrice ? base * ustcPrice : undefined
      }
      return base
    }

    const calcFxFallback = (amount: string, denom?: string) => {
      if (!ustcPrice || !denom) return undefined
      const lower = denom.toLowerCase()
      const fx =
        lower === "umnt"
          ? fxRates?.MNT
          : lower === "utwd"
          ? fxRates?.TWD
          : undefined
      if (!fx) return undefined
      return (Number(amount) / 1e6) * fx * ustcPrice
    }

    const nativeRows = (balances ?? [])
      .filter((coin) => Number(coin.amount) > 0)
      .map((coin): AssetRow => {
        const isClassic = true
        const swaprate = swapRateMap.get(coin.denom)
        const classicSymbol = formatDenom(coin.denom, true)
        const isClassicStable = classicSymbol.endsWith("TC")
        const valueFromSwaprate =
          calcValueFromSwaprate(
            coin.amount,
            swaprate,
            isClassicStable
          ) ?? calcFxFallback(coin.amount, coin.denom)

        if (coin.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom) {
          const value =
            luncPrice !== undefined
              ? toUnitAmount(coin.amount, CLASSIC_DENOMS.lunc.coinDecimals) *
                luncPrice
              : valueFromSwaprate
          const unitAmount = toUnitAmount(
            coin.amount,
            CLASSIC_DENOMS.lunc.coinDecimals
          )
          const price =
            value !== undefined && unitAmount > 0 ? value / unitAmount : luncPrice

          return {
            kind: "native",
            denom: coin.denom,
            symbol: "LUNC",
            name: "Terra Classic",
            decimals: CLASSIC_DENOMS.lunc.coinDecimals,
            amount: coin.amount,
            price,
            change: luncChange,
            value,
            chainCount: 1,
            whitelisted: true,
            iconCandidates: buildIconCandidates({
              icon: undefined,
              denom: coin.denom,
              isClassic
            })
          }
        }

        if (coin.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom) {
          const value =
            ustcPrice !== undefined
              ? toUnitAmount(coin.amount, CLASSIC_DENOMS.ustc.coinDecimals) *
                ustcPrice
              : valueFromSwaprate
          const unitAmount = toUnitAmount(
            coin.amount,
            CLASSIC_DENOMS.ustc.coinDecimals
          )
          const price =
            value !== undefined && unitAmount > 0 ? value / unitAmount : ustcPrice

          return {
            kind: "native",
            denom: coin.denom,
            symbol: "USTC",
            name: "Stablecoin",
            decimals: CLASSIC_DENOMS.ustc.coinDecimals,
            amount: coin.amount,
            price,
            change: ustcChange,
            value,
            chainCount: 1,
            whitelisted: true,
            iconCandidates: buildIconCandidates({
              icon: undefined,
              denom: coin.denom,
              isClassic
            })
          }
        }

        if (coin.denom.startsWith("ibc/")) {
          const hash = coin.denom.replace("ibc/", "")
          const ibcToken = ibcWhitelist?.[hash]
          const symbol = ibcToken?.symbol ?? "IBC"
          const name = ibcToken?.name ?? symbol
          const decimals = ibcToken?.decimals ?? 6
          const unitAmount = toUnitAmount(coin.amount, decimals)
          const baseDenom = ibcToken?.base_denom ?? coin.denom
          const isClassicStableIbc = formatDenom(baseDenom, true).endsWith("TC")
          const value = calcValueFromSwaprate(
            coin.amount,
            swaprate,
            isClassicStableIbc
          ) ?? calcFxFallback(coin.amount, baseDenom)
          const price =
            value !== undefined && unitAmount > 0 ? value / unitAmount : undefined

          return {
            kind: "ibc",
            denom: coin.denom,
            symbol,
            name,
            decimals,
            amount: coin.amount,
            price,
            change: undefined,
            value,
            chainCount: 1,
            whitelisted: Boolean(ibcToken),
            iconCandidates: ibcToken
              ? [
                  ...buildIconCandidates({
                    icon: ibcToken?.icon,
                    denom: ibcToken?.base_denom ?? coin.denom,
                    isClassic
                  }).filter((item) => item !== "/system/cw20.svg"),
                  "/system/ibc.svg"
                ]
              : ["/system/ibc.svg"]
          }
        }

        const displaySymbol = formatDenom(coin.denom, true)
        const unitAmount = toUnitAmount(coin.amount, 6)
        const value = valueFromSwaprate ?? calcFxFallback(coin.amount, coin.denom)
        const price =
          value !== undefined && unitAmount > 0 ? value / unitAmount : undefined

        return {
          kind: "native",
          denom: coin.denom,
          symbol: displaySymbol,
          name: displaySymbol,
          decimals: 6,
          amount: coin.amount,
          price,
          change: undefined,
          value,
          chainCount: 1,
          whitelisted: false,
          iconCandidates: buildIconCandidates({
            icon: undefined,
            denom: coin.denom,
            isClassic
          })
        }
      })

    const hasLunc = nativeRows.some(
      (row) => row.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
    )
    const hasUstc = nativeRows.some(
      (row) => row.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
    )

    if (!hasLunc) {
      const amount = getBalance(CLASSIC_DENOMS.lunc.coinMinimalDenom) ?? "0"
      const unitAmount = toUnitAmount(
        amount,
        CLASSIC_DENOMS.lunc.coinDecimals
      )
      nativeRows.push({
        kind: "native",
        denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
        symbol: "LUNC",
        name: "Terra Classic",
        decimals: CLASSIC_DENOMS.lunc.coinDecimals,
        amount,
        price: luncPrice,
        change: luncChange,
        value: luncPrice !== undefined ? unitAmount * luncPrice : undefined,
        chainCount: 1,
        whitelisted: true,
        iconCandidates: buildIconCandidates({
          icon: undefined,
          denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
          isClassic: true
        })
      })
    }

    if (!hasUstc) {
      const amount = getBalance(CLASSIC_DENOMS.ustc.coinMinimalDenom) ?? "0"
      const unitAmount = toUnitAmount(
        amount,
        CLASSIC_DENOMS.ustc.coinDecimals
      )
      nativeRows.push({
        kind: "native",
        denom: CLASSIC_DENOMS.ustc.coinMinimalDenom,
        symbol: "USTC",
        name: "Stablecoin",
        decimals: CLASSIC_DENOMS.ustc.coinDecimals,
        amount,
        price: ustcPrice,
        change: ustcChange,
        value: ustcPrice !== undefined ? unitAmount * ustcPrice : undefined,
        chainCount: 1,
        whitelisted: true,
        iconCandidates: buildIconCandidates({
          icon: undefined,
          denom: CLASSIC_DENOMS.ustc.coinMinimalDenom,
          isClassic: true
        })
      })
    }

    const cw20Rows =
      cw20Balances
        ?.filter((token) => Number(token.balance) > 0)
        .map((token): AssetRow => {
          const unitAmount = toUnitAmount(token.balance, token.decimals ?? 6)
          const price =
            token.symbol === "LUNC"
              ? luncPrice
              : token.symbol === "USTC"
              ? ustcPrice
              : undefined
          const value =
            price !== undefined && unitAmount > 0 ? unitAmount * price : undefined

          return {
            kind: "cw20",
            denom: token.address,
            symbol: token.symbol,
            name: token.name ?? token.symbol,
            decimals: token.decimals ?? 6,
            amount: token.balance,
            price,
            change: undefined,
            value,
            chainCount: 1,
            whitelisted: true,
            iconCandidates: [token.icon, "/system/cw20.svg"].filter(
              Boolean
            ) as string[]
          }
        }) ?? []

    const sortByValueDesc = (
      a: { value?: number; amount: string; decimals: number; symbol: string },
      b: { value?: number; amount: string; decimals: number; symbol: string }
    ) => {
      const aValue = a.value ?? toUnitAmount(a.amount, a.decimals)
      const bValue = b.value ?? toUnitAmount(b.amount, b.decimals)
      if (aValue === bValue) {
        return a.symbol.localeCompare(b.symbol)
      }
      return bValue - aValue
    }

    const luncRow = nativeRows.find(
      (row) => row.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom
    )
    const ustcRow = nativeRows.find(
      (row) => row.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
    )
    const nativeNonIbc = nativeRows.filter(
      (row) =>
        row.denom !== CLASSIC_DENOMS.lunc.coinMinimalDenom &&
        row.denom !== CLASSIC_DENOMS.ustc.coinMinimalDenom &&
        !row.denom.startsWith("ibc/")
    )
    const ibcRows = nativeRows.filter((row) => row.denom.startsWith("ibc/"))

    const sortedNative = nativeNonIbc.sort(sortByValueDesc)
    const sortedIbc = ibcRows.sort(sortByValueDesc)
    const sortedCw20 = cw20Rows.sort(sortByValueDesc)

    return [
      luncRow,
      ustcRow,
      ...sortedNative,
      ...sortedCw20,
      ...sortedIbc
    ].filter(isAssetRow)
  }, [
    balances,
    cw20Balances,
    ibcWhitelist,
    luncChange,
    luncPrice,
    swapRates,
    ustcChange,
    ustcPrice
  ])

  const hiddenTokenSet = useMemo(
    () => new Set(hiddenTokens),
    [hiddenTokens]
  )

  const filteredAssetRows = useMemo(() => {
    let list = assetRows.filter((asset) => !hiddenTokenSet.has(asset.denom))
    if (hideNonWhitelisted) {
      list = list.filter((asset) => asset.whitelisted)
    }
    if (!hideLowBalance) return list
    return list.filter((asset) => {
      if (
        asset.denom === CLASSIC_DENOMS.lunc.coinMinimalDenom ||
        asset.denom === CLASSIC_DENOMS.ustc.coinMinimalDenom
      ) {
        return true
      }
      if (asset.kind === "cw20" || asset.kind === "ibc") {
        return toUnitAmount(asset.amount, asset.decimals) >= 0.01
      }
      return asset.value !== undefined && asset.value >= 1
    })
  }, [assetRows, hiddenTokenSet, hideLowBalance, hideNonWhitelisted])

  const manageItems = useMemo<ManageTokenItem[]>(() => {
    const nativeItems: ManageTokenItem[] = [
      {
        key: CLASSIC_DENOMS.lunc.coinMinimalDenom,
        symbol: "LUNC",
        name: "Luna Classic",
        iconCandidates: buildIconCandidates({
          icon: undefined,
          denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
          isClassic: true
        }),
        enabled: !hiddenTokenSet.has(CLASSIC_DENOMS.lunc.coinMinimalDenom)
      },
      {
        key: CLASSIC_DENOMS.ustc.coinMinimalDenom,
        symbol: "USTC",
        name: "TerraClassicUSD",
        iconCandidates: buildIconCandidates({
          icon: undefined,
          denom: CLASSIC_DENOMS.ustc.coinMinimalDenom,
          isClassic: true
        }),
        enabled: !hiddenTokenSet.has(CLASSIC_DENOMS.ustc.coinMinimalDenom)
      }
    ]

    const ibcItems = Object.entries(ibcWhitelist ?? {}).map(
      ([hash, token]) => ({
        key: `ibc/${hash}`,
        symbol: token.symbol,
        name: token.name,
        iconCandidates: [
          ...buildIconCandidates({
            icon: token.icon,
            denom: token.base_denom,
            isClassic: true
          }),
          "/system/ibc.svg"
        ],
        enabled: !hiddenTokenSet.has(`ibc/${hash}`)
      })
    )

    const cw20Items = Object.entries(cw20Whitelist ?? {}).map(
      ([address, token]) => ({
        key: address,
        symbol: token.symbol,
        name: token.name ?? token.protocol,
        iconCandidates: [token.icon, "/system/cw20.svg"].filter(
          Boolean
        ) as string[],
        enabled: !hiddenTokenSet.has(address)
      })
    )

    const list = [...nativeItems, ...ibcItems, ...cw20Items]
    return list.sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [cw20Whitelist, hiddenTokenSet, ibcWhitelist])

  const netWorth = assetRows.reduce((sum, asset) => sum + (asset.value ?? 0), 0)
  const netWorthDisplay = account ? formatUsd(netWorth) : "$0.00"
  const netWorthValue =
    netWorthDisplay === "--" || netWorthDisplay === "$0"
      ? "$0.00"
      : netWorthDisplay

  const selectedCw20Balance = cw20Balances.find(
    (token) => token.address === selectedAsset.denom
  )?.balance
  const selectedBalance = selectedCw20Balance ?? getBalance(selectedAsset.denom)
  const selectedAssetRow = assetRows.find(
    (asset) => asset.denom === selectedAsset.denom
  )
  const selectedDecimals = selectedAssetRow?.decimals ?? selectedAsset.decimals
  const selectedPrice = selectedAssetRow?.price
  const selectedSymbol = selectedAssetRow?.symbol ?? selectedAsset.symbol
  const selectedIconCandidates = selectedAssetRow?.iconCandidates ?? []
  const selectedValue =
    selectedPrice !== undefined
      ? toUnitAmount(selectedBalance, selectedDecimals) * selectedPrice
      : undefined
  const selectedAmountDisplay = formatTokenAmount(
    selectedBalance,
    selectedDecimals,
    2
  )

  const handleCopy = (value: string) => {
    if (!account) return
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => {})
    }
  }

  const handleBack = () => {
    if (view !== "wallet") {
      setView("wallet")
      return
    }
    setIsOpen(false)
  }

  const renderDetails = () => {
    if (view === "asset") {
      return (
        <div className={styles.details}>
          <div className={styles.assetDetails}>
            <div className={styles.assetBadgeLarge}>
              <AssetIcon
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
              onClick={() => setView("send")}
            >
              <SendIcon />
            </button>
            <span>Send</span>
          </div>
          <div className={styles.actionItem}>
            <button
              className={styles.actionButton}
              type="button"
              onClick={() => setView("receive")}
            >
              <ReceiveIcon />
            </button>
            <span>Receive</span>
          </div>
          <div className={styles.actionItem}>
            <button className={styles.actionButton} type="button">
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
            <div className={styles.formField}>
              <label>Asset</label>
              <button className={styles.assetSelect} type="button">
                LUNC
              </button>
            </div>
            <div className={styles.formField}>
              <label>Source chain</label>
              <div className={styles.chainSelector}>
                <button
                  className={`${styles.chainPill} ${styles.chainPillActive}`}
                  type="button"
                >
                  Classic
                </button>
              </div>
            </div>
            <div className={styles.formField}>
              <label>Recipient</label>
              <input placeholder="terra..." aria-label="Recipient" />
            </div>
            <div className={styles.formField}>
              <div className={styles.fieldHeader}>
                <label>Amount</label>
                <button className={styles.maxButton} type="button">
                  Max
                </button>
              </div>
              <div className={styles.amountRow}>
                <input placeholder="0.0" aria-label="Amount" />
                <button className={styles.assetButton} type="button">
                  LUNC
                </button>
              </div>
              <div className={styles.fieldHint}>
                Available:{" "}
                {account
                  ? `${formatTokenAmount(
                      luncAmount,
                      CLASSIC_DENOMS.lunc.coinDecimals,
                      2
                    )} LUNC`
                  : "--"}
              </div>
            </div>
            <div className={styles.formField}>
              <label>Memo (optional)</label>
              <input placeholder="Optional" aria-label="Memo" />
            </div>
            <div className={styles.formWarning}>
              <span className={styles.warningIcon} aria-hidden="true" />
              <span>Check if this transaction requires a memo</span>
            </div>
            <div className={styles.formSummary}>
              <div className={styles.detailRow}>
                <span>Fee</span>
                <strong>--</strong>
              </div>
              <div className={styles.detailRow}>
                <span>Estimated time</span>
                <strong>--</strong>
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (view === "receive") {
      const address = account?.address ?? "Connect wallet"
      return (
        <div className={`${styles.formPanel} ${styles.receivePanel}`}>
          <h1 className={styles.formTitleLarge}>Receive</h1>
          <div className={styles.searchField}>
            <span className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search for a chain..."
              aria-label="Search for a chain"
            />
          </div>
          <div className={styles.addressTable}>
            {[
              { chain: "Terra Classic", address }
            ].map((row) => (
              <div key={row.chain} className={styles.addressRow}>
                <div className={styles.addressChain}>
                  <span className={styles.chainDot} />
                  <span>{row.chain}</span>
                </div>
                <div className={styles.addressValue}>{row.address}</div>
                <button
                  className={styles.addressButton}
                  type="button"
                  disabled={!account}
                  onClick={() => handleCopy(row.address)}
                >
                  Copy
                </button>
              </div>
            ))}
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
          {filteredAssetRows.length === 0 ? (
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
                      <AssetIcon
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
          <button className="uiButton uiButtonPrimary" type="button">
            Review
          </button>
        </div>
      )
    }

    if (view === "asset") {
      return (
        <div className={styles.actions}>
          <button className="uiButton uiButtonPrimary" type="button">
            Send
          </button>
          <button className="uiButton uiButtonOutline" type="button">
            Receive
          </button>
        </div>
      )
    }

    return null
  }

  return (
    <>
      <aside
        className={`${styles.wallet} ${!isOpen ? styles.closed : ""} ${
          animateOpen ? styles.animateOpen : ""
        }`}
      >
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
    </>
  )
}

export default WalletPanel
