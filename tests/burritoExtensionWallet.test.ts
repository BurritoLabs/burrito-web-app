import { encodeSecp256k1Pubkey, pubkeyToAddress } from "@cosmjs/amino"
import { sha256 } from "@cosmjs/crypto"
import { toBase64, toHex } from "@cosmjs/encoding"
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
  transactionSigning = true
} = {}) => {
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
        return {
          txRawBytes: toBase64(txRawBytes),
          txHash: mutateHash
            ? "A".repeat(64)
            : toHex(sha256(txRawBytes)).toUpperCase(),
          chainId: params.chainId,
          account: params.account,
          sequence
        }
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

  it("connects the explicit chain and validates the signed transaction", async () => {
    const provider = installProvider()
    await expect(
      connectBurritoExtensionWallet("columbus-5")
    ).resolves.toEqual({ address, name: "Burrito Wallet" })

    const signer = getBurritoExtensionOfflineSigner("columbus-5")
    await expect(signer.getAccounts()).resolves.toEqual([
      { address, algo: "secp256k1", pubkey: publicKey }
    ])
    const signDoc = createSignDoc()
    const response = await signer.signDirect(address, signDoc)
    expect(response.signed).toBe(signDoc)
    expect(response.signature.signature).toBe(toBase64(signatureBytes))
    expect(provider.request).toHaveBeenCalledWith("wallet.connect", {
      chainIds: ["columbus-5"]
    })
    expect(provider.request).toHaveBeenLastCalledWith("wallet.signDirect", {
      version: 1,
      chainId: "columbus-5",
      account: address,
      accountNumber: "42",
      bodyBytes: toBase64(signDoc.bodyBytes),
      authInfoBytes: toBase64(signDoc.authInfoBytes)
    })
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
