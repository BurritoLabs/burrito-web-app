import { Suspense, lazy, type ComponentType } from "react"
import { useRoutes } from "react-router-dom"
import Dashboard from "../pages/Dashboard"
import {
  ContractIcon,
  GovIcon,
  HistoryIcon,
  LaunchpadIcon,
  MarketIcon,
  NftIcon,
  StakeIcon,
  SwapIcon,
  WalletIcon
} from "./icons"
import RouteFallback from "./layout/RouteFallback"
import ChainFeatureGuard from "./routes/ChainFeatureGuard"
import type { AppChainConfig } from "./appChains"

const ICON_SIZE = { width: 18, height: 18 }

const loadWallet = () => import("../pages/Wallet")
const loadNft = () => import("../pages/NFT")
const loadMarket = () => import("../pages/Market")
const loadMarketPairDetails = () => import("../pages/MarketPairDetails")
const loadLaunchpad = () => import("../pages/Launchpad")
const loadSwap = () => import("../pages/Swap")
const loadHistory = () => import("../pages/History")
const loadStake = () => import("../pages/Stake")
const loadGovernance = () => import("../pages/Governance")
const loadContract = () => import("../pages/Contract")

const Wallet = lazy(loadWallet)
const NFT = lazy(loadNft)
const Market = lazy(loadMarket)
const MarketPairDetails = lazy(loadMarketPairDetails)
const Launchpad = lazy(loadLaunchpad)
const Swap = lazy(loadSwap)
const History = lazy(loadHistory)
const Stake = lazy(loadStake)
const WithdrawRewards = lazy(() => import("../pages/WithdrawRewards"))
const WithdrawCommission = lazy(() => import("../pages/WithdrawCommission"))
const Governance = lazy(loadGovernance)
const ProposalDetails = lazy(() => import("../pages/ProposalDetails"))
const ProposalNew = lazy(() => import("../pages/ProposalNew"))
const Contract = lazy(loadContract)
const NotFound = lazy(() => import("../pages/NotFound"))

const renderPage = (Component: ComponentType) => (
  <Suspense fallback={<RouteFallback />}>
    <Component />
  </Suspense>
)

const renderFeaturePage = (
  Component: ComponentType,
  feature: keyof AppChainConfig["features"],
  title: string
) => (
  <Suspense fallback={<RouteFallback />}>
    <ChainFeatureGuard feature={feature} title={title}>
      <Component />
    </ChainFeatureGuard>
  </Suspense>
)

export const navMenu = [
  {
    path: "/wallet",
    title: "Wallet",
    icon: <WalletIcon {...ICON_SIZE} />,
    preload: loadWallet
  },
  {
    path: "/swap",
    title: "Swap",
    icon: <SwapIcon {...ICON_SIZE} />,
    preload: loadSwap
  },
  {
    path: "/market",
    title: "Market",
    icon: <MarketIcon {...ICON_SIZE} />,
    preload: loadMarket
  },
  {
    path: "/launchpad",
    title: "Launchpad",
    icon: <LaunchpadIcon {...ICON_SIZE} />,
    preload: loadLaunchpad
  },
  {
    path: "/history",
    title: "History",
    icon: <HistoryIcon {...ICON_SIZE} />,
    preload: loadHistory
  },
  {
    path: "/stake",
    title: "Stake",
    icon: <StakeIcon {...ICON_SIZE} />,
    preload: loadStake
  },
  {
    path: "/gov",
    title: "Governance",
    icon: <GovIcon {...ICON_SIZE} />,
    preload: loadGovernance
  },
  {
    path: "/nft",
    title: "NFT",
    icon: <NftIcon {...ICON_SIZE} />,
    preload: loadNft
  },
  {
    path: "/contract",
    title: "Contract",
    icon: <ContractIcon {...ICON_SIZE} />,
    preload: loadContract
  }
] as const

const appRoutes = [
  { path: "/", element: renderPage(Dashboard) },
  {
    path: "/market/pair/:dexId/:pair",
    element: renderFeaturePage(MarketPairDetails, "market", "Market")
  },
  {
    path: "/market/pair/:pairId",
    element: renderFeaturePage(MarketPairDetails, "market", "Market")
  },
  { path: "/proposal/new", element: renderPage(ProposalNew) },
  { path: "/proposal/:id", element: renderPage(ProposalDetails) },
  { path: "/rewards", element: renderPage(WithdrawRewards) },
  { path: "/commission", element: renderPage(WithdrawCommission) },
  { path: "/wallet", element: renderPage(Wallet) },
  { path: "/nft", element: renderPage(NFT) },
  { path: "/swap", element: renderFeaturePage(Swap, "swap", "Swap") },
  { path: "/market", element: renderFeaturePage(Market, "market", "Market") },
  {
    path: "/launchpad",
    element: renderFeaturePage(Launchpad, "launchpad", "Launchpad")
  },
  { path: "/history", element: renderPage(History) },
  { path: "/stake", element: renderPage(Stake) },
  { path: "/gov", element: renderPage(Governance) },
  { path: "/contract", element: renderPage(Contract) },
  { path: "*", element: renderPage(NotFound) }
]

export const useAppRoutes = () => useRoutes(appRoutes)
