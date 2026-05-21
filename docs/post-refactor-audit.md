# Post Refactor Audit

Date: 2026-05-19

Audited range: `3403ffb..53f73ad`

Mode: safety audit only. No broad refactor was performed.

## Result

No blocking static issues were found.

`npm run lint`, `npx tsc -b`, and `npm run build` all passed after the refactor and the later CW20 USD pricing fix.

This audit did not change application code. The only file added during this audit is this document.

## Checks

- Broken imports: no broken imports were found by ESLint, TypeScript, or production build.
- Routes: `src/app/routes.tsx` was compared against the pre-refactor baseline. Public routes are preserved.
- Local storage keys: existing wallet, launchpad, dashboard, token cache, Keybase, native balance, and CW20 balance keys are preserved. Some call sites moved into feature folders, but key strings were not renamed.
- Query keys: `queryKey:` count remains stable at 94 across `src/app` and `src/pages`. Query families appear preserved; paths moved as part of the feature-folder migration.
- Transaction payloads: static review found no intentional message-payload changes for Swap, Stake, Withdraw rewards/commission, Governance vote/deposit, or Launchpad execution flows.
- Fee, gas, and slippage defaults: current defaults match the preserved production values. Swap platform fee remains 20 bps, default slippage remains 0.5%, Terra Classic gas price remains 28.325 micro LUNC where used, and Launchpad creation fee remains 30,000 LUNC.
- Launchpad component props: TypeScript compile passed after the component split, so no static prop mismatch was found.
- Mobile wallet behavior: WalletConnect fallback project ID and connector defaults are preserved. This still requires real mobile wallet manual testing because static checks cannot prove app handoff behavior.
- Error boundary placement: `AppErrorBoundary` wraps `WalletBoot` and the router while staying inside `QueryClientProvider`. The fallback is minimal and does not replace transaction-specific error handling.

## Non-blocking Risks

- The production refactor was large, so future work should stay limited to one feature area per commit.
- Read-only chain data now uses LCD/FCD endpoint fallback for balances, market pool reads, token metadata, dashboard data, and swap quote simulation. Wallet signing and transaction broadcast paths were intentionally left unchanged.
- `VITE_SWAP_PLATFORM_FEE_BPS` supports an env override. This has been hardened so missing, invalid, negative, or above-100 bps values fall back to the default 20 bps.
- Build output still reports Vite warnings from third-party dependencies and large wallet/protobuf chunks. These are not build failures, but they explain some mobile loading cost.
- Static checks cannot prove every wallet signing path. Real-device checks remain required for Keplr mobile, Galaxy Station, and desktop extensions.

## Manual Regression Priority

1. Keplr desktop connect and disconnect.
2. Galaxy Station desktop connect and disconnect.
3. Mobile Keplr app handoff and return.
4. Wallet and drawer balance display, including CW20 USD values.
5. LUNC to USTC small swap.
6. CW20 pair quote and small swap.
7. Delegate, redelegate, undelegate, withdraw rewards, and withdraw commission.
8. Governance vote and deposit on an available proposal.
9. Launchpad create token, create pair, provide liquidity, lock LP, publish, explore, and manage.
10. Refresh nested routes such as `/market/pair/...` and `/proposal/...` directly on Cloudflare Pages.
