# Production Refactor Notes

## Baseline

- `npm run build`: passed before refactor. Vite reported existing dependency/chunk-size warnings only.
- `npm run lint`: initially failed on a pre-existing `Wallet.tsx` hook dependency warning. The dependency was narrowed to `accountAddress` without changing behavior, then lint passed.

## Files Touched

- `src/app/config/chainConfig.ts`
- `src/app/config/walletConfig.ts`
- `src/app/config/swapConfig.ts`
- `src/app/config/launchpadConfig.ts`
- `src/app/config/externalServices.ts`
- `src/app/utils/assetIdentity.ts`
- `src/app/utils/dexDisplay.ts`
- `src/app/utils/numberDisplay.ts`
- `src/app/utils/cjsRegistry.ts`
- `src/app/swap/amount.ts`
- `src/app/governance/proposalFormat.ts`
- `src/app/chain.ts`
- `src/app/wallet/cosmosKit.ts`
- `src/app/data/classic.ts`
- `src/app/data/dexPrices.ts`
- `src/app/data/market.ts`
- `src/app/data/terraAssets.ts`
- `src/app/utils/assetIcons.ts`
- `src/app/launchpad/cw20.ts`
- `src/app/launchpad/locker.ts`
- `src/app/launchpad/registry.ts`
- `src/app/feedback/AppErrorBoundary.tsx`
- `src/app/feedback/DataErrorCard.tsx`
- `src/app/feedback/DataErrorCard.module.css`
- `src/main.tsx`
- `src/pages/Launchpad.tsx`
- `src/pages/Market.tsx`
- `src/pages/market/MarketPage.tsx`
- `src/pages/MarketPairDetails.tsx`
- `src/pages/ProposalDetails.tsx`
- `src/pages/Stake.tsx`
- `src/pages/Wallet.tsx`
- `src/pages/components/SwapPanel.tsx`
- `README.md`
- `docs/testing-checklist.md`

## Behavior Preservation Notes

- Routes were not changed.
- Wallet connector defaults were preserved.
- Swap transaction message construction was not changed.
- Swap platform fee default remained `20` bps.
- Swap platform fee recipient default remained `terra16x9dcx9pm9j8ykl0td4hptwule706ysjeskflu`.
- Launchpad creation fee remained `30,000 LUNC`.
- Launchpad registry and LP locker features still disable themselves when the corresponding environment address is missing.
- External service URLs were moved into a typed config module without changing values.
- The global error boundary only catches unhandled React render errors. Existing transaction error handling remains local to the existing transaction status flows.

## Risky Areas Intentionally Not Changed

- Market sorting, filtering, charting, recent-trade parsing, and asset resolution logic.
- Swap quote routing, pair lookup, slippage math, fee math, wallet signing, and broadcast behavior.
- Stake delegate/redelegate/undelegate transaction behavior.
- Governance vote/deposit transaction behavior and vote tally math.
- Launchpad business flow and contract message shape.

## Refactor Summary

- Centralized chain, wallet, swap, launchpad, and external-service config into `src/app/config`.
- Added safe optional environment overrides for swap platform fee values while keeping production defaults.
- Added a production-safe WalletConnect fallback warning helper without requiring new environment variables.
- Extracted duplicated pure helpers for asset identity, DEX labels, compact USD formatting, and CommonJS registry parsing.
- Moved the Market page implementation behind a thin `src/pages/Market.tsx` wrapper without changing route behavior.
- Extracted SwapPanel amount parsing/formatting helpers without changing quote or transaction construction.
- Extracted ProposalDetails pure formatting/parsing helpers without changing vote/deposit queries, signing, retry, or broadcast behavior.
- Added a global React error boundary with a minimal reload fallback.
- Added production README and manual testing checklist.

## Final Verification

- `npm run build`: passed after final edits. Existing Vite warnings remain limited to dependency eval/PURE comments and large chunks.
- `npm run lint`: passed after final edits.
