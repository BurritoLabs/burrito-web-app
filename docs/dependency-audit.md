# Dependency Audit

Both dependency scopes are checked in normal frontend CI, the weekly/manual
`Dependency Audit` workflow, and `npm run verify`:

- `npm run check:audit` retains the reviewed production-only baseline below.
- `npm run check:audit:all` explicitly includes development dependencies and
  fails on moderate, high or critical findings. Do not omit build dependencies:
  Vite's Node polyfill plugin can put some of them in the browser bundle.

## Current Baseline

- Reviewed: 2026-08-08
- Review again by: 2026-11-08
- Known findings: 12 low, 0 moderate, 0 high, 0 critical
- Scope: production dependencies only (`npm audit --omit=dev`)

The low-risk findings are transitive dependencies in the CosmosKit, Keplr, and
secp256k1 wallet stack. npm currently offers either no direct fix or changes
that would replace current wallet packages with incompatible versions. Do not
run `npm audit fix --force` without a wallet regression plan.

React Router was upgraded to 7.18.2, which removed the previously reviewed
high-severity React Server Components advisory from the production dependency
graph. No elevated advisory exception remains in the baseline.

The accepted package names, exact advisory URLs, and maximum count live in
`scripts/dependency-audit-baseline.json`. `npm run check:audit` fails when:

- an elevated finding is not matched by an exact reviewed advisory and package;
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

## Build-tool and polyfill remediation — 2026-10-11

The complete locked graph initially reported 17 low, six moderate and six high
findings. Compatible lockfile updates remove the elevated affected versions:

| Dependency family | Verified resolution |
| --- | --- |
| brace-expansion (both minimatch paths) | 1.1.21 / 5.0.12 |
| browserslist / baseline-browser-mapping | 4.29.3 / 2.11.28 |
| js-yaml | 4.3.2 |
| nanoid / postcss / source-map-js | 3.3.20 / 8.5.29 / 1.2.2 |
| @humanfs/node | 0.16.8 |
| Vitest and its matching @vitest packages | 4.1.11 |
| pbkdf2 / qs | 3.1.7 / 6.16.0 |

All transitive updates satisfy their existing parent ranges. Vitest is pinned
to the reviewed patch rather than overriding its mocker independently. No
production-dependency lock entry, wallet package, application source, fee,
transaction builder or brand asset was changed. Associated tooling closure and
browser-data updates are visible in the lockfile; this was not a forced audit
fix or an exception to the existing production baseline.

Fresh full audit: 17 low, zero moderate/high/critical. Production audit remains
12 low, zero moderate/high/critical. These are package-graph counts, not proof
that every advisory had a remotely exploitable application path. Remaining
elliptic/wallet/polyfill findings were not dismissed or forced through a wallet
downgrade. Examples of the upstream fixes are the
[Nano ID generator boundary](https://github.com/advisories/GHSA-2v37-7h3g-55p8)
and [Vitest mock-path validation](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).

Compiled module provenance confirms `pbkdf2/browser` is present in the
`crypto-vendor` chunk; npm's `dev` flag is not a browser-exclusion guarantee.
Sixteen synchronous/asynchronous public test-vector comparisons against Node
crypto preserve SHA-1/256/384/512 output for ordinary and long passwords.
Separate bounded subprocess checks reproduce Nano ID zero/negative-size
failures in the old graph and normal completion in the patched graph. Normal
glob, YAML, CSS/source-map, ID, browser-query and URL-query controls also pass.
These use only synthetic inputs, not user secrets, signatures or transactions.

No application-wallet lifecycle issue, genuine-wallet acceptance gate or
production deployment is closed merely by this dependency remediation.
