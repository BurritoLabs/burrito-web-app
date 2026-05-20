import type { ProposalItem } from "../data/classic"

export type GovernanceTabKey =
  | "all"
  | "voting"
  | "deposit"
  | "passed"
  | "rejected"

export type ProposalGroups = Record<Exclude<GovernanceTabKey, "all">, ProposalItem[]>

export const formatGovernanceProposalType = (type?: string) => {
  if (!type) return "Proposal"
  const last = type.split(".").pop() ?? type
  const cleaned = last.replace("Proposal", "").replace(/^Msg/, "")
  const spaced = cleaned.replace(/([A-Z])/g, " $1").trim()
  const label = spaced.length ? spaced.toLowerCase() : "proposal"
  return last.startsWith("Msg") ? `Msg ${label}` : label
}

export const governanceSafeRatio = (num: bigint, den: bigint) => {
  try {
    if (den === 0n) return 0
    const scaled = (num * 1_000_000n) / den
    return Number(scaled) / 1_000_000
  } catch {
    return 0
  }
}

export const governanceToBigInt = (value?: string | number) => {
  try {
    if (value === undefined || value === null) return 0n
    const raw = typeof value === "number" ? Math.trunc(value).toString() : value
    return BigInt(raw)
  } catch {
    return 0n
  }
}

export const formatGovernanceDurationLabel = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--"
  const days = seconds / 86_400
  if (Number.isInteger(days) && days >= 1) {
    return `${days} day${days === 1 ? "" : "s"}`
  }
  const hours = seconds / 3_600
  if (Number.isInteger(hours) && hours >= 1) {
    return `${hours} hour${hours === 1 ? "" : "s"}`
  }
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

export const groupProposalsByStatus = (proposals: ProposalItem[]) => {
  const groups: ProposalGroups = {
    voting: [],
    deposit: [],
    passed: [],
    rejected: []
  }

  proposals.forEach((proposal) => {
    const status = String(proposal.status).toUpperCase()
    if (status.includes("VOTING")) groups.voting.push(proposal)
    else if (status.includes("DEPOSIT")) groups.deposit.push(proposal)
    else if (status.includes("PASSED")) groups.passed.push(proposal)
    else if (status.includes("REJECTED")) groups.rejected.push(proposal)
  })

  return groups
}
