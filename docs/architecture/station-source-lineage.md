# Station Source Lineage

Last verified: 2026-08-01

## Purpose

This document records the upstream Station projects that may be used as
reference material or migration sources for the Burrito wallet ecosystem. It
exists to preserve provenance while Burrito develops independently.

The Burrito product and codebase have historical Station lineage, as confirmed
by the project owner. The current `BurritoLabs/burrito-web-app` repository is
not connected to a Station fork network on GitHub, and its visible local
history begins with a Burrito scaffold in January 2026. This distinction does
not erase the product lineage; it means future imports need explicit source
records rather than relying on GitHub fork metadata.

## Pinned Upstreams

| Component | Repository | Reference commit | Upstream status at verification | Declared license | Intended Burrito use |
| --- | --- | --- | --- | --- | --- |
| Mobile | [`stationmoney/station-mobile`](https://github.com/stationmoney/station-mobile) | [`a06fc67ccc2143a7799a17a13cec73156dfb9fb3`](https://github.com/stationmoney/station-mobile/commit/a06fc67ccc2143a7799a17a13cec73156dfb9fb3) | Not archived; latest commit at the pinned head is dated 2023-08-29 | `package.json` and README declare Apache-2.0; the pinned root does not contain a full `LICENSE` file | Product flow and implementation reference for iOS/Android migration |
| Extension | [`stationmoney/station-extension`](https://github.com/stationmoney/station-extension) | [`9a1767bac51fa1d3b47418b2f959bc3da34dc30a`](https://github.com/stationmoney/station-extension/commit/9a1767bac51fa1d3b47418b2f959bc3da34dc30a) | Not archived; latest commit at the pinned head is dated 2024-04-23 | MIT | Later Chrome/Firefox wallet migration source |
| Web | [`stationmoney/station`](https://github.com/stationmoney/station) | [`fded3bb475bfb9839cbf9998a0275c686f2e7bbb`](https://github.com/stationmoney/station/commit/fded3bb475bfb9839cbf9998a0275c686f2e7bbb) | Not archived; latest commit at the pinned head is dated 2024-03-07 | MIT | Historical reference only; not an upstream merge target for the current Burrito Web app |

The commit pins are evidence anchors, not automatic dependency choices. Any
later source import must record the exact commit actually used.

## Current Web Comparison

On 2026-08-01, the 214 files under the current Burrito `src/` tree were
compared by SHA-256 content hash with the 672 files under Station Web `src/` at
the pinned commit.

- Exact content matches: `0`.
- Identical relative paths: `2` (`src/app/routes.tsx` and
  `src/pages/NotFound.tsx`).
- The two same-path files did not have identical content.

This supports the owner's description that Burrito has been substantially
modified. An exact-hash comparison cannot identify rewritten, translated,
reformatted, or conceptually adapted code, so it does not remove the need for
the historical attribution or a deeper file-level review where provenance is
uncertain.

## Licensing Rules

- Do not copy Station code into a Burrito distribution without recording the
  upstream repository, commit, path, license, Burrito destination, and a short
  description of the modifications.
- Preserve applicable copyright, license, patent, trademark, and attribution
  notices in imported source.
- Include the complete upstream license text in the repository or distribution
  that contains imported code.
- Record prominent modification notices where Apache-2.0 requires them.
- If an upstream `NOTICE` file exists at the selected commit, preserve its
  applicable notices in the derivative distribution.
- Treat Station and Terra names, logos, screenshots, store artwork, bundle
  identifiers, and domains as branding assets, not automatically reusable
  source code. Burrito releases must use Burrito branding.
- The mobile repository's Apache-2.0 declaration should receive a focused legal
  review before commercial distribution because the pinned repository root
  does not provide the full license file.

This inventory is engineering provenance, not legal advice and not a license
grant for Burrito's original code.

## Import Record Template

Every copied or substantially adapted source unit should add a row to the
destination repository's source-import register.

| Imported at | Upstream repository | Commit | Upstream path | License | Burrito path | Change summary |
| --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | owner/repository | full SHA | path/to/file | SPDX identifier | path/to/file | What Burrito changed |

## Upstream Policy

Station is a source of ideas and selected implementation material, not the
ongoing architecture authority for Burrito.

- Do not merge or rebase the current Burrito Web app against Station Web.
- Review upstream security fixes and port only the relevant behavior.
- Compare generated transaction messages and signing bytes before accepting a
  wallet-related port.
- Never replace a currently verified Burrito chain, fee, tax, memo, DEX, or
  broadcast rule merely because the older Station implementation differs.
