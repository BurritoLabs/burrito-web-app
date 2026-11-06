import { createServer, type Server } from "node:http"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { runInNewContext } from "node:vm"
import { expect, it } from "vitest"
import { z } from "zod"

const require = createRequire(import.meta.url)
const redirects = require("follow-redirects") as {
  http: {
    get: (url: string, options: Record<string, unknown>, callback: (response: import("node:http").IncomingMessage) => void) => import("node:http").ClientRequest
  }
}

const listen = (server: Server) => new Promise<number>((resolve, reject) => {
  server.once("error", reject)
  server.listen(0, "127.0.0.1", () => {
    const address = server.address()
    if (!address || typeof address === "string") return reject(new Error("Missing fixture port"))
    resolve(address.port)
  })
})

const close = (server: Server) => new Promise<void>((resolve, reject) => {
  server.closeAllConnections()
  server.close((error) => error ? reject(error) : resolve())
})

it("keeps foreign-realm sensitive headers protected across redirects without changing public headers", async () => {
  // Loopback only, synthetic headers; no wallet, real credential or external host.
  const echo = (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => {
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ secret: request.headers["x-fixture-private"] ?? null, public: request.headers["x-fixture-public"] }))
  }
  const destination = createServer(echo)
  const destinationPort = await listen(destination)
  const source = createServer((request, response) => {
    if (request.url === "/echo") return echo(request, response)
    response.writeHead(302, { location: request.url === "/same" ? "/echo" : `http://127.0.0.1:${destinationPort}/echo` })
    response.end()
  })
  try {
    const sourcePort = await listen(source)
    const read = (path: string, sensitiveHeaders: string[]) => new Promise<unknown>((resolve, reject) => {
      const request = redirects.http.get(`http://127.0.0.1:${sourcePort}${path}`, {
        headers: { "x-fixture-private": "synthetic-only", "x-fixture-public": "ordinary" },
        sensitiveHeaders
      }, (response) => {
        let body = ""
        response.setEncoding("utf8")
        response.on("data", (chunk: string) => { body += chunk })
        response.on("end", () => { try { resolve(JSON.parse(body)) } catch (error) { reject(error) } })
        response.on("error", reject)
      })
      request.setTimeout(2_000, () => request.destroy(new Error("Fixture timeout")))
      request.on("error", reject)
    })
    const foreign = () => runInNewContext("['X-Fixture-Private']") as string[]
    for (const names of [["X-Fixture-Private"], foreign()]) {
      expect(await read("/cross", names)).toEqual({ secret: null, public: "ordinary" })
    }
    expect(await read("/same", foreign())).toEqual({ secret: "synthetic-only", public: "ordinary" })
  } finally {
    await Promise.all([close(source), close(destination)])
  }
}, 10_000)

it("rejects oversized constrained Zod collections before parsing elements and accepts normal values", () => {
  for (const kind of ["array", "set"] as const) {
    let calls = 0
    const value = z.string().superRefine(() => { calls++ })
    const schema = kind === "array" ? z.array(value).max(2) : z.set(value).max(2)
    const input = (values: string[]) => kind === "array" ? values : new Set(values)
    expect(schema.safeParse(input(["one", "two", "three"])).success).toBe(false)
    expect(calls).toBe(0)
    expect(schema.safeParse(input(["one", "two"])).success).toBe(true)
    expect(calls).toBe(2)
  }
})

it("serializes comma-format query arrays with non-callable own toString without throwing", () => {
  const qs = require("qs") as { stringify: (input: unknown, options: Record<string, unknown>) => string }
  for (const encodeValuesOnly of [false, true]) {
    expect(() => qs.stringify({ a: [{ toString: "synthetic-only" }] }, {
      arrayFormat: "comma", encodeValuesOnly
    })).not.toThrow()
    expect(qs.stringify({ a: ["one", "two"] }, { arrayFormat: "comma", encodeValuesOnly }))
      .toBe(encodeValuesOnly ? "a=one,two" : "a=one%2Ctwo")
  }
})

it("preserves the actual TypeScript project-service allowlist consumer and isolated glob APIs", () => {
  const consumerPath = join(dirname(require.resolve("@typescript-eslint/typescript-estree")), "useProgramFromProjectService.js")
  const consumerRequire = createRequire(consumerPath)
  const consumerExports: { fixtureMatch?: (path: string, patterns?: string[]) => boolean } = {}
  // Execute the installed consumer, exposing only its private pure matcher; do not copy its implementation.
  runInNewContext(`${readFileSync(consumerPath, "utf8")}\nexports.fixtureMatch = filePathMatchedBy;`, {
    require: consumerRequire, exports: consumerExports, process, console, __filename: consumerPath, __dirname: dirname(consumerPath)
  })
  const match = consumerExports.fixtureMatch!
  expect(consumerRequire("minimatch/package.json").version).toBe("11.0.1")
  expect(typeof consumerRequire("minimatch").Minimatch).toBe("function")
  for (const [path, patterns, expected] of [
    ["config.ts", ["*.ts"], true],
    [".hidden.ts", ["*.ts"], true],
    ["配置.ts", ["*.ts"], true],
    ["src/配置.ts", ["src/*.ts"], true],
    ["src/nested/a.ts", ["src/*.ts"], false],
    ["config.js", ["*.ts"], false],
    ["src\\配置.ts", ["src/*.ts"], process.platform === "win32"],
    ["config.ts", undefined, false]
  ] as const) {
    expect(match(path, patterns ? [...patterns] : undefined), path).toBe(expected)
  }
  const { minimatch, Minimatch } = consumerRequire("minimatch")
  expect(minimatch("C:\\project\\配置.ts", "C:/project/*.ts", { platform: "win32", windowsPathsNoEscape: true })).toBe(true)
  expect(minimatch("C:\\project\\配置.ts", "C:/project/*.ts", { platform: "linux", windowsPathsNoEscape: true })).toBe(false)
  expect(new Minimatch("**/*.{ts,tsx}").match("src/配置.tsx")).toBe(true)
  // ESLint's older matcher must not be replaced by the scoped tooling override.
  const eslintRequire = createRequire(require.resolve("eslint"))
  expect(eslintRequire("minimatch/package.json").version).toMatch(/^3\./)
})

it("bounds excessive glob preprocessing in an isolated subprocess", () => {
  const consumerPath = require.resolve("@typescript-eslint/typescript-estree")
  const result = spawnSync(process.execPath, ["-e", `
    const { createRequire } = require('node:module');
    const { Minimatch } = createRequire(${JSON.stringify(consumerPath)})('minimatch');
    const matcher = new Minimatch(('**/../').repeat(12) + '*.ts', { optimizationLevel: 2 });
    if (typeof matcher.match('src/config.ts') !== 'boolean') process.exit(2);
  `], { timeout: 3_000, encoding: "utf8", windowsHide: true })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
})
