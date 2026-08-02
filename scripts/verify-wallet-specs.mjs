import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { fromBech32 } from "@cosmjs/encoding"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8"))

const fail = (message) => {
  throw new Error(`Wallet spec verification failed: ${message}`)
}

const registry = await readJson("specs/wallet/chain-registry.v1.json")
const intentSchema = await readJson(
  "specs/wallet/transaction-intent.v1.schema.json"
)
const isolation = await readJson("specs/wallet/fixtures/chain-isolation.v1.json")
const intentFixtures = await readJson(
  "specs/wallet/fixtures/transaction-intents.v1.json"
)
const source = await readFile(path.join(projectRoot, registry.generatedFrom), "utf8")
const sourceSha256 = createHash("sha256").update(source).digest("hex")

if (registry.version !== 1) fail("unsupported chain-registry version")
if (registry.keyAlgorithm !== "secp256k1") fail("unexpected key algorithm")
if (sourceSha256 !== registry.sourceSha256) {
  fail(
    `${registry.generatedFrom} changed; review the mobile registry and refresh sourceSha256`
  )
}

const expectedChains = new Map([
  ["lunc", "columbus-5"],
  ["luna", "phoenix-1"]
])
const chainIds = new Set()

for (const chain of registry.chains) {
  if (expectedChains.get(chain.key) !== chain.chainId) {
    fail(`unexpected chain mapping ${chain.key}:${chain.chainId}`)
  }
  if (chainIds.has(chain.chainId)) fail(`duplicate chainId ${chain.chainId}`)
  chainIds.add(chain.chainId)
  if (chain.bech32Prefix !== "terra") fail(`${chain.chainId} prefix drifted`)
  if (chain.coinType !== 330) fail(`${chain.chainId} coin type drifted`)
  if (chain.nativeAsset?.minimalDenom !== "uluna") {
    fail(`${chain.chainId} native denom drifted`)
  }
  if (!Array.isArray(chain.feeAssets) || chain.feeAssets.length === 0) {
    fail(`${chain.chainId} has no fee assets`)
  }
  for (const endpointType of ["rpc", "lcd", "fcd"]) {
    const endpoints = chain.endpoints?.[endpointType]
    if (!Array.isArray(endpoints) || endpoints.length === 0) {
      fail(`${chain.chainId} has no ${endpointType} endpoint`)
    }
    for (const endpoint of endpoints) {
      if (!endpoint.startsWith("https://")) {
        fail(`${chain.chainId} contains a non-HTTPS ${endpointType} endpoint`)
      }
    }
  }
}

if (chainIds.size !== expectedChains.size) fail("supported chain count drifted")

const schemaChainIds = new Set(intentSchema.properties?.chainId?.enum ?? [])
if (
  schemaChainIds.size !== chainIds.size ||
  [...chainIds].some((chainId) => !schemaChainIds.has(chainId))
) {
  fail("transaction-intent schema chain list drifted from the registry")
}
if (!intentSchema.required?.includes("chainId")) {
  fail("transaction-intent schema must require chainId")
}

const isValidTerraAddress = (value) => {
  if (typeof value !== "string") return false
  try {
    const decoded = fromBech32(value)
    return decoded.prefix === "terra" && decoded.data.length === 20
  } catch {
    return false
  }
}

const isolationKeys = new Set()
for (const fixture of isolation.cases) {
  const { chainId, address } = fixture.accountRef ?? {}
  if (!chainIds.has(chainId)) fail(`${fixture.name} uses an unsupported chain`)
  if (!isValidTerraAddress(address)) fail(`${fixture.name} has an invalid address`)
  const expectedKey = `${chainId}:${address}`
  if (fixture.cacheKey !== expectedKey) fail(`${fixture.name} cache key is unsafe`)
  if (fixture.transactionQueueKey !== expectedKey) {
    fail(`${fixture.name} transaction queue key is unsafe`)
  }
  isolationKeys.add(`${fixture.accountRef.source}:${fixture.cacheKey}`)
}
if (isolationKeys.size !== isolation.cases.length) {
  fail("chain/source isolation fixtures contain a collision")
}

const isUnsignedInteger = (value) =>
  typeof value === "string" && /^[0-9]+$/.test(value)

const validateIntent = (intent) => {
  if (intent?.version !== 1 || !chainIds.has(intent.chainId)) return false
  if (!isValidTerraAddress(intent.account)) return false
  if (!Array.isArray(intent.messages) || intent.messages.length === 0) return false
  if (typeof intent.memo !== "string" || typeof intent.origin !== "string") {
    return false
  }
  if (intent.fee) {
    if (!isUnsignedInteger(intent.fee.gas)) return false
    if (!Array.isArray(intent.fee.amount) || intent.fee.amount.length === 0) {
      return false
    }
    if (
      intent.fee.amount.some(
        (coin) => !coin.denom || !isUnsignedInteger(coin.amount)
      )
    ) {
      return false
    }
  }
  return intent.messages.every(
    (message) =>
      typeof message?.typeUrl === "string" &&
      message.typeUrl.startsWith("/") &&
      message.value &&
      typeof message.value === "object"
  )
}

for (const fixture of intentFixtures.valid) {
  if (!validateIntent(fixture.intent)) fail(`${fixture.name} should be valid`)
}
for (const fixture of intentFixtures.mustReject) {
  if (validateIntent(fixture.intent)) fail(`${fixture.name} should be rejected`)
}

console.log(
  `Wallet specs verified: ${chainIds.size} chains, ${isolation.cases.length} isolation cases, ${intentFixtures.valid.length} valid intents, ${intentFixtures.mustReject.length} rejection cases.`
)
