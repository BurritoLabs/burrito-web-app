import { sha256 } from "@cosmjs/crypto"
import { toBase64, toHex } from "@cosmjs/encoding"
import { SignDoc, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  connectBurritoNativeWallet,
  disconnectBurritoNativeWallet,
  getBurritoNativeOfflineSigner,
  isBurritoNativeWalletAvailable
} from "../src/app/wallet/burritoNativeWallet"

const account = "terra1amdttz2937a3dytmxmkany53pp6ma6dy4vsllv"
const publicKey = "Aqy0vCZ9t3dGFL9gEcWZKbAGwlVDhqMJC6/ws/xBjsBE"

const capabilities = {
  platform: "ios",
  protocolVersion: 1,
  capabilities: {
    localWallet: true,
    transactionSigning: true,
    supportedDirectSignTypeUrls: ["/cosmos.bank.v1beta1.MsgSend"]
  }
}

const walletOpenResult = {
  source: "burrito",
  accounts: [
    {
      source: "burrito",
      chainId: "columbus-5",
      address: account,
      algorithm: "secp256k1",
      publicKey
    }
  ]
}

afterEach(async () => {
  await disconnectBurritoNativeWallet()
  vi.unstubAllGlobals()
})

describe("Burrito native direct signer", () => {
  it("validates the public identity and returns a native-approved signature", async () => {
    const signDoc = SignDoc.fromPartial({
      chainId: "columbus-5",
      accountNumber: 42n,
      bodyBytes: Uint8Array.from([10, 20, 30]),
      authInfoBytes: Uint8Array.from([40, 50])
    })
    const rawSignature = Uint8Array.from({ length: 64 }, (_, index) => index)
    const txBytes = TxRaw.encode({
      bodyBytes: signDoc.bodyBytes,
      authInfoBytes: signDoc.authInfoBytes,
      signatures: [rawSignature]
    }).finish()
    const request = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === "bridge.getCapabilities") return capabilities
      if (method === "wallet.open") return walletOpenResult
      if (method === "wallet.signDirect") {
        expect(params).toEqual({
          version: 1,
          chainId: "columbus-5",
          account,
          accountNumber: "42",
          bodyBytes: toBase64(signDoc.bodyBytes),
          authInfoBytes: toBase64(signDoc.authInfoBytes)
        })
        return {
          chainId: "columbus-5",
          account,
          sequence: "7",
          txRawBytes: toBase64(txBytes),
          txHash: toHex(sha256(txBytes)).toUpperCase()
        }
      }
      throw new Error(`Unexpected method: ${method}`)
    })
    vi.stubGlobal("window", {
      BurritoNative: { version: 1, request }
    })

    expect(isBurritoNativeWalletAvailable()).toBe(true)
    await expect(connectBurritoNativeWallet("columbus-5")).resolves.toEqual({
      address: account,
      name: "Burrito Wallet"
    })
    const signer = getBurritoNativeOfflineSigner("columbus-5")
    await expect(signer.getAccounts()).resolves.toEqual([
      {
        address: account,
        algo: "secp256k1",
        pubkey: expect.any(Uint8Array)
      }
    ])
    const response = await signer.signDirect(account, signDoc)
    expect(response.signed).toBe(signDoc)
    expect(response.signature.pub_key).toEqual({
      type: "tendermint/PubKeySecp256k1",
      value: publicKey
    })
    expect(response.signature.signature).toBe(toBase64(rawSignature))
  })

  it("rejects native responses that sign different transaction bytes", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "bridge.getCapabilities") return capabilities
      if (method === "wallet.open") return walletOpenResult
      if (method === "wallet.signDirect") {
        const txBytes = TxRaw.encode({
          bodyBytes: Uint8Array.from([99]),
          authInfoBytes: Uint8Array.from([2]),
          signatures: [new Uint8Array(64)]
        }).finish()
        return {
          chainId: "columbus-5",
          account,
          sequence: "0",
          txRawBytes: toBase64(txBytes),
          txHash: toHex(sha256(txBytes)).toUpperCase()
        }
      }
      throw new Error(`Unexpected method: ${method}`)
    })
    vi.stubGlobal("window", {
      BurritoNative: { version: 1, request }
    })

    await connectBurritoNativeWallet("columbus-5")
    const signer = getBurritoNativeOfflineSigner("columbus-5")
    await expect(
      signer.signDirect(
        account,
        SignDoc.fromPartial({
          chainId: "columbus-5",
          bodyBytes: Uint8Array.from([1]),
          authInfoBytes: Uint8Array.from([2])
        })
      )
    ).rejects.toThrow("signature does not match the request")
  })

  it("rejects a public key that does not derive the returned address", async () => {
    vi.stubGlobal("window", {
      BurritoNative: {
        version: 1,
        request: async (method: string) =>
          method === "bridge.getCapabilities"
            ? capabilities
            : {
                ...walletOpenResult,
                accounts: [
                  {
                    ...walletOpenResult.accounts[0],
                    address: "terra1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq486l9a"
                  }
                ]
              }
      }
    })

    await expect(connectBurritoNativeWallet("columbus-5")).rejects.toThrow(
      "public key does not match"
    )
  })
})
