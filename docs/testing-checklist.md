# Testing Checklist

Run this before a production deployment or after touching wallet, market, swap, stake, governance, or launchpad code.

## Wallet

- Connect Keplr extension on desktop.
- Connect Galaxy Station on desktop.
- Connect Keplr mobile from mobile browser.
- Disconnect and reconnect without refreshing.
- Switch Keplr accounts and confirm the app follows the new address on desktop
  and mobile.
- Refresh after disconnect and confirm the wallet stays disconnected.
- Repeat connect, account switch, refresh, and disconnect on both chains.
- Open the drawer wallet from at least two routes.
- Confirm native, CW20, and IBC balances load.
- Confirm balance values, token logos, and fallback logos display.

## Market

- Open `/market`.
- Search by symbol, name, contract, and pool address.
- Switch sort direction and sort field.
- On Terra Classic, switch through every visible DEX filter, including
  Terraswap, Astroport, Terraport, Garuda, White Whale, LUNCSwap.fun, pump
  venues, and WESO DeFi when present.
- On Terra, switch through Astroport, Terraswap, Phoenix, and White Whale.
- Open a TerraSwap pair detail page.
- Open a Terraport pair detail page.
- Open a Garuda pair detail page.
- Confirm pair logos, balance display, chart, recent trades, swap panel, liquidity panel, and top metrics load.
- Copy pool, base token, and quote token addresses from a pair detail page.
- Provide and withdraw liquidity from a small test pair when balances are available.
- Use the pair detail back button from a launchpad-opened market page.
- Refresh a pair detail route directly on Cloudflare.

## Swap

- Load a quote for native to native.
- Load a quote for native to CW20.
- Load a quote for CW20 to native.
- Load a quote for CW20 to CW20 if route exists.
- Execute a small swap on desktop.
- Execute a small swap from mobile Keplr.
- Execute one route through each visible DEX route when liquidity exists.
- Confirm slippage settings do not reset unexpectedly.
- Confirm platform fee and route details are displayed consistently.

## Stake

- Delegate a small amount.
- Redelegate between validators.
- Undelegate a small amount.
- Confirm fee estimate is high enough for each transaction.
- Confirm Galaxy Station and Keplr both broadcast at least one staking transaction after fee changes.
- Confirm mobile layout on manage stake.

## Withdrawals

- Withdraw rewards on desktop.
- Withdraw rewards on mobile.
- Withdraw commission on desktop.
- Withdraw commission on mobile.
- Confirm fee estimate is high enough.

## Governance

- Open voting, deposit, passed, and rejected tabs.
- Open proposal details directly by route.
- Submit a vote.
- Deposit into an active deposit proposal.
- Confirm vote progress and deposit progress display.

## Launchpad

- Create a CW20-only token.
- Create a launch-with-pool token.
- Repeat the full flow on Terra Classic and Terra.
- Create the native pair for the active chain (LUNC or LUNA).
- Open market from Manage and provide initial liquidity.
- Lock LP tokens.
- Publish to launchpad registry.
- Send a small CW20 distribution batch from Manage.
- Confirm the launch appears in Explore.
- Confirm Manage shows the created launch.
- Open market from Explore and confirm pair assets are correct.

## Contract Tools

- Query a known contract.
- Instantiate only with a known valid code ID and init message.
- Execute only a known safe contract action.

## Mobile

- Open `/`, `/wallet`, `/market`, `/swap`, `/stake`, `/governance`, and `/launchpad`.
- Confirm no horizontal overflow.
- Confirm wallet drawer opens on first tap.
- Confirm balance data appears without needing a manual refresh.
- Confirm browser refresh works on nested routes.

## Refactor Safety

- Confirm no route names changed.
- Confirm no localStorage key migration is required.
- Confirm transaction messages were not changed unless intentionally tested.
- Confirm `docs/production-refactor-notes.md` is updated for the batch.

## Cloudflare

- Confirm `public/_redirects` exists.
- Confirm a direct refresh works on `/wallet`, `/market`, `/swap`, `/proposal/:id`, and `/launchpad`.
- Confirm chain-specific production launchpad overrides match the deployed
  contracts when overrides are used.
