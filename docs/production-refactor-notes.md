# Production Refactor Notes

## Empty Keplr connection guidance — 2026-09-30

The desktop Keplr connector now maps the exact official 0.13.52 empty-keyring
error to an instruction to create or import inside the Keplr extension, then
connect again. Other messages, cancellation, non-Error fallback, Burrito's
mapping, adapters, session ownership, storage and restoration policy are unchanged.
The unresolved active-owner lifecycle gate below remains open.

Local lint, 277 unit tests in 43 files, wallet-spec verification, TypeScript,
production build and bundle budgets pass. The initial selected browser run
passed 56 cases with two intentional desktop skips. Four final targeted cases
also pass: empty Keplr retries count actual fixture enable calls, no automatic
Burrito account request occurs, explicitly choosing Burrito clears the error and
connects, and Keplr cancellation retains its original message. These are
controlled-provider tests, not installed-wallet approval evidence.

Separately, the actual official empty Keplr and empty Burrito extension were
loaded in a new retained test profile. The local production artifact at the
intercepted exact Web origin passed 47 checks at 1440x900/light and 390x844/dark:
actionable alert, usable retry controls, no borrowed account or Burrito review,
no remembered failed session, viewport containment, close/focus and disconnected
reload. Screenshots were visually inspected. No wallet creation, import, approval,
signature, funded account or live API request was used. This narrow desktop
viewport does not establish mobile-browser extension support.

An earlier attempt timed out during fresh-extension discovery before Connect;
it is retained as failed setup, not a product pass. The final discovery recorded
Burrito compatibility first, then independent Keplr after a normal reload. The
run does not claim automatic first-document discovery. There were no uncaught
page errors or external HTTP responses; 49 blocked-resource messages and one
blocked Keplr telemetry error were expected under browser-level offline/routes/
DNS restrictions, not a verified OS firewall. Existing production-build warnings
about large chunks, vm-browserify eval and a stripped annotation remain.

Evidence: `C:/Users/fengz/.codex/artifacts/burrito-wallet/keplr-empty-copy-20260930/`,
final `actual-4lDDzt/acceptance.json`, build `build-kPn9gG/candidate-build.json`.
The build pins 412 source files and 156 outputs and uses the unchanged local
dependencies, not a fresh install. No tracked distribution files, publication,
store, native signing or simulator data changed. iMac still has 7.2 GiB free;
new dedicated simulator permission is recorded but old-cache deletion is not.

## Genuine Keplr active-owner lifecycle findings — 2026-09-30

Documentation-only checkpoint; no product behavior, dependencies, typography,
brand, signing, or deployment changed. The tested Web runtime remains `258c6ce`,
Burrito extension runtime `007bfa8`, and official Keplr 0.13.52 (CRX SHA256
`452668db29ec1276c785b2114d781460dbd6a758857f4c24a4ce9184252212bf`).

Prior normal-UI dual-account acceptance passed 62 named checks in each of two
complete fresh-profile replays. That established the listed account-access,
identity isolation, refresh/disconnect and chain-race scenarios, not all Keplr
lock or permission semantics. The follow-up used fresh unfunded accounts,
actual wallet pages and local production artifacts routed at the exact Web
origin, with external HTTP/WebSockets blocked. It reproduced stale Web account
display after Keplr lock or site revocation, followed by automatic unlock or
permission prompts on reload. No signature, broadcast, live balance, or real
funds operation was used to reach these observations.

`requestApproval: false` currently does not make the Keplr adapter passive.
Fixed-package source also shows that `getKey` / `getKeysSettled` first ensure
interactive unlock and access; they cannot replace `enable` as silent probes.
Normal lock/unlock/site revocation do not emit the supported account-change
event. Do not equate a cached displayed address with currently confirmed access,
or claim the observed prompts automatically approve access. The interaction
policy choice is unresolved and recorded in the quality gates; no quieter but
functionally reduced recovery flow has been substituted without that decision.

Evidence is outside the repository under
`C:/Users/fengz/.codex/artifacts/burrito-wallet/keplr-active-owner-20260930/`.
It retains the interactive probe's setup/locator/cleanup failures, the complete
narrow replay, and subsequent verification. The narrow replay's reproduction
checks being true are not a release pass: its four lifecycle expectations are
explicitly false. Early cleanup read an already-open permission list after a
second window re-granted access; that is UI evidence only, not proof of an empty
persistent permission store. Final cleanup requires popup reload before clearing
and another reload to verify. Retained QA profiles are not included in evidence
archives and must not be reused or deleted without authorization.

