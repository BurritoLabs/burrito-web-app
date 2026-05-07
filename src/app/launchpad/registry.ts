import { toUtf8 } from "@cosmjs/encoding"
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx"
import { queryContractSmart } from "../data/classic"

const rawRegistryAddress =
  import.meta.env.VITE_LAUNCHPAD_REGISTRY_ADDRESS?.trim() ?? ""

export const LAUNCHPAD_REGISTRY_ADDRESS = /^terra1[0-9a-z]{38,80}$/.test(
  rawRegistryAddress
)
  ? rawRegistryAddress
  : ""

export const isLaunchRegistryConfigured = Boolean(LAUNCHPAD_REGISTRY_ADDRESS)

export type LaunchRegistryMetadata = {
  name: string
  symbol: string
  website?: string | null
  x_profile?: string | null
  description?: string | null
}

export type LaunchRegistryLaunch = {
  id: number
  creator: string
  token_contract: string
  pair_contract: string
  lp_token: string
  locker_contract: string
  lp_lock_id: string
  lp_unlock_time: number
  metadata: LaunchRegistryMetadata
  status: "live" | "hidden"
  created_at: number
  updated_at: number
}

type LaunchesResponse = {
  launches?: LaunchRegistryLaunch[]
}

const cleanOptional = (value: string) => {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export const fetchLaunchRegistryLaunches = async () => {
  if (!isLaunchRegistryConfigured) return []
  const response = await queryContractSmart<LaunchesResponse>(
    LAUNCHPAD_REGISTRY_ADDRESS,
    {
      launches: {
        limit: 100
      }
    }
  )
  return response.launches ?? []
}

export const buildRegisterLaunchMessage = ({
  sender,
  tokenContract,
  pairContract,
  lpToken,
  lockerContract,
  lpLockId,
  lpUnlockTime,
  metadata
}: {
  sender: string
  tokenContract: string
  pairContract: string
  lpToken: string
  lockerContract: string
  lpLockId: string
  lpUnlockTime: number
  metadata: {
    name: string
    symbol: string
    website: string
    xProfile: string
    description: string
  }
}) => {
  if (!isLaunchRegistryConfigured) {
    throw new Error("Launch registry contract is not configured.")
  }

  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: MsgExecuteContract.fromPartial({
      sender,
      contract: LAUNCHPAD_REGISTRY_ADDRESS,
      msg: toUtf8(
        JSON.stringify({
          register_launch: {
            token_contract: tokenContract,
            pair_contract: pairContract,
            lp_token: lpToken,
            locker_contract: lockerContract,
            lp_lock_id: lpLockId,
            lp_unlock_time: lpUnlockTime,
            metadata: {
              name: metadata.name.trim(),
              symbol: metadata.symbol.trim().toUpperCase(),
              website: cleanOptional(metadata.website),
              x_profile: cleanOptional(metadata.xProfile),
              description: cleanOptional(metadata.description)
            }
          }
        })
      ),
      funds: []
    })
  }
}

export const extractRegistryLaunchIdFromEvents = (
  events:
    | ReadonlyArray<{
        type: string
        attributes: ReadonlyArray<{ key: string; value: string }>
      }>
    | undefined
) => {
  if (!events?.length) return ""
  for (const event of events) {
    for (const attr of event.attributes ?? []) {
      if (attr.key === "launch_id") return attr.value
    }
  }
  return ""
}
