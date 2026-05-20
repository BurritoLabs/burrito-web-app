# Maintenance Boundaries

Use this before changing production behavior. Burrito App is live, so code cleanup must preserve wallet, transaction, route, and display behavior unless a product change is explicitly requested.

## Safe By Default

- Moving pure formatting helpers into `src/app/utils` or a feature-local helper file.
- Moving presentation-only JSX into feature-local components when props preserve the same values and handlers.
- Adding documentation, comments for risk-sensitive code, or manual testing notes.
- Improving TypeScript names and prop types without changing runtime values.
- Centralizing existing constants when the fallback value remains exactly the same.

## Requires Full Manual Regression

- Any change in `src/pages/components/SwapPanel.tsx` that touches quotes, pair lookup, slippage, fees, route ordering, signing, or broadcast.
- Any change in stake, redelegate, undelegate, withdraw rewards, or withdraw commission transaction builders.
- Any change in governance vote/deposit message construction, retry behavior, tally math, or proposal query keys.
- Any change in launchpad create-token, create-pair, provide-liquidity, lock-LP, publish, update-listing, or distribution transaction handlers.
- Any change in wallet connector selection, mobile wallet deep links, WalletConnect project ID behavior, or signer address resolution.
- Any change in market asset resolution, token metadata fallback, chart candle generation, or recent-trade parsing.

## Do Not Change Accidentally

- Public routes such as `/market`, `/market/pair/...`, `/wallet`, `/swap`, `/stake`, `/governance`, `/proposal/:id`, `/launchpad`, and `/contract`.
- Local storage keys used for launchpad drafts, created launches, wallet recipients, and token metadata caches.
- Query keys used by wallet balances, market pools, proposal details, staking data, and launchpad registry reads.
- Existing production defaults for platform fees, launchpad fees, gas fallback values, chain IDs, and RPC/LCD URLs.
- Existing CSS class names unless the component and stylesheet are changed together and visual behavior is manually checked.

## Current Large Files

- `src/pages/launchpad/LaunchpadPage.tsx`: still contains high-risk chain transaction orchestration. Prefer extracting presentation components only.
- `src/pages/components/SwapPanel.tsx`: high-risk quote and transaction file. Only pure UI/helper extraction is safe without message snapshots.
- `src/app/wallet/WalletPanel.tsx`: safe to continue splitting UI, but balance loading and send transaction behavior should be left intact.
- `src/pages/governance/ProposalDetailsPage.tsx`: vote/deposit handlers should remain stable unless transaction tests are run.
- `src/app/data/market.ts` and `src/app/data/classic.ts`: data-layer changes can affect most pages. Keep changes small and cache-aware.

## Verification Gate

For every production refactor batch:

- Run `npm run lint`.
- Run `npx tsc -b`.
- Run `npm run build`.
- Confirm `dist` is not included in source commits unless deployment artifacts are intentionally committed.
- Update `docs/production-refactor-notes.md` with touched files and behavior-preservation notes.

