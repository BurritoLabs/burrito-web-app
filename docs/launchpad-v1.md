# Burrito Launchpad V1

Launchpad V1 is intentionally narrow:

- create a fixed-supply CW20 token
- create a Terraswap Token / LUNC pair
- provide initial liquidity
- lock the LP CW20 token
- publish launch facts to the Burrito registry

It does not include official project verification, mintable tokens, tax tokens,
blacklists, hidden owner controls, or a custom DEX contract.

## Frontend Flow

1. Open `/launchpad`.
2. Use `Create` to choose `Launch with pool` or `CW20 only`.
3. Create the CW20 token contract.
4. Use `Manage` to create/find the Terraswap LUNC pair.
5. Provide token + LUNC liquidity.
6. Lock the minted LP token after the locker contract is configured.
7. Publish the listing after the registry contract is configured.
8. Use `Explore` to view on-chain registry launches.
9. Project owners can add more liquidity, withdraw unlocked LP from the pool,
   withdraw locked LP after unlock, update registry metadata, and hide/restore
   their published listing.
10. If local browser storage is lost, connect the creator wallet and use
    `Sync my launches` in `Manage` to recover published registry launches.

## Contracts

The frontend is wired to two Burrito-owned contracts:

- `contracts/lp-locker`: receives LP CW20 tokens and blocks withdrawal until unlock time.
- `contracts/launch-registry`: stores public launch records on Terra Classic.

Both contracts are built by `.github/workflows/lp-locker-contract.yml`.

Deploy `lp-locker` first. Then instantiate `launch-registry` with the deployed
locker address so the registry can reject fake LP-lock claims.

## Cloudflare Variables

After deploying the contracts, configure these Cloudflare Pages environment
variables and redeploy:

```text
VITE_LAUNCHPAD_LP_LOCKER_ADDRESS=terra1...
VITE_LAUNCHPAD_REGISTRY_ADDRESS=terra1...
```

Until those are set, the UI keeps LP locking and public publishing disabled.
That is intentional and prevents users from thinking the launch is complete
before the contracts exist. Production Explore also shows an empty state instead
of fake sample launches when the registry is not configured.

## Manual Test Checklist

- Create mode accepts lowercase symbols but saves uppercase symbols.
- `CW20 only` creates a token and opens the record in `Manage`.
- `Launch with pool` creates a token and pre-fills planned liquidity and lock days in `Manage`.
- Importing an existing CW20 loads name, symbol, decimals, and total supply.
- Importing a published CW20 recovers registry metadata, pair contract, LP token,
  LP lock id, unlock time, and listing visibility.
- `Sync my launches` loads every registry page, filters by the connected creator
  address, and restores matching launches into `Manage`.
- Explore search filters by symbol, name, pair, creator, token contract, pair
  contract, or registry id.
- Explore stats show total, live, risk, and unlocked launch counts.
- Explore detail panel shows creator, token contract, pair contract, LP lock,
  publish time, description, website, X profile, and market link.
- Pair lookup shows whether a Terraswap LUNC pair exists.
- Pair creation stores pair contract and LP token after LCD indexing.
- Liquidity provision broadcasts `increase_allowance` and `provide_liquidity` in one transaction.
- Liquidity withdrawal sends unlocked LP CW20 tokens to the pair contract with
  the Terraswap `withdraw_liquidity` hook.
- LP lock panel shows wallet LP balance and can fill the full balance.
- LP lock stays disabled when `VITE_LAUNCHPAD_LP_LOCKER_ADDRESS` is empty.
- Public listing stays disabled when `VITE_LAUNCHPAD_REGISTRY_ADDRESS` is empty.
- Published listing metadata and visibility can be updated through the registry
  contract.
- Registry Explore shows real on-chain records when configured, newest first.
- Registry Explore classifies records as live, ended, or risk based on LP lock
  state and missing public info.
- Registry Explore shows an empty state, not fake launches, when configured but empty.
- Mobile width keeps cards inside the viewport.

## Build Checks

Run before deploying:

```bash
npm run lint
npm run build
```

The local machine used during initial implementation did not have Rust/Cargo or
Docker installed, so contract compilation is expected to run in GitHub Actions.
