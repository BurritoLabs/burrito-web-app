import { encodeSecp256k1Pubkey, pubkeyToAddress } from "@cosmjs/amino"
import { sha256 } from "@cosmjs/crypto"
import { fromBase64, toBase64, toHex } from "@cosmjs/encoding"
import {
  AuthInfo,
  TxBody,
  TxRaw,
  type SignDoc
} from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  BURRITO_EXTENSION_ACCOUNTS_CHANGED_EVENT,
  connectBurritoExtensionWallet,
  disconnectBurritoExtensionWallet,
  getBurritoExtensionConnectionErrorMessage,
  getBurritoExtensionConnector,
  getBurritoExtensionOfflineSigner,
  isBurritoExtensionWalletAvailable,
  restoreBurritoExtensionWallet
} from "../src/app/wallet/burritoExtensionWallet"
import { getWalletConnectors } from "../src/app/wallet/walletAdapters"

const publicKey = Uint8Array.from([
  2,
  ...Array.from({ length: 32 }, (_, index) => index + 1)
])
const address = pubkeyToAddress(encodeSecp256k1Pubkey(publicKey), "terra")
const signatureBytes = Uint8Array.from(
  { length: 64 },
  (_, index) => index + 1
)
// These fixed bytes exercise the response contract, not cryptographic signing.
const otherAddress = pubkeyToAddress(
  encodeSecp256k1Pubkey(Uint8Array.from([3, ...publicKey.slice(1)])),
  "terra"
)

type MockSigningResponse = {
  txRawBytes: string
  txHash: string
  chainId: unknown
  account: unknown
  sequence: string
}

type ProviderOptions = {
  mutateBody?: boolean
  mutateHash?: boolean
  sequence?: string
  transactionSigning?: boolean
  mutateResponse?: (response: MockSigningResponse) => MockSigningResponse
}

const withTransactionBytes = (
  response: MockSigningResponse,
  bytes: Uint8Array
): MockSigningResponse => ({
  ...response,
  txRawBytes: toBase64(bytes),
  // Recompute the hash so a changed payload cannot fail on hash alone.
  txHash: toHex(sha256(bytes)).toUpperCase()
})

const withTransaction = (
  response: MockSigningResponse,
  change: (transaction: TxRaw) => void
) => {
  const transaction = TxRaw.decode(fromBase64(response.txRawBytes))
  change(transaction)
  return withTransactionBytes(response, TxRaw.encode(transaction).finish())
}

const createSignDoc = (chainId = "columbus-5"): SignDoc => ({
  bodyBytes: TxBody.encode(
    TxBody.fromPartial({ memo: "Burrito extension test" })
  ).finish(),
  authInfoBytes: AuthInfo.encode(
    AuthInfo.fromPartial({ signerInfos: [{ sequence: 7n }] })
  ).finish(),
  chainId,
  accountNumber: 42n
})

