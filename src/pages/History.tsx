import PageShell from "./PageShell"

const History = () => {
  return (
    <PageShell
      title="History"
      subtitle="Track every swap, transfer, and staking action across your Terra Classic wallet."
      actionLabel="Export"
    >
      <div className="card">
        <div className="cardTitle">Recent activity</div>
        <div className="list">
          {["Swap LUNC → USTC", "Stake LUNC", "Send LUNC"].map((item) => (
            <div key={item} className="listRow">
              <div>
                <strong>{item}</strong>
                <span>Awaiting wallet connection</span>
              </div>
              <div className="listMeta">--</div>
            </div>
          ))}
        </div>
      </div>
      <div className="cardGrid three">
        {["Total swaps", "Total transfers", "Staking txs"].map((label) => (
          <div key={label} className="statCard">
            <div>{label}</div>
            <strong>--</strong>
          </div>
        ))}
      </div>
    </PageShell>
  )
}

export default History
