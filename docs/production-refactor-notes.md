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
- `src/app/contract/contractHelpers.ts`
- `src/app/dashboard/dashboardFormat.ts`
- `src/app/utils/assetIdentity.ts`
- `src/app/utils/dexDisplay.ts`
- `src/app/utils/numberDisplay.ts`
- `src/app/utils/cjsRegistry.ts`
- `src/app/swap/amount.ts`
- `src/app/history/historyFormat.ts`
- `src/app/governance/proposalFormat.ts`
- `src/app/governance/governanceList.ts`
- `src/app/chain.ts`
- `src/app/wallet/cosmosKit.ts`
- `src/app/wallet/WalletPanelActions.tsx`
- `src/app/wallet/WalletPanelAssetList.tsx`
- `src/app/wallet/WalletPanelDetails.tsx`
- `src/app/wallet/WalletPanelIcons.tsx`
- `src/app/wallet/walletPanelUtils.ts`
- `src/app/data/classic.ts`
- `src/app/data/dexPrices.ts`
- `src/app/data/market.ts`
- `src/app/data/terraAssets.ts`
- `src/app/utils/assetIcons.ts`
- `src/app/launchpad/cw20.ts`
- `src/app/launchpad/locker.ts`
- `src/app/launchpad/pageModel.ts`
- `src/app/launchpad/registry.ts`
- `src/app/market/pairChart.ts`
- `src/app/feedback/AppErrorBoundary.tsx`
- `src/app/feedback/DataErrorCard.tsx`
- `src/app/feedback/DataErrorCard.module.css`
- `src/main.tsx`
- `src/pages/Contract.tsx`
- `src/pages/contract/ContractLinks.tsx`
- `src/pages/contract/ContractPage.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/dashboard/DashboardPage.tsx`
- `src/pages/dashboard/DashboardMetricCard.tsx`
- `src/pages/History.tsx`
- `src/pages/history/HistoryPage.tsx`
- `src/pages/Launchpad.tsx`
- `src/pages/launchpad/LaunchCreateForm.tsx`
- `src/pages/launchpad/LaunchCreatePreview.tsx`
- `src/pages/launchpad/LaunchDistributionTool.tsx`
- `src/pages/launchpad/LaunchExplorePanel.tsx`
- `src/pages/launchpad/LaunchManageOverview.tsx`
- `src/pages/launchpad/LaunchpadTabs.tsx`
- `src/pages/launchpad/LaunchTokenLogo.tsx`
- `src/pages/launchpad/LaunchpadPage.tsx`
- `src/pages/Market.tsx`
- `src/pages/market/MarketPage.tsx`
- `src/pages/market/MarketPairAssetIcon.tsx`
- `src/pages/market/MarketPairChartPanel.tsx`
- `src/pages/market/MarketRecentTrades.tsx`
- `src/pages/MarketPairDetails.tsx`
- `src/pages/market/MarketPairDetailsPage.tsx`
- `src/pages/NotFound.tsx`
- `src/pages/system/NotFoundPage.tsx`
- `src/pages/ProposalDetails.tsx`
- `src/pages/governance/ProposalDetailsPage.tsx`
- `src/pages/Governance.tsx`
- `src/pages/governance/GovernancePage.tsx`
- `src/pages/governance/GovernanceProposalCard.tsx`
- `src/pages/governance/ProposalDepositModal.tsx`
- `src/pages/governance/ProposalDepositSection.tsx`
- `src/pages/governance/ProposalDetailIntro.tsx`
- `src/pages/governance/ProposalTallyProcedure.tsx`
- `src/pages/governance/ProposalPrimaryAction.tsx`
- `src/pages/governance/ProposalVoteModal.tsx`
- `src/pages/governance/ProposalVotesPanel.tsx`
- `src/pages/governance/ProposalSummaryValue.tsx`
- `src/pages/governance/ProposalVoteFlag.tsx`
- `src/pages/ProposalNew.tsx`
- `src/pages/governance/ProposalNewPage.tsx`
- `src/app/stake/keybasePictures.ts`
- `src/app/stake/stakeFormat.ts`
- `src/app/stake/stakeTx.ts`
- `src/app/stake/withdrawTx.ts`
- `src/pages/Stake.tsx`
- `src/pages/stake/StakePage.tsx`
- `src/pages/stake/StakeValidatorRow.tsx`
- `src/pages/StakeManageModal.tsx`
- `src/pages/stake/StakeManageModal.tsx`
- `src/pages/Swap.tsx`
- `src/pages/swap/SwapPage.tsx`
- `src/pages/WithdrawRewards.tsx`
- `src/pages/stake/WithdrawRewardsPage.tsx`
- `src/pages/WithdrawCommission.tsx`
- `src/pages/stake/WithdrawCommissionPage.tsx`
- `src/pages/Wallet.tsx`
- `src/pages/wallet/WalletPage.tsx`
- `src/pages/wallet/WalletAssetSections.tsx`
- `src/pages/components/SwapPanel.tsx`
- `src/pages/components/swap/SwapAssetIcon.tsx`
- `src/pages/components/swap/SwapAssetPickerModal.tsx`
- `README.md`
- `docs/testing-checklist.md`
- `docs/maintenance-boundaries.md`

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
- Moved the Market pair detail implementation behind a thin `src/pages/MarketPairDetails.tsx` wrapper without changing route behavior.
- Moved the Proposal details implementation behind a thin `src/pages/ProposalDetails.tsx` wrapper without changing governance route behavior.
- Moved the Launchpad implementation behind a thin `src/pages/Launchpad.tsx` wrapper without changing launchpad route behavior.
- Extracted Launchpad page model helpers for tabs, filters, local draft storage, display formatting, URL validation, distribution parsing, and recovered registry records without changing the launchpad flow or message payloads.
- Moved the Launchpad create form into a local component without changing input normalization, validation hints, fee display, or create button behavior.
- Moved the Launchpad create preview card into a local component file without changing displayed values, links, or readiness behavior.
- Moved the Launchpad CW20 distribution form into a local component without changing transfer preview parsing, validation messages, submit handler, Finder links, or wallet-ready button behavior.
- Moved the Launchpad Explore search/filter/detail/card rendering into a local component without changing filter values, links, copy behavior, or card selection behavior.
- Moved the Launchpad Manage overview, import, readiness, summary, and tool navigation rendering into a local component without changing owner selection, sync/import handlers, copy actions, or active tool behavior.
- Moved the Launchpad tab bar into a local component without changing tab IDs, query behavior, or labels.
- Moved the Launchpad token logo renderer into a local component file without changing image fallback order or CSS classes.
- Moved Stake and StakeManageModal implementations behind thin wrappers without changing staking transaction behavior.
- Extracted Stake validator identity/cache helpers, bigint/percent helpers, donut segment calculation, and validator-row rendering while preserving query keys, sorting behavior, Keybase cache keys, Finder links, and Manage Stake opening behavior.
- Extracted StakeManageModal micro-amount conversion and staking fee/gas constants into a stake transaction helper while preserving the exact fallback gas values, gas price, delegate buffer, gas adjustment, and sign/broadcast message construction.
- Extracted withdraw rewards/commission fee and gas constants into a shared withdraw transaction helper while preserving the exact gas defaults, gas price, simulation fallback multiplier, fee denom behavior, and distribution message construction.
- Moved the Swap page shell behind a thin wrapper without changing SwapPanel quote or transaction behavior.
- Moved the Contract tool implementation behind a thin `src/pages/Contract.tsx` wrapper without changing contract transaction behavior.
- Moved History, Governance, and ProposalNew implementations behind thin wrappers without changing route or transaction behavior.
- Moved Dashboard, Wallet, WithdrawRewards, and WithdrawCommission implementations behind thin wrappers without changing route or transaction behavior.
- Extracted Wallet coin/token section rendering into a wallet page component while preserving wallet asset query usage, hide-low-balance behavior, retry query keys, and Buy/Send/Swap navigation handlers.
- Extracted Market pair detail chart timeframe constants, axis/tooltip formatting, trade formatting, and chart event time parsing into a pure market helper while preserving candle generation, chart options, selected timeframes, and displayed values.
- Extracted Market pair detail asset icon rendering and recent-trades table rendering into local presentation components while preserving icon fallback order, Finder links, price display, table rows, empty/loading states, and load-more behavior.
- Extracted Market pair detail chart shell into a local presentation component while preserving the existing chart refs, OHLC display, loading/empty states, tooltip-driven chart effect, and timeframe aria label behavior.
- Extracted WalletPanel send amount parsing, recent-recipient storage key, address truncation, Terra address validation, fallback send gas constants, and JSON byte encoding into a pure wallet helper while preserving existing localStorage keys, address display, amount conversion, and send transaction payloads.
- Moved WalletPanel SVG icon definitions into a wallet icon component file without changing rendered SVG paths, button behavior, or class names.
- Extracted WalletPanel portfolio/asset detail summary and bottom action footer into pure presentation components while preserving existing handlers, labels, disabled states, and wallet/send/receive view behavior.
- Extracted WalletPanel asset list and selected-asset chain summary into pure presentation components while preserving the existing Manage, Retry balances, asset selection, icon fallback, price, amount, and 24h change rendering.
- Moved the NotFound page behind a thin wrapper without changing fallback route behavior.
- Extracted Dashboard range config, mobile-defer detection helper, and value/delta formatting helpers into `src/app/dashboard/dashboardFormat.ts` while preserving query keys, refresh intervals, range labels, and dashboard card rendering.
- Extracted Dashboard metric card and skeleton rendering into a local component while preserving the existing metric class names, delta icon logic, and section ordering.
- Extracted Contract tool default JSON snippets, micro-amount conversion, JSON object validation, and event attribute lookup into `src/app/contract/contractHelpers.ts` without changing upload, instantiate, execute, migrate, or admin transaction message construction.
- Extracted Contract search icon and Finder address link rendering into a local component file while preserving existing links, icon SVG paths, and CSS classes.
- Extracted SwapPanel amount parsing/formatting helpers without changing quote or transaction construction.
- Extracted SwapPanel token icon rendering and token picker modal rendering into pure UI components while preserving asset fallback behavior, search text, selected-state checks, balance display, and pick/close handlers.
- Extracted ProposalDetails pure formatting/parsing helpers without changing vote/deposit queries, signing, retry, or broadcast behavior.
- Extracted ProposalDetails summary value rendering and vote progress flag into local governance components without changing tally math, displayed values, or vote/deposit transaction behavior.
- Extracted ProposalDetails vote and deposit modal rendering into local governance components while keeping the original submit handlers, validation states, button labels, and transaction behavior in the page orchestrator.
- Extracted ProposalDetails top summary/header and tally procedure rendering into local governance components without changing proposal labels, links, or tally threshold display.
- Extracted ProposalDetails primary action button into a local governance component without changing voting/deposit modal routing, disabled state, or button labels.
- Extracted ProposalDetails deposit progress/list section into a local governance component while preserving deposit progress math, list formatting, and modal opening behavior.
- Extracted ProposalDetails votes summary, progress bar, and validator vote list rendering into a local governance component while preserving filter toggles, vote colors, tx links, and load-more behavior.
- Extracted Governance proposal grouping/duration/math helpers and the live-tally proposal card into dedicated governance files while preserving proposal tab behavior, query keys, refetch intervals, detail navigation state, and deposit action state.
- Extracted History pure formatting, transaction-log normalization, canonical-message parsing, timestamp formatting, sign-mode detection, and contract-candidate collection into `src/app/history/historyFormat.ts` while preserving history query keys, retry behavior, rendered messages, and card layout.
- Added a global React error boundary with a minimal reload fallback.
- Added production README, manual testing checklist, and maintenance boundary notes for safe future refactors.

## Final Verification

- `npm run build`: passed after final edits. Existing Vite warnings remain limited to dependency eval/PURE comments and large chunks.
- `npm run lint`: passed after final edits.
- `npx tsc -b`: passed after final edits.

## Brand And Metadata Refresh

- Replaced the single-chain social preview with a deterministic dual-chain asset.
- Added route-aware page titles, descriptions, canonical URLs, and social metadata.
- Added a web app manifest, sitemap, theme metadata, and sitemap discovery in robots.txt.
- Replaced the retired Twitter bird with the current X mark.
- Added a 192px runtime brand icon so small UI placements no longer load the 1024px source asset.
- Corrected the mobile testing checklist to use the real `/gov` route.
- Isolated Playwright mobile checks on port `4173` so an existing local `5173` session cannot produce false failures.
- Wallet, transaction, chain, market, swap, staking, governance, and launchpad behavior were not changed.
