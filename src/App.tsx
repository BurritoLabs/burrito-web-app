import { useCallback, useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { useAppRoutes } from "./app/routes"
import Layout, {
  Content,
  Header,
  MainContainer,
  Sidebar
} from "./app/layout/Layout"
import TopBar from "./app/header/TopBar"
import Nav from "./app/nav/Nav"
import DeferredWalletPanel from "./app/wallet/DeferredWalletPanel"
import Aside from "./app/aside/Aside"
import LoadingBar from "./app/feedback/LoadingBar"
import TxStatusModal from "./app/feedback/TxStatusModal"
import ScrollTopButton from "./app/layout/ScrollTopButton"
import RouteMetadata from "./app/metadata/RouteMetadata"

function App() {
  const routes = useAppRoutes()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), [])

  useEffect(() => {
    // Receipt reconciliation is background work, not a dependency of the
    // first screen or wallet SDK. Failed loads leave receipts queued for retry.
    void import("./app/revenue/webFeeReceipt")
      .then(({ retryPendingWebFeeReceipts }) => retryPendingWebFeeReceipts())
      .catch(() => { /* The durable receipt queue is retained. */ })
  }, [])

  return (
    <Layout menuOpen={menuOpen}>
      <RouteMetadata />
      <Sidebar>
        <Nav isOpen={menuOpen} onClose={closeMenu} />
        <Aside />
      </Sidebar>

      <Header>
        <TopBar onMenuClick={toggleMenu} menuOpen={menuOpen} />
      </Header>

      <Content>
        <MainContainer>
          <LoadingBar />
          <TxStatusModal />
          <ScrollTopButton />
          <div
            key={location.pathname}
            className="pageArea"
          >
            {routes}
          </div>
          <DeferredWalletPanel />
        </MainContainer>
      </Content>
    </Layout>
  )
}

export default App
