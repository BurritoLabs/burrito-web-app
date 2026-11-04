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
  connectBurritoExtensionWallet,
  disconnectBurritoExtensionWallet,
  getBurritoExtensionConnector,
  getBurritoExtensionOfflineSigner,
  isBurritoExtensionWalletAvailable
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
          transactionSigning
        }
      }
      if (method === "wallet.connect") {
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
  vi.stubGlobal("window", { BurritoWallet: provider })
  return provider
}

afterEach(async () => {
  await disconnectBurritoExtensionWallet().catch(() => undefined)
  vi.unstubAllGlobals()
})

describe("Burrito Wallet Extension provider", () => {
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
