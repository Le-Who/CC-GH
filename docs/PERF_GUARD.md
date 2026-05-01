# Perf Guard

This repo uses three performance guard layers because one metric cannot cover a Telegram Mini App with React shell UI, Vite chunks, Pixi scenes, and Node-side game logic.

## Research Basis

- Core Web Vitals remain the user-facing baseline: LCP covers perceived load, CLS covers layout stability, and INP covers interaction responsiveness. Source: https://web.dev/performance
- The W3C Long Animation Frames API First Public Working Draft was published on 2026-04-28. It targets main-thread congestion and animation jank that ordinary long-task checks can miss around rendering phases. Source: https://www.w3.org/TR/long-animation-frames/
- Node exposes `perf_hooks` for high-resolution timing, event-loop utilization, and event-loop delay monitoring. Source: https://nodejs.org/api/perf_hooks.html
- PixiJS performance guidance favors spritesheets, controlled scene complexity, batching-friendly draw order, explicit destroy/unload for GPU resources, and pooling where allocation churn matters. Sources: https://pixijs.com/7.x/guides/production/performance-tips and https://pixijs.com/8.x/guides/concepts/garbage-collection
- Vite's build guidance treats uncompressed chunk size as relevant to JavaScript execution time and exposes build output controls such as manifest and chunk-size warning limits. Source: https://main.vitejs.dev/config/build-options.html
- VM/JIT benchmark research warns that warmup and steady state are not guaranteed. CI guards should use warmup, enough samples, percentiles, repeatable fixtures, and focused reruns instead of trusting one average. Sources: https://arxiv.org/abs/1602.00602 and https://link.springer.com/article/10.1007/s10664-022-10247-x
- Playwright traces are the right artifact for browser-flow triage when a runtime guard fails. Source: https://playwright.dev/docs/trace-viewer-intro

## Guard Layers

1. `pnpm run perf:guard`

   Node hot-path budgets for deterministic engine/server work. This is the fast default and writes `artifacts/perf/perf-guard-report.json`.

   Covered areas:
   - Gem Crush board generation, match scans, legal moves, valid swaps, Star Drop.
   - Building Blox fit scans, almost-full fit scans, placements.
   - Gacha Merge board hydration, generator mutation, recipe mutation.
   - Bubbo pressure and shot resolution.
   - Garden Shelf offline returns.
   - Brain Blitz question picking.
   - Cozy Yard 36-hour and long-idle simulation.
   - Player JSON current/legacy migrations and authoritative snapshot building.
   - Runtime asset pipeline entry scanning, generated-manifest parsing, and Pixi bundle URL mapping.

   Useful focused commands:

   ```bash
   pnpm run perf:guard -- --list
   pnpm run perf:guard -- --suite player.build-snapshot
   pnpm run perf:guard -- --suite match3.find-matches --repeat 3
   ```

2. `pnpm run build && pnpm run perf:guard:build`

   Build artifact budgets for startup JS/CSS, async Pixi chunks, game chunks, generated `/assets-runtime` manifest/payload size, content-hashed runtime asset names, and the invariant that Pixi runtime chunks must not be module-preloaded into startup HTML. This writes `artifacts/perf/perf-build-report.json`.

3. `pnpm run perf:guard:browser`

   Browser runtime smoke for the current Telegram shell. It checks startup lazy-loading, verifies startup uses the generated runtime manifest without eager Bubbo/Gem Crush art, enters Gacha Merge, performs a real free-tap generator action, samples `requestAnimationFrame` cadence, records Long Task / Long Animation Frame entries when the browser supports them, and runs the generated runtime asset coverage spec for Garden Shelf, Bubbo, Gem Crush, and Cozy Yard.

4. `pnpm run perf:guard:all`

   Full local performance gate: Node hot paths, production build, build budgets, and browser runtime smoke.

## Budget Policy

- p95 is the primary CI gate for regressions.
- p99 is the hard tail gate checked against each suite's `max` budget.
- raw max is diagnostic only: it is reported as a warning when it exceeds the tail budget, because single-sample VM scheduling or GC spikes are not stable enough to fail otherwise healthy p95/p99 measurements.
- Prefer adding focused suites for changed mechanics over loosening shared budgets.
- Browser performance specs stay separate from `pnpm test` because they are slower and environment-sensitive.

## Conservative Optimization Workflow

- Capture a repeat baseline before changing code, usually with `pnpm run perf:guard -- --suite <id> --repeat 3` for the target suite.
- Keep only changes that show at least a 3% p95 improvement with no p99 regression and no gameplay-semantic change.
- Refresh the baseline after each kept win before moving to the next target, so later comparisons measure against the current tree.
- Treat `pnpm run perf:guard:all` as the final source of truth because it covers Node hot paths, build budgets, and browser runtime smoke together.
- Stop after three consecutive noisy, reverted, or sub-3% attempts, or when the next likely change would require gameplay behavior changes.