const installProvider = ({
  mutateBody = false,
  mutateHash = false,
  sequence = "7",
  transactionSigning = true,
  mutateResponse
}: ProviderOptions = {}) => {
  const provider = {
    version: 1,
    request: vi.fn(async (method: string, params: Record<string, unknown> = {}) => {
      if (method === "wallet.getCapabilities") {
        return {
          protocolVersion: 1,
          platform: "chrome",
          supportedChainIds: ["columbus-5", "phoenix-1"],
          supportedDirectSignTypeUrls: ["/cosmos.bank.v1beta1.MsgSend"],
          transactionSigning,
          messageSigning: true
        }
      }
      if (method === "wallet.connect" || method === "wallet.getAccounts") {
        const chainId = String((params.chainIds as string[])[0])
        return {
          source: "burrito",
          accounts: [
            {
              source: "burrito",
              chainId,
              address,
              algorithm: "secp256k1",
              publicKey: toBase64(publicKey)
            }
          ]
        }
      }
      if (method === "wallet.disconnect") return { disconnected: true }
      if (method === "wallet.signDirect") {
        const bodyBytes = mutateBody
          ? Uint8Array.of(10, 1, 120)
          : Uint8Array.from(Buffer.from(String(params.bodyBytes), "base64"))
        const authInfoBytes = Uint8Array.from(
          Buffer.from(String(params.authInfoBytes), "base64")
        )
        const txRawBytes = TxRaw.encode(
          TxRaw.fromPartial({
            bodyBytes,
            authInfoBytes,
            signatures: [signatureBytes]
          })
        ).finish()
        const response: MockSigningResponse = {
          txRawBytes: toBase64(txRawBytes),
          txHash: mutateHash
            ? "A".repeat(64)
            : toHex(sha256(txRawBytes)).toUpperCase(),
          chainId: params.chainId,
          account: params.account,
          sequence
        }
        return mutateResponse ? mutateResponse(response) : response
      }
      throw new Error(`Unexpected extension method: ${method}`)
    })
  }
  vi.stubGlobal("window", Object.assign(new EventTarget(), { BurritoWallet: provider }))
  return provider
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

afterEach(async () => {
  await disconnectBurritoExtensionWallet().catch(() => undefined)
  vi.unstubAllGlobals()
})

describe("Burrito Wallet Extension provider", () => {
  for (const method of ["wallet.connect", "wallet.getAccounts"] as const) {
    it(`does not commit ${method} after invalidation at the final async boundary`, async () => {
      const provider = installProvider()
      const original = provider.request.getMockImplementation()!
      provider.request.mockImplementation(async (nextMethod, params) => {
        const response = await original(nextMethod, params)
        if (nextMethod === method && response && "accounts" in response) {
          const account = response.accounts[0]
          const publicKey = account.publicKey
          Object.defineProperty(account, "publicKey", {
            get: () => {
              // Run after the inner reader's synchronous validation but before
              // its caller commits the resolved account in the next microtask.
              queueMicrotask(() => window.dispatchEvent(
                new Event(BURRITO_EXTENSION_ACCOUNTS_CHANGED_EVENT)
              ))
              return publicKey
            }
          })
        }
        return response
      })
      const read = method === "wallet.connect"
        ? connectBurritoExtensionWallet
        : restoreBurritoExtensionWallet
      await expect(read("columbus-5")).rejects.toThrow("connection changed")
      expect(() => getBurritoExtensionOfflineSigner("columbus-5")).toThrow("Reconnect")
    })
  }

  it("accepts the original capability response without optional message signing", async () => {
    const provider = installProvider()
    const original = provider.request.getMockImplementation()!
    provider.request.mockImplementation(async (method, params) => {
      const result = await original(method, params)
      if (method === "wallet.getCapabilities") {
        const legacy = { ...result } as Record<string, unknown>
        delete legacy.messageSigning
        return legacy as typeof result
      }
      return result
    })
    await expect(connectBurritoExtensionWallet("columbus-5")).resolves.toMatchObject({ address })
  })

  it("rejects malformed optional message signing capabilities", async () => {
    const provider = installProvider()
    const original = provider.request.getMockImplementation()!
    provider.request.mockImplementation(async (method, params) => {
      const result = await original(method, params)
      return method === "wallet.getCapabilities"
        ? { ...result, messageSigning: "true" } as unknown as typeof result
        : result
    })
    await expect(connectBurritoExtensionWallet("columbus-5")).rejects.toThrow("protocol is incompatible")
  })

  it("restores an existing grant without opening an implicit connection approval", async () => {
    const provider = installProvider()

    await expect(
      restoreBurritoExtensionWallet("phoenix-1")
    ).resolves.toEqual({ address, name: "Burrito Wallet" })
    expect(provider.request.mock.calls).toEqual([
      ["wallet.getCapabilities", {}],
      ["wallet.getAccounts", { chainIds: ["phoenix-1"] }]
    ])
    expect(
      provider.request.mock.calls.some(([method]) => method === "wallet.connect")
    ).toBe(false)
    expect(
      provider.request.mock.calls.some(([method]) => method === "wallet.disconnect")
    ).toBe(false)
  })

  it("applies the same exact-chain account validation to passive restore", async () => {
    const provider = installProvider()
    const original = provider.request.getMockImplementation()!
    provider.request.mockImplementation(async (method, params) => {
      if (method !== "wallet.getAccounts") return original(method, params)
      return {
        source: "burrito",
        accounts: [{
          source: "burrito",
          chainId: "columbus-5",
          address,
          algorithm: "secp256k1",
          publicKey: toBase64(publicKey)
        }]
      }
    })

    await expect(
      restoreBurritoExtensionWallet("phoenix-1")
    ).rejects.toThrow("account is invalid")
  })

  it("discards a passive restore result returned after session invalidation", async () => {
    const provider = installProvider()
    const original = provider.request.getMockImplementation()!
    const held = deferred<unknown>()
    let response: unknown
    provider.request.mockImplementation((method, params) => {
      if (method !== "wallet.getAccounts") return original(method, params)
      response = original(method, params)
      return held.promise
    })

    const restoring = restoreBurritoExtensionWallet("columbus-5")
    await vi.waitFor(() => expect(response).toBeDefined())
    window.dispatchEvent(new Event(BURRITO_EXTENSION_ACCOUNTS_CHANGED_EVENT))
    held.resolve(await response)
    await expect(restoring).rejects.toThrow("connection changed")
    expect(() => getBurritoExtensionOfflineSigner("columbus-5")).toThrow(
      "Reconnect"
    )
  })

  it("keeps one explicit connection pending while allowing passive restore", async () => {
    const provider = installProvider()
    const original = provider.request.getMockImplementation()!
    const held = deferred<unknown>()
    let response: unknown
    let connectCalls = 0
    provider.request.mockImplementation((method, params) => {
      if (method !== "wallet.connect" || connectCalls++ > 0) {
        return original(method, params)
      }
      response = original(method, params)
      return held.promise
    })

    const first = connectBurritoExtensionWallet("columbus-5")
    await vi.waitFor(() => expect(response).toBeDefined())
    const busy = await connectBurritoExtensionWallet("phoenix-1").catch(
      (error: unknown) => error
    )
    expect(busy).toMatchObject({ code: "BUSY" })
    await expect(
      restoreBurritoExtensionWallet("columbus-5")
    ).resolves.toEqual({ address, name: "Burrito Wallet" })
    held.resolve(await response)
    await expect(first).resolves.toEqual({ address, name: "Burrito Wallet" })
    await expect(
      connectBurritoExtensionWallet("phoenix-1")
    ).resolves.toEqual({ address, name: "Burrito Wallet" })
    expect(
      provider.request.mock.calls.filter(([method]) => method === "wallet.connect")
    ).toHaveLength(2)
  })

  it("does not let a late passive restore overwrite an explicit connection", async () => {
    const provider = installProvider()
    const original = provider.request.getMockImplementation()!
    const held = deferred<unknown>()
    let passiveResponse: unknown
    provider.request.mockImplementation((method, params) => {
      if (method !== "wallet.getAccounts") return original(method, params)
      passiveResponse = original(method, params)
      return held.promise
    })

    const connecting = connectBurritoExtensionWallet("columbus-5")
    const restoring = restoreBurritoExtensionWallet("phoenix-1")
    await vi.waitFor(() => expect(passiveResponse).toBeDefined())
    await expect(connecting).resolves.toEqual({
      address,
      name: "Burrito Wallet"
    })
    held.resolve(await passiveResponse)
    await expect(restoring).rejects.toThrow("connection changed")
    await expect(
      getBurritoExtensionOfflineSigner("columbus-5").getAccounts()
    ).resolves.toHaveLength(1)
    expect(() => getBurritoExtensionOfflineSigner("phoenix-1")).toThrow(
      "Reconnect"
    )
  })

  it("preserves provider rejection codes and releases the explicit guard", async () => {
    const provider = installProvider()
    const original = provider.request.getMockImplementation()!
    const rejection = Object.assign(new Error("The user cancelled approval"), {
      code: "USER_REJECTED"
    })
    let rejected = false
    provider.request.mockImplementation((method, params) => {
      if (method === "wallet.connect" && !rejected) {
        rejected = true
        return Promise.reject(rejection)
      }
      return original(method, params)
    })

    await expect(
      connectBurritoExtensionWallet("columbus-5")
    ).rejects.toBe(rejection)
    expect((rejection as Error & { code: string }).code).toBe("USER_REJECTED")
    await expect(
      connectBurritoExtensionWallet("columbus-5")
    ).resolves.toEqual({ address, name: "Burrito Wallet" })
  })

  it("preserves passive provider rejection codes", async () => {
    const provider = installProvider()
    const original = provider.request.getMockImplementation()!
    const rejection = Object.assign(new Error("Unlock the extension"), {
      code: "WALLET_LOCKED"
    })
    provider.request.mockImplementation((method, params) =>
      method === "wallet.getAccounts"
        ? Promise.reject(rejection)
        : original(method, params)
    )

    await expect(
      restoreBurritoExtensionWallet("columbus-5")
    ).rejects.toBe(rejection)
  })

  it("maps typed connection failures to actionable messages", () => {
    expect(getBurritoExtensionConnectionErrorMessage({ code: "USER_REJECTED" }))
      .toContain("Choose Connect")
    expect(getBurritoExtensionConnectionErrorMessage({ code: "WALLET_LOCKED" }))
      .toContain("Unlock Burrito Wallet")
    expect(getBurritoExtensionConnectionErrorMessage({ code: "UNAUTHORIZED" }))
      .toContain("approve access")
    expect(getBurritoExtensionConnectionErrorMessage({ code: "BUSY" }))
      .toContain("Finish or cancel")
    expect(getBurritoExtensionConnectionErrorMessage(new Error("Provider failed")))
      .toBe("Provider failed")
  })

  it("invalidates cached signers when the extension locks or changes accounts", async () => {
    const provider = installProvider()
    await connectBurritoExtensionWallet("columbus-5")
    const signer = getBurritoExtensionOfflineSigner("columbus-5")
    window.dispatchEvent(new Event(BURRITO_EXTENSION_ACCOUNTS_CHANGED_EVENT))
    await expect(signer.getAccounts()).rejects.toThrow("signing context changed")
    await expect(signer.signDirect(address, createSignDoc())).rejects.toThrow("Reconnect")
    expect(provider.request.mock.calls.some(([method]) => method === "wallet.signDirect")).toBe(false)
  })

  it("rejects an old signer even after reconnecting the same account", async () => {
    installProvider()
    await connectBurritoExtensionWallet("columbus-5")
    const signer = getBurritoExtensionOfflineSigner("columbus-5")
    await connectBurritoExtensionWallet("columbus-5")
    await expect(signer.getAccounts()).rejects.toThrow("signing context changed")
    await expect(signer.signDirect(address, createSignDoc())).rejects.toThrow("signing context changed")
  })

  it("discards a signature returned after the session was revoked", async () => {
    const provider = installProvider()
    await connectBurritoExtensionWallet("columbus-5")
    const signer = getBurritoExtensionOfflineSigner("columbus-5")
    const original = provider.request.getMockImplementation()!
    let release!: (response: unknown) => void
    let response: unknown
    provider.request.mockImplementationOnce((method, params) => {
      response = original(method, params)
      return new Promise((resolve) => { release = resolve })
    })
    const pending = signer.signDirect(address, createSignDoc())
    const rejected = expect(pending).rejects.toThrow("signing context changed")
    window.dispatchEvent(new Event(BURRITO_EXTENSION_ACCOUNTS_CHANGED_EVENT))
    release(await response)
    await rejected
  })

  it("does not resurrect a connection cancelled while wallet approval is pending", async () => {
    const provider = installProvider()
    const original = provider.request.getMockImplementation()!
    let release!: (response: unknown) => void
    let response: unknown
    provider.request.mockImplementation((method, params) => {
      if (method !== "wallet.connect") return original(method, params)
      response = original(method, params)
      return new Promise((resolve) => { release = resolve })
    })
    const pending = connectBurritoExtensionWallet("columbus-5")
    const rejected = expect(pending).rejects.toThrow("connection changed")
    await vi.waitFor(() => expect(release).toBeTypeOf("function"))
    await disconnectBurritoExtensionWallet()
    await expect(
      connectBurritoExtensionWallet("phoenix-1")
    ).rejects.toMatchObject({ code: "BUSY" })
    release(await response)
    await rejected
    expect(() => getBurritoExtensionOfflineSigner("columbus-5")).toThrow("Reconnect")
    provider.request.mockImplementation(original)
    await expect(
      connectBurritoExtensionWallet("columbus-5")
    ).resolves.toEqual({ address, name: "Burrito Wallet" })
  })

  it("is available only when the versioned provider is injected", () => {
    vi.stubGlobal("window", {})
    expect(isBurritoExtensionWalletAvailable()).toBe(false)
    expect(getBurritoExtensionConnector()).toMatchObject({
      id: "burrito-extension",
      type: "extension",
      available: false
    })

    installProvider()
    expect(isBurritoExtensionWalletAvailable()).toBe(true)
    expect(getWalletConnectors()[1]).toMatchObject({
      id: "burrito-extension",
      available: true
    })
  })

  it.each(["columbus-5", "phoenix-1"])("connects %s and validates the synthetic transaction response", async (chainId) => {
    const provider = installProvider()
    await expect(
      connectBurritoExtensionWallet(chainId)
    ).resolves.toEqual({ address, name: "Burrito Wallet" })

    const signer = getBurritoExtensionOfflineSigner(chainId)
    await expect(signer.getAccounts()).resolves.toEqual([
      { address, algo: "secp256k1", pubkey: publicKey }
    ])
    const signDoc = createSignDoc(chainId)
    const response = await signer.signDirect(address, signDoc)
    expect(response.signed).toBe(signDoc)
    expect(response.signature.signature).toBe(toBase64(signatureBytes))
    expect(provider.request).toHaveBeenCalledWith("wallet.connect", {
      chainIds: [chainId]
    })
    expect(provider.request).toHaveBeenLastCalledWith("wallet.signDirect", {
      version: 1,
      chainId,
      account: address,
      accountNumber: "42",
      bodyBytes: toBase64(signDoc.bodyBytes),
      authInfoBytes: toBase64(signDoc.authInfoBytes)
    })
  })

  describe.each(["columbus-5", "phoenix-1"])("%s response contract", (chainId) => {
    const otherChainId = chainId === "columbus-5" ? "phoenix-1" : "columbus-5"
    const invalidResponse = "Burrito Wallet Extension signature response is invalid"
    const mismatchedResponse = "Burrito Wallet Extension signature does not match the request"
    const cases: Array<{
      label: string
      mutate: (response: MockSigningResponse) => MockSigningResponse
      error: string
    }> = [
      {
        label: "the other supported chain",
        mutate: (response) => ({ ...response, chainId: otherChainId }),
        error: invalidResponse
      },
      {
        label: "a different account",
        mutate: (response) => ({ ...response, account: otherAddress }),
        error: invalidResponse
      },
      {
        label: "a non-canonical sequence",
        mutate: (response) => ({ ...response, sequence: "07" }),
        error: invalidResponse
      },
      {
        label: "an unexpected response field",
        mutate: (response) => ({ ...response, unexpected: true }),
        error: invalidResponse
      },
      {
        label: "changed authInfo with the same sequence and a matching hash",
        mutate: (response) => withTransaction(response, (transaction) => {
          transaction.authInfoBytes = AuthInfo.encode(AuthInfo.fromPartial({
            signerInfos: [{ sequence: 7n }],
            fee: { amount: [{ denom: "uluna", amount: "1" }], gasLimit: 1n }
          })).finish()
        }),
        error: mismatchedResponse
      },
      {
        label: "non-canonical base64 pad bits encoding the same bytes",
        mutate: (response) => {
          const canonical = response.txRawBytes
          expect(canonical.endsWith("=")).toBe(true)
          const padding = canonical.endsWith("==") ? 2 : 1
          const lastIndex = canonical.length - padding - 1
          const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
          const changed = canonical.slice(0, lastIndex) +
            alphabet[alphabet.indexOf(canonical[lastIndex]) | 1] +
            canonical.slice(lastIndex + 1)
          expect(changed).not.toBe(canonical)
          expect(fromBase64(changed)).toEqual(fromBase64(canonical))
          return { ...response, txRawBytes: changed }
        },
        error: mismatchedResponse
      },
      {
        label: "a duplicate protobuf field encoding the same transaction",
        mutate: (response) => {
          const bytes = fromBase64(response.txRawBytes)
          const transaction = TxRaw.decode(bytes)
          expect(transaction.bodyBytes.length).toBeLessThan(128)
          const repeated = Uint8Array.from([
            ...bytes, 0x0a, transaction.bodyBytes.length, ...transaction.bodyBytes
          ])
          expect(TxRaw.decode(repeated)).toEqual(transaction)
          expect(TxRaw.encode(TxRaw.decode(repeated)).finish()).not.toEqual(repeated)
          return withTransactionBytes(response, repeated)
        },
        error: mismatchedResponse
      },
      {
        label: "truncated protobuf bytes with a matching hash",
        mutate: (response) => withTransactionBytes(response, Uint8Array.of(0x0a, 5, 1)),
        error: "Burrito Wallet Extension signed transaction is invalid"
      },
      {
        label: "no signature",
        mutate: (response) => withTransaction(response, (transaction) => {
          transaction.signatures = []
        }),
        error: mismatchedResponse
      },
      {
        label: "two signatures",
        mutate: (response) => withTransaction(response, (transaction) => {
          transaction.signatures = [signatureBytes, signatureBytes]
        }),
        error: mismatchedResponse
      },
      {
        label: "a 63-byte signature",
        mutate: (response) => withTransaction(response, (transaction) => {
          transaction.signatures = [signatureBytes.slice(0, 63)]
        }),
        error: mismatchedResponse
      },
      {
        label: "a 65-byte signature",
        mutate: (response) => withTransaction(response, (transaction) => {
          transaction.signatures = [Uint8Array.from([...signatureBytes, 65])]
        }),
        error: mismatchedResponse
      }
    ]

    it.each(cases)("rejects $label, then accepts the unchanged response", async ({ mutate, error }) => {
      let changeResponse = true
      const provider = installProvider({
        mutateResponse: (response) => changeResponse ? mutate(response) : response
      })
      await connectBurritoExtensionWallet(chainId)
      const signer = getBurritoExtensionOfflineSigner(chainId)
      const signDoc = createSignDoc(chainId)

      await expect(signer.signDirect(address, signDoc)).rejects.toThrow(error)
      expect(provider.request.mock.calls.filter(([method]) => method === "wallet.signDirect"))
        .toHaveLength(1)

      // Positive control: a valid response in the same session must still pass.
      changeResponse = false
      const response = await signer.signDirect(address, signDoc)
      expect(response.signed).toBe(signDoc)
      expect(response.signature.signature).toBe(toBase64(signatureBytes))
      expect(provider.request.mock.calls.map(([method]) => method)).toEqual([
        "wallet.getCapabilities", "wallet.connect", "wallet.signDirect", "wallet.signDirect"
      ])
    })

    it.each([0, 2])("rejects %i signerInfos even when returned bytes and hash match", async (count) => {
      const provider = installProvider()
      await connectBurritoExtensionWallet(chainId)
      const signer = getBurritoExtensionOfflineSigner(chainId)
      const signDoc = createSignDoc(chainId)
      signDoc.authInfoBytes = AuthInfo.encode(AuthInfo.fromPartial({
        signerInfos: Array.from({ length: count }, () => ({ sequence: 7n }))
      })).finish()

      await expect(signer.signDirect(address, signDoc)).rejects.toThrow(mismatchedResponse)
      const valid = createSignDoc(chainId)
      expect((await signer.signDirect(address, valid)).signed).toBe(valid)
      expect(provider.request.mock.calls.filter(([method]) => method === "wallet.signDirect"))
        .toHaveLength(2)
    })

    it.each(["signer address", "signDoc chain", "negative account number"])(
      "rejects an invalid %s before requesting a response",
      async (field) => {
        const provider = installProvider()
        await connectBurritoExtensionWallet(chainId)
        const signer = getBurritoExtensionOfflineSigner(chainId)
        const signDoc = createSignDoc(field === "signDoc chain" ? otherChainId : chainId)
        if (field === "negative account number") signDoc.accountNumber = -1n

        await expect(signer.signDirect(
          field === "signer address" ? otherAddress : address,
          signDoc
        )).rejects.toThrow("Burrito Wallet Extension signing context changed")
        expect(provider.request.mock.calls.some(([method]) => method === "wallet.signDirect"))
          .toBe(false)
        const valid = createSignDoc(chainId)
        expect((await signer.signDirect(address, valid)).signed).toBe(valid)
        expect(provider.request.mock.calls.filter(([method]) => method === "wallet.signDirect"))
          .toHaveLength(1)
      }
    )
  })

  it("rejects a response that changes the reviewed transaction bytes", async () => {
    installProvider({ mutateBody: true })
    await connectBurritoExtensionWallet("columbus-5")
    const signer = getBurritoExtensionOfflineSigner("columbus-5")

    await expect(signer.signDirect(address, createSignDoc())).rejects.toThrow(
      "signature does not match the request"
    )
  })

  it("rejects an invalid transaction hash or sequence", async () => {
    installProvider({ mutateHash: true })
    await connectBurritoExtensionWallet("columbus-5")
    await expect(
      getBurritoExtensionOfflineSigner("columbus-5").signDirect(
        address,
        createSignDoc()
      )
    ).rejects.toThrow("signature does not match the request")

    installProvider({ sequence: "8" })
    await connectBurritoExtensionWallet("columbus-5")
    await expect(
      getBurritoExtensionOfflineSigner("columbus-5").signDirect(
        address,
        createSignDoc()
      )
    ).rejects.toThrow("signature does not match the request")
  })

  it("requires an enabled compatible signing capability", async () => {
    installProvider({ transactionSigning: false })
    await expect(
      connectBurritoExtensionWallet("columbus-5")
    ).rejects.toThrow("protocol is incompatible")
  })

  it("revokes the origin session and clears the local account", async () => {
    const provider = installProvider()
    await connectBurritoExtensionWallet("columbus-5")
    await disconnectBurritoExtensionWallet()

    expect(provider.request).toHaveBeenCalledWith("wallet.disconnect", {})
    expect(() => getBurritoExtensionOfflineSigner("columbus-5")).toThrow(
      "Reconnect Burrito Wallet Extension"
    )
  })
})
