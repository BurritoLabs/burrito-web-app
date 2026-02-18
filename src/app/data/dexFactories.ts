export type ClassicDexFactory = {
  dex: string
  address: string
  variant?: string
  activePairCount?: number
  note?: string
}

/**
 * Terra Classic DEX factory contracts verified from LCD smart queries:
 * - { "config": {} }
 * - { "pairs": { "limit": 1 } }
 *
 * `activePairCount` is matched against `https://assets.terra.dev/cw20/pairs.dex.json` (classic).
 */
export const CLASSIC_DEX_FACTORIES: readonly ClassicDexFactory[] = [
  {
    dex: "Terraswap",
    variant: "primary",
    address: "terra1jkndu9w5attpz09ut02sgey5dd3e8sq5watzm0",
    activePairCount: 79
  },
  {
    dex: "Terraswap",
    variant: "legacy",
    address: "terra1ulgw0td86nvs4wtpsc80thv6xelk76ut7a7apj",
    activePairCount: 2
  },
  {
    dex: "Astroport",
    variant: "primary",
    address: "terra1fnywlw4edny3vw44x04xd67uzkdqluymgreu7g",
    activePairCount: 26
  },
  {
    dex: "Astroport",
    variant: "factory",
    address: "terra1srmt7smgrafsfuk40ulscuh5x2yj4pn3qne43r",
    note: "Factory contract exists but has no currently indexed pairs in assets.terra.dev."
  },
  {
    dex: "Astroport",
    variant: "factory",
    address: "terra17thfrxneg0sfv74p580c6lxppuy9fu2x499cjs",
    note: "Factory contract exists but has no currently indexed pairs in assets.terra.dev."
  },
  {
    dex: "Terraport",
    variant: "v2",
    address: "terra1n75fgfc8clsssrm2k0fswgtzsvstdaah7la6sfu96szdu22xta0q57rqqr",
    activePairCount: 2
  },
  {
    dex: "Terraport",
    variant: "cpmm",
    address: "terra1m8zz7q49x8phrfwc0rxep77l2u6hf7tm2arv2rmzk5c9lg7p6ncqu3y4zg",
    note: "Factory on code 9251; exposes uluna/uusd pair and supports simulation queries."
  },
  {
    dex: "Terraport",
    variant: "v3",
    address: "terra1y55punu6m5cm8sgqdgt6ngevtyklaylc09qxputn6ksye4ptf9ysxmtyl6",
    activePairCount: 1
  },
  {
    dex: "Terraport",
    variant: "v3",
    address: "terra1cl9883egl8nl0p44fkyshtx4wa72p4xdw6z39j330r9a0q273ylsrpker9",
    note: "Factory contract exists but has no currently indexed pairs in assets.terra.dev."
  },
  {
    dex: "Terraport",
    variant: "v3",
    address: "terra1qrec4zylcgrkcl2s5trrz9ysgywuqsr49r7yxgxw0lysunxlm89smwhu3g",
    note: "Factory contract exists but has no currently indexed pairs in assets.terra.dev."
  },
  {
    dex: "Garuda DeFi",
    variant: "v1",
    address: "terra18srpvety7xz28lw5g0f6cx9sw50hyvk3xk7up80ul4pdpauvq7jq5zcm98",
    note: "Legacy Garuda factory (earlier generation, limited pools)."
  },
  {
    dex: "Garuda DeFi",
    variant: "v2",
    address: "terra1ypwj6sw25g0qcykv7mzmcvsndvx56r3yrgkaw3fds7yzwl7fwwcsnxkeh7"
  }
]

export type ClassicSwapDex = {
  id: string
  label: string
  factory: string
  mode?: "terraswap" | "garuda"
}

/**
 * Active DEX factories used by the in-app swap quote router.
 */
export const CLASSIC_SWAP_DEXES: readonly ClassicSwapDex[] = [
  {
    id: "terraswap",
    label: "Terraswap",
    factory: "terra1jkndu9w5attpz09ut02sgey5dd3e8sq5watzm0"
  },
  {
    id: "terraswap-legacy",
    label: "Terraswap V1",
    factory: "terra1ulgw0td86nvs4wtpsc80thv6xelk76ut7a7apj"
  },
  {
    id: "astroport",
    label: "Astroport",
    factory: "terra1fnywlw4edny3vw44x04xd67uzkdqluymgreu7g"
  },
  {
    id: "terraport-v2",
    label: "Terraport V2",
    factory: "terra1n75fgfc8clsssrm2k0fswgtzsvstdaah7la6sfu96szdu22xta0q57rqqr"
  },
  {
    id: "terraport-cpmm",
    label: "Terraport XYK",
    factory: "terra1m8zz7q49x8phrfwc0rxep77l2u6hf7tm2arv2rmzk5c9lg7p6ncqu3y4zg"
  },
  {
    id: "terraport-v3",
    label: "Terraport V3",
    factory: "terra1y55punu6m5cm8sgqdgt6ngevtyklaylc09qxputn6ksye4ptf9ysxmtyl6"
  },
  {
    id: "garuda-v1",
    label: "Garuda DeFi V1",
    factory: "terra18srpvety7xz28lw5g0f6cx9sw50hyvk3xk7up80ul4pdpauvq7jq5zcm98",
    mode: "garuda"
  },
  {
    id: "garuda-v2",
    label: "Garuda DeFi V2",
    factory: "terra1ypwj6sw25g0qcykv7mzmcvsndvx56r3yrgkaw3fds7yzwl7fwwcsnxkeh7",
    mode: "garuda"
  }
]
