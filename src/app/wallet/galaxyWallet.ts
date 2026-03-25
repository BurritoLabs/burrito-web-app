import { fromBase64, fromHex } from "@cosmjs/encoding"
import type { AccountData } from "@cosmjs/amino"
import type {
  DirectSignResponse,
  OfflineDirectSigner
} from "@cosmjs/proto-signing"
import type { SignDoc } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import GalaxyStationMobileWallet from "@hexxagon/galaxy-station-mobile"
import StationWallet from "@hexxagon/station-wallet"
import { CLASSIC_CHAIN } from "../chain"
import type { WalletAccount } from "./WalletContext"
import { isLikelyMobileBrowser } from "./walletPlatform"

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
  signDirect: (tx: {
    signerAddress: string
    signDoc: SignDoc
  }) => Promise<DirectSignResponse>
}

let mobileGalaxyWallet: GalaxyStationMobileWallet | undefined

const getDesktopGalaxyWallet = () => new StationWallet()

const getMobileGalaxyWallet = () => {
  mobileGalaxyWallet ??= new GalaxyStationMobileWallet()
  return mobileGalaxyWallet
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

const getGalaxyWallet = () =>
  isLikelyMobileBrowser() ? getMobileGalaxyWallet() : getDesktopGalaxyWallet()

const resolveGalaxyAddress = (
  response: GalaxyConnectResponse,
  chainId: string
) =>
  response.addresses[chainId] ??
  Object.values(response.addresses)[0]

const getConnectedResponse = async (
  chainId: string = CLASSIC_CHAIN.chainId
) => {
  const response = await getGalaxyWallet().connect()
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
    const { response, address } = await getConnectedResponse(this.chainId)
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
    return this.wallet.signDirect({
      signerAddress,
      signDoc
    })
  }
}

export const getGalaxyConnector = () => {
  const isMobile = isLikelyMobileBrowser()
  const wallet = getGalaxyWallet()
  const available = isMobile ? true : Boolean(wallet.isInstalled)
  const type: "mobile" | "extension" = isMobile ? "mobile" : "extension"

  return {
    id: "galaxy" as const,
    label: "Galaxy Station",
    type,
    available
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
  const wallet = getGalaxyWallet() as GalaxyWalletLike
  await wallet.disconnect?.()
}

export const getGalaxyOfflineSigner = async () => {
  const wallet = getGalaxyWallet()
  await wallet.connect()

  if (!isLikelyMobileBrowser()) {
    const station = window.galaxyStation
    if (station) {
      return station.getOfflineSigner(CLASSIC_CHAIN.chainId)
    }
  }

  return new GalaxyOfflineSigner(wallet, CLASSIC_CHAIN.chainId)
}
