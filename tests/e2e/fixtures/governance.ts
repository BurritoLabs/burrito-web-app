import type { Page } from "@playwright/test"

// Fixed, unfunded read-only records: rendering coverage must not depend on a
// live chain currently having a proposal in every status or replying before Axe.
export const governanceFixtures = [
  ["Voting", "VOTING_PERIOD"],
  ["Deposit", "DEPOSIT_PERIOD"],
  ["Passed", "PASSED"],
  ["Rejected", "REJECTED"]
].map(([label, status], index) => ({
  label,
  tab: label.toLowerCase(),
  proposal: {
    id: String(99001 + index),
    status: `PROPOSAL_STATUS_${status}`,
    title: `QA ${label} proposal`,
    summary: "Read-only governance presentation fixture.",
    submit_time: "2026-09-01T00:00:00Z",
    deposit_end_time: "2026-10-15T00:00:00Z",
    voting_end_time: "2026-10-30T00:00:00Z",
    total_deposit: [{ denom: "uluna", amount: "1000000" }],
    final_tally_result: {
      yes_count: "1000000", no_count: "0", abstain_count: "0", no_with_veto_count: "0"
    }
  }
}))

export const installGovernanceFixtures = async (page: Page) => {
  await page.route(/\/cosmos\/gov\/v1(?:beta1)?\//, async (route) => {
    if (route.request().method() !== "GET") return route.abort("blockedbyclient")
    const url = new URL(route.request().url())
    const suffix = url.pathname.split(/\/cosmos\/gov\/v1(?:beta1)?\//)[1]
    if (suffix === "proposals") {
      return route.fulfill({ json: {
        proposals: governanceFixtures.map((fixture) => fixture.proposal)
          .filter((proposal) => proposal.status === url.searchParams.get("proposal_status")),
        pagination: { next_key: null }
      } })
    }
    const detail = suffix.match(/^proposals\/(\d+)$/)
    if (detail) {
      const proposal = governanceFixtures.find((fixture) => fixture.proposal.id === detail[1])?.proposal
      return route.fulfill({ status: proposal ? 200 : 404, json: { proposal } })
    }
    if (suffix.endsWith("/tally")) return route.fulfill({ json: { tally: governanceFixtures[0].proposal.final_tally_result } })
    if (suffix.endsWith("/votes")) return route.fulfill({ json: { votes: [], pagination: { next_key: null } } })
    if (suffix.endsWith("/deposits")) return route.fulfill({ json: { deposits: [], pagination: { next_key: null } } })
    if (suffix === "params/voting") return route.fulfill({ json: { voting_params: { voting_period: "604800s" } } })
    if (suffix === "params/deposit") return route.fulfill({ json: { deposit_params: { min_deposit: [{ denom: "uluna", amount: "2000000" }], max_deposit_period: "604800s" } } })
    if (suffix === "params/tallying") return route.fulfill({ json: { tally_params: { quorum: "0.334", threshold: "0.5", veto_threshold: "0.334" } } })
    return route.abort("blockedbyclient")
  })
  await page.route(/\/cosmos\/staking\/v1beta1\/pool(?:\?|$)/, (route) => route.fulfill({ json: { pool: { bonded_tokens: "10000000" } } }))
  await page.route(/\/cosmos\/staking\/v1beta1\/validators(?:\?|$)/, (route) => route.fulfill({ json: { validators: [], pagination: { next_key: null } } }))
}
