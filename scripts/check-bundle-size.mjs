import { gzipSync } from "node:zlib"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

const distDir = path.resolve("dist")
const assetsDir = path.join(distDir, "assets")
const maxInitialJsBytes = 700 * 1024
const maxAsyncJsBytes = 1200 * 1024
const maxAsyncGzipBytes = 320 * 1024
const maxWalletRuntimeBytes = 1600 * 1024
const maxWalletRuntimeGzipBytes = 450 * 1024
const maxWalletRuntimeStaticGzipBytes = 1050 * 1024
const walletRuntimeChunks = [/WalletRuntimeProvider/i]

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`

const fail = (message) => {
  console.error(message)
  process.exitCode = 1
}

const files = await readdir(assetsDir)
const jsFiles = files.filter((file) => file.endsWith(".js"))
const jsStats = await Promise.all(
  jsFiles.map(async (file) => {
    const filePath = path.join(assetsDir, file)
    const contents = await readFile(filePath)
    return {
      file,
      size: (await stat(filePath)).size,
      gzipSize: gzipSync(contents).byteLength
    }
  })
)
const jsStatsByFile = new Map(jsStats.map((item) => [item.file, item]))

const html = await readFile(path.join(distDir, "index.html"), "utf8")
const initialScripts = [...html.matchAll(/<script[^>]+src="\/assets\/([^"]+\.js)"/g)]
  .map((match) => match[1])
const initialScriptSet = new Set(initialScripts)
const initialBytes = jsStats
  .filter((item) => initialScriptSet.has(item.file))
  .reduce((sum, item) => sum + item.size, 0)

if (initialBytes > maxInitialJsBytes) {
  fail(
    `Initial JS budget exceeded: ${formatBytes(initialBytes)} > ${formatBytes(
      maxInitialJsBytes
    )}`
  )
}

for (const item of jsStats) {
  const isWalletRuntime = walletRuntimeChunks.some((pattern) => pattern.test(item.file))

  if (!isWalletRuntime && item.size > maxAsyncJsBytes) {
    fail(
      `Async JS chunk too large: ${item.file} is ${formatBytes(item.size)} > ${formatBytes(
        maxAsyncJsBytes
      )}`
    )
  }

  if (!isWalletRuntime && item.gzipSize > maxAsyncGzipBytes) {
    fail(
      `Async JS gzip chunk too large: ${item.file} is ${formatBytes(
        item.gzipSize
      )} > ${formatBytes(maxAsyncGzipBytes)}`
    )
  }

  if (isWalletRuntime && item.size > maxWalletRuntimeBytes) {
    fail(
      `Wallet runtime chunk too large: ${item.file} is ${formatBytes(
        item.size
      )} > ${formatBytes(maxWalletRuntimeBytes)}`
    )
  }

  if (isWalletRuntime && item.gzipSize > maxWalletRuntimeGzipBytes) {
    fail(
      `Wallet runtime gzip chunk too large: ${item.file} is ${formatBytes(
        item.gzipSize
      )} > ${formatBytes(maxWalletRuntimeGzipBytes)}`
    )
  }

  if (initialScriptSet.has(item.file) && isWalletRuntime) {
    fail(`Wallet runtime chunk must stay async: ${item.file}`)
  }
}

const manifestPath = path.join(distDir, ".vite", "manifest.json")
const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
const walletRuntimeEntry = Object.values(manifest).find((entry) =>
  walletRuntimeChunks.some((pattern) => pattern.test(entry.file ?? ""))
)
const signingClientEntry = manifest["src/app/wallet/signingClient.ts"]

if (!walletRuntimeEntry) {
  fail("Wallet runtime entry is missing from the Vite manifest")
} else {
  const staticFiles = new Set()
  const visitStaticImports = (entry) => {
    if (!entry?.file || staticFiles.has(entry.file)) return
    staticFiles.add(entry.file)
    for (const importedKey of entry.imports ?? []) {
      visitStaticImports(manifest[importedKey])
    }
  }
  visitStaticImports(walletRuntimeEntry)

  const staticGzipBytes = [...staticFiles].reduce(
    (sum, file) => sum + (jsStatsByFile.get(path.basename(file))?.gzipSize ?? 0),
    0
  )
  if (staticGzipBytes > maxWalletRuntimeStaticGzipBytes) {
    fail(
      `Wallet runtime static load is ${formatBytes(staticGzipBytes)} gzip > ${formatBytes(
        maxWalletRuntimeStaticGzipBytes
      )}`
    )
  }
  if (signingClientEntry?.file && staticFiles.has(signingClientEntry.file)) {
    fail("Signing client must not be a static wallet runtime dependency")
  }
  console.log(
    `Wallet runtime static load: ${formatBytes(staticGzipBytes)} gzip across ${staticFiles.size} chunks`
  )
}

if (!process.exitCode) {
  const largest = [...jsStats].sort((a, b) => b.size - a.size).slice(0, 5)
  console.log(`Initial JS: ${formatBytes(initialBytes)}`)
  console.log("Largest JS chunks:")
  for (const item of largest) {
    console.log(
      `- ${item.file}: ${formatBytes(item.size)} (${formatBytes(item.gzipSize)} gzip)`
    )
  }
}
