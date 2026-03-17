import { Registry, type OfflineSigner } from "@cosmjs/proto-signing"
import {
  GasPrice,
  SigningStargateClient,
  defaultRegistryTypes
} from "@cosmjs/stargate"
import {
  MsgClearAdmin,
  MsgExecuteContract,
  MsgInstantiateContract,
  MsgMigrateContract,
  MsgStoreCode,
  MsgUpdateAdmin
} from "cosmjs-types/cosmwasm/wasm/v1/tx"
import { CLASSIC_CHAIN, CLASSIC_DENOMS } from "../chain"

type RegistryType = Parameters<Registry["register"]>[1]

const getClassicRegistry = () => {
  const registry = new Registry(defaultRegistryTypes)
  registry.register(
    "/cosmwasm.wasm.v1.MsgExecuteContract",
    MsgExecuteContract as unknown as RegistryType
  )
  registry.register(
    "/cosmwasm.wasm.v1.MsgInstantiateContract",
    MsgInstantiateContract as unknown as RegistryType
  )
  registry.register(
    "/cosmwasm.wasm.v1.MsgStoreCode",
    MsgStoreCode as unknown as RegistryType
  )
  registry.register(
    "/cosmwasm.wasm.v1.MsgMigrateContract",
    MsgMigrateContract as unknown as RegistryType
  )
  registry.register(
    "/cosmwasm.wasm.v1.MsgUpdateAdmin",
    MsgUpdateAdmin as unknown as RegistryType
  )
  registry.register(
    "/cosmwasm.wasm.v1.MsgClearAdmin",
    MsgClearAdmin as unknown as RegistryType
  )
  return registry
}

export const connectClassicSigningClient = async (signer: OfflineSigner) =>
  SigningStargateClient.connectWithSigner(CLASSIC_CHAIN.rpc, signer, {
    gasPrice: GasPrice.fromString(`28.325${CLASSIC_DENOMS.lunc.coinMinimalDenom}`),
    registry: getClassicRegistry()
  })
