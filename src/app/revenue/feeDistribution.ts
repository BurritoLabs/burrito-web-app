import type { EncodeObject } from "@cosmjs/proto-signing"
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx"
import { MsgFundCommunityPool } from "cosmjs-types/cosmos/distribution/v1beta1/tx"
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx"
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

type SwapFeeAsset = {
  type: "native" | "cw20"
  denom?: string
  contract?: string
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

const cw20Transfer = (
  sender: string,
  contract: string,
  recipient: string,
  amount: bigint
): EncodeObject => ({
  typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
  value: MsgExecuteContract.fromPartial({
    sender,
    contract,
    msg: new TextEncoder().encode(
      JSON.stringify({
        transfer: {
          recipient,
          amount: amount.toString()
        }
      })
    ),
    funds: []
  })
})

export const buildCollectorFeeTransfer = ({
  amount,
  asset,
  sender
}: {
  amount: bigint
  asset: SwapFeeAsset
  sender: string
}) => {
  if (amount <= 0n) return undefined
  if (asset.type === "native" && asset.denom) {
    return bankSend(
      sender,
      WEB_FEE_COLLECTOR_ADDRESS,
      asset.denom,
      amount
    )
  }
  if (asset.type === "cw20" && asset.contract) {
    return cw20Transfer(
      sender,
      asset.contract,
      WEB_FEE_COLLECTOR_ADDRESS,
      amount
    )
  }
  throw new Error("Unsupported platform fee asset.")
}

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

export const buildSwapRevenueDistribution = ({
  amount,
  asset,
  chainKey,
  sender
}: {
  amount: bigint
  asset: SwapFeeAsset
  chainKey: AppChainKey
  sender: string
}) => {
  if (
    asset.type === "native" &&
    asset.denom &&
    isSupportedRevenueAsset(chainKey, asset.denom)
  ) {
    return {
      ...buildRevenueDistribution({
        amount,
        chainKey,
        denom: asset.denom,
        sender
      }),
      receiptSupported: true
    }
  }

  const collectorMessage = buildCollectorFeeTransfer({
    amount,
    asset,
    sender
  })
  return {
    messages: collectorMessage ? [collectorMessage] : [],
    networkRewardFee: 0n,
    receiptSupported: false,
    split: {
      burn: 0n,
      communityPool: 0n,
      networkRewards: 0n,
      collector: amount > 0n ? amount : 0n
    }
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
