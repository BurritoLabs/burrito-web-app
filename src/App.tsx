import { useState } from "react"
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

  return (
    <Layout menuOpen={menuOpen}>
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
          <LoadingBar />
          <div className="pageArea">{routes}</div>
          <WalletPanel />
        </MainContainer>
      </Content>
    </Layout>
  )
}

export default App
