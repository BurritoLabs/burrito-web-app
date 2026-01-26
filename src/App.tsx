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

  return (
    <Layout>
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
        <TopBar />
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