Final desktop `run-KBRAbm` completed 55 reproduction/helper assertions, observed
the re-granted QA site after reload, explicitly cleared it, and verified the
empty list after another reload. Both wallets were normally locked and the
browser closed. Its status remains `findings-confirmed`, not passed: all four
desired lifecycle expectations are false. Earlier `run-O9d3tw` and `run-F2liPO`
did restore the account before cleanup failed on an incorrect assumption that
reload returns Keplr to Home; their stale failure-stage labels must not be read
as evidence of failed account restoration or a desktop/narrow discrepancy.

No full-suite, native, CI, live-service, or store gate is promoted by this note.
The earlier dual-account evidence remains separately sealed at
`C:/Users/fengz/.codex/artifacts/burrito-wallet/keplr-accounts-20260930/`.

## Proposal tally text and full detail-page gates — 2026-09-30

Following `8e28bb6`, the status pills passed, but that did not cover the four
vote-percentage values. A populated, offline baseline measured light-theme
Yes/No/Veto/Abstain at 2.15/2.33/3.11/1.56:1 against a required 4.5:1.
The final baseline matrix reproduced 16 light-theme failures; 16 dark-theme
cases passed. The four text classes now use the existing shared success,
danger and warning tokens. Chart segments, borders, typography, brand,
wallet logic and transaction execution are unchanged.

`governance-details.spec.ts` adds 32 cases: both chains, both themes, all four
proposal states, desktop 1440x900 and touch/mobile 390x844. Tests enter from
the real Governance list, require a loaded tally and four visible percentage
nodes, expand/collapse the description, check overflow/page errors, and run
whole-page Axe with the existing decorative `aria-hidden` exclusion. Each
of the four changed values must also appear in the scoped contrast passes;
empty violations/incomplete arrays alone are insufficient. Whole-page manual
review items are retained as attachments, not declared passing or suppressed.
This is not a complete WCAG certification: fixture validators, individual votes
and deposit lists remain empty, and no wallet is connected or transaction sent.

Local full dev suite: 173 pass / 3 intentional platform skips. Production
governance suite: 40/40; lint, 265 unit tests, TypeScript,
production build and bundle budgets pass. Production dependency audit remains
12 low and zero moderate/high/critical, not a full-tree dependency clearance.
The isolated dependencies are copied from the previously verified lock-matched
installation; final-head CI must provide its own fresh-install result.
The 32 new production cases record 2,560 console messages with no truncation:
expected blocked-network failures and preload warnings, no uncaught page errors.
The wider 40-case suite records 4,560 messages and drops 422 at the existing
per-test cap; it is not evidence of complete error-free online service logs.

Evidence: `C:/Users/fengz/.codex/artifacts/burrito-wallet/proposal-details-20260930/`.
The initial cold-dev-server invalid-hook failure and early test-authoring
failures (ambiguous Deposit link and overbroad manual-review assertion) are
retained alongside the corrected baseline and final production evidence.
The previously sealed pairing evidence was not modified; this CSS-only runtime
change does not claim a new installed-extension/native/signing acceptance run.
Full-suite and subsequent exact-head CI results are retained in this collection
rather than creating a documentation-only follow-up that retriggers CI.

## Populated governance contrast and installed-runtime pairing — 2026-09-30

The documentation-only follow-up `cead7fe` did not stay green: Frontend run
`36767576636` passed install/lint/unit/audit/build/budgets but failed mobile dark
Governance. A real Voting proposal arrived before Axe and exposed 4.2:1 text
contrast instead of the required 4.5:1. The earlier passing empty/timing-dependent
scan did not prove populated status labels were accessible. This was a real
palette defect, not grounds to retry CI unchanged or weaken the contrast rule.

An offline production baseline with all four states reproduced 10/16 failures:
all four light-theme labels and dark Voting at both viewport widths. The new
permanent tests also failed 8/8 before the fix. Governance list/detail status
pills now use the existing shared info/warning/success/danger foreground and
soft-background tokens. Typography, brand, chain data and transaction logic are
unchanged. The generic Governance quality gate waits for a fixture proposal;
the additional tests require each visible label and a measurable Axe result on
both chains, both themes and list/details at desktop/mobile sizes: 64 checks
inside 8 tests. No empty-state pass or contrast exclusion is used.

