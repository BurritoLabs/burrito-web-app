import PageShell from "./PageShell"

const Swap = () => {
  return (
    <PageShell
      title="Swap"
      subtitle="Swap tokens with deep routing and transparent pricing across Terra Classic pools."
      actionLabel="New swap"
    >
      <div className="cardGrid two">
        <div className="card">
          <div className="cardTitle">Route preview</div>
          <p className="cardText">
            Liquidity sources, expected output, and price impact will appear
            here once a wallet is connected.
          </p>
          <div className="cardMeta">Classic · On-chain routing</div>
        </div>
        <div className="card">
          <div className="cardTitle">Swap panel</div>
          <p className="cardText">
            Choose assets, review slippage, and sign with your external wallet.
          </p>
          <div className="pillRow">
            <span>LUNC</span>
            <span>USTC</span>
            <span>+ Route</span>
          </div>
        </div>
      </div>

      <div className="cardGrid three">
        {[
          "Price impact",
          "Minimum received",
          "Slippage",
          "Liquidity venue",
          "Fees",
          "Execution speed"
        ].map((label) => (
          <div key={label} className="statCard">
            <div>{label}</div>
            <strong>--</strong>
          </div>
        ))}
      </div>
    </PageShell>
  )
}

export default Swap
