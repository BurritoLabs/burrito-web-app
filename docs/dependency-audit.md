# Dependency Audit

The production dependency audit is checked in normal frontend CI and in the
weekly `Dependency Audit` workflow.

## Current Baseline

- Reviewed: 2026-07-13
- Review again by: 2026-10-13
- Known findings: 13 low, 0 moderate, 0 high, 0 critical
- Scope: production dependencies only (`npm audit --omit=dev`)

The low-risk findings are transitive dependencies in the CosmosKit, Keplr, and
secp256k1 wallet stack. npm currently offers either no direct fix or changes
that would replace current wallet packages with incompatible versions. Do not
run `npm audit fix --force` without a wallet regression plan.

The accepted package names and maximum count live in
`scripts/dependency-audit-baseline.json`. `npm run check:audit` fails when:

- a moderate, high, or critical finding appears;
- the low-risk count exceeds the reviewed baseline; or
- a low-risk finding appears in a package that was not reviewed.

## Review Procedure

1. Run `npm audit --omit=dev --json` and inspect every changed advisory.
2. Test a compatible CosmosKit or Keplr upgrade in a separate change.
3. Run desktop and mobile connect, account switch, sign, broadcast, reconnect,
   and disconnect checks on both chains.
4. Update the baseline only after confirming that remaining findings are
   understood and do not have a compatible fix.
5. Move `reviewedAt` and `reviewBy` forward by no more than three months.
