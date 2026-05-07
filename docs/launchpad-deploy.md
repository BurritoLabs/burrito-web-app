# Launchpad Deploy Runbook

This runbook is for Burrito Launchpad V1 on Terra Classic.

## Contracts

Launchpad uses two Burrito-owned CosmWasm contracts:

- `lp-locker`: holds Terraswap LP CW20 tokens until the unlock time.
- `launch-registry`: stores public launch records and verifies that the LP lock
  matches the creator, pair, LP token, and unlock time.

Deploy order matters:

1. Build both contracts from the GitHub Actions workflow `Launchpad Contracts`.
2. Store and instantiate `lp-locker`.
3. Store and instantiate `launch-registry` with the `lp-locker` address.
4. Add both instantiated contract addresses to Cloudflare Pages environment
   variables.
5. Redeploy the frontend.

## GitHub Actions

The workflow path is `.github/workflows/lp-locker-contract.yml`.

Run it manually from GitHub Actions or let it run after pushing contract changes.
It uploads two optimized wasm artifacts:

- `burrito-lp-locker-wasm`
- `burrito-launch-registry-wasm`

The local Windows machine does not need Rust or Docker if the GitHub workflow is
used as the contract build source.

## Instantiate Messages

`lp-locker`:

```json
{
  "owner": "terra1..."
}
```

`owner` can be omitted, but setting it explicitly is safer for production.

`launch-registry`:

```json
{
  "owner": "terra1...",
  "locker_contract": "terra1..."
}
```

The `locker_contract` value must be the instantiated `lp-locker` address.

## Cloudflare Pages Variables

Set these on the `app.burrito.money` Cloudflare Pages project:

```text
VITE_LAUNCHPAD_LP_LOCKER_ADDRESS=terra1...
VITE_LAUNCHPAD_REGISTRY_ADDRESS=terra1...
```

Then redeploy. Vite reads these at build time, so changing the variables without
a redeploy will not update the app.

## Frontend Verification

After redeploying:

1. Open `/launchpad`.
2. Confirm the status strip shows `LP locker: Configured` and
   `Registry: Configured`.
3. Create or import a CW20 in `Manage`.
4. Create/find the Terraswap LUNC pair.
5. Provide liquidity.
6. Lock LP.
7. Publish to Launchpad.
8. Open `Explore`, click `Details`, and verify token, pair, LP lock, and market
   links are visible.
9. Copy the launch link and open it in a fresh tab.

## Safety Notes

- `Remove local record` only clears browser storage. It does not change on-chain
  token, pool, LP lock, or registry data.
- Hiding a listing changes registry visibility only. It does not pause trading
  or disable the token.
- The first version intentionally has no Burrito verification badge. Public info
  and LP lock facts are shown, but users still need to judge risk.
