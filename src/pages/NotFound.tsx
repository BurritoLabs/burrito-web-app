import PageShell from "./PageShell"

const NotFound = () => {
  return (
    <PageShell
      title="Page not found"
      subtitle="This route does not exist in Burrito Station."
    >
      <div className="card">
        <div className="cardTitle">Try another section</div>
        <p className="cardText">
          Use the sidebar to navigate to Swap, Stake, Governance, or History.
        </p>
      </div>
    </PageShell>
  )
}

export default NotFound
