import { useRoutes } from "react-router-dom"
import Dashboard from "../pages/Dashboard"
import Wallet from "../pages/Wallet"
import Market from "../pages/Market"
import MarketPairDetails from "../pages/MarketPairDetails"
import Swap from "../pages/Swap"
import History from "../pages/History"
import Stake from "../pages/Stake"
import WithdrawRewards from "../pages/WithdrawRewards"
import WithdrawCommission from "../pages/WithdrawCommission"
import Governance from "../pages/Governance"
import ProposalDetails from "../pages/ProposalDetails"
import ProposalNew from "../pages/ProposalNew"
import Contract from "../pages/Contract"
import NotFound from "../pages/NotFound"
import {
  ContractIcon,
  GovIcon,
  HistoryIcon,
  MarketIcon,
  StakeIcon,
  SwapIcon,
  WalletIcon
} from "./icons"

const ICON_SIZE = { width: 18, height: 18 }

export const useNav = () => {
  const menu = [
    {
      path: "/wallet",
      element: <Wallet />,
      title: "Wallet",
      icon: <WalletIcon {...ICON_SIZE} />
    },
    {
      path: "/swap",
      element: <Swap />,
      title: "Swap",
      icon: <SwapIcon {...ICON_SIZE} />
    },
    {
      path: "/market",
      element: <Market />,
      title: "Market",
      icon: <MarketIcon {...ICON_SIZE} />
    },
    {
      path: "/history",
      element: <History />,
      title: "History",
      icon: <HistoryIcon {...ICON_SIZE} />
    },
    {
      path: "/stake",
      element: <Stake />,
      title: "Stake",
      icon: <StakeIcon {...ICON_SIZE} />
    },
    {
      path: "/gov",
      element: <Governance />,
      title: "Governance",
      icon: <GovIcon {...ICON_SIZE} />
    },
    {
      path: "/contract",
      element: <Contract />,
      title: "Contract",
      icon: <ContractIcon {...ICON_SIZE} />
    }
  ]

  const routes = [
    { path: "/", element: <Dashboard /> },
    { path: "/market/pair/:dexId/:pair", element: <MarketPairDetails /> },
    { path: "/market/pair/:pairId", element: <MarketPairDetails /> },
    { path: "/proposal/new", element: <ProposalNew /> },
    { path: "/proposal/:id", element: <ProposalDetails /> },
    { path: "/rewards", element: <WithdrawRewards /> },
    { path: "/commission", element: <WithdrawCommission /> },
    ...menu,
    { path: "*", element: <NotFound /> }
  ]

  return { menu, element: useRoutes(routes) }
}
