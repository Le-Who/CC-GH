# Safe Perf Guard Loop Journal

Reusable CC-GH-specific learnings from conservative perf loops. This is not an attempt log.

## 2026-05-03 - Yard Seeded Selection Allocation
**Learning:** Yard visitor and activity selection can drop transient `filter`, `reduce`, and `Set` allocations while preserving candidate order and seeded modulo choices.
**Evidence:** `pnpm run perf:guard -- --suite yard.simulate-36h,yard.simulate-long-idle --repeat 4 --report artifacts/perf/2026-05-03-objective-epoch-attempt1-yard-selection-rerun-repeat4.json`; `yard.simulate-long-idle` p95 improved from `0.560ms` to `0.504ms`, and p99 improved from `0.892ms` to `0.700ms`.
**Action:** Prefer loop-based allocation reduction inside pure Yard selection helpers before considering gameplay, reward, timer, or persistence semantics.

## 2026-05-03 - Yard Visitor List Precompute Rejected
**Learning:** Precomputing `Object.values(YARD_VISITORS)` into a module-level visitor list did not help the current Yard simulation hot path.
**Evidence:** `pnpm run perf:guard -- --suite yard.simulate-36h,yard.simulate-long-idle --repeat 4 --report artifacts/perf/2026-05-03-objective-epoch-attempt2-yard-visitor-list-repeat4.json`; refreshed `yard.simulate-long-idle` p95 regressed from `0.508ms` to `0.645ms`, and p99 regressed from `0.640ms` to `1.140ms`.
**Action:** Do not retry visitor-list precomputation as a safe Yard target unless a future guard baseline or catalog shape materially changes.

## 2026-05-03 - Bubbo Drop Concat Replacement Rejected
**Learning:** Replacing Bubbo dropped-cell `concat` calls with manual append loops regressed the pressure-advance guard in this checkout.
**Evidence:** `pnpm run perf:guard -- --suite bubbo.pressure-advance,bubbo.apply-shot --repeat 4 --report artifacts/perf/2026-05-03-objective-epoch-attempt3-bubbo-drops-repeat4.json`; refreshed `bubbo.pressure-advance` p95 regressed from `0.081ms` to `0.102ms`, and p99 regressed from `0.143ms` to `0.216ms`.
**Action:** Leave Bubbo dropped-list concatenation unchanged unless a future profile shows a different allocation pattern or a larger semantics-safe refactor is explicitly scoped.

## 2026-05-03 - Merge Empty-Cell Row Caching Rejected
**Learning:** Local row reuse inside Merge empty-cell scans regressed the current Merge guard suites instead of improving them.
**Evidence:** `pnpm run perf:guard -- --suite merge.board-hydrate,merge.apply-generator,merge.apply-recipe --repeat 4 --report artifacts/perf/2026-05-03-objective-epoch-attempt4-merge-empty-row-repeat4.json`; refreshed `merge.board-hydrate` p95 regressed from `0.040ms` to `0.050ms`, `merge.apply-generator` from `0.119ms` to `0.139ms`, and `merge.apply-recipe` from `0.053ms` to `0.079ms`.
**Action:** Do not retry local row-caching or similar empty-cell scan churn on Merge without a new profile that shows the helper shape changed.

## 2026-05-03 - Player Achievement Lookup Cache Rejected
**Learning:** Local caching of `p.achievements || {}` inside `buildAchievements()` was not a reproducible `player.build-snapshot` win.
**Evidence:** First focused run `artifacts/perf/2026-05-03-objective-epoch-attempt5-player-achievements-repeat4.json` showed `player.build-snapshot` p95 `0.083ms`, but direct rerun `artifacts/perf/2026-05-03-objective-epoch-attempt5-player-achievements-rerun-repeat4.json` regressed to `0.092ms` versus the refreshed `0.086ms` baseline.
**Action:** Treat achievement optional-lookup caching as noisy/sub-threshold and avoid it unless snapshot structure changes.

## 2026-05-03 - Yard Lazy Selection Arrays Rejected
**Learning:** Lazily allocating Yard activity match arrays after the successful loop-based selection rewrite regressed both Yard simulation guards.
**Evidence:** `pnpm run perf:guard -- --suite yard.simulate-36h,yard.simulate-long-idle --repeat 4 --report artifacts/perf/2026-05-03-objective-epoch-attempt6-yard-lazy-selection-repeat4.json`; refreshed `yard.simulate-long-idle` p95 regressed from `0.508ms` to `0.556ms`, and `yard.simulate-36h` p95 regressed from `0.074ms` to `0.125ms`.
**Action:** Keep the eager arrays from the confirmed Yard selection rewrite; do not continue micro-churning that helper family in this epoch.

## 2026-05-03 - Player Season Pass Claim Cache Rejected
**Learning:** Caching `p.seasonPass.claimed` locally inside `buildSeasonPass()` regressed the focused snapshot guard.
**Evidence:** `pnpm run perf:guard -- --suite player.build-snapshot --repeat 4 --report artifacts/perf/2026-05-03-objective-epoch2-attempt1-player-season-pass-repeat4.json`; refreshed `player.build-snapshot` p95 regressed from `0.086ms` to `0.109ms`, and p99 regressed from `0.173ms` to `0.214ms`.
**Action:** Avoid tiny Player snapshot optional-lookup/cache churn in this loop unless a profile identifies a larger safe snapshot bottleneck.