Final local checks: full dev suite 141 pass / 3 intentional platform skips;
selected production wallet/quality/status suite 88/88; lint, 265 unit tests,
TypeScript build, production build, existing bundle limits and production audit
pass. Audit remains 12 low, zero elevated in production, not full-tree clearance.
All browser runs are isolated offline API fixtures, not governance execution or
live-data acceptance. Zero uncaught page errors; full dev console samples retain
8,987 messages and drop 3,693 at the existing cap, production retains 5,972 and
drops 2,940. These are not complete error-free online-service logs.

Before the palette change, exact runtime `4e894ff` / docs head `cead7fe` also
passed 205/205 actual installed-extension pairing assertions with unchanged
extension `007bfa8` / ZIP `d9fc83e7...26c22d`. A separate 105/105 focused run
held its exact production lazy chunk, queued and cancelled an unstarted mobile
handoff through UI, opened a real extension review, then released unchanged
code. Original dialog/focus and pending network lock survived 122 rendered
frames / 1005 ms; real Cancel left no grant after reload. This proves that
observed account-access boundary, not completed WalletConnect pairing or signing.
Both new unfunded QA wallets were locked normally, contexts closed and exact
profile Chrome process counts were zero. Profiles are retained, not deleted.

Persistent evidence collection:
`C:/Users/fengz/.codex/artifacts/burrito-wallet/installed-runtime-pairing-20260930-4e9256842eaa44dcb6879751753b05c6/`.
It retains the failed CI log, initial probe's detached-node failure, corrected
baseline, candidate tests/screens and source/output pins. The initial probe
used rapid tab clicks; the contrast reproduction navigates directly to each
status URL instead, without claiming the initial probe passed. Current-candidate
pairing and CI must retain their own subsequent evidence; earlier results are
not silently rebound to a different build. No real funds/signatures/broadcast,
native-device/certificate changes, main merge, deployment or store upload.

## Persistent wallet owner and CI regression repairs — 2026-09-30

The application now has one persistent WalletProvider. Lazy Cosmos Kit code
publishes a memoized, chain-tagged snapshot through a headless sibling instead
of replacing the application tree. Delayed loading preserves the same Connect
dialog/focus and pending Burrito approval. Failure only resets mobile-owned
work, and a chain change cancels an unstarted mobile handoff. SDK hook automatic
connection is disabled; explicit connection and read-only hydration stay with
the controller. Desktop-only transaction feedback retains its previous
explicit-dismiss behavior. No CSS, brand asset, chain/fee or API contract changed.

Source baseline is `9cb9a1783f6f10c680caa5ccd9d87cd012c72298`, which already
upgraded the Axios lock to 1.20.0. Its GitHub run `36761711734` passed dependency
audit/build but failed four dialog-surface checks and one lazy-runtime wallet
test. The dialog checks measured Connect's unpainted header instead of its
painted card. They now measure each component's actual surface without dropping
color or viewport assertions; contrast checks await finite theme transitions.

Final local validation uses an independent source/dependency copy, scrubbed
environment, empty env directories and the normal in-copy Vite cache:

- Lint, both TypeScript projects, 265 unit tests/42 files, wallet specs, market
  asset identities, production build and unchanged bundle budgets pass.
- Fresh production dependency audit: 12 reviewed low, 0 moderate/high/critical.
- Controlled-provider wallet cases: 54 pass, 2 desktop-only skips. The final
  complete offline dev suite: 133 pass, 3 intentional desktop skips / 136.
- Production assets: 88/88 wallet and light/dark quality cases pass. Tests
  requiring a Vite source-module interception are excluded from this production
  run and covered in the dev suite, not counted as production passes.
- Initial JS 440.0 KiB / 145.5 KiB gzip (150 KiB gzip budget); lazy wallet
  closure 1021.4 KiB gzip (1025 KiB budget). Existing annotation, vm-browserify
  eval and large-chunk build warnings remain.
