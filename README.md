# Burrito App

Burrito App is a Terra Classic focused web app for wallet, market, swap, staking, governance, launchpad, and contract workflows.

## Terra Classic Focus

The app targets `columbus-5` and is built around Terra Classic assets, DEX liquidity, governance, staking, and CW20 launch flows.

## Features

- Wallet: connect supported wallets, view native, CW20, and IBC balances, send, receive, and buy links.
- Market: pool list, pair detail pages, charts, recent trades, search, sorting, and DEX labels.
- Swap: aggregated on-chain quotes across supported Classic DEX routes with platform fee support.
- Stake: delegate, redelegate, undelegate, withdraw rewards, and withdraw commission.
- Governance: proposal list, proposal detail, voting, and deposit flows.
- Launchpad: CW20 creation, LUNC pair setup, initial liquidity, LP lock, registry publishing, explore, and creator management.
- Contract tools: upload, instantiate, query, and execute contract workflows for advanced users.

## Supported Wallets

- Keplr extension
- Keplr mobile
- Galaxy Station

## Supported DEXs

- TerraSwap
- Terraport
- Astroport
- Garuda DeFi

## Environment Variables

All variables are optional unless the related feature is needed in production.

```bash
VITE_WALLETCONNECT_PROJECT_ID=
VITE_SWAP_PLATFORM_FEE_BPS=
VITE_SWAP_PLATFORM_FEE_RECIPIENT=
VITE_LAUNCHPAD_LP_LOCKER_ADDRESS=
VITE_LAUNCHPAD_REGISTRY_ADDRESS=
```

If `VITE_WALLETCONNECT_PROJECT_ID` is missing, the app keeps the bundled fallback project ID. Launchpad LP locking and public registry publishing stay disabled until their contract addresses are configured.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Optional market data rebuild:

```bash
npm run build:market-all
```

## Deployment Notes For Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: keep `public/_redirects` with `/* /index.html 200`
- Configure optional launchpad contract addresses in Cloudflare Pages environment variables, then redeploy.

## Security Notes

- The frontend never stores private keys.
- Wallet signing is delegated to the connected wallet.
- Launchpad contract addresses should be verified before enabling production LP lock and registry publishing.
- Contract tools are advanced-user features and can execute arbitrary contract messages.

## Launchpad Configuration

Launchpad V1 documentation:

- `docs/launchpad-v1.md`
- `docs/launchpad-deploy.md`

Production launchpad registry and LP locker addresses are configured through:

- `VITE_LAUNCHPAD_REGISTRY_ADDRESS`
- `VITE_LAUNCHPAD_LP_LOCKER_ADDRESS`

## Known Limitations

- Some market charts depend on available recent trade history.
- Token metadata and logos depend on chain registry data, local launchpad records, and known fallback rules.
- Mobile wallet deep-link behavior depends on each wallet app and browser environment.
