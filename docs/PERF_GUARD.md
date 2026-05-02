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

   Browser runtime smoke for the current Telegram shell. The Playwright web-server builds production assets first, then starts `server.js` with the test env for dev auth and in-memory player state. The specs check startup lazy-loading, verify startup uses the generated runtime manifest without eager Bubbo/Gem Crush art, enter Gacha Merge, perform a real free-tap generator action, sample `requestAnimationFrame` cadence, record Long Task / Long Animation Frame entries when the browser supports them, and run the generated runtime asset coverage spec for Garden Shelf, Bubbo, Gem Crush, and Cozy Yard.

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

### 2026-05-02 Garden/Merge/Yard Follow-up Loop

The Garden/Merge/Yard follow-up loop stopped by rule after three consecutive safe attempts were reverted or failed to produce a confirmed guarded `>=3%` p95/build improvement. Final validation then exposed real browser-runtime guard misses in Merge's static Pixi render loop and overlapping Merge action path; those guard failures were fixed directly instead of loosening browser thresholds. No gameplay rules, RNG, rewards, persistence meaning, budgets, or tests were loosened.

Baseline reports:
- Node: `artifacts/perf/2026-05-02-current-fixes-baseline-node-repeat3.json` passed 24/24 suites; slowest ratios were `yard.simulate-long-idle`, `merge.board-hydrate`, `assets.pipeline-entry-scan`, `player.build-snapshot`, and `merge.apply-generator`.
- Build: `artifacts/perf/2026-05-02-current-fixes-baseline-build-report.json` passed with startup JS `311,830B` raw / `100,022B` gzip, startup CSS `93,059B` raw / `17,037B` gzip, async Pixi chunks `612,080B` raw / `186,882B` gzip, and runtime assets `7,687,694B` raw.

| Attempt | Target | Baseline | Attempt | Result |
| --- | --- | ---: | ---: | --- |
| 1 | Cozy Yard recorded-visit reuse | `yard.simulate-long-idle` p95 `0.964ms` | `1.138ms` | Reverted; focused p95 and p99 regressed. |
| 2 | Split Pixi scene import pruning | build startup JS `311,830B` raw / `100,022B` gzip | unchanged | Kept only as code-quality cleanup; guarded build bytes were identical, so this was not counted as a perf win. |
| 3 | Merge board hydration row caching | `merge.board-hydrate` p95 `0.095ms` | `0.103ms` | Reverted; focused p95 and p99 regressed. |

Kept changes:
- Removed unused named imports from the split Pixi scene modules, reducing `pnpm exec eslint .` from 295 warnings to a clean exit while leaving the build metrics unchanged.
- Stopped Gacha Merge from continuously auto-rendering its static Pixi board. The scene now renders on draw/drag/state updates and starts the Pixi ticker only while merge feedback particles are alive. A custom browser trace improved the Merge sample from 18-19 frames at `50-66ms` p95 to 51-55 frames at about `16.8ms` p95.
- Split `LazyPixiSceneHost` further so entering Merge loads `PixiGameHost` plus the Merge builder instead of every Pixi scene builder. The build guard's async Pixi payload dropped from `612,080B` raw / `186,882B` gzip at baseline to `297,351B` raw / `87,624B` gzip in the final `perf:guard:all` pass.
- Coalesced Pixi state updates onto `requestAnimationFrame`, removed the duplicate post-construction scene update, patched only changed Merge board cells after generator actions, skipped blocking full-bundle prewarm for Merge item art, disabled nonessential free-tap-claim feedback, and serialized pending Merge actions so `Claim +` cannot overlap `Generate` in the same runtime frame.
- Final `pnpm run perf:guard:all` passed: Node 24/24 with slowest budget ratio `0.292`, build budgets passed with startup JS `311,959B` raw / `100,067B` gzip and startup CSS `93,079B` raw / `17,041B` gzip, and browser runtime smoke passed 2/2.

Verification for the kept state:
- `pnpm exec eslint .`
- `pnpm run test:cleanup`
- `pnpm test`
- `pnpm run build`
- `pnpm run perf:guard:all`

### 2026-05-02 Telegram Mini App UX Implementation Loop

The Telegram Mini App UX implementation pass kept three conservative performance wins and stopped by rule after three consecutive reverted or sub-threshold attempts. No gameplay rules, rewards, RNG distribution, budgets, or tests were loosened.

Baseline reports:
- Focused implementation guard: `artifacts/perf/post-telegram-ux.json` passed 5/5 suites after the UX work.
- Node loop baseline: `artifacts/perf/2026-05-02-telegram-ux-loop-baseline-node-repeat3.json` passed 24/24 suites.
- Build baseline: `artifacts/perf/2026-05-02-telegram-ux-loop-baseline-build-report.json` passed with startup JS `503,219B` raw / `165,318B` gzip and startup CSS `92,298B` raw / `16,891B` gzip.

