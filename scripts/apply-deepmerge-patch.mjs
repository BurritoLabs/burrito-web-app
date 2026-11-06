import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const DEEPMERGE_ADVISORY = "https://github.com/advisories/GHSA-gcqx-w48m-w2h4"
export const DEEPMERGE_PATCH_FILES = {
  "index.js": ["12440c84957c1990ea2d5e33dc0091722dc1dc1585c6d20e0c780e568ffa9d30", "2270f84aba34ce469af96e5ebf9d6703854b1463f6450b50c12bd958500ae07e"],
  "dist/cjs.js": ["2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d", "a18bc1bcb0a285eed2280c1aae3c23bd9cd61bf3c3038dc06706bbbee19c9f42"],
  "dist/umd.js": ["f33e6596482d1fb5c7c427f8ef92f2aa849eea9223acd974176b2fb27ddbf73a", "ac73e83bcfefd4e39e9a2bee3d7ec478b3ba558c2ef71647d691b9737f6360e8"]
}
const digest = source => createHash("sha256").update(source).digest("hex")
const dataWrite = value => `Object.defineProperty(destination, key, { value: ${value}, enumerable: true, configurable: true, writable: true })`
const assignments = [
  "cloneUnlessOtherwiseSpecified(target[key], options)",
  "getMergeFunction(key, options)(target[key], source[key], options)",
  "cloneUnlessOtherwiseSpecified(source[key], options)"
]

// A local fix, not an upstream version exemption. Validate every locked copy and
// every shipped/source implementation before changing any installed file.
export const applyDeepmergePatch = (projectRoot, { verifyOnly = false } = {}) => {
  const root = path.resolve(projectRoot)
  const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"))
  const copies = Object.entries(lock.packages ?? {}).filter(([location]) =>
    location === "node_modules/deepmerge" || location.endsWith("/node_modules/deepmerge"))
  if (!copies.length) throw new Error("Reviewed deepmerge dependency is missing")
  const changes = []
  for (const [location, entry] of copies) {
    const directory = path.resolve(root, location)
    if (!directory.startsWith(`${path.join(root, "node_modules")}${path.sep}`)) throw new Error("Invalid dependency location")
    const installed = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"))
    if (entry.version !== "4.3.1" || installed.name !== "deepmerge" || installed.version !== "4.3.1") {
      throw new Error("Unreviewed deepmerge version; update the patch review")
    }
    for (const [file, [original, patched]] of Object.entries(DEEPMERGE_PATCH_FILES)) {
      const filename = path.join(directory, file)
      const source = readFileSync(filename, "utf8")
      const actual = digest(source)
      if (actual === patched) continue
      if (verifyOnly || actual !== original) throw new Error(`Deepmerge patch missing or changed: ${location}/${file}`)
      let result = source
      for (const value of assignments) {
        const before = `destination[key] = ${value}`
        if (result.split(before).length !== 2) throw new Error("Unexpected deepmerge assignment boundary")
        result = result.replace(before, dataWrite(value))
      }
      if (digest(result) !== patched) throw new Error("Unexpected deepmerge patched digest")
      changes.push([filename, result])
    }
  }
  for (const [filename, source] of changes) writeFileSync(filename, source)
  return { copies: copies.length, changed: changes.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url))
  const result = applyDeepmergePatch(root, { verifyOnly: process.argv.includes("--verify") })
  console.log(`Deepmerge local patch verified: ${result.copies} locked copy/copies; ${result.changed} files changed`)
}
