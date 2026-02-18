# Terra Classic DEX Factory Contracts

Verification method (Classic):

1. Factory contract must answer both smart queries:
   - `{ "config": {} }`
   - `{ "pairs": { "limit": 1 }`
2. Pair coverage cross-check source:
   - `https://assets.terra.dev/cw20/pairs.dex.json` (`classic` set only)

`phoenix` is excluded (not Classic DEX scope for this app).

## Active factories (indexed pairs found)

- Terraswap (primary): `terra1jkndu9w5attpz09ut02sgey5dd3e8sq5watzm0` (79 pairs)
- Terraswap V1: `terra1ulgw0td86nvs4wtpsc80thv6xelk76ut7a7apj` (2 pairs)
- Astroport (primary): `terra1fnywlw4edny3vw44x04xd67uzkdqluymgreu7g` (26 pairs)
- Terraport V2: `terra1n75fgfc8clsssrm2k0fswgtzsvstdaah7la6sfu96szdu22xta0q57rqqr` (2 pairs)
- Terraport XYK: `terra1m8zz7q49x8phrfwc0rxep77l2u6hf7tm2arv2rmzk5c9lg7p6ncqu3y4zg` (code 9251)
- Terraport V3: `terra1y55punu6m5cm8sgqdgt6ngevtyklaylc09qxputn6ksye4ptf9ysxmtyl6` (1 pair)

## Factory contracts found but currently no indexed pairs

- Astroport factory: `terra1srmt7smgrafsfuk40ulscuh5x2yj4pn3qne43r`
- Astroport factory: `terra17thfrxneg0sfv74p580c6lxppuy9fu2x499cjs`
- Terraport V3 factory: `terra1cl9883egl8nl0p44fkyshtx4wa72p4xdw6z39j330r9a0q273ylsrpker9`
- Terraport V3 factory: `terra1qrec4zylcgrkcl2s5trrz9ysgywuqsr49r7yxgxw0lysunxlm89smwhu3g`

## Notes

- If a DEX launches another factory, it will appear as a new contract that answers the two smart queries above.
- The in-app Swap route list currently uses the active factory set.
- `phoenix` is intentionally excluded from routing in this app (user requirement: Classic DEX set only).
- For these websites, no standard Terraswap-style `config + pairs` factory contract was discovered from public frontend bundles:
  - Garuda DeFi
  - WESO
  - LUNCSwap
  - Terra.pump
  - LUNCPump
  - White Whale
