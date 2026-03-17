import { useCallback, useState } from "react"
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

function App() {
  const routes = useAppRoutes()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), [])

  return (
    <Layout menuOpen={menuOpen}>
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
            key={`${location.pathname}${location.search}${location.hash}`}
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
