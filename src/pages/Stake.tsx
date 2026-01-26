import PageShell from "./PageShell"

const Stake = () => {
  return (
    <PageShell
      title="Stake"
      subtitle="Delegate to validators, manage rewards, and monitor your staking position on Terra Classic."
      actionLabel="Delegate"
    >
      <div className="cardGrid two">
        <div className="card">
          <div className="cardTitle">Staked balance</div>
          <p className="cardText">
            Overview of your delegated LUNC, rewards, and unbonding positions.
          </p>
          <div className="cardMeta">Validators · Rewards · Unbonding</div>
        </div>
        <div className="card">
          <div className="cardTitle">Validator list</div>
          <p className="cardText">
            Discover active validators, voting power, and commission details.
          </p>
          <div className="list dense">
            {["Burrito Node", "Allnodes", "Classic Labs"].map((name) => (
              <div key={name} className="listRow">
                <strong>{name}</strong>
                <span>APR --</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="cardGrid three">
        {["Rewards", "APR", "Staked"].map((label) => (
          <div key={label} className="statCard">
            <div>{label}</div>
            <strong>--</strong>
          </div>
        ))}
      </div>
    </PageShell>
  )
}

export default Stake
