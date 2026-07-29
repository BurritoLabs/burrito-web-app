import type { EncodeObject } from "@cosmjs/proto-signing"
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx"
import { MsgFundCommunityPool } from "cosmjs-types/cosmos/distribution/v1beta1/tx"
import type { AppChainKey } from "../appChains"

const DEFAULT_COLLECTOR_ADDRESS =
  "terra14upy365pjz2qh46qr3kh8xf7aslsjz958n349w"
const LUNC_BURN_ADDRESS =
  "terra1sk06e3dyexuq4shw77y3dsv480xv42mq73anxu"
const LUNC_ORACLE_POOL_ADDRESS =
  "terra1jgp27m8fykex4e4jtt0l7ze8q528ux2lh4zh0f"
const LUNA_BURN_ADDRESS =
  "terra1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq486l9a"

const parseTerraAddress = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim()
  return trimmed && /^terra1[0-9a-z]{38,80}$/.test(trimmed)
    ? trimmed
    : fallback
}

export const WEB_FEE_COLLECTOR_ADDRESS = parseTerraAddress(
  import.meta.env.VITE_WEB_FEE_COLLECTOR_ADDRESS,
  DEFAULT_COLLECTOR_ADDRESS
)

export const isSupportedRevenueAsset = (
  chainKey: AppChainKey,
  denom: string | undefined
) =>
  chainKey === "luna"
    ? denom === "uluna"
    : denom === "uluna" || denom === "uusd"

export type RevenueSplit = {
  burn: bigint
  communityPool: bigint
  networkRewards: bigint
  collector: bigint
}

export const splitRevenueFee = (amount: bigint): RevenueSplit => {
  if (amount <= 0n) {
    return {
      burn: 0n,
      communityPool: 0n,
      networkRewards: 0n,
      collector: 0n
    }
  }
  const fivePercent = (amount * 5n) / 100n
  return {
    burn: fivePercent,
    communityPool: fivePercent,
    networkRewards: fivePercent,
    collector: amount - fivePercent * 3n
  }
}

const bankSend = (
  sender: string,
  recipient: string,
  denom: string,
  amount: bigint
): EncodeObject => ({
  typeUrl: "/cosmos.bank.v1beta1.MsgSend",
  value: MsgSend.fromPartial({
    fromAddress: sender,
    toAddress: recipient,
    amount: [{ denom, amount: amount.toString() }]
  })
})

export const buildRevenueDistribution = ({
  amount,
  chainKey,
  denom,
  sender
}: {
  amount: bigint
  chainKey: AppChainKey
  denom: string
  sender: string
}) => {
  if (!isSupportedRevenueAsset(chainKey, denom)) {
    return {
      messages: [] as EncodeObject[],
      networkRewardFee: 0n,
      split: splitRevenueFee(0n)
    }
  }
  const split = splitRevenueFee(amount)
  const burnAddress =
    chainKey === "lunc" ? LUNC_BURN_ADDRESS : LUNA_BURN_ADDRESS
  const messages: EncodeObject[] = []
  if (split.burn > 0n) {
    messages.push(bankSend(sender, burnAddress, denom, split.burn))
  }
  if (split.communityPool > 0n) {
    messages.push({
      typeUrl: "/cosmos.distribution.v1beta1.MsgFundCommunityPool",
      value: MsgFundCommunityPool.fromPartial({
        depositor: sender,
        amount: [{ denom, amount: split.communityPool.toString() }]
      })
    })
  }
  if (chainKey === "lunc" && split.networkRewards > 0n) {
    messages.push(
      bankSend(
        sender,
        LUNC_ORACLE_POOL_ADDRESS,
        denom,
        split.networkRewards
      )
    )
  }
  if (split.collector > 0n) {
    messages.push(
      bankSend(sender, WEB_FEE_COLLECTOR_ADDRESS, denom, split.collector)
    )
  }
  return {
    messages,
    networkRewardFee: chainKey === "luna" ? split.networkRewards : 0n,
    split
  }
}

export const applyLunaNetworkRewardFee = (
  standardFee: {
    amount: readonly { amount: string; denom: string }[]
    gas: string
  },
  denom: string,
  networkRewardFee: bigint
): { amount: { amount: string; denom: string }[]; gas: string } => {
  if (networkRewardFee <= 0n) {
    return {
      amount: standardFee.amount.map((coin) => ({ ...coin })),
      gas: standardFee.gas
    }
  }
  const standardAmount = standardFee.amount
    .filter((coin) => coin.denom === denom)
    .reduce((total, coin) => total + BigInt(coin.amount), 0n)
  return {
    gas: standardFee.gas,
    amount: [
      {
        denom,
        amount: (networkRewardFee > standardAmount
          ? networkRewardFee
          : standardAmount
        ).toString()
      }
    ]
  }
}
