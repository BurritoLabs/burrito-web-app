import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const indexPath = path.join(root, "public", "market", "index.json")
const payload = JSON.parse(fs.readFileSync(indexPath, "utf8"))
const errors = []
let ustcPairs = 0
let ibcPairs = 0
let ignoredDuplicateAssetPairs = 0

const toPoolAssetId = (asset) =>
  asset.startsWith("terra1") ? `cw20:${asset.toLowerCase()}` : `native:${asset}`

for (const [index, pair] of (payload.pairs ?? []).entries()) {
  const label = pair.pair || `pair[${index}]`
  if (!Array.isArray(pair.assets) || pair.assets.length !== 2) {
    errors.push(`${label}: expected exactly two pair assets`)
    continue
  }
  if (!Array.isArray(pair.poolAssets) || pair.poolAssets.length !== 2) {
    errors.push(`${label}: expected exactly two pool assets`)
    continue
  }

  const expectedIds = pair.assets.map(toPoolAssetId)
  const actualIds = pair.poolAssets.map((asset) => asset?.id)
  if (expectedIds.some((id, assetIndex) => id !== actualIds[assetIndex])) {
    errors.push(
      `${label}: pair assets ${expectedIds.join(",")} do not match pool assets ${actualIds.join(",")}`
    )
  }
  if (new Set(expectedIds).size !== expectedIds.length) {
    ignoredDuplicateAssetPairs += 1
  }

  if (pair.assets.includes("uusd")) {
    ustcPairs += 1
    if (!actualIds.includes("native:uusd")) {
      errors.push(`${label}: Classic uusd must remain native:uusd`)
    }
  }
  if (pair.assets.some((asset) => asset.startsWith("ibc/"))) {
    ibcPairs += 1
    if (pair.assets.some((asset) => asset === "ibc/uusd")) {
      errors.push(`${label}: invalid IBC alias; use the full IBC hash`)
    }
  }
}

if (errors.length) {
  console.error(`Market asset identity check failed with ${errors.length} error(s):`)
  errors.slice(0, 50).forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log(
  `Market asset identities verified: ${payload.pairs?.length ?? 0} indexed pairs, ${ustcPairs} USTC pairs, ${ibcPairs} IBC pairs, ${ignoredDuplicateAssetPairs} duplicate-asset pools ignored by the app.`
)
