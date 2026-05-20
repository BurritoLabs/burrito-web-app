export const WITHDRAW_REWARDS_DEFAULT_FEE_GAS = 180_000
export const WITHDRAW_REWARD_MSG_GAS = 70_000
export const WITHDRAW_COMMISSION_DEFAULT_FEE_GAS = 220_000
export const WITHDRAW_GAS_PRICE_MICRO_LUNC = 28.325
export const WITHDRAW_SUBMIT_GAS_ADJUSTMENT = 1.6
export const WITHDRAW_SIMULATION_FALLBACK_GAS_MULTIPLIER = 1.35

export const getRewardsFallbackGas = (validatorCount: number) =>
  WITHDRAW_REWARDS_DEFAULT_FEE_GAS + validatorCount * WITHDRAW_REWARD_MSG_GAS

export const buildWithdrawTxFee = (gas: number, denom: string) => ({
  amount: [
    {
      amount: Math.ceil(gas * WITHDRAW_GAS_PRICE_MICRO_LUNC).toString(),
      denom
    }
  ],
  gas: String(gas)
})
