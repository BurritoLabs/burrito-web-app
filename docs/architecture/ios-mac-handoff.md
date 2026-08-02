# Burrito Mobile: Mac Handoff

Last updated: 2026-08-02

## What Is Ready Before the Mac Is Connected

The Web repository now contains versioned, machine-readable inputs for the
native wallet rather than native project files:

- `specs/wallet/chain-registry.v1.json` snapshots the current LUNC/LUNA chain,
  denom, gas-price, and endpoint behavior.
- `specs/wallet/transaction-intent.v1.schema.json` defines the unsigned,
  reviewable transaction boundary.
- `specs/wallet/fixtures/chain-isolation.v1.json` proves that chain identity is
  required even when address prefix and minimal denom are identical.
- `specs/wallet/fixtures/transaction-intents.v1.json` supplies public positive
  and rejection fixtures without wallet secrets.
- `npm run check:wallet-specs` detects drift between the Web chain source and
  the mobile snapshot and validates the safety invariants.

These files are preparation artifacts. They do not create, import, encrypt, or
sign with a wallet.

## Repository Decision

Create the native application in a separate repository:

```text
BurritoLabs/burrito-wallet-mobile
```

Do not place an Xcode project, Android Gradle project, Keychain code, or wallet
vault in `burrito-web-app`. The versioned JSON specifications may be copied into
the mobile repository with their source commit recorded.

Because Android is already a product requirement and Station Mobile is React
Native, the default baseline is a fresh, currently supported React Native
application with iOS and Android targets. Station Mobile is a pinned migration
reference, not the package/dependency baseline.

## Proposed Product Identifiers

These remain proposals until availability and the Apple Developer Team are
verified on the Mac:

| Item | Proposed value |
| --- | --- |
| Display name | `Burrito` |
| Repository | `BurritoLabs/burrito-wallet-mobile` |
| iOS bundle identifier | `ca.burritolabs.wallet` |
| URL scheme | `burrito-wallet` |
| WalletConnect display name | `Burrito` |

Changing them later affects signing, deep links, WalletConnect metadata,
Keychain access groups, App Store records, and Android application IDs, so the
Mac bootstrap must confirm them before creating production identifiers.

## First Mac Session

The first Mac session is an environment and blank-shell proof, not wallet
custody work.

1. Confirm the Mac is online in Tailscale and Codex can see the remote host.
2. Record `xcodebuild -version`, macOS version, Node/package-manager versions,
   Ruby/CocoaPods if used, Java, and Android SDK versions.
3. Confirm the Apple Developer Team is visible in Xcode without exporting or
   sharing Apple credentials.
4. Create the separate mobile repository and a fresh React Native application.
5. Add the complete applicable Station Mobile license/attribution material and
   a blank source-import register before copying any Station source.
6. Build the unchanged shell on an iOS Simulator.
7. Build the unchanged Android shell before claiming the shared baseline is
   healthy.
8. Import the wallet specifications and make their verifier part of mobile CI.

No Station vault, AES helper, WalletConnect v1 code, signing bridge, analytics,
or branding asset should be copied during this session.

## First Native Milestone

After the blank shell builds on both platforms, implement only:

- explicit `columbus-5` / `phoenix-1` selection;
- read-only account references and balance placeholders keyed by `chainId`;
- lock-screen and onboarding navigation with no real secret generation;
- transaction-intent decoding and readable preview using public fixtures;
- unit tests that reject a missing/changed chain or account.

Local wallet creation starts only after the vault design and public derivation
fixtures are reviewed. Keplr remains a separate external-signer flow and does
not share the local-wallet credential path.

## Evidence Required Before Saying iOS Works

- Current Xcode build log for the selected scheme.
- Simulator launch plus UI description or screenshots.
- Real iPhone install and launch.
- Signing under the intended Apple Developer Team.
- TestFlight upload and install for the release milestone.

Until those exist, the correct status is “Windows preparation complete; Mac
build pending.”
