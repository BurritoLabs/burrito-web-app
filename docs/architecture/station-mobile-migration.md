# Station Mobile Migration Plan

Last updated: 2026-08-01

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

### Phase 0 - Provenance and boundaries

Status: completed in the Web repository documentation.

- Pin Station upstream commits.
- Record license and trademark boundaries.
- Define Web, Mobile, Extension, backend, and shared-contract responsibilities.
- Establish the migration matrix and acceptance gates.

### Phase 1 - Mobile repository and baseline spike

Status: not started.

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

Status: Windows preparation completed; native import and cross-platform tests
pending.

- Snapshot `columbus-5` and `phoenix-1` identities from current Burrito behavior.
- Add address, denom, fee, memo, message, and readable-preview fixtures.
- Add negative tests for cross-chain address/session/cache confusion.
- Do not refactor production Web transaction builders during this phase.

The preparatory registry, schema, and public fixtures live under
`specs/wallet/` and are checked by `npm run check:wallet-specs`. Completion of
this phase still requires importing them into the separate mobile repository
and proving equivalent iOS and Android tests.

### Phase 3 - Local vault and account lifecycle

Status: not started.

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

Status: not started.

- LUNC/LUNA account selection with explicit `chainId`.
- Native asset balances and receive QR.
- Current endpoint fallback and freshness handling.
- Honest loading, unavailable, empty, and partial-data states.

### Phase 5 - Send and readable signing

Status: not started.

- Prepare, simulate, review, sign, broadcast, and confirm a native transfer.
- Verify the active chain/account immediately before signing.
- Show recipient, gross/net amount where tax applies, fee, memo, and explorer
  link.
- Compare message bytes or canonical message fixtures against approved Burrito
  behavior.

### Phase 6 - Keplr connection

Status: not started.

- Add Keplr as an external signer, separate from a Burrito-created account.
- Implement deep-link, session restoration, rejection, expiry, account change,
  chain change, and return-to-app UX.
- Never import or request the Keplr recovery phrase.

### Phase 7 - TestFlight MVP

Status: not started.

- Create/import/backup/recover.
- Keplr external connection.
- LUNC/LUNA receive and native send.
- Locking, biometric access, destructive wallet deletion confirmation.
- Real-device testing, privacy disclosure, support links, and App Review notes.

Stake, Governance, Swap, Launchpad, contract tools, Ledger, and acting as a
WalletConnect wallet for third-party dApps remain outside the first custody MVP.

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