## Local Loop Notes

### 2026-05-01 Conservative Loop Follow-up

The follow-up May 1, 2026 loop stopped by rule after three consecutive safe attempts were reverted or failed to reach the 3% keep threshold. No gameplay rules, budgets, or tests were loosened, and no code changes were kept.

Baseline reports:
- Node: `artifacts/perf/2026-05-01-loop2-baseline-node-repeat3.json` passed 24/24 suites; slowest ratios were `yard.simulate-long-idle`, `merge.board-hydrate`, `assets.pipeline-entry-scan`, `bubbo.pressure-advance`, and `player.build-snapshot`.
- Build: `artifacts/perf/2026-05-01-loop2-baseline-build-report.json` passed with startup JS `554,541B` raw / `182,514B` gzip and startup CSS `89,294B` raw / `16,473B` gzip.

| Attempt | Target | Baseline | Attempt | Result |
| --- | --- | ---: | ---: | --- |
| 1 | Lazy boot imports for update manager and realtime client | startup JS `554,541B` raw | `551,675B` raw | Reverted; only about 0.5% raw JS reduction. |
| 2 | `yard.simulate-long-idle` occupancy and visit-count reuse | p95 `0.428ms` | `0.608ms` | Reverted; focused p95 and p99 regressed. |
| 3 | Dead startup CSS selector cleanup | startup CSS `89,294B` raw | `87,616B` raw | Reverted; about 1.9% raw CSS reduction, below the keep threshold. |

Evidence artifacts were written under `artifacts/perf/2026-05-01-loop2-*.json`. The code tree returned to the baseline state before this documentation note.

### 2026-05-01 Conservative Loop

The May 1, 2026 loop kept one build/CSS asset win and stopped before further likely changes crossed into gameplay/runtime semantics. No gameplay rules, budgets, or tests were loosened.

Baseline reports:
- Node: `artifacts/perf/2026-05-01-baseline-node-repeat3.json` passed 24/24 suites; slowest ratios were `yard.simulate-long-idle`, `merge.apply-generator`, `assets.pipeline-entry-scan`, `merge.board-hydrate`, and `player.build-snapshot`.
- Build: `artifacts/perf/2026-05-01-baseline-build-report.json` passed with startup CSS `93,157B` raw / `16,758B` gzip and startup JS `544,026B` raw / `179,408B` gzip.

| Attempt | Target | Baseline | Attempt | Result |
| --- | --- | ---: | ---: | --- |
| 1 | Merge snapshot item counting reuse | `merge.apply-generator` p95 `0.169ms` in A/B baseline | `0.207ms` after edit | Reverted; A/B showed the original path was faster. |
| 2 | `assets.pipeline-entry-scan` recursive sort reduction | p95 `1.318ms` | `2.026ms` | Reverted; p95 regressed. |
| 3 | Startup font subset payload | startup CSS `93,157B` raw / `16,758B` gzip | `87,243B` raw / `16,068B` gzip | Kept; PWA precache also dropped from 100 entries / 2218 KiB to 54 entries / 1658 KiB. |
| 4 | Lazy Merge CSS split | startup CSS `87,243B` raw | `76,093B` raw | Reverted; browser guard repeatedly missed Merge frame p95 (`50.10ms > 50ms`). |

Kept change:
- Replaced broad `@fontsource` imports with explicit WOFF2 Latin, Latin-ext, and Cyrillic `@font-face` declarations in `src/fonts.css`, preserving the app's English/Russian typography while dropping unused startup font subsets and legacy WOFF fallbacks.

Verification for the kept state:
- `pnpm run build`
- `pnpm run perf:guard:build -- --report artifacts/perf/2026-05-01-attempt3-font-subsets-build-report.json`
- `pnpm run perf:guard -- --repeat 3 --report artifacts/perf/2026-05-01-post-font-node-baseline-repeat3.json`
- `pnpm run perf:guard:browser`

### 2026-04-30 Conservative Loop

The April 30, 2026 loop stopped by rule after three consecutive safe attempts failed to produce a confirmed 3% p95 win. No gameplay or budget changes were kept.

| Attempt | Target | Baseline p95 | Attempt p95 | Result |
| --- | --- | ---: | ---: | --- |
| 1 | `yard.simulate-long-idle` per-step visit counting | 0.599ms | 0.800ms | Reverted; p95 regressed. |
| 2 | `assets.pipeline-entry-scan` immutable entry templates | 1.151ms | 1.600ms | Reverted; p95 regressed. |
| 3 | `merge.board-hydrate` empty-cell normalization shortcut | 0.076ms | 0.088ms | Reverted; sub-3% and p95 regressed. |

Evidence artifacts were written under `artifacts/perf/attempt1-yard-*.json`, `artifacts/perf/attempt2-assets-*.json`, and `artifacts/perf/attempt3-merge-*.json`.
