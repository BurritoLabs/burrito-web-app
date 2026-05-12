import { Suspense, lazy, type ComponentType } from "react"
import { useRoutes } from "react-router-dom"
import Dashboard from "../pages/Dashboard"
import {
  ContractIcon,
  GovIcon,
  HistoryIcon,
  LaunchpadIcon,
  MarketIcon,
  StakeIcon,
  SwapIcon,
  WalletIcon
} from "./icons"
import RouteFallback from "./layout/RouteFallback"

const ICON_SIZE = { width: 18, height: 18 }

const Wallet = lazy(() => import("../pages/Wallet"))
const Market = lazy(() => import("../pages/Market"))
const MarketPairDetails = lazy(() => import("../pages/MarketPairDetails"))
const Launchpad = lazy(() => import("../pages/Launchpad"))
const Swap = lazy(() => import("../pages/Swap"))
const History = lazy(() => import("../pages/History"))
const Stake = lazy(() => import("../pages/Stake"))
const WithdrawRewards = lazy(() => import("../pages/WithdrawRewards"))
const WithdrawCommission = lazy(() => import("../pages/WithdrawCommission"))
const Governance = lazy(() => import("../pages/Governance"))
const ProposalDetails = lazy(() => import("../pages/ProposalDetails"))
const ProposalNew = lazy(() => import("../pages/ProposalNew"))
const Contract = lazy(() => import("../pages/Contract"))
const NotFound = lazy(() => import("../pages/NotFound"))

const renderPage = (Component: ComponentType) => (
  <Suspense fallback={<RouteFallback />}>
    <Component />
  </Suspense>
)

export const navMenu = [
  {
    path: "/wallet",
    title: "Wallet",
    icon: <WalletIcon {...ICON_SIZE} />
  },
  {
    path: "/swap",
    title: "Swap",
    icon: <SwapIcon {...ICON_SIZE} />
  },
  {
    path: "/market",
    title: "Market",
    icon: <MarketIcon {...ICON_SIZE} />
  },
  {
    path: "/launchpad",
    title: "Launchpad",
    icon: <LaunchpadIcon {...ICON_SIZE} />
  },
  {
    path: "/history",
    title: "History",
    icon: <HistoryIcon {...ICON_SIZE} />
  },
  {
    path: "/stake",
    title: "Stake",
    icon: <StakeIcon {...ICON_SIZE} />
  },
  {
    path: "/gov",
    title: "Governance",
    icon: <GovIcon {...ICON_SIZE} />
  },
  {
    path: "/contract",
    title: "Contract",
    icon: <ContractIcon {...ICON_SIZE} />
  }
] as const

const appRoutes = [
  { path: "/", element: renderPage(Dashboard) },
  {
    path: "/market/pair/:dexId/:pair",
    element: renderPage(MarketPairDetails)
  },
  { path: "/market/pair/:pairId", element: renderPage(MarketPairDetails) },
  { path: "/proposal/new", element: renderPage(ProposalNew) },
  { path: "/proposal/:id", element: renderPage(ProposalDetails) },
  { path: "/rewards", element: renderPage(WithdrawRewards) },
  { path: "/commission", element: renderPage(WithdrawCommission) },
  { path: "/wallet", element: renderPage(Wallet) },
  { path: "/swap", element: renderPage(Swap) },
  { path: "/market", element: renderPage(Market) },
  { path: "/launchpad", element: renderPage(Launchpad) },
  { path: "/history", element: renderPage(History) },
  { path: "/stake", element: renderPage(Stake) },
  { path: "/gov", element: renderPage(Governance) },
  { path: "/contract", element: renderPage(Contract) },
  { path: "*", element: renderPage(NotFound) }
]

export const useAppRoutes = () => useRoutes(appRoutes)
