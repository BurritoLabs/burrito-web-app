import PageShell from "./PageShell"

const Contract = () => {
  return (
    <PageShell
      title="Contract"
      subtitle="Store, instantiate, and manage smart contracts on Terra Classic."
      actionLabel="Deploy"
    >
      <div className="cardGrid two">
        <div className="card">
          <div className="cardTitle">Contract actions</div>
          <p className="cardText">
            Upload WASM, instantiate contracts, and execute messages with full
            transparency.
          </p>
          <div className="pillRow">
            <span>Store code</span>
            <span>Instantiate</span>
            <span>Execute</span>
          </div>
        </div>
        <div className="card">
          <div className="cardTitle">Recent contracts</div>
          <div className="list dense">
            {["Exchange router", "Vault", "Oracle"].map((name) => (
              <div key={name} className="listRow">
                <strong>{name}</strong>
                <span>0x...</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="cardGrid three">
        {["Contracts", "Executions", "Gas used"].map((label) => (
          <div key={label} className="statCard">
            <div>{label}</div>
            <strong>--</strong>
          </div>
        ))}
      </div>
    </PageShell>
  )
}

export default Contract
