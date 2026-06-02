import { fromBase64, fromHex } from "@cosmjs/encoding"
import type { AccountData } from "@cosmjs/amino"
import type {
  DirectSignResponse,
  OfflineDirectSigner
} from "@cosmjs/proto-signing"
import type { SignDoc } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { CLASSIC_CHAIN } from "../chain"
import type { WalletAccount } from "./WalletContext"

type GalaxyConnectResponse = {
  addresses: Record<string, string>
  name?: string
  pubkey?: {
    330?: string
    118?: string
  }
}

type GalaxyWalletLike = {
  connect: () => Promise<GalaxyConnectResponse>
  disconnect?: () => Promise<void>
  signDirect?: (tx: {
    signerAddress: string
    signDoc: SignDoc
  }) => Promise<DirectSignResponse>
  getOfflineSigner?: (chainId: string) => OfflineDirectSigner
}

type GalaxyWindow = Window & {
  galaxyStation?: GalaxyWalletLike | HTMLElement
}

const getGalaxyProvider = () => {
  if (typeof window === "undefined") {
    throw new Error("Galaxy Station unavailable")
  }

  const provider = (window as GalaxyWindow).galaxyStation
  if (!provider || provider instanceof HTMLElement) {
    throw new Error("Galaxy Station extension not installed")
  }

  return provider
}

const decodePubkey = (value?: string) => {
  if (!value) return undefined

  try {
    return fromBase64(value)
  } catch {
    try {
      return fromHex(value)
    } catch {
      return undefined
    }
  }
}

const resolveGalaxyAddress = (
  response: GalaxyConnectResponse,
  chainId: string
) =>
  response.addresses[chainId] ??
  Object.values(response.addresses)[0]

const getConnectedResponse = async (
  chainId: string = CLASSIC_CHAIN.chainId
) => {
  const wallet = getGalaxyProvider()
  const response = await wallet.connect()
  const address = resolveGalaxyAddress(response, chainId)

  if (!address) {
    throw new Error("Galaxy Station account unavailable")
  }

  return {
    response,
    address
  }
}

class GalaxyOfflineSigner implements OfflineDirectSigner {
  private readonly wallet: GalaxyWalletLike
  private readonly chainId: string

  constructor(wallet: GalaxyWalletLike, chainId: string) {
    this.wallet = wallet
    this.chainId = chainId
  }

  async getAccounts(): Promise<readonly AccountData[]> {
    const response = await this.wallet.connect()
    const address = resolveGalaxyAddress(response, this.chainId)

    if (!address) {
      throw new Error("Galaxy Station account unavailable")
    }

    const pubkey =
      decodePubkey(response.pubkey?.[330]) ?? decodePubkey(response.pubkey?.[118])

    return [
      {
        address,
        algo: "secp256k1",
        pubkey: pubkey ?? new Uint8Array()
      }
    ]
  }

  async signDirect(
    signerAddress: string,
    signDoc: SignDoc
  ): Promise<DirectSignResponse> {
    if (!this.wallet.signDirect) {
      throw new Error("Galaxy Station direct signer unavailable")
    }

    return this.wallet.signDirect({
      signerAddress,
      signDoc
    })
  }
}

export const getGalaxyConnector = () => {
  const desktopInstalled =
    typeof window !== "undefined" &&
    Boolean((window as GalaxyWindow).galaxyStation) &&
    !((window as GalaxyWindow).galaxyStation instanceof HTMLElement)

  return {
    id: "galaxy" as const,
    label: "Galaxy Station",
    type: "extension" as const,
    available: desktopInstalled
  }
}

export const connectGalaxyWallet = async (): Promise<WalletAccount> => {
  const { response, address } = await getConnectedResponse()
  return {
    address,
    name: response.name?.trim() || "Galaxy Station"
  }
}

export const disconnectGalaxyWallet = async () => {
  const wallet = getGalaxyProvider()
  await wallet.disconnect?.()
}

export const getGalaxyOfflineSigner = async () => {
  const wallet = getGalaxyProvider()
  await wallet.connect()

  if (wallet.getOfflineSigner) {
    return wallet.getOfflineSigner(CLASSIC_CHAIN.chainId)
  }

  return new GalaxyOfflineSigner(wallet, CLASSIC_CHAIN.chainId)
}