- Windows Playwright, 1440x900 and 390x844; Browser plugin unavailable. Local
  static JSON/assets and explicit fixtures allowed; other HTTP/WebSockets
  blocked. Zero uncaught page errors. Recorded console samples contain offline
  asset/preload failures, intentionally aborted module failures, blocked Vite
  HMR and an SDK deprecation warning; samples cap at 250 messages/test. This is
  not online-service health, installed-extension or native-wallet acceptance.

Failures are retained: pre-fix delayed-load tests reproduce 3/4 failures. The
first candidate run has 50 pass/3 fail/1 skip because two new fixture oracles
incorrectly approved an already-rejected synthetic request and expected the
extension-only network lock for mobile. They were corrected, with an additional
mobile chain-cancellation case. Initial broader offline runs have 129 pass/
4 fail/3 skip and production 84 pass/4 fail: the harness blocked local market
JSON and contrast sampling raced theme transitions. Final passes above use
the corrected harness and unchanged contrast threshold. A first direct-node
audit invocation failed on Windows npm.cmd launching; the normal npm CLI
environment resolves this without changing the repository's audit policy.

Raw logs, screenshots, source/output hashes and harnesses are in the external
`burrito-runtime-lifecycle-9068d5046f3143faa4c66edde1ce59cb` evidence collection.
Runtime candidate `4e894ffcc70f3cd1ed3d6824ccb352a5bcb685b9` passed the existing
public-repository [Frontend run 36766611890](https://github.com/BurritoLabs/burrito-web-app/actions/runs/36766611890)
at 2026-09-30 19:40 UTC: fresh npm ci, lint, 265 unit tests, production audit,
build, unchanged bundle budgets and 133 browser cases (3 intentional skips).
The npm ci informational full-tree audit still reports 17 low, 5 moderate and
5 high findings, including development dependencies. The production-only gate
reports 12 low and no elevated findings; this is not an all-dependency clearance.
Private runner labels/budgets and deployment workflows are unchanged.

A separate final production visual probe passed desktop 1440x900 and mobile
390x844 in both themes, including page identity, nonblank content, absence of an
error overlay, dialog bounds, initial focus, Escape and trigger-focus return.
It used no injected provider and records zero page errors/unexpected console
entries, plus 16 expected blocked-network errors. Full-suite console sampling
limits above still apply and are not superseded by this four-surface probe.

Persistent local evidence is `C:/Users/fengz/.codex/artifacts/burrito-wallet/runtime-lifecycle-20260930/evidence.zip`:
556 entries, 17,774,223 bytes, SHA256
`d4ca849e7ea3501d2ff7cba9fc60e349810addaa54e884d86d504a09f8fc8a0f`.
Every archived file was read back and matched to its source SHA256; the package
includes failed attempts, final runs, CI status/log and exact source/output pins.
412 non-documentation files match the runtime commit after Git line-ending and
disposable test-import normalization. The 156 built outputs use a local QA
release label and are not a deployed build. This follow-up note changes no runtime.

Genuine WalletConnect pairing/return/restoration, exact installed-extension
pairing of this new build, native iOS/Android acceptance and original release
gates remain open. No actual signature/broadcast, real funds, device/certificate
changes, production deployment, main merge or store submission occurred.

## Independent Keplr identity and mobile handoff isolation — 2026-09-30

Runtime `ed6fa7bc38d7a8df029dff05aa8aaee8b990e81a` includes `4d5bda3`'s
shared provider identity check across WalletBoot, WalletProvider and adapters.
Burrito's named/versioned Keplr compatibility object is no longer advertised or
used as a separate Keplr installation. A desktop connector cannot use a cached
runtime to bypass that check or borrow Burrito's global signer helpers.
Independent Keplr interfaces and their legacy helpers remain supported.
Keplr Mobile no longer falls back to a desktop account/signer when its runtime
is absent; a legitimate pending mobile handoff still returns without an account.
No extension API, CSS, brand asset, dependency or audit baseline changed.

Regression evidence distinguishes fixtures from actual installed extensions:

- Initial alias tests: 6 failures / 8 cases; mobile-fallback follow-up: 2 failures
  / 13 cases. Console result summaries are retained, not claimed as raw logs.
  Final identity tests: 13/13; full Vitest suite: 265/265 across 42 files.
- Existing desktop/narrow-screen wallet suites: 42/42 on an isolated Vite dev
  server. Includes the actual lazy controller with a synthetic Burrito alias,
  stale Keplr restore, independent-provider coexistence and mobile handoff
  boundaries. Provider state/decisions here are fixtures, not real Keplr QA.
- Actual unchanged `007bfa8` Burrito extension plus final local Web production
  assets: 205/205 assertions (including provenance, not 205 distinct features).
  Covers Classic/Terra grants, cancellation, refresh, lock, explicit reconnect,
  revocation, address/QR UI and wallet A/B switching. Separate real-extension
  dialog probe: 27/27, including alias disabled, Burrito enabled, compatibility
  API still present and keyboard focus at both viewport widths.
- Final production build, both TypeScript checks, modified-file ESLint and
  existing bundle budgets pass. Wallet runtime closure is 1024.0 KiB gzip
  against 1025 KiB; initial JS 426.7 KiB / 141.8 KiB gzip. Existing annotation,
  vm-browserify eval and large-chunk warnings remain.

Browser plugin unavailable: existing Playwright 1.62.1 / Windows Chromium
151.0.7922.34; 1440x900 and 390x844. Real-extension tests serve local static
assets at the isolated browser's app origin and block other HTTP/WebSockets.
The final pairing records 0 page errors, 0 unexpected console errors and 0
external responses; 191 reads/20 writes blocked, 151 expected network errors,
59 warnings (20 preload, 39 unclassified). This is not live-data validation.
No actual signature, broadcast, secrets captured or funded wallet; final QA
wallets locked/disconnected, four persistent profiles retained and no matching
Chrome processes after closure. The approval screenshot is a 1440x900 viewport,
not physical popup geometry. No native-mobile or new optical-ink claim.

Evidence: `artifacts/web-provider-identity-20260930/`. Final pairing report
`final/run-UtMkxo/acceptance.json` SHA-256
`b323d2ac54ef8e29b879f61f5a206f7807ec20f5c0f47b2426b8478928b1e452`;
dialog report `final/focus-u4axjS/acceptance.json` SHA-256
`6c1cd6567c7c9d5c5b9410df01faa9c7094420daa90ec0e194279176da651ff4`.
Complete ZIP has 362 individually hash-verified entries, SHA-256
`85e56394663423ff2031d6d1490fbfc4b75f44ea77c275b7f95596437d223f89`.
Source/output pins cover 316 Web files/156 outputs and the unchanged complete
extension ZIP. Repository dist and unrelated untracked entries remain intact.

Remaining: genuine Keplr/Burrito extension injection-order coexistence, actual
WalletConnect mobile pairing/signing, deployed consumers and original release
gates. CI run 36757104617 for the preceding `b3749cc` passed install/lint/unit
tests but failed production dependency audit on newly reported Axios advisories;
its build/E2E were skipped, not passed. Lock remains Axios 1.19.0. Address the
upstream patched version and compatibility in a separate dependency change;
do not widen audit allowances or inherit an old green CI result.

## Current-extension pairing and connection-dialog keyboard fix — 2026-09-30

Runtime `c152eaa1ff1d35e86650d239ce7ebca99458b888` gives ConnectModal an
accessible name, focuses its dialog when opened, contains forward/reverse Tab,
closes with Escape and restores the triggering control. The keyboard listener
exists only while open; a stable callback ref avoids resubscribing/refocusing
when wallet state changes. No CSS, shared brand, provider/storage/signing logic
or dependencies changed. Escape closes the Web UI, not a pending wallet request.

The pre-fix production build reproduced all six keyboard/semantic failures at
both desktop and narrow viewports (6/18 checks passed). The unchanged probe
passes 18/18 after the fix; a separate real-extension probe passes 21/21,
including multiple enabled controls. Permanent keyboard tests pass on both
configured desktop and mobile projects. The full unit suite remains 252/252
across 41 files; modified-file ESLint, both TypeScript projects and existing
bundle budgets pass. Initial JS is 426.5 KiB / 141.8 KiB gzip; the existing
wallet runtime's static closure is 1023.9 KiB gzip, close to its 1025 KiB budget.
Existing Rollup annotation, vm-browserify eval and large-chunk warnings remain.

Two isolated real-extension runs, before and after this UI fix, each pass
197/197 assertions (including provenance checks, not 197 distinct features).
The authoritative post-fix run pairs this Web runtime with extension runtime
`007bfa80c51c5666d94edd604adf3624067b6d3e`, complete ZIP SHA-256
`d9fc83e73a83f8807abdf2df71c4edb83538bb161957be62abdbe6683526c22d`.

- Uses the actual production-mode local `/privacy` application and real
  extension, not injected provider/vault/worker state. Only local static assets
  are fulfilled at the isolated browser's `https://app.burrito.money` origin;
  all other HTTP/WebSockets are blocked. This is not the deployed WebApp.
- Covers cancellation, closing a pending panel with network switching still
  disabled, Classic-only permission, rejected Terra upgrade preserving Classic,
  both-chain permission, passive restoration, lock/unlock requiring explicit
  reconnect, extension revocation and Web disconnect across refresh.
- At 390x844, verifies the connected identity and separate address/QR close
  controls. Adding wallet B invalidates Web wallet A; switching back to A
  invalidates B, clears grants and requires new explicit access. Full public
  identities match; screenshots are masked and reports retain only digests.
- Wallets are fresh and unfunded, phrases counted only, passwords in memory;
  no signature, broadcast or real funds. Both pairing runs end locked and
  disconnected. All five dedicated persistent profiles are retained and have
  zero matching Chrome processes after normal closure.
- Existing Playwright 1.62.1 / Windows Chromium 151.0.7922.34, Browser plugin
  unavailable; 1440x900 and 390x844. Identity, meaningful content, no framework
  overlay and the interactions above pass. Post-fix actual pairing has zero
  uncaught/unexpected console errors or external responses, 191 blocked reads,
  20 blocked writes, 151 expected network-error messages and 60 warnings
  (20 unused-preload, 40 unclassified). This is not error-free online-data QA.
- Pre/post hashes match 315 Web sources, 156 outputs, 109 extension sources,
  40 extension outputs and the complete ZIP. Builds used existing dependencies,
  scrubbed environment and empty env directories; repository `dist` and the
  four unrelated untracked entries were preserved. No fresh install/audit,
  Linux CI, physical toolbar, mobile-native, QR payload decoding or optical-ink
  certification is implied. The approval screenshot uses a 1440x900 viewport.

The expanded controlled-provider suite has **26 passing production-preview
cases**, including Escape while approval remains pending. Two existing tests
explicitly await `/src/app/wallet/WalletRuntimeProvider.tsx`, so running them
against production assets caused two harness-environment timeouts. Original
logs and error contexts remain. Both subsequently pass against an isolated
Vite development server with their original oracles/timeouts. This is 26 + 2
environment-appropriate passes, not an erased failure or one all-green run.

Evidence collection `artifacts/web-current-pairing-20260930/`:

- Post-fix `fix/run-09HiPS/acceptance.json`: SHA-256
  `64ea6ebf95095a7188569f800a856359df6400376939dbc968ba9e31ee8d64a9`.
- Real-extension focus `focus-CnTIZ3/acceptance.json`: SHA-256
  `9396ab1772718f570a6679af246eb0044935c787137dbe7671e56dccc77013c5`.
- Complete evidence ZIP (368 entries individually hash-verified), including
  both builds, baseline failures, helpers and images: SHA-256
  `85202c815f03f332ba69b4cc27fd84e89623222694b3c0b7dc6ee316f05420fe`.

**Next confirmed issue:** with only Burrito installed, the Web selector also
enables a row labelled Keplr. The extension intentionally supplies its named
compatibility provider as `window.keplr` only when that global is absent, while
Web's two desktop-provider checks accept any truthy `window.keplr`. The fresh
real-extension focus screenshots expose this misleading identity. Distinguish
that alias from an independently installed Keplr without removing compatibility
from the extension; verify genuine Keplr coexistence and both Web controllers.
The explicit Burrito-flow passes above do not close this separate identity gate.

Publication, live balances/transactions, complete screen-reader/contrast tests,
other wallets/devices, current CI and original release gates remain separate.

## Wallet privacy and exact-extension pairing — 2026-09-30

- Runtime source `d16855789e2d48b5527706467dfd2270a5e4f05c` clarifies the
  local privacy draft: encrypted storage versus local secret processing,
  extension theme storage, asset identifiers in price queries, pre-signature
  simulation, Finder navigation/cookie boundaries and deletion limits.
  Mobile removal deletes its protected wallet secret, not WebView storage;
  uninstalling is not promised to remove every secure-storage record. Saved
  phrase reveal is described only for the extension, not as a mobile feature.
- Added accessible names to the address-dialog and QR close buttons. No
  routes, brand/CSS, wallet storage keys, grants, transaction construction or
  signing behavior changed. No new dependency or production deployment.
- Local checks: 252 unit tests / 41 files, app typecheck, modified-file ESLint,
  and 28 desktop/mobile privacy/provider-fixture browser tests pass. The fixture
  tests are not installed-extension acceptance; the new negative-wording
  assertions were also rerun separately on desktop and mobile.
- Built production-mode assets into a new external evidence directory. The
  existing repository `dist`, four unrelated untracked entries, extension
  `.output` and frozen extension ZIP were preserved. Build warnings remain for
  the existing Rollup annotation, vm-browserify eval and large chunks. This was
  not a fresh dependency installation or independent security review.

### Actual installed extension + local static Web build

The flow is local `/privacy` -> explicit Burrito Wallet Extension -> Cancel or
approve the requested network -> reload/switch/lock/revoke/disconnect. Existing
Playwright 1.62.1/Chromium 151.0.7922.34 was used because Browser plugin is
unavailable. A fresh owned offline profile loaded the unchanged frozen
extension `84d11b0`, ZIP SHA-256
`9c6cc71ccceb3e0f455a7af5cd9c3f8815ec8a5b53c6a3a3dcf85063514f07a4`.
Normal UI created a new unfunded 24-word wallet; recovery words were counted,
not read or retained. Password was random and in-memory only.

Within this isolated browser only, `https://app.burrito.money/privacy` and the
build's static assets were fulfilled from the unmodified local output. All
other network requests were blocked; no wallet/provider, worker or chain data
was injected. This is **local consumer pairing, not the deployed WebApp**.
The local `index.html` SHA-256 is
`0ddef3e22ab3448b57de80372c4e2036f1f499f80c6270e8516a5bf722bbbbcd`.

The final run passes **211 assertions**, including **84 extension package/hash
checks** and **25 served-Web-file hash checks**, not 211 distinct features:

- First-connection cancellation grants nothing; closing the Web panel leaves
  the extension request open and keeps network switching disabled.
- Classic approval grants only `columbus-5`; refresh restores without a prompt.
  Switching to ungranted Terra does not open a prompt. Cancelling the explicit
  Terra request retains Classic; a later approval adds `phoenix-1`.
- Reviews disclose the requested chain and full matching public identity.
  Chain IDs are checked independently because both chains can share an address.
- Lock invalidates the Web account but preserves grants. Reload and unlock do
  not silently reconnect. Explicit reconnect reuses the existing grant without
  another review. Extension revocation and Web disconnect clear site access and
  remain disconnected after reload. No signing or broadcast occurred.
- Address and QR views show the correct identity and both named close controls
  operate independently. Privacy page identity, meaningful content, absence of
  framework overlay and mobile horizontal-overflow checks pass.

Console scope: zero uncaught page errors and zero unexpected console errors;
90 expected network-failure console messages, 18 warnings, 84 blocked reads,
14 blocked writes and zero external responses. Warning text was not classified.
This is not an error-free online-data run. No natural worker-idle, real chain
data, signature execution, native-mobile or physical-toolbar acceptance is
implied. Connection checks run at desktop size; privacy screenshots cover
1440x900 and 390x844. The approval image uses the browser context's 1440x900
viewport, not a measured native popup size.

Six masked screenshots were visually inspected. Some ordinary title-bearing
controls are masked along with public account text; those blocks are evidence
redaction, not UI defects. The mobile services image shows the section heading
and preceding content, not every newly added paragraph. DOM assertions cover
the complete wording. All three owned contexts closed and profiles are retained.

The first two runs are retained as **helper failures**, not product failures or
complete passes: the first used `Unlock wallet` instead of actual `Unlock`;
the second incorrectly expected another review for an existing grant. Their
partial 117/120 assertions are not added to the final 211. Original helpers and
failure reports are preserved beside the corrected helper.

Managed evidence: Web collection `artifacts/privacy-web-20260930/`, final
`pairing-SvpE0w/acceptance.json`, SHA-256
`a4124561a452f288c2e361b96226ae277ea495b4544700bcc5cb88ef4bb6f347`.
The helpers, three attempt reports, six final images, build index and Vite
manifest are retained. This result does not supersede the separate live-site
observation: deployed `/assets/index-CtXY4JAH.js` lacked the explicit connector
and showed the August 6 policy. Production publication and owner confirmation
of actual recipient practices remain separate gates, as do current-commit CI,
other DApp consumers, mobile-device/authentication and independent review.

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

## Wallet Reliability And Runtime Performance

- Replaced the full Cosmos Kit React package with `@cosmos-kit/react-lite` while preserving the existing Keplr desktop and mobile connectors.
- Deferred the signing client and transaction protobuf runtime until a transaction client is requested.
- Serialized broadcasts per chain and wallet address so two actions cannot race the same account sequence.
- Re-checks the signer address immediately before wallet approval and stops safely if the active wallet account changed.
- Added transaction duration, release, chain ID, online state, and page visibility to copied diagnostics; remote diagnostics continue to omit wallet addresses and raw signatures.
- Added desktop fallback transaction diagnostics so desktop and mobile failures follow the same classification path.
- Disabled background-tab query intervals and retained reconnect refreshes.
- Added browser-native offscreen rendering containment to the Market, Stake, and Governance long lists.
- Added raw, gzip, wallet-runtime dependency-chain, and signing-client reachability checks to the bundle budget.
- The optimized build keeps initial JavaScript at about 110 KiB and the wallet runtime static dependency chain below 1 MiB gzip.

## Extension Integration Reliability — 2026-09-08

- Integrated the current main-branch theme, asset-logo fallback, and CW20 gas-fallback fixes into the wallet integration branch without reverting the existing extension connector.
- Updated `burritoExtensionWallet.ts` to accept the extension's optional boolean `messageSigning` capability. The previous exact-key check rejected the actual extension response even though older test fixtures passed.
- Added extension session invalidation for lock, account changes, and revoked site access. Cached signers and late connection/signature responses cannot survive a disconnected or replaced session; a fresh user connection is required.
- Updated both `WalletBoot.tsx` and `WalletProvider.tsx` so the rendered account and stored auto-connect state follow extension invalidation events, with balanced React event-listener cleanup.
- Added connection-attempt ownership in both providers: late failures and slow disconnects cannot replace newer sessions, and an invalidated lazy adapter load cannot start a new wallet approval.
- Added adapter and desktop/mobile browser regressions for invalidation, explicit reconnection, and refresh without automatic reconnection. Browser fixtures and real compiled MV3 integration were both used, since fixtures alone had missed capability drift.
- Preserved the public routes, storage key names, transaction message construction, community/platform fee policy, brand assets, and typography.
- Validation artifacts and the production build were written outside the repository. Tracked `dist` deployment artifacts are not included in this source change.
- No store upload, real-wallet signing, transaction broadcast, production deployment, or production wallet-data changes were performed.
- Checks include 160 unit tests, TypeScript, ESLint, the bundle budget, six desktop/mobile session-race checks, and real compiled MV3-to-WebApp connection/lock/unlock/revocation. One full-suite Keplr Mobile handoff timed out; three targeted repeats on both the updated and isolated original provider code passed, so that intermittent result remains recorded rather than hidden by a relaxed assertion.

## Shared brand geometry (2026-09-08)

- Replaced the private BrandLogo rendering with @burritolabs/ui; the current brand contract is v0.3.1 pinned to 39e3914427310ab1c8412620b58b8512550cc165.
- All primary brand rows now use a 24px mark at 16px top/leading insets in a 56px row, with platform safe-area padding applied first. The shared bundled Montserrat font uses 20px type, -1px tracking for the Burrito word and product suffix, and the shared optical baseline correction.
- At widths up to 420px, network and wallet controls use a second row to preserve the full wordmark and readable buttons. Menu branding retains the same first-row geometry.
- The production release is isolated from source 6e2f6f817b7d; unrelated wallet integration branch changes are excluded. Navigation, signing, balances, quotes, and transaction behavior are unchanged.
- Validation: lint, TypeScript and production build; rendered geometry at 1440/768/390/320; mobile menu open, brand return-home and close checks.
