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

Only an explicit Connect action may request extension approval. Page reload,
focus, and network changes may read existing accounts, but must not silently
request another grant. A cancelled network upgrade must preserve the older
network's grant. Locking or revoking access invalidates the Web session.

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

Dialog checks must measure the actual painted surface (the Connect dialog
itself versus the token picker's inner card), while retaining all background,
foreground and viewport assertions. Theme accessibility checks wait for actual
finite CSS transitions and fonts before measuring contrast, not an arbitrary
delay. Offline acceptance must still allow versioned local static JSON/assets;
blocked live services and intentionally failed imports are recorded separately.

Production clients report FCP, LCP, CLS, INP, and TTFB to the Burrito API. The
report contains no wallet address or query string and is aggregated for a
30-day operational view.
