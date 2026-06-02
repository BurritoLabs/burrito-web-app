import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

const distDir = path.resolve("dist")
const assetsDir = path.join(distDir, "assets")
const maxInitialJsBytes = 700 * 1024
const maxAsyncJsBytes = 1200 * 1024
const forbiddenRuntimeChunks = [/WalletRuntimeProvider/i]

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`

const fail = (message) => {
  console.error(message)
  process.exitCode = 1
}

const files = await readdir(assetsDir)
const jsFiles = files.filter((file) => file.endsWith(".js"))
const jsStats = await Promise.all(
  jsFiles.map(async (file) => ({
    file,
    size: (await stat(path.join(assetsDir, file))).size
  }))
)

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
  if (item.size > maxAsyncJsBytes) {
    fail(
      `Async JS chunk too large: ${item.file} is ${formatBytes(item.size)} > ${formatBytes(
        maxAsyncJsBytes
      )}`
    )
  }

  if (forbiddenRuntimeChunks.some((pattern) => pattern.test(item.file))) {
    fail(`Forbidden wallet runtime chunk emitted: ${item.file}`)
  }
}

if (!process.exitCode) {
  const largest = [...jsStats].sort((a, b) => b.size - a.size).slice(0, 5)
  console.log(`Initial JS: ${formatBytes(initialBytes)}`)
  console.log("Largest JS chunks:")
  for (const item of largest) {
    console.log(`- ${item.file}: ${formatBytes(item.size)}`)
  }
}
