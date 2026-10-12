# Frontend Quality Gates

The normal frontend CI verifies the following before deployment:

- lint, unit tests, production dependency audit, and production build;
- initial and deferred JavaScript bundle budgets;
- all core routes on LUNC and LUNA;
- representative desktop and mobile routes in light and dark themes;
- serious and critical WCAG 2 A/AA findings;
- horizontal overflow and header-control overlap checks;
- wallet runtime deferral, mobile handoff, failure recovery, and long labels;
- extension consent versus passive restoration, pending-request ownership,
  network authorization, and stale connector callbacks.

The mobile wallet runtime remains outside the initial bundle. Opening the
connect flow preloads it only when Keplr Mobile is available, reducing the wait
after the user chooses that connector without taxing ordinary page loads.
One persistent controller owns the application wallet state. The lazy SDK is
a headless, chain-tagged bridge: loading it must not remount routes, dismiss an
open connection dialog, orphan an approval, or clear a desktop session on failure.
Queued mobile work is cancelled by a chain change or disconnect before it can
start a handoff. SDK readiness is not evidence of completed native pairing.

## Extension connection contract

For Burrito Wallet Extension, only an explicit Connect action may request
extension approval. Page reload, focus, and network changes may passively read
existing access, but must not silently request another grant. A cancelled
network upgrade must preserve the older network's grant. Locking or revoking
access invalidates the Web session.

Hidden focus/pageshow/visibility events must not initiate recovery or consume
its retry window. Once visible, a failed passive restore may retry once within
the existing cooldown policy; pending reads must not be duplicated. These gates
do not disable the distinct, user-approved Keplr restoration policy below.
Late initial pageshow/focus/visibility events are not a resume. Recovery requires
an observed hidden/blur departure, or a persisted BFCache pageshow; connector
discovery still refreshes on visible events. Cover both early and late startup
events, window blur/focus with a visible document, and BFCache without prior blur.

Genuine Keplr follows a distinct, accepted restoration policy: keep automatic
restoration enabled. Keplr's public account/key reads may open a Keplr-owned
unlock or account-permission prompt during restoration; the user accepts that
possible prompt. It is not Burrito's passive restoration behavior and does not
grant access without the user's approval. A declined prompt must not be
described as a successful connection or authorization to sign.

One pending request owns the connection state until it settles or is
invalidated. Repeated clicks must not supersede it; callbacks from an older
connector, network, or unmounted provider must not restore stale accounts.
The network control stays disabled while the extension request is pending,
and the connection panel explains that closing it does not cancel the
extension's approval window.

`tests/e2e/extension-connection-lifecycle.spec.ts` runs in the normal desktop
and mobile Playwright projects. Its controlled provider exercises UI state
and callback ordering; it is not evidence of installed-extension behavior.
`tests/burritoExtensionWallet.test.ts` separately checks adapter validation,
single-flight requests, passive reads, and invalidation at async boundaries.

A release candidate also needs an isolated installed-extension check against
the exact production Web build, with source revisions and bundle hashes
recorded. Use a disposable wallet, block external network requests, and do
not sign or broadcast transactions during the connection-only check.
Keep its evidence outside this repository. Neither the controlled-provider
tests nor a connection-only browser run replace native-wallet acceptance,
transaction review tests, full product-route regression, or release CI.

### Genuine Keplr lifecycle: restoration decision and open acceptance

The contract above is a requirement, not proof that every connector implements
it. On September 30, 2026, the exact Web runtime `258c6ce` paired with official
Keplr 0.13.52 and Burrito extension runtime `007bfa8` reproduced stale-account
behavior and automatic restoration prompts:

- Locking Keplr or revoking the site's permission in Connected Websites leaves
  the previously displayed Web account in place, including after Web focus.
- Reloading the Web page can open a Keplr unlock or account-access permission
  window. This prompt is an accepted consequence of the product decision to
  keep automatic Keplr restoration enabled. It still requires user approval;
  it is not a silent grant or evidence that locked or unauthorized signing can
  succeed.

