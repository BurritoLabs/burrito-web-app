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
import Aside from "./app/aside/Aside"

function App() {
  const { element: routes } = useNav()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <Layout menuOpen={menuOpen}>
      <Banner>
        <div className="bannerStrip">
          <span className="bannerDot" />
          <span>Terra Classic only - External wallets</span>
        </div>
      </Banner>

      <Sidebar>
        <Nav isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <Aside />
      </Sidebar>

      <Header>
        <TopBar
          onMenuClick={() => setMenuOpen((open) => !open)}
          menuOpen={menuOpen}
        />
      </Header>

      <Content>
        <MainContainer>
          <div className="pageArea">{routes}</div>
          <WalletPanel />
        </MainContainer>
      </Content>
    </Layout>
  )
}

export default App
