# Frozen Yard public-media delivery

This packages reviewed media without generating, re-encoding, or activating it.
The release/acceptance gates and scene request/decode policies are unchanged.

## Exact runtime graph

`scripts/yard-public-media.json` pins URL, byte size, MIME type and SHA-256 for
exactly the actor-manifest/page/still URL graph, including extra source clips:

| Public root | Files | Encoded bytes |
| --- | ---: | ---: |
| `/assets/yard-family/` | 4 JSON manifests | 6,286,213 |
| `/assets/yard-fox/` | 375 WebPs | 97,542,196 |
| `/assets/yard-turtles/` | 327 WebPs | 88,825,024 |
| Total | 706 | 192,653,433 |

All bytes remain sourced from `recovery-tools/yard-family-frozen/`. The original
719-file QA media closure is unchanged. Its other 13 files (25,496,727 bytes)
are source descriptors, proofs, handoff metadata and documentation; none is
required by the browser URL graph or included in the production media copy.

## Build and delivery

The `yardPublicMedia()` Vite hook validates every frozen source and existing
output before copying missing files to `public/assets/`. It never overwrites
conflicting bytes. Generated copies are Git-ignored; the repository retains one
owned source copy. Paths, hashes, lengths, JSON/WebP magic and unknown output
files are checked. Symlink/traversal paths are rejected.

`.dockerignore` admits only the 706 source JSON/WebP files from the frozen roots,
not their QA proofs. Generated local public copies are excluded from the Docker
context, so a clean Docker build must regenerate them from pinned source bytes.
Vite then copies `public/` into `dist/`. Both the build stage and the final image
run `node scripts/yard-public-media.mjs --verify dist`; the final image has no
`recovery-tools/` dependency. Existing Express `dist/` serving provides the exact
URLs. Unknown media paths return a plain-text 404, never SPA HTML.

Commands:

- `node scripts/yard-public-media.mjs --check`: validate sources/current output
- `node scripts/yard-public-media.mjs`: materialize missing byte-identical copies
- `node scripts/yard-public-media.mjs --verify dist`: verify final delivery only
- `node --test tests/yard-public-media.test.mjs`: native contract/negative tests
- After `pnpm run build`, `NODE_ENV=test node --test tests/yard-public-media-built.test.mjs`:
  GET every production URL through the real Express app, check status/type/length/hash,
  verify HEAD with cache-revision query and negative 404s, inspect built precache
- `pnpm run perf:guard:build`: measure actual built bytes and frozen-closure integrity

CI runs these checks after the real client build and preserves the measured
`perf-build-report.json` separately from the client artifact. Docker performs
its own clean-context and final-image byte checks. A final-container smoke runs
`docker run --rm --network none --entrypoint node game-hub-ci scripts/yard-public-media-http.mjs`.
It uses the final image's real Express app on loopback, with the same 706 HTTP
checks and no external network, QA source tree, or database initialization.
This verifies static delivery, not PostgreSQL/Redis startup readiness.

## Deployment footprint and budgets

These are deployed encoded file totals, not startup network requests:

| Measurement | Before | Reviewed addition | Projected after, before any extra Vite-emitted media |
| --- | ---: | ---: | ---: |
| Public assets | 70,533,609 | 192,653,433 | 263,187,042 |
| All public media | 248,807,952 | 192,653,433 | 441,461,385 |

The baseline all-media figure is public games 172,573,167 + public assets
70,533,609 + runtime payload 5,701,176. The 10,009-byte runtime manifest is tracked
under its own budget and excluded from the existing public-media metric.

Only total-deployment ceilings are rebaselined, by the exact reviewed delta:

- Public assets: 75,000,000 + 192,653,433 = 267,653,433
- All public media: 263,000,000 + 192,653,433 = 455,653,433
- Previous slack is preserved: 4,466,391 and 14,192,048 bytes, respectively
- Non-family public assets/media still have the original 75,000,000 / 263,000,000
  ceilings. Only verified exact family files earn the dedicated allowance.
- Missing, extra, resized or hash-changed family assets fail the build guard.
  The final built report, rather than this source-file projection, is authoritative.

Initial JS/CSS, game chunks, runtime-manifest/runtime-image, public-games,
request/concurrency and decoded-memory budgets are unchanged.

## No eager download or larger decode allowance

- The Vite hook only copies files; it emits no browser code or preload links.
- Workbox's non-recursive `assets/*` pattern does not match these nested roots.
  The shell-manifest transform independently excludes every one of the 706 URLs.
- `assets-pipeline.config.mjs`, the generated runtime manifest and the Pixi warming
  bundles do not contain these family paths. The frozen copier is separate from
  the image-generation/optimization pipeline.
- The built test verifies `index.html`, `sw.js` and `assets-runtime/manifest.json`
  contain none of the new family roots.
- The existing scene lazily opens actor descriptors/stills only for registered
  exact actor profiles, then streams required/current and bounded lookahead
  atlas pages. This packaging change does not edit that scene or its loader.
- Family atlas limits remain 64 MiB including the external backing ledger,
  one concurrent decode, 16 resident slots, and at most 8 MiB per atlas page.
  Existing eight-demand-over-budget rejection remains tested; this is not a
  claim that arbitrary eight-actor combinations fit simultaneously.
