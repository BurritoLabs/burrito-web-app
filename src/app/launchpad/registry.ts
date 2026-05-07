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

type LaunchesQuery = {
  launches: {
    start_after?: number
    limit: number
  }
}

type LaunchResponse =
  | LaunchRegistryLaunch
  | {
      launch?: LaunchRegistryLaunch | null
    }
  | null

const cleanOptional = (value: string) => {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const isLaunchRecord = (value: unknown): value is LaunchRegistryLaunch =>
  Boolean(
    value &&
      typeof value === "object" &&
      "token_contract" in value &&
      "pair_contract" in value
  )

export const fetchLaunchRegistryLaunches = async () => {
  if (!isLaunchRegistryConfigured) return []
  const launches: LaunchRegistryLaunch[] = []
  const limit = 100
  let startAfter: number | undefined

  for (let page = 0; page < 10; page += 1) {
    const query: LaunchesQuery = {
      launches: {
        limit
      }
    }
    if (typeof startAfter === "number") {
      query.launches.start_after = startAfter
    }
    const response = await queryContractSmart<LaunchesResponse>(
      LAUNCHPAD_REGISTRY_ADDRESS,
      query
    )
    const pageLaunches = response.launches ?? []
    launches.push(...pageLaunches)
    if (pageLaunches.length < limit) break
    startAfter = pageLaunches[pageLaunches.length - 1]?.id
    if (typeof startAfter !== "number") break
  }

  return launches
}

export const fetchLaunchRegistryLaunch = async (tokenContract: string) => {
  if (!isLaunchRegistryConfigured) return null
  try {
    const response = await queryContractSmart<LaunchResponse>(
      LAUNCHPAD_REGISTRY_ADDRESS,
      {
        launch: {
          token_contract: tokenContract
        }
      }
    )
    if (isLaunchRecord(response)) return response
    if (
      response &&
      typeof response === "object" &&
      "launch" in response &&
      isLaunchRecord(response.launch)
    ) {
      return response.launch
    }
    return null
  } catch {
    return null
  }
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

export const buildUpdateLaunchMessage = ({
  sender,
  tokenContract,
  metadata,
  status,
  lpLockId,
  lpUnlockTime
}: {
  sender: string
  tokenContract: string
  metadata?: {
    name: string
    symbol: string
    website: string
    xProfile: string
    description: string
  }
  status?: "live" | "hidden"
  lpLockId?: string
  lpUnlockTime?: number
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
          update_launch: {
            token_contract: tokenContract,
            metadata: metadata
              ? {
                  name: metadata.name.trim(),
                  symbol: metadata.symbol.trim().toUpperCase(),
                  website: cleanOptional(metadata.website),
                  x_profile: cleanOptional(metadata.xProfile),
                  description: cleanOptional(metadata.description)
                }
              : null,
            status: status ?? null,
            lp_lock_id: lpLockId ?? null,
            lp_unlock_time: lpUnlockTime ?? null
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
