import PageShell from "./PageShell"

const Governance = () => {
  return (
    <PageShell
      title="Governance"
      subtitle="Review proposals, vote, and stay aligned with the Terra Classic community."
      actionLabel="New proposal"
    >
      <div className="card">
        <div className="cardTitle">Open proposals</div>
        <div className="list">
          {["Upgrade roadmap", "Validator incentives", "Community pool"].map(
            (title) => (
              <div key={title} className="listRow">
                <div>
                  <strong>{title}</strong>
                  <span>Voting period · 7d left</span>
                </div>
                <div className="pill">Vote</div>
              </div>
            )
          )}
        </div>
      </div>
      <div className="cardGrid three">
        {["Active", "Passed", "Rejected"].map((label) => (
          <div key={label} className="statCard">
            <div>{label}</div>
            <strong>--</strong>
          </div>
        ))}
      </div>
    </PageShell>
  )
}

export default Governance
