# Burrito LP Locker

Minimal CosmWasm contract for locking Terraswap LP CW20 tokens.

## What It Does

- Accepts LP tokens through CW20 `send`.
- Records owner, LP token, pair contract, amount, created time, and unlock time.
- Rejects withdrawals before unlock time.
- Transfers LP tokens back to the owner after unlock.

## CW20 Send Hook

The LP token contract should execute:

```json
{
  "send": {
    "contract": "<locker_contract>",
    "amount": "1000000",
    "msg": "base64({\"lock\":{\"owner\":\"terra1...\",\"pair_contract\":\"terra1...\",\"unlock_time\":1770000000}})"
  }
}
```

The frontend already builds this message from `src/app/launchpad/locker.ts`.

## Build

This machine currently does not have Rust/Cargo installed, so the contract was
not compiled locally. The repository includes a GitHub Actions workflow:

```text
.github/workflows/lp-locker-contract.yml
```

Run it manually from GitHub Actions. It will:

- install Rust
- run `cargo fmt --check`
- run `cargo test`
- run `cargo clippy`
- compile raw wasm
- optimize wasm with `cosmwasm/optimizer`
- upload `burrito_lp_locker.wasm` as a workflow artifact

If building manually in a Rust environment:

```bash
rustup target add wasm32-unknown-unknown
cargo build --manifest-path contracts/lp-locker/Cargo.toml --release --target wasm32-unknown-unknown
```

For production, optimize the wasm with `cosmwasm/optimizer` before uploading.

## Frontend Wiring

After deployment, set this environment variable for the web app:

```bash
VITE_LAUNCHPAD_LP_LOCKER_ADDRESS=terra1...
```

Without that variable, the Launchpad UI intentionally disables LP locking.

## Deployment Flow

1. Download `burrito_lp_locker.wasm` from the GitHub Actions artifact.
2. Upload and instantiate it on Terra Classic.
3. Set `VITE_LAUNCHPAD_LP_LOCKER_ADDRESS` in Cloudflare Pages.
4. Redeploy the web app.
5. The Launchpad LP lock form will become active.
