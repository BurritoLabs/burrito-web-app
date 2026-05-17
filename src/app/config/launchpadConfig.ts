const parseTerraAddress = (value: string | undefined) => {
  const trimmed = value?.trim() ?? ""
  return /^terra1[0-9a-z]{38,80}$/.test(trimmed) ? trimmed : ""
}

export const LAUNCHPAD_CREATION_FEE_LUNC = 30_000
export const LAUNCHPAD_CREATION_FEE_MICRO =
  BigInt(LAUNCHPAD_CREATION_FEE_LUNC) * 1_000_000n
export const LAUNCHPAD_FEE_RECIPIENT =
  "terra16x9dcx9pm9j8ykl0td4hptwule706ysjeskflu"
export const LAUNCHPAD_CREATION_FEE_LABEL = `${new Intl.NumberFormat(
  "en-US"
).format(LAUNCHPAD_CREATION_FEE_LUNC)} LUNC`

export const LAUNCHPAD_CW20_CODE_ID = 3n
export const LAUNCHPAD_CW20_CODE_ID_LABEL = "Terra Classic CW20 code ID 3"

export const LAUNCHPAD_LP_LOCKER_ADDRESS = parseTerraAddress(
  import.meta.env.VITE_LAUNCHPAD_LP_LOCKER_ADDRESS
)
export const isLpLockerConfigured = Boolean(LAUNCHPAD_LP_LOCKER_ADDRESS)

export const LAUNCHPAD_REGISTRY_ADDRESS = parseTerraAddress(
  import.meta.env.VITE_LAUNCHPAD_REGISTRY_ADDRESS
)
export const isLaunchRegistryConfigured = Boolean(LAUNCHPAD_REGISTRY_ADDRESS)

export const MIN_LP_LOCK_SECONDS = 30 * 24 * 60 * 60
export const MAX_LP_LOCK_SECONDS = 3650 * 24 * 60 * 60
export const LP_LOCK_CHAIN_TIME_BUFFER_SECONDS = 10 * 60
