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
  connectBurritoNativeWallet,
  disconnectBurritoNativeWallet,
  getBurritoNativeConnector,
  getBurritoNativeOfflineSigner,
  invalidateBurritoNativeSession,
  isBurritoNativeWalletAvailable
} from "../src/app/wallet/burritoNativeWallet"
import { getWalletConnectors } from "../src/app/wallet/walletAdapters"

const publicKey = Uint8Array.from([2, ...Array.from({ length: 32 }, (_, i) => i + 1)])
const address = pubkeyToAddress(encodeSecp256k1Pubkey(publicKey), "terra")
const signatureBytes = Uint8Array.from({ length: 64 }, (_, index) => index + 1)

const nativeAccounts = ["columbus-5", "phoenix-1"].map((chainId) => ({
  source: "burrito",
  chainId,
  address,
  algorithm: "secp256k1",
  publicKey: toBase64(publicKey)
}))

const capabilities = {
  platform: "ios",
  protocolVersion: 1,
  capabilities: {
    biometricApproval: true,
    deepLinks: true,
    localWallet: true,
    qrScanner: false,
    supportedDirectSignTypeUrls: ["/cosmos.bank.v1beta1.MsgSend"],
    transactionSigning: true,
    walletConnect: false
  }
}

const createSignDoc = (chainId = "columbus-5"): SignDoc => ({
  bodyBytes: TxBody.encode(TxBody.fromPartial({ memo: "Burrito native test" })).finish(),
  authInfoBytes: AuthInfo.encode(
    AuthInfo.fromPartial({ signerInfos: [{ sequence: 7n }] })
  ).finish(),
  chainId,
  accountNumber: 42n
})

