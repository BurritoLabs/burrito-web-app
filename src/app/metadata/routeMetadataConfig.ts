const DEFAULT_DESCRIPTION =
  "Burrito is a non-custodial Terra and Terra Classic app for wallets, swaps, markets, staking, governance, and CW20 launches."

export type RouteMetadataValue = {
  title: string
  description: string
  canonicalPath: string
}

const metadata = (
  title: string,
  description: string,
  canonicalPath: string
): RouteMetadataValue => ({ title, description, canonicalPath })

export const getRouteMetadata = (pathname: string): RouteMetadataValue => {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/"

  if (path === "/") {
    return metadata("Burrito | Terra & Terra Classic", DEFAULT_DESCRIPTION, "/")
  }
  if (path.startsWith("/market/pair/")) {
    return metadata(
      "Market Pair | Burrito",
      "Inspect a Terra or Terra Classic liquidity pool, market activity, routes, and supported on-chain actions.",
      path
    )
  }
  if (path === "/proposal/new") {
    return metadata(
      "Create Proposal | Burrito",
      "Create a governance proposal on the active Terra network.",
      path
    )
  }
  if (path.startsWith("/proposal/")) {
    return metadata(
      "Governance Proposal | Burrito",
      "Review proposal details, tally progress, votes, and deposits on the active Terra network.",
      path
    )
  }

  const routes: Record<string, Omit<RouteMetadataValue, "canonicalPath">> = {
    "/wallet": {
      title: "Wallet | Burrito",
      description: "Manage LUNA, LUNC, CW20, and IBC assets across Terra and Terra Classic."
    },
    "/nft": {
      title: "NFT | Burrito",
      description: "View wallet NFTs from registered CW721 collections on Terra and Terra Classic."
    },
    "/swap": {
      title: "Swap | Burrito",
      description: "Compare and execute supported on-chain swap routes on Terra and Terra Classic."
    },
    "/market": {
      title: "Market | Burrito",
      description: "Explore Terra and Terra Classic liquidity pools, DEX venues, charts, and market activity."
    },
    "/launchpad": {
      title: "Launchpad | Burrito",
      description: "Create, seed, lock, publish, and manage CW20 launches on Terra and Terra Classic."
    },
    "/history": {
      title: "History | Burrito",
      description: "Review wallet transaction history on the active Terra network."
    },
    "/stake": {
      title: "Stake | Burrito",
      description: "Explore validators and manage staking positions on Terra and Terra Classic."
    },
    "/rewards": {
      title: "Withdraw Rewards | Burrito",
      description: "Review and withdraw staking rewards on the active Terra network."
    },
    "/commission": {
      title: "Withdraw Commission | Burrito",
      description: "Review and withdraw validator commission on the active Terra network."
    },
    "/gov": {
      title: "Governance | Burrito",
      description: "Review proposals, votes, deposits, and governance activity on Terra and Terra Classic."
    },
    "/contract": {
      title: "Contract Tools | Burrito",
      description: "Use advanced CosmWasm query, upload, instantiate, execute, and migration tools."
    },
    "/privacy": {
      title: "Privacy Policy | Burrito",
      description:
        "Learn how the non-custodial Burrito wallet processes local wallet data, public blockchain information, and network metadata."
    }
  }
  const route = routes[path]
  if (route) return { ...route, canonicalPath: path }

  return metadata("Burrito | Terra & Terra Classic", DEFAULT_DESCRIPTION, "/")
}
