import {
  encodeSecp256k1Pubkey,
  encodeSecp256k1Signature,
  pubkeyToAddress
} from "@cosmjs/amino"
import { sha256 } from "@cosmjs/crypto"
import { fromBase64, toBase64, toHex } from "@cosmjs/encoding"
import type {
  AccountData,
  DirectSignResponse,
  OfflineDirectSigner
} from "@cosmjs/proto-signing"
import { AuthInfo, SignDoc, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import type { WalletAccount, WalletConnector } from "./WalletContext"

const EXTENSION_PROTOCOL_VERSION = 1
const SUPPORTED_CHAIN_IDS = ["columbus-5", "phoenix-1"] as const
const HASH = /^[A-F0-9]{64}$/
const UNSIGNED_INTEGER = /^(0|[1-9][0-9]*)$/

type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number]

type ExtensionProvider = {
  version: number
  request: (method: string, params?: Record<string, unknown>) => Promise<unknown>
}

type ExtensionWalletAccount = AccountData & {
  chainId: SupportedChainId
}

declare global {
  interface Window {
    BurritoWallet?: ExtensionProvider
  }
}

let connectedAccount: ExtensionWalletAccount | undefined

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[]
) => Object.keys(value).every((key) => allowed.includes(key))

const equalBytes = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

const clearConnectedAccount = () => {
  connectedAccount?.pubkey.fill(0)
  connectedAccount = undefined
}

const getProvider = () => {
  const provider =
    typeof window === "undefined" ? undefined : window.BurritoWallet
  if (
    !provider ||
    provider.version !== EXTENSION_PROTOCOL_VERSION ||
    typeof provider.request !== "function"
  ) {
    throw new Error("Burrito Wallet Extension is unavailable")
  }
  return provider
}

export const isBurritoExtensionWalletAvailable = () => {
  try {
    getProvider()
    return true
  } catch {
    return false
  }
}

export const getBurritoExtensionConnector = (): WalletConnector => ({
  id: "burrito-extension",
  label: "Burrito Wallet",
  type: "extension",
  available: isBurritoExtensionWalletAvailable()
})

const validateCapabilities = (value: unknown, chainId: SupportedChainId) => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "protocolVersion",
      "platform",
      "supportedChainIds",
      "supportedDirectSignTypeUrls",
      "transactionSigning"
    ]) ||
    value.protocolVersion !== EXTENSION_PROTOCOL_VERSION ||
    value.platform !== "chrome" ||
    value.transactionSigning !== true ||
    !Array.isArray(value.supportedChainIds) ||
    !value.supportedChainIds.includes(chainId) ||
    value.supportedChainIds.some(
      (candidate) =>
        typeof candidate !== "string" ||
        !SUPPORTED_CHAIN_IDS.includes(candidate as SupportedChainId)
    ) ||
    !Array.isArray(value.supportedDirectSignTypeUrls) ||
    value.supportedDirectSignTypeUrls.length === 0 ||
    value.supportedDirectSignTypeUrls.some(
      (typeUrl) => typeof typeUrl !== "string"
    )
  ) {
    throw new Error("Burrito Wallet Extension protocol is incompatible")
  }
}

const parseExtensionAccount = (
  value: unknown,
  chainId: SupportedChainId
): ExtensionWalletAccount => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "source",
      "chainId",
      "address",
      "algorithm",
      "publicKey"
    ]) ||
    value.source !== "burrito" ||
    value.chainId !== chainId ||
    value.algorithm !== "secp256k1" ||
    typeof value.address !== "string" ||
    typeof value.publicKey !== "string"
  ) {
    throw new Error("Burrito Wallet Extension account is invalid")
  }

  let pubkey: Uint8Array
  try {
    pubkey = fromBase64(value.publicKey)
  } catch {
    throw new Error("Burrito Wallet Extension public key is invalid")
  }
  if (
    pubkey.length !== 33 ||
    (pubkey[0] !== 2 && pubkey[0] !== 3) ||
    toBase64(pubkey) !== value.publicKey ||
    pubkeyToAddress(encodeSecp256k1Pubkey(pubkey), "terra") !== value.address
  ) {
    pubkey.fill(0)
    throw new Error("Burrito Wallet Extension public key does not match the account")
  }

  return {
    chainId,
    address: value.address,
    algo: "secp256k1",
    pubkey: pubkey.slice()
  }
}

const parseExtensionAccounts = (
  value: unknown,
  chainId: SupportedChainId
): ExtensionWalletAccount => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["source", "accounts"]) ||
    value.source !== "burrito" ||
    !Array.isArray(value.accounts) ||
    value.accounts.length !== 1
  ) {
    throw new Error("Burrito Wallet Extension returned invalid accounts")
  }
  return parseExtensionAccount(value.accounts[0], chainId)
}