## 2026-05-03 - Runtime Manifest Minification Build Win
**Learning:** The generated runtime asset manifest does not need pretty-printed JSON for runtime or test contracts; compact JSON preserves keys, bundles, fallbacks, and hashes while reducing build payload.
**Evidence:** `pnpm run perf:guard:build -- --report artifacts/perf/2026-05-03-objective-epoch2-attempt2-manifest-minify-build-report.json`; runtime manifest raw bytes improved from `23478B` to `18379B`, gzip from `3045B` to `2899B`, and `pnpm run perf:guard:all` passed.
**Action:** Keep generated manifest JSON compact; use parsed manifest contract tests rather than formatting expectations.

## 2026-05-03 - Farm Offline Refuel List Cache
**Learning:** `processOfflineActions()` can cache the cheap-crop refuel id list within a single offline simulation call because the relevant inventory only decreases during that call.
**Evidence:** `pnpm run perf:guard -- --suite farm.offline-full,farm.offline-24h --repeat 4 --report artifacts/perf/2026-05-03-objective-epoch2-attempt3-farm-refuel-cache-rerun-repeat4.json`; `farm.offline-full` p95 improved from `0.034ms` to `0.022ms`, and `farm.offline-24h` p95 improved from `0.015ms` to `0.014ms`.
**Action:** Prefer per-call caches for immutable-or-decreasing offline simulation scans; do not persist them across players, requests, or tests.

## 2026-05-03 - Yard Active-Visitor Scan Merge Rejected
**Learning:** Combining Yard active-anchor and slot-count scans into one helper did not produce a usable long-idle win and worsened the 36h tail.
**Evidence:** `pnpm run perf:guard -- --suite yard.simulate-36h,yard.simulate-long-idle --repeat 4 --report artifacts/perf/2026-05-03-objective-epoch2-attempt4-yard-active-usage-repeat4.json`; refreshed `yard.simulate-long-idle` p95 only moved from `0.661ms` to `0.657ms`, while `yard.simulate-36h` p99 regressed from `0.394ms` to `0.493ms`.
**Action:** Keep the separate active-anchor and slot-count helpers unless future profiling shows visitor-use checks dominate.

## 2026-05-03 - Yard Condition Profile Reuse Rejected
**Learning:** Passing a pre-fetched Yard condition profile into `cachedVisitorCandidates()` regressed the long-idle guard.
**Evidence:** `pnpm run perf:guard -- --suite yard.simulate-36h,yard.simulate-long-idle --repeat 4 --report artifacts/perf/2026-05-03-objective-epoch2-attempt5-yard-condition-profile-repeat4.json`; refreshed `yard.simulate-long-idle` p95 regressed from `0.661ms` to `0.942ms`.
**Action:** Leave the current condition-profile cache lookup shape intact; do not force parameter threading for this path.

## 2026-05-10 - Runtime Asset Manifest Compaction
**Learning:** Generated runtime payloads can stay within the build guard by emitting only runtime-resolved generated art, WebP-only raster outputs, and a compact dir/hash manifest. Dynamic Merge art still needs a compact `pixi.merge` prefix bundle so Pixi prewarming loads table, board, UI, and item textures instead of falling back to uncached `Sprite.from()` warnings.
**Evidence:** Baseline `pnpm run perf:guard:build -- --report artifacts/perf/2026-05-10-indefinite-baseline-build-report.json` failed with runtime manifest `97561B` raw / `16508B` gzip, runtime assets `52074023B`, and max file `3062883B`. After compaction, `pnpm run perf:guard:build -- --report artifacts/perf/2026-05-10-indefinite-attempt1-runtime-assets-build-report.json` passed with manifest `15665B` raw / `4748B` gzip and runtime assets `8363476B`; `pnpm run perf:guard:all` passed.
**Action:** Prefer compact generated runtime manifests and pruned runtime asset entry lists. Keep dynamic scene bundle prefixes only where code-owned lists would be incomplete or duplicate large generated catalogs.

## 2026-05-10 - Gacha Merge Runtime Art Prune
**Learning:** Gacha Merge generated runtime output should include the concrete UI/background/fx ids resolved by `MergeGame` and `mergeScene`, plus dynamic item textures. Extra generated UI/fx art that has no resolver call adds manifest and payload cost without improving the live scene.
**Evidence:** After the manifest compaction baseline, `pnpm run perf:guard:build -- --report artifacts/perf/2026-05-10-indefinite-attempt2-gacha-merge-prune-build-report.json` improved runtime manifest gzip from `4748B` to `4462B`, runtime assets from `339` files / `8363476B` to `320` files / `8139554B`; `pnpm run perf:guard:all` passed.
**Action:** When adding Gacha Merge art, add it to the runtime pipeline only when a runtime resolver path uses that id, and keep the browser asset-runtime guard covering the live requested prefixes.
