import { toBase64, toUtf8 } from "@cosmjs/encoding"
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx"
import { CLASSIC_DENOMS } from "../chain"
import { queryContractSmart } from "../data/classic"
import { parseTokenAmountToBaseUnits } from "./cw20"

export const TERRASWAP_FACTORY_ADDRESS =
  "terra1jkndu9w5attpz09ut02sgey5dd3e8sq5watzm0"

type NativeAssetInfo = {
  native_token: {
    denom: string
  }
}

type TokenAssetInfo = {
  token: {
    contract_addr: string
  }
}

export type TerraswapPairInfo = {
  asset_infos: Array<NativeAssetInfo | TokenAssetInfo>
  contract_addr: string
  liquidity_token?: string
  asset_decimals?: number[]
}

type TerraswapLiquidityAsset = {
  info: NativeAssetInfo | TokenAssetInfo
  amount: string
}

type TerraswapProvideLiquidityMsg = {
  provide_liquidity: {
    assets: TerraswapLiquidityAsset[]
    slippage_tolerance?: string
  }
}

export const buildLuncPairAssetInfos = (tokenAddress: string) => [
  {
    token: {
      contract_addr: tokenAddress
    }
  },
  {
    native_token: {
      denom: CLASSIC_DENOMS.lunc.coinMinimalDenom
    }
  }
]

const isMissingPairError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes("PairInfoRaw not found") ||
    message.includes("not found") ||
    message.includes("No pair")
  )
}

export const fetchTerraswapLuncPair = async (tokenAddress: string) => {
  try {
    return await queryContractSmart<TerraswapPairInfo>(
      TERRASWAP_FACTORY_ADDRESS,
      {
        pair: {
          asset_infos: buildLuncPairAssetInfos(tokenAddress)
        }
      }
    )
  } catch (error) {
    if (isMissingPairError(error)) return null
    throw error
  }
}

export const waitForTerraswapLuncPair = async (
  tokenAddress: string,
  attempts = 5
) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const pair = await fetchTerraswapLuncPair(tokenAddress)
    if (pair) return pair
    if (attempt < attempts - 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 1200))
    }
  }
  return null
}

export const buildCreateTerraswapLuncPairMessage = (
  sender: string,
  tokenAddress: string
) => ({
  typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
  value: MsgExecuteContract.fromPartial({
    sender,
    contract: TERRASWAP_FACTORY_ADDRESS,
    msg: toUtf8(
      JSON.stringify({
        create_pair: {
          asset_infos: buildLuncPairAssetInfos(tokenAddress)
        }
      })
    ),
    funds: []
  })
})

export const parseLuncAmountToBaseUnits = (value: string) =>
  parseTokenAmountToBaseUnits(
    value,
    CLASSIC_DENOMS.lunc.coinDecimals,
    "LUNC amount"
  )

export const formatSlippageTolerance = (percentValue: string) => {
  const normalized = percentValue.replace(/,/g, "").trim()
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Slippage must be a positive number.")
  }

  const percent = Number(normalized)
  if (!Number.isFinite(percent) || percent <= 0 || percent > 50) {
    throw new Error("Slippage must be greater than 0% and no more than 50%.")
  }

  return (percent / 100).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
}

export const buildIncreaseAllowanceMessage = ({
  sender,
  tokenAddress,
  spender,
  amount
}: {
  sender: string
  tokenAddress: string
  spender: string
  amount: string
}) => ({
  typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
  value: MsgExecuteContract.fromPartial({
    sender,
    contract: tokenAddress,
    msg: toUtf8(
      JSON.stringify({
        increase_allowance: {
          spender,
          amount
        }
      })
    ),
    funds: []
  })
})

export const buildProvideTerraswapLiquidityMessage = ({
  sender,
  pairAddress,
  tokenAddress,
  tokenAmount,
  luncAmount,
  slippageTolerance
}: {
  sender: string
  pairAddress: string
  tokenAddress: string
  tokenAmount: string
  luncAmount: string
  slippageTolerance?: string
}) => {
  const msg: TerraswapProvideLiquidityMsg = {
    provide_liquidity: {
      assets: [
        {
          info: {
            token: {
              contract_addr: tokenAddress
            }
          },
          amount: tokenAmount
        },
        {
          info: {
            native_token: {
              denom: CLASSIC_DENOMS.lunc.coinMinimalDenom
            }
          },
          amount: luncAmount
        }
      ]
    }
  }

  if (slippageTolerance) {
    msg.provide_liquidity.slippage_tolerance = slippageTolerance
  }

  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: MsgExecuteContract.fromPartial({
      sender,
      contract: pairAddress,
      msg: toUtf8(JSON.stringify(msg)),
      funds: [
        {
          denom: CLASSIC_DENOMS.lunc.coinMinimalDenom,
          amount: luncAmount
        }
      ]
    })
  }
}

export const buildWithdrawTerraswapLiquidityMessage = ({
  sender,
  pairAddress,
  lpTokenAddress,
  lpAmount
}: {
  sender: string
  pairAddress: string
  lpTokenAddress: string
  lpAmount: string
}) => ({
  typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
  value: MsgExecuteContract.fromPartial({
    sender,
    contract: lpTokenAddress,
    msg: toUtf8(
      JSON.stringify({
        send: {
          contract: pairAddress,
          amount: lpAmount,
          msg: toBase64(
            toUtf8(
              JSON.stringify({
                withdraw_liquidity: {}
              })
            )
          )
        }
      })
    ),
    funds: []
  })
})
