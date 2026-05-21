# Transaction Standardization Plan

Date: 2026-05-20

Goal: make all Burrito transaction flows safer and easier to debug without changing existing transaction messages, wallet behavior, routes, or UI design.

## Hard Rules

- Do not change Swap, Send, Stake, Withdraw, Governance, Contract, or Launchpad message payloads unless a specific bug requires it.
- Do not change wallet connector behavior.
- Do not change default slippage, gas defaults, platform fees, launchpad fees, or memo values.
- Do not migrate all flows at once.
- One transaction area per commit after diagnostics are in place.
- Run `npm run lint`, `npx tsc -b`, and `npm run build` after every transaction-layer change.

## Phase 1 - Diagnostics and Error Taxonomy

Status: completed.

Scope:

- Add shared transaction error categories.
- Keep existing user-facing error messages stable.
- Record lightweight local diagnostics for start, success, and failure events.
- Include wallet connector, account, tx label, tx hash, raw message when available, and category.

Must not change:

- Signing.
- Broadcast.
- Gas simulation.
- Fee amount.
- Transaction payloads.

Implementation notes:

- Added shared transaction error classification in `src/app/tx/txDiagnostics.ts`.
- Kept `formatTxError` user-facing messages stable by delegating to the shared classifier.
- Added local diagnostic recording for global wallet transaction start, success, and failure lifecycle events.
- Diagnostics are best effort and must never affect transaction execution.
- Validation passed: `npm run lint`, `npx tsc -b`, `npm run build`.

## Phase 2 - Read-Only Preflight Helpers

Status: not started.

Scope:

- Add helpers that can read account number, sequence, balances, and network status before a tx.
- Do not enforce new blocking behavior yet.
- Use this only to produce clearer diagnostics.

## Phase 3 - Gas and Fee Safety Helpers

Status: not started.

Scope:

- Centralize gas simulation result parsing and gas adjustment math.
- Preserve each flow's existing fallback gas values during migration.
- Add standardized `fee too low` and `out of gas` classification.

Migration order:

1. Withdraw rewards and withdraw commission.
2. Send.
3. Stake delegate, redelegate, undelegate.
4. Governance vote and deposit.
5. Swap.
6. Launchpad.

## Phase 4 - Unified Transaction Runner

Status: not started.

Scope:

- Create a single runner for preflight, simulation, wallet confirmation, broadcast, and tx hash recording.
- Migrate one flow at a time.
- Compare generated messages before and after each migration.

## Phase 5 - Confirmation Tracking

Status: not started.

Scope:

- After broadcast, track tx hash until the chain confirms or fails.
- Show clear pending, success, and failure states.
- Keep Finder links visible.

## Current Priority

Complete Phase 1 only. Do not start Phase 2 until Phase 1 is deployed and manually tested.
