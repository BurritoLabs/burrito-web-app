# Burrito Launch Registry

On-chain registry for Launchpad listings.

## Purpose

The web app can create local launch records, but local storage is not enough for
a public product. This registry stores public Launchpad facts on Terra Classic:

- creator
- token contract
- pair contract
- LP token
- LP locker contract
- LP lock id
- LP unlock time
- project metadata
- listing status

## Build

GitHub Actions builds and optimizes this contract:

```text
.github/workflows/lp-locker-contract.yml
```

The optimized artifact is uploaded as:

```text
burrito_launch_registry.wasm
```

## Frontend Wiring

After deploying the registry contract, set:

```bash
VITE_LAUNCHPAD_REGISTRY_ADDRESS=terra1...
```

Without that variable, the Launchpad shows local creator records only and keeps
`Publish listing` disabled.

## Instantiate

Instantiate the registry after the LP locker is deployed:

```json
{
  "owner": "terra1...",
  "locker_contract": "terra1..."
}
```

The registry only accepts listings whose `locker_contract` matches this
configured Burrito locker. It also queries the locker during registration and
rejects listings if the LP lock owner, LP token, pair contract, unlock time, or
withdrawn status do not match.

The registry also queries the CW20 token contract and rejects listings or
metadata updates when the submitted name or symbol does not match `token_info`.
