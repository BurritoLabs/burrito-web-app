# Burrito Wallet Ecosystem Boundaries

Last updated: 2026-08-01

## Decision

Burrito will use Station as a migration skeleton while maintaining independent
product, security, chain, and transaction rules.

The current Web app remains a non-custodial dApp connector. Mobile and the
browser extension may hold locally created wallet material, but each platform
must implement an appropriate secure vault. Burrito backend services must
never receive seed phrases or private keys.

## Product Boundaries

| Product | Owns | Must not own |
| --- | --- | --- |
| Burrito Web | Market data, Swap, Stake, Governance, Launchpad, contract tools, external-wallet connection, readable transaction preparation | Seed creation, private-key storage, background signing |
| Burrito Mobile | Local wallet creation/import, device vault, biometric-gated signing, Keplr connection, receive/send, mobile wallet sessions | Server-side custody, silent signing, default cloud seed synchronization |
| Burrito Extension | Encrypted browser vault, per-origin permissions, dApp provider, explicit signature approval | Unencrypted secrets, automatic address disclosure to unapproved origins, unreviewed cross-frame access |
| Burrito Backend | Public chain data, indexed history, token metadata, market data, remote configuration, optional signed-nonce sessions | Seed phrases, private keys, wallet passwords, decrypted signing payloads |

## Identity Flows

### External Keplr account

Keplr remains the signing boundary. Burrito receives approved public accounts
and requests signatures through the supported connection protocol. Connecting
an address is not, by itself, a durable Burrito backend login. A backend login
must use a server nonce, wallet signature, server verification, expiration,
and replay protection.

### Burrito-created account

The account is generated, encrypted, and signed locally. The recovery phrase
is shown only in the recovery flow and must be excluded from logs, analytics,
crash metadata, clipboard history, screenshots where the platform permits, and
backend requests.

## Dependency Direction

```text
                    Burrito chain and transaction contracts
                  chain identity, messages, fee rules, previews
                                  |
              +-------------------+-------------------+
              |                   |                   |
         Burrito Web         Burrito Mobile     Burrito Extension
       external signer       native vault       browser vault
              |                   |                   |
              +----------- public Burrito APIs -------+
                                  |
                         Terra / Terra Classic
```

UI code, secure storage, biometrics, deep links, extension permissions, and
platform lifecycle code do not belong in the shared contract layer.

## Current Burrito Sources of Truth

The first shared contract should be documented from current behavior before
any extraction or refactor.

| Concern | Current source |
| --- | --- |
| LUNC/LUNA identities, endpoints, denoms, gas-price steps | `src/app/config/chainConfig.ts` |
| Keplr and Keplr Mobile connector metadata | `src/app/wallet/cosmosKit.ts` |
| Wallet session, signer acquisition, retry and account-change handling | `src/app/wallet/WalletProvider.tsx` |
| Signing client and endpoint fallback | `src/app/wallet/signingClient.ts` |
| Connector-neutral wallet adapter boundary | `src/app/wallet/walletAdapters.ts` |
| Transaction error taxonomy and diagnostics | `src/app/tx/txDiagnostics.ts` |
| Transaction serialization guard | `src/app/tx/transactionQueue.ts` |

The existing transaction standardization plan remains authoritative. Cross-
platform work must not bypass its staged migration rules or silently change
production Web messages.

## Chain Isolation Invariant

An address prefix or minimal denom is not a chain identity. Terra Classic and
Terra both use the `terra` prefix and can use `uluna`.

Every account reference, balance cache, query key, transaction draft,
WalletConnect session, signing request, history record, and remote
configuration entry must include an explicit `chainId`.

The minimum account reference is:

```ts
type WalletAccountRef = {
  source: "burrito" | "keplr" | "ledger" | "watch-only"
  chainId: "columbus-5" | "phoenix-1"
  address: string
}
```

## Transaction Intent Invariant

All clients should converge on a versioned, serializable transaction intent.
It is a contract for comparison and readable previews, not a request for the
backend to sign.

```ts
type TransactionIntent = {
  version: 1
  chainId: "columbus-5" | "phoenix-1"
  account: string
  messages: Array<{ typeUrl: string; value: unknown }>
  fee?: { amount: Array<{ denom: string; amount: string }>; gas: string }
  memo: string
  origin: string
}
```

Before broadcast, the signing client must verify that the active account and
chain still match the reviewed intent. The user-facing confirmation must show
the effective recipient, assets, amounts, fee, memo, contract, and origin when
available.

## Security Invariants

- Never store or transmit plaintext wallet material outside the active local
  signing or recovery operation.
- iOS must use device-only Keychain protection and biometric/passcode gating;
  do not claim native Secure Enclave signing for Cosmos `secp256k1` keys.
- Android must use Android Keystore/StrongBox-backed protection where
  available.
- Extension secrets require authenticated encryption, a modern password KDF,
  explicit lock state, and cleared in-memory/session state on lock.
- No client signs a message that cannot be decoded into a readable review or
  explicitly identified as unsupported raw data.
- The backend may broadcast a signed transaction supplied by a client, but it
  must never be able to create the user's signature.

## Repository Boundary

Do not add Mobile native projects or Extension privileged code to this Vite
production repository. The intended layout is:

```text
BurritoLabs/burrito-web-app
BurritoLabs/burrito-wallet-mobile
BurritoLabs/burrito-wallet-extension
```

A shared package may be introduced only after its API and test vectors are
stable. Until then, use versioned specifications and fixture files to avoid
premature coupling.
