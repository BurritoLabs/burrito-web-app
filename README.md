# Burrito

Burrito is a non-custodial Terra Classic application built for day-to-day
wallet operations, market discovery, on-chain trading, staking, governance,
CW20 launches, and advanced contract workflows.

The app is designed as a focused Classic interface rather than a generic
multi-chain dashboard. It combines wallet UX, indexed market data, direct pool
execution, launchpad tooling, and operational contract utilities in one
production-ready frontend.

## Product Scope

Burrito targets `columbus-5` and prioritizes workflows that matter on Terra
Classic:

- Discover Classic liquidity across supported DEX venues.
- Inspect pair-level market data, reserves, addresses, charts, and recent trades.
- Swap through selected liquidity routes or directly through a specific pair.
- Add and remove liquidity where the underlying DEX contract supports it.
- Trade supported bonding-curve / pump-style markets from their market detail page.
- Manage wallet balances, CW20 tokens, IBC assets, staking positions, governance
  actions, and contract interactions.
- Create, seed, lock, publish, and manage CW20 launchpad projects.

## Core Modules

### Wallet

- Extension and mobile wallet connection flows.
- Native, CW20, and IBC balance views.
- Token visibility management.
- Send, receive, and external buy entry points.
- Finder-compatible transaction links.

### Market

- Indexed pool list with search, DEX filters, timeframe filters, sorting, and
  liquidity/volume context.
- Pair detail pages with reserves, copyable pool/token identifiers, price
  display, market cap/FDV context, liquidity, 24h volume, trader count, charts,
  and recent trades.
- Direct pair swap panel for ordinary pools.
- Add/remove liquidity panel for supported AMM pairs.
- Bonding-curve swap panel for supported pump-style markets.

### Swap

- On-chain quote discovery across supported Classic DEX routes.
- Pair-only mode for market detail pages.
- Slippage controls.
- Platform fee configuration.
- Fast signing and broadcast path with sequence-mismatch retry handling.

### Stake

- Delegate, redelegate, undelegate, withdraw rewards, and withdraw commission.
- Validator-aware management flows.
- Mobile wallet compatible transaction construction.

### Governance

- Proposal list and proposal detail pages.
- Vote and deposit flows.
- Tally, status, and governance metadata presentation.

### Launchpad

- CW20 token creation flow.
- LUNC pair setup and initial liquidity.
- LP lock integration when configured.
- Public registry publishing when configured.
- Explore and creator management views.

### Contract Tools

- Upload, instantiate, query, and execute workflows.
- Intended for advanced users who need direct CosmWasm contract access.

## DEX And Market Coverage

The market index is built from on-chain factory, pair, pool, and bonding-curve
queries. Current coverage includes:

- TerraSwap
- Terraport
- Astroport
- Garuda DeFi
- White Whale
- LUNCSwap
- Terra.pump
- LUNCPump

Not every DEX exposes the same contract interface. Burrito enables swap,
liquidity, and bonding-curve actions only where the app has an implemented and
tested transaction path for that protocol.

## Market Data Pipeline

Static market artifacts are generated into `public/market` and served with the
frontend:

```bash
npm run build:market-index
npm run build:market-candles
npm run build:market-all
```

The release build can rebuild all market artifacts before compiling the app:

```bash
npm run build:release
```

## Supported Wallets

- Keplr extension
- Keplr mobile
- Galaxy Station

Wallets remain the signing boundary. Burrito never stores private keys and does
not custody user assets.

## Configuration

All variables are optional unless the related production feature is enabled.

```bash
VITE_WALLETCONNECT_PROJECT_ID=
VITE_SWAP_PLATFORM_FEE_BPS=
VITE_SWAP_PLATFORM_FEE_RECIPIENT=
VITE_LAUNCHPAD_LP_LOCKER_ADDRESS=
VITE_LAUNCHPAD_REGISTRY_ADDRESS=
```

If `VITE_WALLETCONNECT_PROJECT_ID` is missing, the app uses the bundled fallback
project id. Launchpad LP locking and registry publishing remain disabled until
their contract addresses are configured.

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

For a release build with fresh market artifacts:

```bash
npm run build:release
```

## Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: keep `public/_redirects` with `/* /index.html 200`
- Configure production launchpad contract addresses in Cloudflare Pages
  environment variables before enabling registry publishing or LP locking.

## Security And Operational Boundaries

- The frontend is non-custodial and delegates all signing to the connected wallet.
- Contract tools can execute arbitrary contract messages and should be treated as
  advanced-user functionality.
- Production launchpad contract addresses should be verified before being exposed
  in the UI.
- Market and token metadata depend on on-chain queries, registry sources, local
  launchpad records, and known fallback rules.
- Mobile wallet deep-link behavior depends on wallet app and browser behavior.

Maintenance notes:

- `docs/maintenance-boundaries.md`
- `docs/testing-checklist.md`
- `docs/tx-standardization-plan.md`

Launchpad notes:

- `docs/launchpad-v1.md`
- `docs/launchpad-deploy.md`
