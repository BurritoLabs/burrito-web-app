# Burrito

Burrito is a non-custodial Terra application built for day-to-day
wallet operations, market discovery, on-chain trading, staking, governance,
CW20 launches, and advanced contract workflows.

The app supports Terra Classic (`columbus-5`) and Terra (`phoenix-1`). It
combines wallet UX, indexed market data, direct pool execution, launchpad
tooling, and operational contract utilities in one frontend.

## Product Scope

Burrito targets `columbus-5` and `phoenix-1`:

- Discover liquidity across supported DEX venues on the active chain.
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

- On-chain quote discovery across supported routes on the active chain.
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
- LUNC or LUNA pair setup and initial liquidity.
- LP lock integration when configured.
- Public registry publishing when configured.
- Explore and creator management views.

### Contract Tools

- Upload, instantiate, query, and execute workflows.
- Intended for advanced users who need direct CosmWasm contract access.

## DEX And Market Coverage

The market index is built from on-chain factory, pair, pool, and bonding-curve
queries. Current discovery coverage includes:

- Terra Classic: Terraswap, Astroport, Terraport, Garuda, White Whale,
  LUNCSwap.fun, Terra.pump, LUNCPump.fun, and WESO DeFi.
- Terra: Astroport, Terraswap, Phoenix, and White Whale.

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
- Keplr Mobile
- Galaxy Station extension
- Galaxy Station mobile in-app browser injection

Wallets remain the signing boundary. Burrito never stores private keys and does
not custody user assets.

## Configuration

All variables are optional unless the related production feature is enabled.

```bash
VITE_SWAP_PLATFORM_FEE_BPS=
VITE_WEB_FEE_COLLECTOR_ADDRESS=
VITE_WEB_FEE_CONFIRM_URL=
VITE_WALLETCONNECT_PROJECT_ID=
VITE_LUNC_LAUNCHPAD_LP_LOCKER_ADDRESS=
VITE_LUNC_LAUNCHPAD_REGISTRY_ADDRESS=
VITE_LUNA_LAUNCHPAD_LP_LOCKER_ADDRESS=
VITE_LUNA_LAUNCHPAD_REGISTRY_ADDRESS=
```

`VITE_WALLETCONNECT_PROJECT_ID` is used for Keplr Mobile WalletConnect handoff.
The app has a bundled fallback, but production deployments should configure a
project id owned by Burrito.

Terra launchpad production addresses are bundled defaults. Chain-specific
environment variables override the bundled values. Terra Classic LP locking
and registry publishing remain disabled when its addresses are not configured.

Swap platform fees charge 0.2% of every supported swap input, including native,
IBC, and CW20 assets. LUNC, USTC, LUNA, and launchpad creation fees are split 5%
to burn, 5% to the community pool, 5% to the Classic oracle pool or Terra
network rewards, and 85% to the dedicated collector. Other swap assets are sent
in full to the collector because CW20 assets cannot be represented as Cosmos
community-pool coins. Confirmed supported collector receipts are settled to the
configured treasury by the Burrito AI allocator.

## Performance Behavior

- Route chunks preload when a user points to or focuses a navigation item.
- Wallet UI code can preload while idle, but wallet asset queries wait for
  wallet intent instead of running on every page load.
- Six-second block polling pauses while the browser tab is hidden.
- Long market, history, stake, and governance lists skip off-screen rendering.

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
- Keep chain-specific launchpad overrides synchronized in Cloudflare Pages when
  migrating either production contract.

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

- `docs/dependency-audit.md`
- `docs/maintenance-boundaries.md`
- `docs/testing-checklist.md`
- `docs/tx-standardization-plan.md`

Launchpad notes:

- `docs/launchpad-v1.md`
- `docs/launchpad-deploy.md`