| Attempt | Target | Baseline | Attempt | Result |
| --- | --- | ---: | ---: | --- |
| 1 | Remove app-shell `framer-motion` from startup | startup JS `503,219B` raw / `165,318B` gzip | `375,936B` raw / `123,502B` gzip | Kept; browser guard passed after fixing the Garden details i18n crash and null local HUD state exposed by Chromium. |
| 2 | Merge board hydration null fast path | `merge.board-hydrate` p95 `0.103ms` | `0.093ms` | Kept; p99 also improved and Merge tests passed. |
| 3 | Lazy Telegram SDK import | startup JS `375,936B` raw / `123,502B` gzip | `309,137B` raw / `99,561B` gzip | Kept; browser guard passed with Back Button/closing/haptics/swipe behavior still progressive. |
| 4 | Direct Garden shell helper imports | startup JS `309,137B` raw / `99,561B` gzip | `308,741B` raw / `99,383B` gzip | Reverted; below 3% threshold. |
| 5 | Reuse Merge item counts inside player snapshot | `player.build-snapshot` p95 `0.208ms` | `0.630ms` | Reverted; focused p95 regressed. |
| 6 | Remove redundant Gacha Merge asset entry sort | `assets.pipeline-entry-scan` p95 `2.299ms` | `3.041ms` | Reverted; focused p95 regressed. |

Kept changes:
- Replaced app-shell `framer-motion` wrappers in `App.jsx` and `src/app/shell.jsx` with CSS transitions in `src/index.css`, leaving Garden's lazy `framer-motion` usage in the Garden game chunk.
- Loaded `@telegram-apps/sdk` through dynamic platform imports while preserving synchronous auth fallback from `window.Telegram.WebApp.initData`.
- Short-circuited `hydrateMergeBoard()` for `null`/`undefined` cells while continuing to normalize every non-empty Merge item.

Verification for the kept state:
- `pnpm test`
- `pnpm run build`
- `pnpm run perf:guard:build -- --report artifacts/perf/2026-05-02-telegram-ux-post-attempt3-build-report.json`
- `pnpm run perf:guard:browser`
- `pnpm run perf:guard -- --repeat 3 --report artifacts/perf/2026-05-02-telegram-ux-post-attempt3-node-repeat3.json`

### 2026-05-02 Conservative Loop

The May 2, 2026 loop kept two build/startup wins plus one Playwright CI-parity fix, then stopped by rule after three consecutive safe attempts were reverted or failed the 3% keep threshold. No gameplay rules, budgets, or tests were loosened.

Baseline reports:
- Node: `artifacts/perf/2026-05-02-baseline-node-repeat3.json` passed 24/24 suites; slowest ratios were `bubbo.pressure-advance`, `merge.board-hydrate`, `yard.simulate-long-idle`, `assets.pipeline-entry-scan`, and `merge.apply-generator`.
- Production build at loop start failed `perf:guard:build`: startup JS was `775,857B` raw / `245,299B` gzip and largest game chunk was `83,093B`, over the existing budgets.

| Attempt | Target | Baseline | Attempt | Result |
| --- | --- | ---: | ---: | --- |
| 1 | Bubbo unsupported-cell traversal queue | pressure p95 `0.073ms` | `0.075ms` | Reverted; mixed/noisy, despite `apply-shot` improving. |
| 2 | Vendor chunk family split | startup JS `775,857B` raw / `245,299B` gzip | `536,791B` raw / `175,808B` gzip | Kept; game chunks also dropped under the existing max budget. |
| 3 | Lazy realtime client import | startup JS `536,791B` raw / `175,808B` gzip | final `494,519B` raw / `162,604B` gzip | Kept; browser guard passed. |
| 4 | Lazy update manager import | startup JS `494,488B` raw | `492,467B` raw | Reverted; about 0.4%, below threshold. |
| 5 | Bubbo dropped-cell aggregation | pressure p95 `0.091ms` | `0.108ms` | Reverted; p95 regressed. |
| 6 | Gacha Merge asset scan single walk | asset scan p95 `0.937ms` | `1.647ms` | Reverted; p95 regressed. |

Kept changes:
- Split Vite manual chunks by stable dependency family so lazy-only Garden effects, socket runtime, storage/state helpers, and motion internals no longer get pulled into one broad startup `vendor` chunk.
- Deferred `socket.io-client` by loading `src/services/realtimeClient.js` inside the boot effect while preserving the existing auth/status/outbox flow.
- Replaced the Playwright web-server command with `scripts/playwright-web-server.mjs`, which builds with `NODE_ENV=production` and then runs the test server with Playwright's test env. This prevents `perf:guard:browser` from leaving behind a dev/test-mode Vite build that fails `perf:guard:build`.

Verification for the kept state:
- `pnpm run build`
- `pnpm run perf:guard:build` inside `pnpm run perf:guard:all` passed with startup JS `494,519B` raw / `162,604B` gzip
- `pnpm run perf:guard:browser`
- `pnpm run perf:guard:build -- --report artifacts/perf/2026-05-02-post-browser-production-build-report.json`
- `pnpm run perf:guard -- --repeat 3 --report artifacts/perf/2026-05-02-post-vendor-split-node-repeat3.json`

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
