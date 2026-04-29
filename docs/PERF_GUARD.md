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

   Useful focused commands:

   ```bash
   pnpm run perf:guard -- --list
   pnpm run perf:guard -- --suite player.build-snapshot
   pnpm run perf:guard -- --suite match3.find-matches --repeat 3
   ```

2. `pnpm run build && pnpm run perf:guard:build`

   Build artifact budgets for startup JS/CSS, async Pixi chunks, game chunks, and the invariant that Pixi runtime chunks must not be module-preloaded into startup HTML. This writes `artifacts/perf/perf-build-report.json`.

3. `pnpm run perf:guard:browser`

   Browser runtime smoke for the current Telegram shell. It checks startup lazy-loading, enters Gacha Merge, performs a real free-tap generator action, samples `requestAnimationFrame` cadence, and records Long Task / Long Animation Frame entries when the browser supports them.

4. `pnpm run perf:guard:all`

   Full local performance gate: Node hot paths, production build, build budgets, and browser runtime smoke.

## Budget Policy

- p95 is the primary CI gate for regressions.
- p99 is the hard tail gate checked against each suite's `max` budget.
- raw max is diagnostic only: it is reported as a warning when it exceeds the tail budget, because single-sample VM scheduling or GC spikes are not stable enough to fail otherwise healthy p95/p99 measurements.
- Prefer adding focused suites for changed mechanics over loosening shared budgets.
- Browser performance specs stay separate from `pnpm test` because they are slower and environment-sensitive.