Keplr's public `getKey` and `getKeysSettled` also perform interactive unlock and
permission checks in this version. Merely omitting `enable` does not make them
passive. Its account-change event is not a lock/unlock or permission-revocation
notification. Do not use internal extension messages, EVM account permissions,
or fabricated provider state to bypass or claim to test this Terra boundary.
See Keplr's [connection API](https://docs.keplr.app/api/guide/enable-connection)
and [account-change event](https://docs.keplr.app/api/guide/custom-event);
the fixed runtime package was also inspected for the specific behavior.

The product decision is to keep automatic Keplr restoration enabled and accept
that restoration may request a user-approved Keplr unlock or account-permission
prompt. The separate genuine-Keplr lock/revocation stale-account behavior remains
an open acceptance gate: the prior Web account must not remain presented as
connected after Keplr locks or site access is revoked. Do not mark that gate
passed without exact-runtime genuine-Keplr verification. Burrito's genuine
coexistence checks and controlled-provider tests do not close this Keplr-specific
gap. Treat Web local Disconnect and clearing Keplr's own site permissions as
separate operations. After re-granting in a second Keplr window, reload the
original popup before reading/clearing Connected Websites, then reload again to
verify the empty list; an already-open empty list alone is insufficient evidence
of persistent cleanup. Manual Web Disconnect must remain disconnected after
refresh; it must not be undone by automatic restoration.

Dialog checks must measure the actual painted surface (the Connect dialog
itself versus the token picker's inner card), while retaining all background,
foreground and viewport assertions. Theme accessibility checks wait for actual
finite CSS transitions and fonts before measuring contrast, not an arbitrary
delay. Offline acceptance must still allow versioned local static JSON/assets;
blocked live services and intentionally failed imports are recorded separately.

## Optional diagnostics

Production clients collect FCP, LCP, CLS, INP and TTFB only after an explicit
browser/WebView-local opt-in on `/privacy`. Default, missing, malformed or
unreadable consent is off. Turning sharing off stops new reports and pending
performance flushes; open tabs synchronize withdrawal. A failed preference
write stops sharing on the current page and clearly warns that the previous
saved choice can still apply after reload.

Runtime and transaction reporting also require consent and a configured
endpoint. Reports can contain paths, network/browser information and diagnostic
details; do not describe them as necessarily anonymous. The performance payload
excludes query strings and wallet addresses. Clearing local transaction
diagnostics requires confirmation and preserves wallets and unrelated settings.
It does not delete reports already sent.

The paired API candidate independently stores performance and error diagnostics
with 30-day table cleanup. This is a source-level retention scope, not proof
of deployment or a promise about proxy/PM2 logs, backups or external providers.
Operational retention and the published policy still require release checks.

Diagnostic-copy UI fixtures import normal package entry points through Vite;
never hardcode transient `node_modules/.vite/deps` cache paths. Keep cold-start,
copy-failure/retry and obsolete async-result checks alongside the product tests.

## Market asset request isolation

Native supply workers capture the query's chain ID and LCD before starting.
A network switch during a batch must not send later workers to the new chain
under the old query key. Cache and in-flight identity include both the chain
ID and full request URL. Native metadata shares only overlapping JSON reads;
failures remain retryable and existing metadata/precision validation is retained.

Supply caching stores raw public amounts, not converted display units. Each
consumer applies its current decimals; changing the visible asset set must not
repeat fresh successful reads. The raw cache expires after ten minutes and is
bounded to 256 entries; the surrounding query retains its existing refresh
schedule. It is not a live-supply guarantee. Invalid or failed responses stay
unavailable instead of becoming a synthetic zero, and do not discard successful
siblings. Preserve the six-worker limit and case-sensitive supply denoms.

`tests/nativeSupplies.test.ts` and `tests/nativeMetadataRequests.test.ts` cover
these boundaries without live endpoints. Production-build desktop/mobile Market
checks must additionally exercise search, sorting, DEX filters and pagination.
Controlled request counts are not measurements of production latency.

On narrow layouts the sort menu overlaps the wrapped DEX filter row. Its
stacking layer must remain above the DEX More control; test actual hit targets
and normal clicks in both themes, not visibility alone or forced clicks.
Keep the fixed application header and global content layers unchanged.

CW20 supply selection must match the existing Market Cap valuation branches.
Skip reads only when the card uses a native special case, already has a market
cap (including zero), falls below the existing price-confidence threshold, or
has no price. Zero price and the exact threshold remain eligible. This is not
a new price-validity or precision rule. Any eligible card for a shared contract
must retain that contract even if another card for it needs no supply.

For Market Cap sorting, selection starts from the full filtered card set, before
pagination. `tests/marketSupplySelection.test.ts` checks both global sort
directions and an eligible highest-value card beyond the first two pages. Do
not reduce global sorting to visible cards to meet a request-count target.

CW20 supply valuation requires explicit on-chain precision. Validate the
`token_info` response's unsigned decimal-string Uint128 supply and integer u8
decimals; never replace missing precision with registry/default-six values or
replace malformed supplies with zero. The generic CW20 response type is u8;
cw20-base's stricter instantiate limit is not a universal interface constraint.
See the [CW20 response definition](https://github.com/CosmWasm/cw-plus/blob/main/packages/cw20/src/query.rs).
Converted units remain approximate display numbers, not transaction amounts.

Only the version-2 per-contract supply cache is trusted for this path. Its key
and query identity include chain ID and configured LCD. Save raw supply and
explicit decimals, validate them again and recompute display units on read.
Expire at 15 minutes without refreshing timestamps on reads. Old version-1 and
aggregate entries may contain inferred precision and must not be migrated;
unrelated settings/wallet storage are not removed. Storage failures must not
prevent live reads. Keep four-worker concurrency, same-endpoint pending request
sharing, successful siblings and retryability of failed/invalid items.

`tests/cw20SupplyPrecision.test.ts` covers malformed responses, zero, non-six
precision, Uint128/u8 bounds, legacy cache rejection, raw cache validation,
expiration and storage/endpoint isolation. Compiled UI acceptance must also use
explicit healthy on-chain fixture decimals and a missing-decimals case; an
unchanged card-order hash when all CW20 responses fail is not value validation.

Market Cap and pair-detail FDV must not combine CW20 supply units with a price
normalized using different base-asset decimals. For a reserve-graph-derived list
price only, convert from the graph's fixed normalization basis to strict supply
precision before display or valuation. This is a unit conversion, not a second
price feed; intermediate-token precision cancels along the reserve path and
USD liquidity/confidence remains invariant. Never rescale an external bonding
spot price or a native anchor. Missing precision, invalid numbers and numerical
overflow/underflow remain unavailable; genuine zero values remain valid.

Display-only CW20 hydration must preserve the decimals used to build the card's
price and reserve amounts. Updating labels/icons must not replace those units
with newer token metadata without rebuilding the price. Otherwise the supply
guard can incorrectly match new supply precision against old price units.
`tests/marketAssetPresentation.test.ts` locks this boundary; compiled acceptance
must include different static-price and dynamic-token decimals, not just missing
precision. Pair details currently resolve metadata before calculating prices.

The list's card values retain their internal pricing basis: labels/icons never
rewrite it. Only `getCardDisplayPriceUsd` produces the displayed unit price;
market-cap multiplication uses the same strict-supply conversion. Visible token
precision reads reuse the existing supply cache and in-flight request sharing,
not a metadata scan of every graph intermediary. Global market-cap eligibility
and pre-pagination selection remain unchanged.

Pair details use the selected pair's validated supply precision for reserves,
graph normalization, DEX estimates and history query keys. Both CW20 sides must
be ready before price-ratio history, spot simulation or embedded trading starts.
Missing precision has an explicit retry and must never pass placeholder units
into trade controls or display fake reserves. Token tickers are not native-price
identities. Preserve our registry's labels, icons and provenance separately.

`tests/cw20Pricing.test.ts` checks single/multi-hop unit conversion, zero/invalid
values, intermediate-precision invariance and both-side readiness. Compiled QA
must check the actual eight-decimal price and cap (not merely `--`), selected
pair FDV, and missing-precision recovery. Native/IBC precision provenance and
upstream candle-unit guarantees still require their own acceptance.
