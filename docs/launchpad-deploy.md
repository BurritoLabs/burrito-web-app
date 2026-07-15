# Launchpad Deploy Runbook

This runbook covers Burrito Launchpad on Terra Classic and Terra Phoenix.

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

Download both artifacts, unzip them, and place the wasm files here:

```text
artifacts/launchpad/burrito_lp_locker.wasm
artifacts/launchpad/burrito_launch_registry.wasm
```

`artifacts/` is gitignored on purpose. These files are deployment inputs, not
frontend source code.

## Node Deploy Script

The project includes a deploy helper:

```bash
npm run deploy:launchpad -- chain=lunc --dry-run
npm run deploy:launchpad -- chain=luna --dry-run
```

For the real deployment, run it locally with a funded deployer wallet on the
target chain. Do not paste the mnemonic into chat or commit it to the repo.

PowerShell example:

```powershell
$env:DEPLOYER_MNEMONIC="your local deployer mnemonic"
npm run deploy:launchpad -- chain=luna
Remove-Item Env:\DEPLOYER_MNEMONIC
```

Optional variables:

```text
DEPLOY_CHAIN=lunc
DEPLOY_RPC=https://terra-classic-rpc.publicnode.com:443
# CLASSIC_RPC and LUNA_RPC are also accepted as chain-specific overrides.
LP_LOCKER_WASM=artifacts/launchpad/burrito_lp_locker.wasm
LAUNCH_REGISTRY_WASM=artifacts/launchpad/burrito_launch_registry.wasm
DEPLOY_OWNER_ADDRESS=terra1...
DEPLOY_ADMIN_ADDRESS=terra1...
DEPLOY_GAS_PRICE=28.325uluna
STORE_GAS=5000000
INSTANTIATE_GAS=600000
```

The script stores and instantiates `lp-locker`, then stores and instantiates
`launch-registry` with the `lp-locker` address. It writes separate results to:

```text
artifacts/launchpad/deploy-result-lunc.json
artifacts/launchpad/deploy-result-luna.json
```

Use the `cloudflare` values from that file as the Cloudflare Pages variables.

## Upgrade Existing Contracts

Do not instantiate replacement contracts for an existing production setup.
That would leave historical LP locks and launch records at the old addresses.
The upgrade helper stores new code and migrates both contracts in place:

```bash
npm run upgrade:launchpad -- chain=lunc --dry-run
npm run upgrade:launchpad -- chain=luna --dry-run
```

The helper verifies the RPC chain ID, both current contract admins, the locker
owner, and the registry-to-locker relationship before broadcasting. The LP
Locker migration rebuilds historical owner and LP-token indexes in batches and
will not report success until `migration_status.complete` is true.

The real command requires both a local mnemonic and an explicit confirmation:

```powershell
$env:DEPLOYER_MNEMONIC="your local deployer mnemonic"
npm run upgrade:launchpad -- chain=lunc --confirm-upgrade
Remove-Item Env:\DEPLOYER_MNEMONIC
```

Run the two chains separately. Results are written to:

```text
artifacts/launchpad/upgrade-result-lunc.json
artifacts/launchpad/upgrade-result-luna.json
```

Optional overrides include `LP_LOCKER_ADDRESS`,
`LAUNCH_REGISTRY_ADDRESS`, `MIGRATE_GAS`, `REINDEX_GAS`, and
`REINDEX_LIMIT` (maximum 500). The script defaults to the currently configured
production contract addresses, but the dry-run output must still be reviewed
before signing.

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
VITE_LUNC_LAUNCHPAD_LP_LOCKER_ADDRESS=terra1...
VITE_LUNC_LAUNCHPAD_REGISTRY_ADDRESS=terra1...
VITE_LUNA_LAUNCHPAD_LP_LOCKER_ADDRESS=terra1zs54uanqzwh2y4a6z9xlzawjyjp3tddd99ad0h58ghr5yh2fdfjq95gmcv
VITE_LUNA_LAUNCHPAD_REGISTRY_ADDRESS=terra1wlfv0q9hye0x0tpd8844c0cmnaz7893x50h2z9q7897d6mjw0w3st4xj5f
```

Then redeploy. Vite reads these at build time, so changing the variables without
a redeploy will not update the app.

## Frontend Verification

After redeploying:

1. Open `/launchpad`.
2. Confirm the status strip shows `LP locker: Configured` and
   `Registry: Configured`.
3. Create a launch or use `Sync my launches` for an already published launch.
4. Create/find the Terraswap LUNC or LUNA pair for the selected chain.
5. Open the market page from `Manage` and provide liquidity.
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
