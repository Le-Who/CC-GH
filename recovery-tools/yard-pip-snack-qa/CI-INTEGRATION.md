# Pip Snack Table source candidate: dedicated CI overlay

This bundle adds only a self-contained recovery fixture, a dedicated server/config and its tests. It does not import Pip into the production registry, change availability, alter prices, modify stored placements, or claim full Yard completion.

## Proposed CI steps

Use the same existing Node/pnpm/Chromium setup as the approved Mochi jobs, then run:

- `node --test tests/yard-pip-source.test.mjs`
- `pnpm exec playwright test --config=playwright.pip.config.js --project=chromium`

Upload `test-results-pip/` and `playwright-report-pip/` as normal CI artifacts, including on failure. The fixture server serves only `/__pip_qa__/` from `recovery-tools/yard-pip-snack-qa/`; it is not a production route. Port 3199 is configurable with `PLAYWRIGHT_PIP_PORT`.

The local cloud-browser open returned `net::ERR_BLOCKED_BY_CLIENT`. That route was stopped, without retries or another local browser/socket execution path. Consequently the browser tests below are prepared and syntax-checked, not passed. Actual Chromium execution belongs to the normal approved CI workflow.

## Prepared coverage

- 14 native Node tests pass, including fresh deterministic full-visit planning, unchanged roster/prices, closed registry, condition/food checks, precise 40 ms turns, coherent target ownership and cache failure/disposal
- 15 browser tests are prepared: 11 phone/tablet/landscape/desktop viewport cases; rest/page seam and repeated controls; delayed/failed page recovery; one complete three-minute visit at 4× speed; and a recorded 1× interaction through brace, nibble, backward steps, turn and the first rest seam
- Small-phone floor 320×568; 360×800 and 390×844 at DPR2; 414×896; 568×320 and 844×390; 768×1024 and 1024×768; 1280×720; extended 375×812 and 393×873
- Browser artifacts include live nibble/rest/departure screenshots, the original Pip identity/game-scale comparison, and cache/source-clock diagnostics
- Ground shadows come from Pip's real source contact rows. Only the two hind paws cast ground-contact shadows while the two forepaws are supported by the table; all four ground contacts return during rest

The fixture uses the shared projection, actor-media validation and AtlasCache, plus the Pip-specific sampler/presenter. It is not yet the canonical shared scene or a multi-actor acceptance result.

## Source and sampling contracts

Actor reference is `pip` / `pip-actor/r2-snack`, still `playbackReady: false` and absent from default `ACTOR_PROFILES`. The source binding is `pip-snack-combined-r1` for the unchanged catalog visitor `pip_hamster` and goodie `snack_table`.

The corrected combined clip is 20,800 ms, 521 inclusive source samples, 25 fps / 40 ms. Entry is root [-0.48,0,0], facing 0; exit is root [-0.48,0,0], facing 4. The persistent rest loop is [17920,19200) ms, frames [448,480), 32 samples. Its actual RGBA endpoints are byte-identical.

Pip's original walking renders carried root travel inside their canvas. The candidate now uses actual 3D root-normalized walking renders, with root/bone readback on every frame. The displayed route root and texture come from the same authored 40 ms row, avoiding double translation. Neither Mika nor Mochi timings or footprint geometry are substituted.

The scene must use page-aware requests. A fixed +1100 ms lookahead can skip a 640 ms Pip page. `entry.presentation.requests` and `entry.presenter.requests` expose current/required/lookahead without owning another cache. Merge those requests into the existing scene-owned cache before any canonical activation.

## Bounded media

There are 101 ≤16-frame atlas pages. Largest decoded page: 7,077,888 bytes. The tested cache limit is three pages / 32 MiB / one concurrent decode. The complete mocked visit loaded 53 unique pages and peaked at 21,233,664 decoded/reserved bytes, closing evicted bitmaps. Loading the entire 414,973,952-byte decoded pack is prohibited. The compressed atlas payload is 24,777,500 bytes.

The target table is drawn exactly once. The standalone still remains available unless the exact composite frame, source revision, and unchanged placement are ready. Pending/error pages retain the last coherent canvas. A new condition, rotation, moved placement, stale source revision, or unsupported actor cannot silently reuse the old table pixels.

## Verified offline source evidence

All 521 corrected source frames passed actual solid actor/prop intersection checks. There were zero unexpected intersections, 8,288 measured tabletop sole-to-mesh checks, and 181 frames of bounded mouth/biscuit contact. Ground support, tabletop support, and mouth contact are reported separately. The first intersecting draft is retained outside this CI bundle as rejected evidence.

The new-state wooden table, checked cloth, biscuit basket, cup and flowering vine preserve the legacy identity. Legacy worn/broken placeholder art is not promoted. Post-admission wear that would change the prop condition rejects the source candidate. The decorative bite is part of the existing table, not a new inventory item.

Still pending: actual CI browser results, canonical server/shared-scene integration, multi-actor/depth and grounding review, worn/broken and other legacy interactions, and explicit release review. Do not enable the source gate from this bundle alone.
