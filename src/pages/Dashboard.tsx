import PageShell from "./PageShell"

const Dashboard = () => {
  return (
    <PageShell title="Dashboard">
      <div className="cardGrid two">
        <div className="card">
          <div className="cardHeader">
            <span className="cardTitle">Overview</span>
          </div>
          <p className="cardText">Connect a wallet to view balances and activity.</p>
        </div>
        <div className="card">
          <div className="cardHeader">
            <span className="cardTitle">Market</span>
          </div>
          <p className="cardText">Live prices and network stats will appear here.</p>
        </div>
      </div>
    </PageShell>
  )
}

export default Dashboard
