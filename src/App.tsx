import { useState } from "react"
import { useNav } from "./app/routes"
import Layout, {
  Banner,
  Content,
  Header,
  MainContainer,
  Sidebar
} from "./app/layout/Layout"
import TopBar from "./app/header/TopBar"
import Nav from "./app/nav/Nav"
import WalletPanel from "./app/wallet/WalletPanel"

function App() {
  const { element: routes } = useNav()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <Layout menuOpen={menuOpen}>
      <Banner>
        <div className="bannerStrip">
          <span className="bannerDot" />
          <span>Terra Classic only · External wallets</span>
        </div>
      </Banner>

      <Sidebar>
        <Nav />
        <div className="sidebarFooter">
          <div className="sidebarMeta">Burrito Network</div>
          <div className="sidebarTag">Classic</div>
        </div>
      </Sidebar>

      <Header>
        <TopBar onMenuClick={() => setMenuOpen(true)} />
      </Header>

      <Content>
        <MainContainer>
          <div className="pageArea">{routes}</div>
          <WalletPanel />
        </MainContainer>
      </Content>

      {menuOpen ? (
        <button
          className="menuOverlay"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
        />
      ) : null}
    </Layout>
  )
}

export default App
