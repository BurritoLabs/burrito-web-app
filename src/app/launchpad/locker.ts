import { toBase64, toUtf8 } from "@cosmjs/encoding"
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx"
import { queryContractSmart } from "../data/classic"
import { parseTokenAmountToBaseUnits } from "./cw20"
import {
  LAUNCHPAD_LP_LOCKER_ADDRESS,
  LP_LOCK_CHAIN_TIME_BUFFER_SECONDS,
  MAX_LP_LOCK_SECONDS,
  MIN_LP_LOCK_SECONDS,
  isLpLockerConfigured
} from "../config/launchpadConfig"

export { LAUNCHPAD_LP_LOCKER_ADDRESS, isLpLockerConfigured }

export type LpLockResponse = {
  id: number
  owner: string
  lp_token: string
  pair_contract: string
  amount: string
  unlock_time: number
  created_at: number
  withdrawn: boolean
}

export const parseLpAmountToBaseUnits = (value: string, decimals: number) =>
  parseTokenAmountToBaseUnits(value, decimals, "LP token amount")

export const getLpUnlockTimestampSeconds = (daysValue: string) => {
  const normalized = daysValue.replace(/,/g, "").trim()
  if (!/^\d+$/.test(normalized)) {
    throw new Error("Lock days must be a whole number.")
  }

  const days = Number(normalized)
  if (!Number.isSafeInteger(days) || days < 30 || days > 3650) {
    throw new Error("Lock days must be between 30 and 3650.")
  }

  const requestedDuration = days * 24 * 60 * 60
  const safeDuration =
    requestedDuration === MAX_LP_LOCK_SECONDS
      ? MAX_LP_LOCK_SECONDS
      : Math.min(
          requestedDuration + LP_LOCK_CHAIN_TIME_BUFFER_SECONDS,
          MAX_LP_LOCK_SECONDS
        )

  return (
    Math.floor(Date.now() / 1000) +
    Math.max(safeDuration, MIN_LP_LOCK_SECONDS)
  )
}

export const buildLockLpMessage = ({
  sender,
  lpTokenAddress,
  pairAddress,
  amount,
  unlockTimestamp
}: {
  sender: string
  lpTokenAddress: string
  pairAddress: string
  amount: string
  unlockTimestamp: number
}) => {
  if (!isLpLockerConfigured) {
    throw new Error("LP locker contract is not configured.")
  }

  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: MsgExecuteContract.fromPartial({
      sender,
      contract: lpTokenAddress,
      msg: toUtf8(
        JSON.stringify({
          send: {
            contract: LAUNCHPAD_LP_LOCKER_ADDRESS,
            amount,
            msg: toBase64(
              toUtf8(
                JSON.stringify({
                  lock: {
                    owner: sender,
                    pair_contract: pairAddress,
                    unlock_time: unlockTimestamp
                  }
                })
              )
            )
          }
        })
      ),
      funds: []
    })
  }
}

export const buildWithdrawLockedLpMessage = ({
  sender,
  lockId
}: {
  sender: string
  lockId: number
}) => {
  if (!isLpLockerConfigured) {
    throw new Error("LP locker contract is not configured.")
  }
  if (!Number.isSafeInteger(lockId) || lockId <= 0) {
    throw new Error("Invalid LP lock id.")
  }

  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: MsgExecuteContract.fromPartial({
      sender,
      contract: LAUNCHPAD_LP_LOCKER_ADDRESS,
      msg: toUtf8(
        JSON.stringify({
          withdraw: {
            lock_id: lockId
          }
        })
      ),
      funds: []
    })
  }
}

export const fetchLpLock = async (lockId: string | number) => {
  if (!isLpLockerConfigured) return null
  const normalized =
    typeof lockId === "number" ? String(lockId) : lockId.trim()
  if (!/^\d+$/.test(normalized)) return null

  return queryContractSmart<LpLockResponse>(LAUNCHPAD_LP_LOCKER_ADDRESS, {
    lock: {
      lock_id: Number(normalized)
    }
  })
}

export const extractLpLockIdFromEvents = (
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
      if (attr.key === "lock_id") return attr.value
    }
  }
  return ""
}
