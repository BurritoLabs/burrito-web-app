import { applyDeepmergePatch, DEEPMERGE_ADVISORY } from "./apply-deepmerge-patch.mjs"

const reviewedConsumers = ["deepmerge", "@keplr-wallet/provider", "@keplr-wallet/provider-extension", "@keplr-wallet/wc-client"]

export const verifiedLocalDependencyFixes = (report, root) => {
  applyDeepmergePatch(root, { verifyOnly: true })
  const exclusivelyFixed = (name, ancestors = new Set()) => {
    if (ancestors.has(name)) return false
    const vulnerability = report.vulnerabilities?.[name]
    if (vulnerability?.severity !== "low" || !vulnerability.via?.length) return false
    const next = new Set([...ancestors, name])
    return vulnerability.via.every(via => typeof via === "string"
      ? exclusivelyFixed(via, next)
      : via.url === DEEPMERGE_ADVISORY && via.name === "deepmerge" && via.severity === "low")
  }
  // A newly reported package, another advisory, unknown graph edge or severity
  // increase still fails the original audit baseline. No blanket version waiver.
  return reviewedConsumers.filter(name => exclusivelyFixed(name))
}
