import { readFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"

const baselineUrl = new URL("./dependency-audit-baseline.json", import.meta.url)
const baseline = JSON.parse(await readFile(baselineUrl, "utf8"))

const npmCli = process.env.npm_execpath
const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm"
const args = npmCli
  ? [npmCli, "audit", "--omit=dev", "--json"]
  : ["audit", "--omit=dev", "--json"]
const result = spawnSync(command, args, {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
  windowsHide: true
})

if (result.error) {
  console.error(`DEPENDENCY_AUDIT_FAILED error=${result.error.message}`)
  process.exit(1)
}

let report
try {
  report = JSON.parse(result.stdout)
} catch {
  console.error("DEPENDENCY_AUDIT_FAILED error=invalid npm audit JSON")
  if (result.stderr.trim()) console.error(result.stderr.trim())
  process.exit(1)
}

if (report.error || !report.metadata?.vulnerabilities || !report.vulnerabilities) {
  const message = report.error?.summary || report.error?.detail || "incomplete npm audit response"
  console.error(`DEPENDENCY_AUDIT_FAILED error=${message}`)
  process.exit(1)
}

const severities = report.metadata.vulnerabilities
const elevated = ["moderate", "high", "critical"].filter(
  (severity) => Number(severities[severity] ?? 0) > 0
)
const lowPackages = Object.entries(report.vulnerabilities ?? {})
  .filter(([, vulnerability]) => vulnerability?.severity === "low")
  .map(([name]) => name)
  .sort()
const allowed = new Set(baseline.allowedLowPackages)
const unexpected = lowPackages.filter((name) => !allowed.has(name))
const lowCount = Number(severities.low ?? lowPackages.length)

const failures = []
if (elevated.length > 0) {
  failures.push(`elevated severities: ${elevated.join(", ")}`)
}
if (lowCount > baseline.maxLow) {
  failures.push(`low count ${lowCount} exceeds baseline ${baseline.maxLow}`)
}
if (unexpected.length > 0) {
  failures.push(`new low-risk packages: ${unexpected.join(", ")}`)
}

if (failures.length > 0) {
  console.error(`DEPENDENCY_AUDIT_FAILED ${failures.join("; ")}`)
  console.error("Review docs/dependency-audit.md before updating the baseline.")
  process.exit(1)
}

if (new Date() > new Date(`${baseline.reviewBy}T23:59:59Z`)) {
  console.warn(`DEPENDENCY_AUDIT_REVIEW_DUE review_by=${baseline.reviewBy}`)
}

console.log(
  `DEPENDENCY_AUDIT_OK low=${lowCount} moderate=${severities.moderate ?? 0} high=${severities.high ?? 0} critical=${severities.critical ?? 0} review_by=${baseline.reviewBy}`
)
