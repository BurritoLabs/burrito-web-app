import { getActiveAppChainKey } from "../activeChain"
import type { AppChainKey } from "../appChains"

const parseTerraAddress = (value: string | undefined) => {
  const trimmed = value?.trim() ?? ""
  return /^terra1[0-9a-z]{38,80}$/.test(trimmed) ? trimmed : ""
}

const parsePositiveAmount = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const FEE_RECIPIENT = "terra16x9dcx9pm9j8ykl0td4hptwule706ysjeskflu"

const classicCreationFee = parsePositiveAmount(
  import.meta.env.VITE_LUNC_LAUNCHPAD_CREATION_FEE,
  30_000
)
const lunaCreationFee = parsePositiveAmount(
  import.meta.env.VITE_LUNA_LAUNCHPAD_CREATION_FEE,
  1
)

const launchpadConfigs = {
  lunc: {
    chainKey: "lunc",
    chainId: "columbus-5",
    nativeDenom: "uluna",
    nativeSymbol: "LUNC",
    creationFee: classicCreationFee,
    creationFeeMicro: BigInt(Math.round(classicCreationFee * 1_000_000)),
    feeRecipient: FEE_RECIPIENT,
    cw20CodeId: 3n,
    cw20CodeIdLabel: "Terra Classic CW20 code ID 3",
    terraswapFactoryAddress:
      "terra1jkndu9w5attpz09ut02sgey5dd3e8sq5watzm0",
    lpLockerAddress: parseTerraAddress(
      import.meta.env.VITE_LUNC_LAUNCHPAD_LP_LOCKER_ADDRESS ||
        import.meta.env.VITE_LAUNCHPAD_LP_LOCKER_ADDRESS
    ),
    registryAddress: parseTerraAddress(
      import.meta.env.VITE_LUNC_LAUNCHPAD_REGISTRY_ADDRESS ||
        import.meta.env.VITE_LAUNCHPAD_REGISTRY_ADDRESS
    )
  },
  luna: {
    chainKey: "luna",
    chainId: "phoenix-1",
    nativeDenom: "uluna",
    nativeSymbol: "LUNA",
    creationFee: lunaCreationFee,
    creationFeeMicro: BigInt(Math.round(lunaCreationFee * 1_000_000)),
    feeRecipient: FEE_RECIPIENT,
    cw20CodeId: 4n,
    cw20CodeIdLabel: "Terra CW20 code ID 4",
    terraswapFactoryAddress:
      "terra1466nf3zuxpya8q9emxukd7vftaf6h4psr0a07srl5zw74zh84yjqxl5qul",
    lpLockerAddress: parseTerraAddress(
      import.meta.env.VITE_LUNA_LAUNCHPAD_LP_LOCKER_ADDRESS
    ),
    registryAddress: parseTerraAddress(
      import.meta.env.VITE_LUNA_LAUNCHPAD_REGISTRY_ADDRESS
    )
  }
} as const

export type LaunchpadChainConfig =
  (typeof launchpadConfigs)[keyof typeof launchpadConfigs]

export const getLaunchpadConfig = (
  chainKey: AppChainKey = getActiveAppChainKey()
): LaunchpadChainConfig => launchpadConfigs[chainKey]

export const getLaunchpadCreationFeeLabel = (chainKey?: AppChainKey) => {
  const config = getLaunchpadConfig(chainKey)
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6
  }).format(config.creationFee)} ${config.nativeSymbol}`
}

export const isLpLockerConfigured = (chainKey?: AppChainKey) =>
  Boolean(getLaunchpadConfig(chainKey).lpLockerAddress)

export const isLaunchRegistryConfigured = (chainKey?: AppChainKey) =>
  Boolean(getLaunchpadConfig(chainKey).registryAddress)

export const getLaunchpadStorageKeys = (chainKey?: AppChainKey) => {
  const key = chainKey ?? getActiveAppChainKey()
  return {
    draft: `burrito.launchpad.${key}.draft.v2`,
    created: `burrito.launchpad.${key}.created.v2`
  }
}

export const MIN_LP_LOCK_SECONDS = 30 * 24 * 60 * 60
export const MAX_LP_LOCK_SECONDS = 3650 * 24 * 60 * 60
export const LP_LOCK_CHAIN_TIME_BUFFER_SECONDS = 10 * 60
