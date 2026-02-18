import { useCallback, useState } from "react"
import { useNav } from "./app/routes"
import Layout, {
  Content,
  Header,
  MainContainer,
  Sidebar
} from "./app/layout/Layout"
import TopBar from "./app/header/TopBar"
import Nav from "./app/nav/Nav"
import WalletPanel from "./app/wallet/WalletPanel"
import Aside from "./app/aside/Aside"
import LoadingBar from "./app/feedback/LoadingBar"

function App() {
  const { element: routes } = useNav()
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
          <div className="pageArea">{routes}</div>
          <WalletPanel />
        </MainContainer>
      </Content>
    </Layout>
  )
}

export default App
