# Burrito Launchpad V1

Launchpad V1 is intentionally narrow:

- create a fixed-supply CW20 token
- create a Terraswap Token / LUNC or Token / LUNA pair
- provide initial liquidity
- lock the LP CW20 token
- publish launch facts to the Burrito registry

It does not include official project verification, mintable tokens, tax tokens,
blacklists, hidden owner controls, or a custom DEX contract.

## Frontend Flow

1. Open `/launchpad`.
2. Use `Create` to choose `Launch with pool` or `CW20 only`.
3. Create the CW20 token contract.
4. Use `Manage` to create/find the Terraswap native pair for the active chain.
5. Open the market page from `Manage` and provide token + native liquidity.
6. Lock the minted LP token after the locker contract is configured.
7. Publish the listing after the registry contract is configured.
8. Use `Explore` to view on-chain registry launches.
9. Project owners can distribute CW20 tokens, use the market page to add or
   remove pool liquidity, withdraw locked LP after unlock, update registry
   metadata, and hide/restore their published listing.
10. If local browser storage is lost, connect the creator wallet and use
    `Sync my launches` in `Manage` to recover published registry launches.

## Contracts

The frontend is wired to two Burrito-owned contracts:

- `contracts/lp-locker`: receives LP CW20 tokens and blocks withdrawal until unlock time.
- `contracts/launch-registry`: stores public launch records on each deployment chain.

Both contracts are built by `.github/workflows/lp-locker-contract.yml`.

Deploy `lp-locker` first. Then instantiate `launch-registry` with the deployed
locker address so the registry can reject fake LP-lock claims.

## Cloudflare Variables

After deploying the contracts, configure these Cloudflare Pages environment
variables and redeploy:

```text
VITE_LUNC_LAUNCHPAD_LP_LOCKER_ADDRESS=terra1...
VITE_LUNC_LAUNCHPAD_REGISTRY_ADDRESS=terra1...
VITE_LUNA_LAUNCHPAD_LP_LOCKER_ADDRESS=terra1...
VITE_LUNA_LAUNCHPAD_REGISTRY_ADDRESS=terra1...
```

Until those are set, the UI keeps LP locking and public publishing disabled.
That is intentional and prevents users from thinking the launch is complete
before the contracts exist. Explore shows an empty state when the registry is
not configured.

## Manual Test Checklist

- Create mode accepts lowercase symbols but saves uppercase symbols.
- Page status strip shows whether CW20 creation, LP locker, registry, and wallet
  connection are ready in the current deploy environment.
- `CW20 only` creates a token and opens the record in `Manage`.
- `Launch with pool` creates a token and pre-fills planned liquidity and lock days in `Manage`.
- Manage can batch CW20 transfers by broadcasting one transfer message per
  recipient line, which makes CW20-only launches usable without forcing a pool.
- `Sync my launches` loads every registry page, filters by the connected creator
  address, and restores matching launches into `Manage`.
- Manage only lists launch records tied to the connected creator wallet. Older
  local records without a creator address are hidden from `My launches`.
- Explore search filters by symbol, name, pair, creator, token contract, pair
  contract, or registry id.
- Explore sorting supports newest, oldest, unlock soon, longest lock, and risk
  first.
- Explore stats show total, live, risk, and unlocked launch counts.
- Explore detail panel shows creator, token contract, pair contract, LP lock,
  publish time, description, website, X profile, and market link.
- Explore queries the Burrito LP locker for published launches and shows the
  locked LP amount plus withdrawn status when available.
- Explore supports `/launchpad?tab=explore&launch=...` deep links and can copy
  a public launch link from the detail panel.
- Pair lookup shows whether a Terraswap native pair exists on the active chain.
- Pair creation stores pair contract and LP token after LCD indexing.
- Market pair detail liquidity provision broadcasts `increase_allowance` and
  `provide_liquidity` in one transaction.
- Market pair detail liquidity withdrawal sends unlocked LP CW20 tokens to the
  pair contract with the Terraswap `withdraw_liquidity` hook.
- LP lock panel shows wallet LP balance and can fill the full balance.
- LP lock stays disabled when the active chain has no configured locker address.
- Public listing stays disabled when the active chain has no configured registry address.
- Published listing metadata and visibility can be updated through the registry
  contract.
- Published listing LP lock id and unlock time can be updated after a creator
  creates a new lock; the registry contract re-validates the lock against the
  Burrito locker before accepting it.
- Manage has copy/open shortcuts for token and pair contracts, plus a
  local-only cleanup action that does not mutate on-chain state.
- Manage shows a launch readiness checklist for token, pair, liquidity, LP lock,
  registry, and publish status, with a next-action summary for creators.
- Manage next-action CTAs scroll directly to the distribution, pair, LP lock,
  or listing tool that needs attention, or link to the market page for
  liquidity.
- Create and Publish validate optional public links. Website must be a full
  `http://` or `https://` URL, and X can be `@handle`, `x.com`, or
  `twitter.com`.
- The registry contract verifies listing name and symbol against the CW20
  token's own `token_info`, so creators cannot publish spoofed metadata through
  the public registry.
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
