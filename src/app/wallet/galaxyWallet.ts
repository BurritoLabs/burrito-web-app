import { fromBase64, fromHex } from "@cosmjs/encoding"
import type { AccountData } from "@cosmjs/amino"
import type {
  DirectSignResponse,
  OfflineDirectSigner
} from "@cosmjs/proto-signing"
import type { SignDoc } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { CLASSIC_CHAIN } from "../chain"
import type { WalletAccount } from "./WalletContext"
import {
  isLikelyMobileBrowser,
  isTouchWalletCapableBrowser
} from "./walletPlatform"

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

let mobileGalaxyWallet: GalaxyWalletLike | undefined

const getDesktopGalaxyWallet = async (): Promise<GalaxyWalletLike> => {
  const { default: StationWallet } = await import("@hexxagon/station-wallet")
  return new StationWallet() as GalaxyWalletLike
}

const getMobileGalaxyWallet = async (): Promise<GalaxyWalletLike> => {
  if (!mobileGalaxyWallet) {
    const { default: GalaxyStationMobileWallet } = await import(
      "@hexxagon/galaxy-station-mobile"
    )
    mobileGalaxyWallet = new GalaxyStationMobileWallet() as GalaxyWalletLike
  }
  return mobileGalaxyWallet
}

const shouldUseMobileGalaxyWallet = () => {
  if (typeof window === "undefined") return false

  if (window.galaxyStation) {
    return false
  }

  if (isLikelyMobileBrowser()) {
    return true
  }

  return isTouchWalletCapableBrowser()
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

const getGalaxyWallet = async () =>
  shouldUseMobileGalaxyWallet() ? getMobileGalaxyWallet() : getDesktopGalaxyWallet()

const resolveGalaxyAddress = (
  response: GalaxyConnectResponse,
  chainId: string
) =>
  response.addresses[chainId] ??
  Object.values(response.addresses)[0]

const getConnectedResponse = async (
  chainId: string = CLASSIC_CHAIN.chainId
) => {
  const wallet = await getGalaxyWallet()
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
    return this.wallet.signDirect({
      signerAddress,
      signDoc
    })
  }
}

export const getGalaxyConnector = () => {
  const isMobile = shouldUseMobileGalaxyWallet()
  const desktopInstalled =
    typeof window !== "undefined" && Boolean(window.galaxyStation)
  const available = desktopInstalled || isMobile
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
  const wallet = await getGalaxyWallet()
  await wallet.disconnect?.()
}

export const getGalaxyOfflineSigner = async () => {
  const wallet = await getGalaxyWallet()
  await wallet.connect()

  if (!shouldUseMobileGalaxyWallet()) {
    const station = window.galaxyStation
    if (station) {
      return station.getOfflineSigner(CLASSIC_CHAIN.chainId)
    }
  }

  return new GalaxyOfflineSigner(wallet, CLASSIC_CHAIN.chainId)
}