export const connectBurritoExtensionWallet = async (
  chainId: string
): Promise<WalletAccount> => {
  if (!SUPPORTED_CHAIN_IDS.includes(chainId as SupportedChainId)) {
    throw new Error("Burrito Wallet Extension does not support this chain")
  }
  const supportedChainId = chainId as SupportedChainId
  const provider = getProvider()
  validateCapabilities(
    await provider.request("wallet.getCapabilities", {}),
    supportedChainId
  )
  const account = parseExtensionAccounts(
    await provider.request("wallet.connect", { chainIds: [supportedChainId] }),
    supportedChainId
  )
  clearConnectedAccount()
  connectedAccount = account
  return { address: account.address, name: "Burrito Wallet" }
}

export const disconnectBurritoExtensionWallet = async () => {
  try {
    await getProvider().request("wallet.disconnect", {})
  } finally {
    clearConnectedAccount()
  }
}

const requireActiveAccount = (chainId: string) => {
  if (connectedAccount?.chainId !== chainId) {
    throw new Error("Reconnect Burrito Wallet Extension before signing")
  }
  return connectedAccount
}

const validateSignedTransaction = (
  value: unknown,
  account: ExtensionWalletAccount,
  signDoc: SignDoc
) => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "txRawBytes",
      "txHash",
      "chainId",
      "account",
      "sequence"
    ]) ||
    value.chainId !== signDoc.chainId ||
    value.account !== account.address ||
    typeof value.sequence !== "string" ||
    !UNSIGNED_INTEGER.test(value.sequence) ||
    typeof value.txRawBytes !== "string" ||
    typeof value.txHash !== "string" ||
    !HASH.test(value.txHash)
  ) {
    throw new Error("Burrito Wallet Extension signature response is invalid")
  }

  let txBytes: Uint8Array
  let txRaw: TxRaw
  let authInfo: AuthInfo
  try {
    txBytes = fromBase64(value.txRawBytes)
    txRaw = TxRaw.decode(txBytes)
    authInfo = AuthInfo.decode(signDoc.authInfoBytes)
  } catch {
    throw new Error("Burrito Wallet Extension signed transaction is invalid")
  }
  if (
    toBase64(txBytes) !== value.txRawBytes ||
    !equalBytes(TxRaw.encode(txRaw).finish(), txBytes) ||
    !equalBytes(txRaw.bodyBytes, signDoc.bodyBytes) ||
    !equalBytes(txRaw.authInfoBytes, signDoc.authInfoBytes) ||
    txRaw.signatures.length !== 1 ||
    txRaw.signatures[0].length !== 64 ||
    toHex(sha256(txBytes)).toUpperCase() !== value.txHash ||
    authInfo.signerInfos.length !== 1 ||
    authInfo.signerInfos[0].sequence.toString() !== value.sequence
  ) {
    throw new Error("Burrito Wallet Extension signature does not match the request")
  }
  return txRaw.signatures[0]
}

export const getBurritoExtensionOfflineSigner = (
  chainId: string
): OfflineDirectSigner => {
  if (!SUPPORTED_CHAIN_IDS.includes(chainId as SupportedChainId)) {
    throw new Error("Burrito Wallet Extension does not support this chain")
  }
  const account = requireActiveAccount(chainId)
  const accountData: AccountData = {
    address: account.address,
    algo: account.algo,
    pubkey: account.pubkey.slice()
  }

  return {
    getAccounts: async () => [
      { ...accountData, pubkey: accountData.pubkey.slice() }
    ],
    signDirect: async (
      signerAddress: string,
      signDoc: SignDoc
    ): Promise<DirectSignResponse> => {
      const current = requireActiveAccount(chainId)
      if (
        signerAddress !== current.address ||
        signDoc.chainId !== chainId ||
        signDoc.accountNumber < 0n
      ) {
        throw new Error("Burrito Wallet Extension signing context changed")
      }
      const response = await getProvider().request("wallet.signDirect", {
        version: 1,
        chainId,
        account: current.address,
        accountNumber: signDoc.accountNumber.toString(),
        bodyBytes: toBase64(signDoc.bodyBytes),
        authInfoBytes: toBase64(signDoc.authInfoBytes)
      })
      const signature = validateSignedTransaction(response, current, signDoc)
      return {
        signed: signDoc,
        signature: encodeSecp256k1Signature(current.pubkey, signature)
      }
    }
  }
}
