# Dependency Audit

## Release follow-up — 2026-11-06 (Toronto)

Vitest is pinned to 4.1.12 and qs resolves to 6.17.1. Only the
`@typescript-eslint/typescript-estree` consumer overrides minimatch to 11.0.1;
ESLint's older callable matcher is not replaced. Ordinary Windows/Unicode and
dotfile matching is covered through the installed consumer. Full-graph audit
now has zero moderate/high/critical findings; its raw low count remains 21.

Deepmerge 4.3.1 has no upstream patched release for
[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
The local postinstall fix writes own data properties at all three destination
assignment boundaries in index.js, dist/cjs.js and dist/umd.js. It preserves the
ordinary result prototype, merge options, symbols, arrays and callback contracts.
Every locked copy must match version 4.3.1 and exact original or patched SHA-256
digests. Changed/unpatched copies fail installation or the production gate.

Raw production audit still reports 16 low entries. The gate separately verifies
the installed fix, then accounts for exactly this advisory on deepmerge and the
three reviewed provider consumers: 4 locally fixed entries and 12 residual low
entries under the **unchanged** baseline. It does not waive another advisory,
severity increase, unknown graph edge or new consumer. Native wallet compromise
or attacker-controlled signing options were not established by this dependency
review. The older elliptic-related baseline remains open; this is not a claim of
zero vulnerabilities. The historical records below describe earlier snapshots.

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

## Compatible advisory refresh — 2026-10-21 UTC

A fresh audit found two elevated package entries without a preceding lockfile
change: follow-redirects 1.16.0 and Vite 7.3.6. Update only the locked
follow-redirects to 1.16.1 and Vite to 7.3.7, including the root Vite minimum.
Axios 1.20.0 already accepts the redirect patch; Vite's dependency and Node-engine
ranges are unchanged. No wallet downgrade, forced audit fix, new override or
audit-baseline exception is introduced.

The redirect advisories concern Node HTTP requests with
[array-form headers](https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-q3jh-wrc6-jgq8)
or [custom sensitive header names](https://github.com/advisories/GHSA-8r9p-f939-6h3c).
An isolated loopback test with synthetic headers reproduces both defects in
1.16.0 and verifies their removal in 1.16.1, with same-host authorization and
ordinary public headers preserved. The first fixture attempt omitted the Host
header required by Node's raw-header-array form and failed before exercising
redirects; only the corrected fixture is remediation evidence. The identified
browser wallet path uses Axios's browser adapter, not this Node transport; this
does not establish that Burrito's live browser app leaked credentials.

Vite bundles launch-editor internally, so a standalone transitive override would
not repair its development-server editor route. The
[patched Vite 7.3.7 release](https://github.com/vitejs/vite/releases/tag/v7.3.7)
contains launch-editor 2.14.2 for the Windows path/escaping and editor-argument
advisories. Isolated checks of the actual bundled pure helpers verify percent
and line-break rejection, normalized paths, CLI-like filename handling and
ordinary spaced filenames with cursor positions. No editor or shell command is
executed by those checks; public reachability or an OS exploit is not claimed.

After a lockfile-consistent install, both audit gates again pass: production
12 low and full graph 17 low, with zero moderate/high/critical. Existing low-risk
wallet findings remain tracked above. Candidate-only remediation is not a
statement that main, older builds or production deployments have been updated.

## High-severity refresh — 2026-11-03

Update only the compatible locked follow-redirects 1.16.1 → 1.16.2 and Zod
4.3.6 → 4.6.7. New tests in `tests/dependencySecurity.test.ts` first failed
against the original installed versions, then passed after a normal clean
install: foreign-realm custom-sensitive-header redirects with public/same-host
controls, and bounded over-limit array/set parsing before element callbacks.
All network fixtures use loopback and synthetic headers; no live credential
leak or browser Zod reachability is asserted. No wallet version is downgraded.

Fresh production metadata now reports 16 low and zero elevated package entries.
The existing production gate still rejects four newly reported low packages
(`deepmerge` and three Keplr provider dependents); the full graph gate also
rejects moderate tooling advisories. Neither baseline nor severity threshold
was relaxed. This is a local candidate, not an all-green release, a closed
GitHub alert or a deployed fix. Zod v3 remains an exported legacy implementation;
no application import of that API was established by this change.

## Release-gate refresh — 2026-11-06

Pin Vitest and its matching packages to 4.1.12, the upstream backport for
[manual mock source injection](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8)
and [Windows redirect traversal](https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp).
Update the compatible locked qs dependency from 6.16.0 to 6.17.1; the upstream
[comma-array serialization fix](https://github.com/ljharb/qs/security/advisories/GHSA-6pq8-jhm2-2vcw)
starts at 6.16.1. A synthetic non-callable own `toString` regression fails on
6.16.0 and passes after `npm ci`, alongside ordinary comma-array controls.
All three focused dependency tests and their scoped ESLint check pass. Existing
follow-redirects 1.16.2 and Zod 4.6.7 resolutions are preserved.

The unchanged production gate still rejects 16 low package findings against
its 12-low baseline. The new root advisory is
[deepmerge prototype poisoning](https://github.com/advisories/GHSA-gcqx-w48m-w2h4),
also propagated to three Keplr provider dependents. The official advisory lists
no patched release, and the registry's latest deepmerge remains 4.3.1. npm's
suggested wallet downgrade is not a compatible remediation and was not applied.

The full graph is reduced from 21 low / 10 moderate to 21 low / 7 moderate;
there are zero high or critical findings. The remaining moderate family is
[minimatch globparts amplification](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249)
under typescript-eslint. The official fix is 11.0.1, outside the parent's
`^10.2.2` range even in latest typescript-eslint 8.72.1. A separately authorized
override is restricted to `@typescript-eslint/typescript-estree` → minimatch
11.0.1. Its CommonJS named `minimatch` and `Minimatch` exports are retained, and
its unchanged Node engine (`18 || 20 || >=22`) includes CI/build Node 22.
ESLint's separate minimatch 3.1.5 is unchanged.

Five focused tests now pass, including the installed project-service consumer's
own matching function with ordinary, dotfile, Unicode and Windows paths, plus
a 3-second-bounded subprocess exercising excessive glob preprocessing. An
initial fixture assumed Windows backslashes were unmatched; the actual matcher
normalizes them on Windows, and the corrected platform-aware expectation passes.
The complete `npm run lint` also passes. `npm run check:audit:all` now passes
with 21 low and zero moderate/high/critical findings. Production baseline 12 is
unchanged; its deepmerge blocker above remains pending separate remediation.
No forced downgrade, allowlist increase or severity waiver was applied.
