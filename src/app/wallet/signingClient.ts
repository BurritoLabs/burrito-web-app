import { Registry, type OfflineSigner } from "@cosmjs/proto-signing"
import {
  createWasmAminoConverters,
  wasmTypes
} from "@cosmjs/cosmwasm-stargate"
import {
  AminoTypes,
  GasPrice,
  SigningStargateClient,
  createDefaultAminoConverters,
  defaultRegistryTypes
} from "@cosmjs/stargate"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"

export const getClassicRegistry = () => {
  return new Registry([...defaultRegistryTypes, ...wasmTypes])
}

export const getClassicAminoTypes = () =>
  new AminoTypes({
    ...createDefaultAminoConverters(),
    ...createWasmAminoConverters()
  })

export const connectClassicSigningClient = async (signer: OfflineSigner) =>
  SigningStargateClient.connectWithSigner(CLASSIC_CHAIN.rpc, signer, {
    gasPrice: GasPrice.fromString(`28.325${CLASSIC_DENOMS.lunc.coinMinimalDenom}`),
    registry: getClassicRegistry(),
    aminoTypes: getClassicAminoTypes()
  })

export const connectClassicStargateClient = async (
  signer: OfflineSigner,
  feeDenom: string = CLASSIC_DENOMS.lunc.coinMinimalDenom
) =>
  SigningStargateClient.connectWithSigner(CLASSIC_CHAIN.rpc, signer, {
    gasPrice: GasPrice.fromString(`28.325${feeDenom}`),
    registry: getClassicRegistry(),
    aminoTypes: getClassicAminoTypes()
  })
