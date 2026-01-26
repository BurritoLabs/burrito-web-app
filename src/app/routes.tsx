import { useRoutes } from "react-router-dom"
import Swap from "../pages/Swap"
import History from "../pages/History"
import Stake from "../pages/Stake"
import Governance from "../pages/Governance"
import Contract from "../pages/Contract"
import NotFound from "../pages/NotFound"
import { ContractIcon, GovIcon, HistoryIcon, StakeIcon, SwapIcon } from "./icons"

const ICON_SIZE = { width: 18, height: 18 }

export const useNav = () => {
  const menu = [
    {
      path: "/",
      element: <Swap />,
      title: "Swap",
      icon: <SwapIcon {...ICON_SIZE} />
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
    ...menu,
    { path: "*", element: <NotFound /> }
  ]

  return { menu, element: useRoutes(routes) }
}
