# Open Source Attributions

Last reviewed: 2026-08-01

## Scope

This file begins the provenance record for the Burrito product family. It does
not replace dependency license files, an application-level `LICENSE`, or legal
review.

The project owner has confirmed that Burrito's product and code lineage began
from Terra Station and was subsequently substantially modified. The current
GitHub repository does not retain a GitHub fork relationship or an identifiable
Station base commit, so exact current file-level derivation remains to be
audited before a definitive distribution notice is issued.

A 2026-08-01 exact-content comparison found no SHA-256-identical files between
the current Burrito `src/` tree and Station Web at the reviewed reference
commit. Only `src/app/routes.tsx` and `src/pages/NotFound.tsx` shared the same
relative path, and neither had identical content. This confirms substantial
change but does not rule out rewritten or conceptually adapted source.

## Station Projects

### Station Web

- Source: https://github.com/stationmoney/station
- Reference reviewed: `fded3bb475bfb9839cbf9998a0275c686f2e7bbb`
- License: MIT
- Copyright notice at the reviewed source: Copyright (c) 2022 Terraform Labs,
  PTE.
- Burrito use: historical Web product and implementation lineage; current
  Burrito behavior is independently maintained.

### Station Mobile

- Source: https://github.com/stationmoney/station-mobile
- Reference reviewed: `a06fc67ccc2143a7799a17a13cec73156dfb9fb3`
- License declaration: Apache-2.0 in the reviewed README and `package.json`.
- Repository caveat: the reviewed root does not contain the full Apache-2.0
  license file. The complete license and applicable attribution must be added
  and reviewed in any Burrito repository that imports Station Mobile code.
- Burrito use: planned migration source for mobile product flows and selected
  implementation reference; legacy custody code is not approved for reuse.

### Station Extension

- Source: https://github.com/stationmoney/station-extension
- Reference reviewed: `9a1767bac51fa1d3b47418b2f959bc3da34dc30a`
- License: MIT
- Copyright notice at the reviewed source: Copyright (c) 2022 Terraform Labs,
  PTE.
- Burrito use: planned source for a later browser-extension migration; legacy
  vault and provider permissions require a new security review.

## Branding

Station and Terra trade names, logos, store artwork, screenshots, bundle IDs,
domains, and product identity are not treated as Burrito assets. Burrito
distributions will use Burrito-owned branding except where a source attribution
must name the original project.

## Required Follow-up

- Choose and add the license governing Burrito's original source code.
- Identify files in the current Web repository that contain substantial Station
  source and add file-level or directory-level attribution where required.
- Add a source-import register to each future Mobile and Extension repository.
- Preserve applicable third-party notices in source archives and binary/store
  distributions.
- Review image, font, token-logo, and other non-code asset rights separately
  from source-code licenses.
