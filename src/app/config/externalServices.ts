export const KEYBASE_PROXY_URL = import.meta.env.DEV
  ? "/keybase"
  : "https://keybase.burrito.money"

export const COINPAPRIKA_LUNC_URL =
  "https://api.coinpaprika.com/v1/tickers/luna-terra"
export const COINPAPRIKA_USTC_URL =
  "https://api.coinpaprika.com/v1/tickers/ust-terrausd"

export const ASSET_URL = "https://assets.terra.dev"
export const ASSET_DEX_PAIRS_URL = `${ASSET_URL}/cw20/pairs.dex.json`
export const HEXXAGON_REGISTRY_URL =
  "https://raw.githubusercontent.com/hexxagon-io/chain-registry/main"
export const HEXXAGON_DEX_PAIRS_URL = `${HEXXAGON_REGISTRY_URL}/cw20/dex_pairs/mainnet/terra.js`

export const LOCAL_MARKET_INDEX_URL = "/market/index.json"
export const LOCAL_MARKET_CANDLES_BASE_URL = "/market/candles"
