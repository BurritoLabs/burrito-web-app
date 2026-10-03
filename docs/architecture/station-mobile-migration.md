# Station Mobile Migration Plan

Last updated: 2026-09-30

## Goal

Use the Station Mobile product skeleton to accelerate an iOS-first Burrito
wallet while keeping Android viable from the same modern React Native codebase.
No legacy custody or signing implementation is accepted without replacement or
explicit security validation.

Pinned reference:
[`stationmoney/station-mobile@a06fc67c`](https://github.com/stationmoney/station-mobile/tree/a06fc67ccc2143a7799a17a13cec73156dfb9fb3)

## Baseline Finding

The pinned application provides valuable iOS, Android, React Native, wallet
onboarding, native signing bridge, Ledger, QR, staking, and WalletConnect
examples. Its runtime is not a safe current release baseline:

- React Native `0.67.3` and React `17.0.1`.
- TypeScript `4.1.5` and Node 14-era setup.
- `@terra-money/terra.js` `3.1.3`.
- WalletConnect v1 through `@walletconnect/client` `1.6.5`.
- Legacy camera, storage, crypto polyfill, navigation, Recoil, Apollo, and
  native dependency versions.
- iOS Keychain storage uses `kSecAttrAccessibleWhenUnlocked` rather than a
  device-only, biometric-gated policy.
- The legacy iOS AES helper uses CBC with a null IV and no authenticated
  encryption tag.

The correct strategy is a new supported React Native application with selected
Station flows migrated into it, not an in-place dependency upgrade of the old
application.

## Migration Matrix

| Station area | Decision | Burrito treatment |
| --- | --- | --- |
| Navigation and onboarding screen sequence | Adapt | Preserve useful flow concepts; rebuild using the supported navigation stack and Burrito design system |
| Create/recover/backup UX | Adapt | Retain the mental model; use a reviewed BIP-39 implementation and new secure vault |
| Asset, receive, send, staking and governance UI | Adapt | Rebind to Burrito LUNC/LUNA data and transaction contracts |
| QR scanning and deep-link UX | Adapt | Replace legacy camera and URL schemes; validate all payloads and origins |
| Ledger BLE interaction | Audit later | Keep out of the first custody milestone unless current supported libraries and devices pass testing |
| Native Terra signing bridge | Reference only | Compare derivation and signing fixtures; replace or isolate behind a reviewed interface |
| iOS Keychain and AES helpers | Replace | Device-only Keychain policy, biometric/passcode access control, authenticated encryption |
| Android Keystore helpers | Replace | Current Android Keystore/StrongBox-backed authenticated encryption |
| WalletConnect v1 | Remove | Use the current supported WalletConnect/Reown flow and Burrito deep links |
| Apollo/legacy Station endpoints | Remove | Use Burrito public APIs and current direct-chain fallback policy |
| Station network and fee configuration | Remove | Use Burrito chain contracts and versioned fixtures |
| Station transaction builders | Reference only | Current Burrito behavior wins; compare messages before adopting any implementation |
| Sentry and other telemetry | Remove by default | Reintroduce only with an explicit redaction and privacy review |
| Station/Terra names, logos and store art | Remove | Use Burrito-owned branding and product copy |

## Delivery Phases

The requirements below retain the original migration scope. Implementation,
scoped acceptance and outstanding release gates are separate: a source-level
feature or simulator result does not complete every requirement in its phase.
The evidence checkpoint is Mobile documentation revision `4025f50`, with
installed iOS runtime `2eeac81`; see the evidence index below. Later work must
use the Mobile repository's current release matrix rather than infer new
acceptance from these historical counts.

### Phase 0 - Provenance and boundaries

Status: documentation completed in the Web repository; this is provenance
preparation, not native runtime or distribution acceptance.

- Pin Station upstream commits.
- Record license and trademark boundaries.
- Define Web, Mobile, Extension, backend, and shared-contract responsibilities.
- Establish the migration matrix and acceptance gates.

### Phase 1 - Mobile repository and baseline spike

Implemented: the separate `BurritoLabs/burrito-wallet-mobile` repository has a
modern React Native shell with iOS/Android targets and recorded Station
reference boundaries; the shell is independently implemented, not a copied
Station native project.

Accepted: the documented `2eeac81` iOS Release simulator build and installed
artifact provenance. Earlier Android Debug evidence is recorded separately.
Pending: current-source Android build/runtime acceptance, final toolchain and
artifact provenance, and device/distribution gates.

- Create `BurritoLabs/burrito-wallet-mobile` as a separate repository.
- Preserve Station source history or an equivalent import record.
- Add the full applicable upstream license and attribution documents.
- Create a fresh supported React Native application with iOS and Android
  targets.
- Prove a blank Burrito shell builds on iOS and Android before migrating wallet
  code.
- Record the Xcode, Swift, CocoaPods/SPM, Android Gradle, Kotlin, Java, Node,
  React Native, and package-manager versions.

Windows can prepare and test JavaScript and Android work, but an actual macOS
host and Apple signing environment are required for iOS build and device proof.

### Phase 2 - Chain contract fixtures

Implemented: the versioned registry and intent/isolation fixtures now also
exist in the Mobile repository. Its `walletContracts` tests consume those
fixtures and check explicit chain identities and wallet-scoped keys.

Accepted: scoped JavaScript contract/regression evidence in the Mobile
release matrix. Pending: equivalent current-source iOS and Android runtime
evidence; JavaScript fixtures are not platform signing acceptance.

- Snapshot `columbus-5` and `phoenix-1` identities from current Burrito behavior.
- Add address, denom, fee, memo, message, and readable-preview fixtures.
- Add negative tests for cross-chain address/session/cache confusion.
- Do not refactor production Web transaction builders during this phase.

The Web registry, schema, and public fixtures live under `specs/wallet/` and
are checked by `npm run check:wallet-specs`. The Mobile fixture import and
consumer are linked in the evidence index. Completing the original phase
still requires equivalent iOS and Android tests, not merely that import.

### Phase 3 - Local vault and account lifecycle

Implemented: native create/import, backup confirmation, protected storage,
unlock and confirmed removal, with session invalidation and pre-save cleanup.

Accepted: earlier iOS simulator passes cover disposable protected create and
12/24-word import, cold/update persistence, Web account return and removal at
their documented revisions. The later `2eeac81` pass covers pre-save import
cleanup only; it does not repeat protected-storage acceptance.
Pending: hardware device-owner authentication, current Android acceptance,
private accessible word review and the remaining lifecycle requirements below.
This does not claim native credential-change or recovery-export acceptance.

- Create/import a wallet locally.
- Verify deterministic addresses against fixed fixtures.
- Encrypt, lock, unlock, change access credentials, export recovery material,
  and delete wallet data.
- Require biometric/passcode approval according to the platform policy.
- Verify logs, analytics, screenshots, crash reports, and clipboard paths do not
  expose wallet material.

No chain broadcast work starts until this phase passes a focused security
review.

### Phase 4 - Read-only wallet

Implemented in part: the native bridge supplies chain-specific public accounts
to the existing shared Web wallet UI. This is not a claim that a separate
native balances/receive-QR interface is complete.

Accepted: the documented iOS native-to-Web connection and full imported-account
identity checks. Pending: complete current-device read-only route acceptance,
including balances, receive QR, freshness and all unavailable/partial states.

- LUNC/LUNA account selection with explicit `chainId`.
- Native asset balances and receive QR.
- Current endpoint fallback and freshness handling.
- Honest loading, unavailable, empty, and partial-data states.

### Phase 5 - Send and readable signing

Implemented in part: native allowlisted transaction decoding, readable review,
canonical validation and signing code, alongside the Web transaction builders.

Accepted: scoped fixture and mocked cancellation/stale-callback regressions.
Pending: actual native transaction-approval acceptance, hardware authentication
and a separately authorized end-to-end signing/broadcast plan. No successful
transaction signing or chain execution is established by the iOS evidence
indexed here; the Phase 3 security-review prerequisite remains unchanged.

- Prepare, simulate, review, sign, broadcast, and confirm a native transfer.
- Verify the active chain/account immediately before signing.
- Show recipient, gross/net amount where tax applies, fee, memo, and explorer
  link.
- Compare message bytes or canonical message fixtures against approved Burrito
  behavior.

### Phase 6 - Keplr connection

Implemented in part: the shared Web connector and bounded native WalletConnect
v2 Keplr handoff policy, separate from the Burrito-created account path.

Accepted: source-level navigation-policy coverage only for this summary.
Pending: actual Keplr pairing and the full restoration, rejection, expiry,
account/network change and return-to-app sequence on current iOS/Android
candidates. Native Burrito account-return checks are not Keplr acceptance.

- Add Keplr as an external signer, separate from a Burrito-created account.
- Implement deep-link, session restoration, rejection, expiry, account change,
  chain change, and return-to-app UX.
- Never import or request the Keplr recovery phrase.

### Phase 7 - TestFlight MVP

Implemented in part: native wallet flows and draft store/privacy/reviewer
materials are prepared. Accepted: only the scoped local and simulator evidence
above. Pending: the complete MVP acceptance list below, final screenshots,
privacy/provider and owner decisions, real-device proof, release signing and
explicitly authorized TestFlight submission. No TestFlight acceptance or
publication approval is claimed.

- Create/import/backup/recover.
- Keplr external connection.
- LUNC/LUNA receive and native send.
- Locking, biometric access, destructive wallet deletion confirmation.
- Real-device testing, privacy disclosure, support links, and App Review notes.

Stake, Governance, Swap, Launchpad, contract tools, Ledger, and acting as a
WalletConnect wallet for third-party dApps remain outside the first custody MVP.

## Evidence Index — September 30 checkpoint

These links pin Mobile documentation/source revision
`4025f509983be12387d120042f145eb4255bce10`, not a new native build. Runtime and
test-only revisions inside each report must not be conflated. The Mobile
repository's `docs/app-store-release.md` is authoritative for later finalized
evidence and remaining gates; this Web plan does not declare newer work passed.

| Evidence | Established scope | Not established |
| --- | --- | --- |
| [Mobile release matrix](https://github.com/BurritoLabs/burrito-wallet-mobile/blob/4025f509983be12387d120042f145eb4255bce10/docs/app-store-release.md) | Current checkpoint and separate platform, privacy, CI and store gates | Final-source CI, complete native acceptance or distribution approval |
| [Imported contract fixtures and tests](https://github.com/BurritoLabs/burrito-wallet-mobile/blob/4025f509983be12387d120042f145eb4255bce10/__tests__/walletContracts.test.ts) | Mobile consumes versioned chain/intent/isolation fixtures and rejects malformed or unsupported contracts | Equivalent native iOS/Android signing/runtime acceptance |
| [Protected-create follow-up](https://github.com/BurritoLabs/burrito-wallet-mobile/blob/4025f509983be12387d120042f145eb4255bce10/docs/ios-protected-runtime-qa-20260930.md) | Earlier `64d2826`/`2796f9a` simulator create/protect, persistence, normal Web account return and Keep/Remove flows | Hardware Face ID/passcode challenge, transaction signing or current-binary repetition |
| [Protected import and update](https://github.com/BurritoLabs/burrito-wallet-mobile/blob/4025f509983be12387d120042f145eb4255bce10/docs/ios-import-runtime-qa-20260930.md) | 12/24-word import at `2796f9a`, update to `01f01df`, full Web-returned address equality and removal; exact flow revisions are in the report | Hardware authentication, actual transaction approval/signing or Android acceptance |
| [Pre-save import lifecycle](https://github.com/BurritoLabs/burrito-wallet-mobile/blob/4025f509983be12387d120042f145eb4255bce10/docs/ios-import-lifecycle-qa-20260930.md) | Installed runtime `2eeac81`: 44 native import/review background, foreground and cold-entry checks. Test-only `2cddb77`: selected Jest 326 tests / 29 suites on Windows and iMac, typecheck and zero-warning lint | A new save/protection/authentication action, repeated protected-wallet acceptance, full dependency audit or complete release acceptance |
| [Android historical runtime](https://github.com/BurritoLabs/burrito-wallet-mobile/blob/4025f509983be12387d120042f145eb4255bce10/docs/android-runtime-qa-20260912.md) | September 12 source-built x86_64 Debug empty-onboarding, text-size and background-clearing checks | Current-source Release runtime, TalkBack, tablet/landscape, hardware authentication or release-binary acceptance |

## Acceptance Gates

- No plaintext seed or private key in persistent storage, logs, analytics,
  clipboard history, or network captures.
- Deterministic address and signing fixtures pass on iOS and Android.
- `columbus-5` and `phoenix-1` state cannot share cache or session keys.
- Every signing action is initiated by an explicit user gesture and shows a
  readable transaction review.
- Account or chain changes between review and signing abort the operation.
- Upstream attribution and modification records ship with the source and store
  distribution where required.
- iOS release claims require a current Xcode build, simulator check, real-device
  evidence, and TestFlight evidence; source completion alone is insufficient.
