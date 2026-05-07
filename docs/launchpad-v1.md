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
before the contracts exist.

## Manual Test Checklist

- Create mode accepts lowercase symbols but saves uppercase symbols.
- `CW20 only` creates a token and opens the record in `Manage`.
- `Launch with pool` creates a token and pre-fills planned liquidity and lock days in `Manage`.
- Importing an existing CW20 loads name, symbol, decimals, and total supply.
- Pair lookup shows whether a Terraswap LUNC pair exists.
- Pair creation stores pair contract and LP token after LCD indexing.
- Liquidity provision broadcasts `increase_allowance` and `provide_liquidity` in one transaction.
- LP lock panel shows wallet LP balance and can fill the full balance.
- LP lock stays disabled when `VITE_LAUNCHPAD_LP_LOCKER_ADDRESS` is empty.
- Public listing stays disabled when `VITE_LAUNCHPAD_REGISTRY_ADDRESS` is empty.
- Registry Explore shows real on-chain records when configured.
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