const installBridge = ({
  mutateBody = false,
  mutateHash = false,
  sequence = "7",
  accounts = nativeAccounts,
  deviceProtectionAvailable = true
} = {}) => {
  const bridge = {
    version: 1,
    request: vi.fn(async (method: string, params: Record<string, unknown> = {}) => {
      if (method === "bridge.getCapabilities") return capabilities
      if (method === "wallet.getStatus") {
        return { exists: true, deviceProtectionAvailable }
      }
      if (method === "wallet.open") {
        return { source: "burrito", accounts }
      }
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
      throw new Error(`Unexpected native method: ${method}`)
    })
  }
  vi.stubGlobal("window", { BurritoNative: bridge })
  return bridge
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

// Only public-account fixtures and fabricated responses are used; no native
// wallet, private key, signature generation, or network is involved.
const pauseNextRequest = (
  bridge: ReturnType<typeof installBridge>,
  pausedMethod: string
) => {
  const entered = deferred<void>()
  const release = deferred<void>()
  const originalRequest = bridge.request.getMockImplementation()!
  let paused = false
  bridge.request.mockImplementation(async (method, params) => {
    const response = await originalRequest(method, params)
    if (method === pausedMethod && !paused) {
      paused = true
      entered.resolve()
      await release.promise
    }
    return response
  })
  return { entered: entered.promise, release: () => release.resolve() }
}

afterEach(async () => {
  await disconnectBurritoNativeWallet()
  vi.unstubAllGlobals()
})

describe("Burrito native wallet bridge", () => {
  it("is available only when the versioned native bridge is injected", () => {
    vi.stubGlobal("window", {})
    expect(isBurritoNativeWalletAvailable()).toBe(false)
    expect(getBurritoNativeConnector()).toMatchObject({
      id: "burrito-native",
      label: "Burrito Wallet",
      available: false
    })

    installBridge()
    expect(isBurritoNativeWalletAvailable()).toBe(true)
    expect(getWalletConnectors()[0]).toMatchObject({
      id: "burrito-native",
      available: true
    })
  })

  it("connects both chain accounts and validates direct signatures", async () => {
    const bridge = installBridge()
    await expect(connectBurritoNativeWallet("columbus-5")).resolves.toEqual({
      address,
      name: "Burrito Wallet"
    })

    const classicSigner = getBurritoNativeOfflineSigner("columbus-5")
    await expect(classicSigner.getAccounts()).resolves.toEqual([
      { address, algo: "secp256k1", pubkey: publicKey }
    ])
    const classicSignDoc = createSignDoc()
    const response = await classicSigner.signDirect(address, classicSignDoc)
    expect(response.signed).toBe(classicSignDoc)
    expect(response.signature.signature).toBe(toBase64(signatureBytes))

    const phoenixSigner = getBurritoNativeOfflineSigner("phoenix-1")
    const phoenixSignDoc = createSignDoc("phoenix-1")
    await phoenixSigner.signDirect(address, phoenixSignDoc)
    expect(bridge.request).toHaveBeenLastCalledWith("wallet.signDirect", {
      version: 1,
      chainId: "phoenix-1",
      account: address,
      accountNumber: "42",
      bodyBytes: toBase64(phoenixSignDoc.bodyBytes),
      authInfoBytes: toBase64(phoenixSignDoc.authInfoBytes)
    })
    expect(bridge.request.mock.calls.map(([method]) => method)).toEqual([
      "bridge.getCapabilities",
      "wallet.getStatus",
      "wallet.open",
      "wallet.signDirect",
      "wallet.signDirect"
    ])
  })

  it("rejects a native response that changes transaction bytes", async () => {
    installBridge({ mutateBody: true })
    await connectBurritoNativeWallet("columbus-5")
    const signer = getBurritoNativeOfflineSigner("columbus-5")

    await expect(signer.signDirect(address, createSignDoc())).rejects.toThrow(
      "signature does not match the request"
    )
  })

  it("rejects a native response whose transaction hash does not match", async () => {
    installBridge({ mutateHash: true })
    await connectBurritoNativeWallet("columbus-5")
    const signer = getBurritoNativeOfflineSigner("columbus-5")

    await expect(signer.signDirect(address, createSignDoc())).rejects.toThrow(
      "signature does not match the request"
    )
  })

  it("rejects a sequence that does not match the signed auth info", async () => {
    installBridge({ sequence: "8" })
    await connectBurritoNativeWallet("columbus-5")
    const signer = getBurritoNativeOfflineSigner("columbus-5")

    await expect(signer.signDirect(address, createSignDoc())).rejects.toThrow(
      "signature does not match the request"
    )
  })

  it("rejects duplicate native chain accounts", async () => {
    installBridge({ accounts: [nativeAccounts[0], nativeAccounts[0]] })
    await expect(connectBurritoNativeWallet("columbus-5")).rejects.toThrow(
      "duplicate chain accounts"
    )
  })

  it("requires secure device-owner protection before opening the wallet", async () => {
    const bridge = installBridge({ deviceProtectionAvailable: false })
    await expect(connectBurritoNativeWallet("columbus-5")).rejects.toThrow(
      "device-owner authentication"
    )
    expect(bridge.request).not.toHaveBeenCalledWith("wallet.open", {})
  })

  it.each(["bridge.getCapabilities", "wallet.getStatus", "wallet.open"])(
    "does not resume a disconnected connection after a late %s response",
    async (method) => {
      const bridge = installBridge()
      const gate = pauseNextRequest(bridge, method)
      const connecting = connectBurritoNativeWallet("columbus-5")
      const rejected = expect(connecting).rejects.toThrow(/Reconnect Burrito Wallet/)
      await gate.entered
      const callsBeforeDisconnect = bridge.request.mock.calls.length
      await disconnectBurritoNativeWallet()
      gate.release()
      await rejected
      expect(bridge.request).toHaveBeenCalledTimes(callsBeforeDisconnect)
      expect(() => getBurritoNativeOfflineSigner("columbus-5")).toThrow(/Reconnect/)
    }
  )

  it("discards an older connect without invalidating the newer connection", async () => {
    const bridge = installBridge()
    const gate = pauseNextRequest(bridge, "wallet.open")
    const oldConnect = connectBurritoNativeWallet("columbus-5")
    const rejected = expect(oldConnect).rejects.toThrow(/Reconnect/)
    await gate.entered
    await connectBurritoNativeWallet("phoenix-1")
    const freshSigner = getBurritoNativeOfflineSigner("phoenix-1")
    gate.release()
    await rejected
    await expect(freshSigner.getAccounts()).resolves.toEqual([
      { address, algo: "secp256k1", pubkey: publicKey }
    ])
  })

  it.each([false, true])(
    "invalidates retained signers after disconnect (same-account reconnect: %s)",
    async (reconnect) => {
      const bridge = installBridge()
      await connectBurritoNativeWallet("columbus-5")
      const staleSigner = getBurritoNativeOfflineSigner("columbus-5")
      await disconnectBurritoNativeWallet()
      if (reconnect) await connectBurritoNativeWallet("columbus-5")
      await expect(staleSigner.getAccounts()).rejects.toThrow(/Reconnect/)
      await expect(staleSigner.signDirect(address, createSignDoc())).rejects.toThrow(/Reconnect/)
      expect(bridge.request).not.toHaveBeenCalledWith("wallet.signDirect", expect.anything())
      if (reconnect) {
        await expect(getBurritoNativeOfflineSigner("columbus-5").getAccounts())
          .resolves.toHaveLength(1)
      }
    }
  )

  it("discards a late fabricated signature response after same-account reconnect", async () => {
    const bridge = installBridge()
    await connectBurritoNativeWallet("columbus-5")
    const staleSigner = getBurritoNativeOfflineSigner("columbus-5")
    const gate = pauseNextRequest(bridge, "wallet.signDirect")
    const signing = staleSigner.signDirect(address, createSignDoc())
    const rejected = expect(signing).rejects.toThrow(/Reconnect/)
    await gate.entered
    await disconnectBurritoNativeWallet()
    await connectBurritoNativeWallet("columbus-5")
    gate.release()
    await rejected
    await expect(getBurritoNativeOfflineSigner("columbus-5").getAccounts())
      .resolves.toHaveLength(1)
  })

  it("does not reuse an old account when the next connection is rejected", async () => {
    const bridge = installBridge()
    await connectBurritoNativeWallet("columbus-5")
    const staleSigner = getBurritoNativeOfflineSigner("columbus-5")
    bridge.request.mockRejectedValueOnce(new Error("User cancelled"))
    await expect(connectBurritoNativeWallet("columbus-5")).rejects.toThrow("User cancelled")
    expect(() => getBurritoNativeOfflineSigner("columbus-5")).toThrow(/Reconnect/)
    await expect(staleSigner.getAccounts()).rejects.toThrow(/Reconnect/)
  })

  it("cancels pending requests synchronously on newer native hosts", async () => {
    const bridge = installBridge()
    const cancelPending = vi.fn()
    Object.assign(bridge, { cancelPending })
    await connectBurritoNativeWallet("columbus-5")
    const signer = getBurritoNativeOfflineSigner("columbus-5")
    cancelPending.mockClear()
    invalidateBurritoNativeSession()
    expect(cancelPending).toHaveBeenCalledTimes(1)
    await expect(signer.getAccounts()).rejects.toThrow(/Reconnect/)
  })

  it("still invalidates locally if the optional native cancellation fails", async () => {
    const bridge = installBridge()
    await connectBurritoNativeWallet("columbus-5")
    const signer = getBurritoNativeOfflineSigner("columbus-5")
    Object.assign(bridge, { cancelPending: () => { throw new Error("Bridge unavailable") } })
    expect(() => invalidateBurritoNativeSession()).not.toThrow()
    await expect(signer.getAccounts()).rejects.toThrow(/Reconnect/)
    expect(() => getBurritoNativeOfflineSigner("columbus-5")).toThrow(/Reconnect/)
  })
})
