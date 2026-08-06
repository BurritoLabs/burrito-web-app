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

const NATIVE_PROTOCOL_VERSION = 1
const SUPPORTED_CHAIN_IDS = ["columbus-5", "phoenix-1"] as const
const HASH = /^[A-F0-9]{64}$/
const UNSIGNED_INTEGER = /^(0|[1-9][0-9]*)$/

type NativeBridge = {
  version: number
  request: (method: string, params?: Record<string, unknown>) => Promise<unknown>
}

type NativeWalletAccount = AccountData & {
  chainId: SupportedChainId
}

type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number]

declare global {
  interface Window {
    BurritoNative?: NativeBridge
  }
}

let connectedAccounts: NativeWalletAccount[] | undefined

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

const getBridge = () => {
  const bridge = typeof window === "undefined" ? undefined : window.BurritoNative
  if (
    !bridge ||
    bridge.version !== NATIVE_PROTOCOL_VERSION ||
    typeof bridge.request !== "function"
  ) {
    throw new Error("Burrito native wallet is unavailable")
  }
  return bridge
}

export const isBurritoNativeWalletAvailable = () => {
  try {
    getBridge()
    return true
  } catch {
    return false
  }
}

export const getBurritoNativeConnector = (): WalletConnector => ({
  id: "burrito-native",
  label: "Burrito Wallet",
  type: "mobile",
  available: isBurritoNativeWalletAvailable()
})

const validateCapabilities = (value: unknown) => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["platform", "protocolVersion", "capabilities"]) ||
    (value.platform !== "ios" && value.platform !== "android") ||
    value.protocolVersion !== NATIVE_PROTOCOL_VERSION
  ) {
    throw new Error("Burrito native protocol is incompatible")
  }
  const capabilities = value.capabilities
  if (
    !isRecord(capabilities) ||
    capabilities.localWallet !== true ||
    capabilities.transactionSigning !== true ||
    !Array.isArray(capabilities.supportedDirectSignTypeUrls) ||
    capabilities.supportedDirectSignTypeUrls.length === 0 ||
    capabilities.supportedDirectSignTypeUrls.some(
      (typeUrl) => typeof typeUrl !== "string"
    )
  ) {
    throw new Error("Burrito native signing is unavailable")
  }
}

const validateWalletStatus = (value: unknown) => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["exists", "deviceProtectionAvailable"]) ||
    typeof value.exists !== "boolean" ||
    typeof value.deviceProtectionAvailable !== "boolean"
  ) {
    throw new Error("Burrito native wallet protection status is invalid")
  }
  if (!value.deviceProtectionAvailable) {
    throw new Error("Secure device-owner authentication is required")
  }
}

const parseNativeAccount = (
  value: unknown,
  chainId: SupportedChainId
): NativeWalletAccount => {
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
    throw new Error("Burrito native account is invalid")
  }

  let pubkey: Uint8Array
  try {
    pubkey = fromBase64(value.publicKey)
  } catch {
    throw new Error("Burrito native public key is invalid")
  }
  if (
    pubkey.length !== 33 ||
    (pubkey[0] !== 2 && pubkey[0] !== 3) ||
    toBase64(pubkey) !== value.publicKey ||
    pubkeyToAddress(encodeSecp256k1Pubkey(pubkey), "terra") !== value.address
  ) {
    throw new Error("Burrito native public key does not match the account")
  }

  return {
    chainId,
    address: value.address,
    algo: "secp256k1",
    pubkey: pubkey.slice()
  }
}

const parseNativeAccounts = (value: unknown): NativeWalletAccount[] => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["source", "accounts"]) ||
    value.source !== "burrito" ||
    !Array.isArray(value.accounts) ||
    value.accounts.length !== SUPPORTED_CHAIN_IDS.length
  ) {
    throw new Error("Burrito native wallet returned invalid accounts")
  }

  const accountValues = value.accounts
  const accounts = SUPPORTED_CHAIN_IDS.map((chainId) => {
    const matches = accountValues.filter(
      (candidate) => isRecord(candidate) && candidate.chainId === chainId
    )
    if (matches.length !== 1) {
      throw new Error("Burrito native wallet returned duplicate chain accounts")
    }
    return parseNativeAccount(matches[0], chainId)
  })

  return accounts
}

export const connectBurritoNativeWallet = async (
  chainId: string
): Promise<WalletAccount> => {
  if (!SUPPORTED_CHAIN_IDS.includes(chainId as SupportedChainId)) {
    throw new Error("Burrito native wallet does not support this chain")
  }
  const bridge = getBridge()
  validateCapabilities(await bridge.request("bridge.getCapabilities", {}))
  validateWalletStatus(await bridge.request("wallet.getStatus", {}))
  const accounts = parseNativeAccounts(await bridge.request("wallet.open", {}))
  connectedAccounts?.forEach((account) => account.pubkey.fill(0))
  connectedAccounts = accounts
  const account = requireActiveAccount(chainId)
  return { address: account.address, name: "Burrito Wallet" }
}

export const disconnectBurritoNativeWallet = async () => {
  connectedAccounts?.forEach((account) => account.pubkey.fill(0))
  connectedAccounts = undefined
}

const requireActiveAccount = (chainId: string) => {
  const account = connectedAccounts?.find((candidate) => candidate.chainId === chainId)
  if (!account) {
    throw new Error("Reconnect Burrito Wallet before signing")
  }
  return account
}

const validateSignedTransaction = (
  value: unknown,
  account: NativeWalletAccount,
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
    throw new Error("Burrito native signature response is invalid")
  }

  let txBytes: Uint8Array
  let txRaw: TxRaw
  let authInfo: AuthInfo
  try {
    txBytes = fromBase64(value.txRawBytes)
    txRaw = TxRaw.decode(txBytes)
    authInfo = AuthInfo.decode(signDoc.authInfoBytes)
  } catch {
    throw new Error("Burrito native signed transaction is invalid")
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
    throw new Error("Burrito native signature does not match the request")
  }
  return txRaw.signatures[0]
}

export const getBurritoNativeOfflineSigner = (
  chainId: string
): OfflineDirectSigner => {
  if (!SUPPORTED_CHAIN_IDS.includes(chainId as SupportedChainId)) {
    throw new Error("Burrito native wallet does not support this chain")
  }
  const account = requireActiveAccount(chainId)
  const accountData: AccountData = {
    address: account.address,
    algo: account.algo,
    pubkey: account.pubkey.slice()
  }

  return {
    getAccounts: async () => [{ ...accountData, pubkey: accountData.pubkey.slice() }],
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
        throw new Error("Burrito native signing context changed")
      }
      const response = await getBridge().request("wallet.signDirect", {
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
