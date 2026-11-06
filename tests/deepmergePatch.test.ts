import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { runInNewContext } from "node:vm"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { applyDeepmergePatch } from "../scripts/apply-deepmerge-patch.mjs"
import { verifiedLocalDependencyFixes } from "../scripts/local-dependency-fixes.mjs"

const require = createRequire(import.meta.url)
type Merge = ((target: unknown, source: unknown, options?: Record<string, unknown>) => Record<PropertyKey, unknown>) & { all: (items: unknown[]) => unknown }
const installed = require("deepmerge") as Merge
const root = fileURLToPath(new URL("../", import.meta.url))

const load = (file: string): Merge => {
  const source = readFileSync(require.resolve(`deepmerge/${file}`), "utf8")
  const options: Record<string, unknown> = {}
  installed({}, {}, options)
  const module = { exports: {} }
  runInNewContext(source, { module, exports: module.exports, require: (name: string) => {
    if (name !== "is-mergeable-object") throw new Error("Unexpected fixture import")
    return options.isMergeableObject
  } })
  return module.exports as Merge
}

describe.each(["index.js", "dist/cjs.js", "dist/umd.js"])("deepmerge %s write boundary", file => {
  it("copies an own prototype-named property without changing the result prototype", () => {
    const merge = load(file)
    const ordinaryPrototype = Object.getPrototypeOf(merge({}, {}))
    const target = JSON.parse('{"__proto__":{"fixtureUnexpected":true},"ordinary":1}')
    const result = merge(target, {})
    expect(Object.getPrototypeOf(result)).toBe(ordinaryPrototype)
    expect(result.fixtureUnexpected).toBeUndefined()
    expect(Object.hasOwn(result, "__proto__")).toBe(true)
    expect(result.ordinary).toBe(1)
    expect(({} as Record<string, unknown>).fixtureUnexpected).toBeUndefined()
  })
  it("protects null-prototype input, recursive results, arrays and custom merges", () => {
    const merge = load(file)
    const ordinaryPrototype = Object.getPrototypeOf(merge({}, {}))
    const own = () => JSON.parse('{"__proto__":{"fixtureUnexpected":true}}')
    for (const result of [
      merge(Object.create(null), own()),
      merge(own(), own()),
      merge(own(), own(), { customMerge: () => () => ({ fixtureUnexpected: true }) }),
      (merge({ list: [] }, { list: [own()] }).list as unknown[])[0]
    ]) {
      expect(Object.getPrototypeOf(result)).toBe(ordinaryPrototype)
      expect((result as Record<string, unknown>).fixtureUnexpected).toBeUndefined()
    }
  })
  it("retains ordinary merge options, data keys, symbols, exclusions and array cloning", () => {
    const merge = load(file)
    const symbol = Symbol("ordinary")
    const source = Object.create({ inherited: 1 })
    source.nested = { right: 2 }
    source[symbol] = "symbol value"
    source.list = [2]
    Object.defineProperty(source, "hidden", { enumerable: false, value: 1 })
    const result = merge({ nested: { left: 1 }, list: [1] }, source)
    expect(result).toMatchObject({ nested: { left: 1, right: 2 }, list: [1, 2], [symbol]: "symbol value" })
    expect(result.inherited).toBeUndefined()
    expect(result.hidden).toBeUndefined()
    const retained = { value: 1 }
    expect(merge({}, { retained }, { clone: false }).retained).toBe(retained)
    expect(merge({}, { retained }, { isMergeableObject: () => false }).retained).toBe(retained)
    expect(merge({ constructor: "data", prototype: "data" }, {})).toMatchObject({ constructor: "data", prototype: "data" })
    expect(merge.all([{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 })
  })
})

it("requires the version-bound patch on every locked implementation and is idempotent", () => {
  expect(applyDeepmergePatch(root, { verifyOnly: true })).toMatchObject({ copies: 1, changed: 0 })
  expect(applyDeepmergePatch(root)).toMatchObject({ changed: 0 })
})

it("audit mitigation requires the exact advisory graph, not a new package or severity waiver", () => {
  const advisory = { name: "deepmerge", severity: "low", url: "https://github.com/advisories/GHSA-gcqx-w48m-w2h4" }
  const vulnerabilities = {
    deepmerge: { severity: "low", via: [advisory] },
    "@keplr-wallet/provider": { severity: "low", via: ["deepmerge"] },
    "@keplr-wallet/provider-extension": { severity: "low", via: ["deepmerge", { ...advisory, url: "https://example.invalid/new-advisory" }] },
    "@keplr-wallet/wc-client": { severity: "low", via: ["deepmerge", "unknown"] },
    "new-consumer": { severity: "low", via: ["deepmerge"] }
  }
  expect(verifiedLocalDependencyFixes({ vulnerabilities }, root)).toEqual(["deepmerge", "@keplr-wallet/provider"])
  expect(verifiedLocalDependencyFixes({ vulnerabilities: { deepmerge: { severity: "high", via: [advisory] } } }, root)).toEqual([])
})
