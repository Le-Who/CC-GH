# Inactive persistent Yard candidate

The 2026-10-04 cold-ground/Escape/test-harness transition is recorded separately in `reviewedColdEscapeChangeSet` and `history/pre-cold-escape/`. Its three approved patch hashes pin the ground optimization, the unchanged 59-case viewport matrix with the real Escape fix, and the bounded real-art HTTP test harness. Prior wiring, rollback and presentation evidence remains unchanged and is verified against archived pre-transition bytes. Only the existing package production pin advances to 8,917 bytes / SHA-256 `e7364b734888d6185723c73917ae81f99c19ae9026b46009c61e1edb56f0d906`; the current ground, Courtyard and changed harness bytes have separate exact reviewed identities. Existing tests and dependencies are preserved.

All four canonical fixtures, the regenerated Mochi 110-minute witness, the 978-file media closure, and Mochi-combined's plan/boundary samples remain byte-identical. The four 95-file canonical closures change only the ground hash. Mochi-combined's served copy receives the same ground update and its 17-file closure is regenerated against that copy; its other source bytes and the separate frozen Pip-snack copy remain unchanged. Detailed comparison is in `evidence/yard-cold-escape-transfer.json`. This new source needs fresh native-duration, build/browser and applicable PostgreSQL evidence; historical b92 duration evidence is not relabeled as a run of this source. Rollout and actor acceptance remain closed.

This directory preserves the isolated source-only overlay harness. The current approved player wiring uses a code-owned closed rollout: ordinary accounts retain legacy Yard; previously migrated accounts are held read-only. The protected contract records the exact nine reviewed production changes from `86b5d798842408190c093aa058186ab906779c0d` using approved wiring `704e6387327a48f51fdc0fac8d8ee6ec66dd0372`. Actor/media acceptance remains closed. Earlier dated sections below describe their original checkpoints, not the current production import graph.

## Explicit checks

From the repository root, using Node 24:

```sh
NODE_ENV=test YARD_CANDIDATE_CI=1 node preview/yard-persistent-candidate/run-checks.mjs
```

The runner first verifies protected production files against base hashes. It then starts isolated Node test processes with explicit module-load overlays. Candidate active-file copies live under `overrides/`; their original module URLs are retained, so relative dependencies bind to this release's source. Missing virtual check/fixture URLs resolve before Node's default filesystem resolver. Native filesystem reads are not intercepted: static source assertions opt into `readCandidateSource` explicitly.

Check entrypoints end in `.checks.mjs`, and the copied check bodies end in `.source.mjs`. Neither adds a default `.test.*` file or modifies the existing test command. Both `NODE_ENV=test` and `YARD_CANDIDATE_CI=1` are required by the runner, loader and dependency substitutes. Do not set these globally or use the overlay loader in a production process.

The dependency-free suite executes source functions, the vanilla store contract, API handlers, in-memory lock behavior and a modeled SQL OCC transport. External packages needed for these tests are replaced by explicit test substitutes. This does not validate React/Zustand rendering, a real database or network services.

## Separate component compile in CI

After the ordinary CI dependency setup has already installed this repository's declared dependencies:

```sh
NODE_ENV=test YARD_CANDIDATE_CI=1 node preview/yard-persistent-candidate/compile-check.mjs
```

This uses the installed esbuild package and candidate source overlays, including the inactive shared-store/HUD candidates. It bundles `CourtyardGame.jsx` with `write:false`, checks that JavaScript output exists and reports byte counts and hashes. It invokes no installer, Vite build, asset pipeline, deployment or production dist write. A missing esbuild package fails explicitly. Compilation is not a browser or visual acceptance gate.

## Production preservation check

```sh
node preview/yard-persistent-candidate/verify-production.mjs
```

This checks all 24 actual production fingerprints, 16 closed-rollout control files, and the separately reviewed eight-file rollback guard transition. A fresh native process, without test import hooks, verifies the disabled rollout, legacy default, read-only migrated accounts, four closed acceptance gates, seven unready profiles, Mika-only client/server registries and the wrapper's guarded fallback. The base contract must be deliberately rebased for another reviewed change; updating hashes alone cannot make an open rollout pass.

## Scope of the source-only proof

- Fresh e5030d source export plus this patch: 314 candidate tests passed; two real-image checks explicitly skipped
- Separate unchanged production tests without candidate overlays: 201 passed
- Local component compile: blocked by absent installed esbuild/dependencies; script syntax passed
- Real image-byte/hash and atlas-existence checks: exactly two named checks explicitly skipped, not passed; those belong to the separate art closure
- Browser, full application build, mobile/WebView QA, real PostgreSQL and deployment: not run

`fixtures/runtime-media.json` is byte-identical to the canonical served Mika metadata. Real canonical media is materialized from the already-reviewed local QA asset copies using `node scripts/yard-materialize-canonical-media.mjs`; `--check` performs a read-only full hash preflight. The old two real-image skips are removed. Adding these data-free public assets does not register the candidate component or activate a visitor.

Publishing the closed wiring does not authorize opening its rollout or actor gates. Actual route/store, build, browser, PostgreSQL and source/media acceptance remain separate mandatory evidence before activation.


## Root-compatible r5 / Mochi / Pebble integration

The canonical `game-logic/yard-v2` and `src/games/companion-yard-v2` modules now
match the reviewed r5 source, including source-owned actor contracts, all three
food bindings, canonical Mochi and Pebble, page-aware requests and prop hooks.
Both new actor gates remain closed. The production room still selects legacy
Yard, and the existing eight protected overlays remain unchanged, including the
three Garden R2 rebases. No production routes, store, HUD registry, package,
release flag or schema version is replaced by this integration.

Order: apply this inactive canonical code base, materialize the matching local
media, verify guarded checks and compile in ordinary CI, then apply the separate
Pip overlay against its exact shared-file base hashes. Registry entries must be
extended, not replaced. Mixed-yard obstacle and multi-actor acceptance remain
separate closed-gate work.

Validated in a sparse snapshot of root commit 4e659a0: 421 guarded candidate checks,
zero failures or skips; 134 Garden R2 checks under those preserved overlays, zero
failures or skips. All 18 protected production fingerprints match. This is not a
local browser, esbuild/Vite or real PostgreSQL result; those remain CI gates.


## Frozen Yard v3 test-wiring rebase (2026-10-04)

For frozen Yard v3 tree `5c976992b1fdda1cc9adfb6735c3c1137b51cecc`, the historical statements above about unchanged package scripts are superseded by a deliberate scripts-only change: nine canonical Yard tests join the default test command, and `test:yard-current-four`, `test:yard-family`, and `test:yard-family:pg` are added. Dependencies and lockfile are unchanged.

The production guard rebases only package.json to 8,441 bytes / SHA-256 `e977e5215281baa922fe5de44c792ccb854682e9bced46b203352e0410784bfe`. All other 23 protected fingerprints and the guard implementation remain unchanged. This preserves all checks and does not activate Yard or open player/media/release gates. Full CI, PostgreSQL/OCC and temporal acceptance remain required.


## Native v4 QA test-wiring rebase (2026-10-04)

The reviewed v4 delta on frozen v3 adds `tests/yard-native-duration.test.mjs` to the default and family test commands. Only the package fingerprint advances to 8,513 bytes / SHA-256 `90c5c85d5c54b40a66566fd7a99fe48388e6c0b7f7df12fc994a4b0f0646f445`; dependencies, lockfile, the other 23 fingerprints and the guard implementation remain unchanged. Parent commit `737ef882af8723dc792b1c3e34227c22ed5e56a5` remains intact, including exact Garden replay-clock assertions. The new first-lost-collect case is additive.

The opt-in `yard-native-gameplay-qa` workflow runs eight independent actual-media scenes against owned loopback memory fixtures with native wall-clock progression. Their durations range from 49 to 110 minutes; this is not eight simultaneous visitors in one scene, PostgreSQL proof, production URL readiness or release activation. The interrupted 46.76-minute HP run remains incomplete. A fresh uninterrupted GitHub execution and the separate remaining acceptance gates are required.

## Closed player wiring contract, 2026-10-04

Only the nine reviewed production pins change; the other fifteen remain byte-for-byte as recorded. `reviewedPlayerWiringChangeSet` contains exact old/new lengths and SHA-256 values, archived prior production bytes and separate control-file hashes. `history/pre-player-rollout/` preserves the old contract, guards and original boundary inputs. No application file or frozen source/media closure is rewritten by this guard rebase.

`verify-boundary-transfer.mjs` now distinguishes archived original overlay proof from the approved current wiring transition. Both original boundary deltas reproduce from archived pinned bytes. The captured pre-integration route delta still matches; the store delta already differed before this integration. Its overlay hash was `683272ae…` versus the historical `3e3d7330…` pin, and its raw delta hash was `831aba94…` versus `32c58e2a…`. The intervening `snapshotRequestPending` lifecycle edits were mirrored into production and overlay, with a production-only `finally` comment and changed indentation around the old Yard edits. Historical `sourceInputs` remain unchanged; the verifier explicitly reports this inherited mismatch instead of relabeling it as a successful original-delta transfer. New route/store tests and full CI are required for the integrated code.

`checks/closed-rollout-guard.checks.mjs` runs as part of the existing candidate runner. Its disposable-copy controls prove that ordinary tampering fails hashes and that repinning an open rollout, actor acceptance/playback flag, extra registry actor or direct persistent wrapper still fails the independent closed-state check. Unrelated pin changes and archived-evidence corruption also fail. The temporary copies never modify application files.

## Closed rollback guard transition, 2026-10-04

Approved ops commit `6b01f6ce6aaf341e1345e4f244a3e871bd28784a`, patch SHA-256 `cbe0fb9eac2ea28f9991fca81608507a3ef41bb089dc35e5f81989eeec62f79c`, adds a separate eight-file transition after the player wiring. `reviewedRollbackGuardChangeSet` and `history/pre-rollback-guard/` retain the approved patch, the prior contract, and exact prior package/policy bytes. The original nine wiring transitions and their evidence remain unchanged.

Only two existing pins advance: `package.json` from 8,650 bytes / `f3b884c9f78f54fb5a222797855699b334eba5b9412b9fb56cbf362817429b21` to 8,794 bytes / `efaaba8f4842511d35de9cab54f875821418a25920ac5cdd21b49169f238ebe1`; and `release-policy.mjs` from 535 bytes / `643d47263de2d3cb94f6f5bbcf86d2de4485475c57a1b1f3d561c07027454ea0` to 1,100 bytes / `dad5d515d329b4f73d8deed7ef5d48ad15541782e94db0b19f2d90362d5f9eec`. The package change only appends the rollback test to the default suite and adds its dedicated command. Dependencies and all other scripts remain unchanged. The remaining 23 production and 15 closed-control pins are preserved.

The policy remains disabled. Its predecessor digest records the reviewed historical `84d252d4` deployment; it is not a claim about the current live image. `requiredClosedPredecessor` remains null. Fresh-process checks and disposable-copy negative controls reject enabling the rollout, opening actor gates, inventing an activation predecessor, replacing the historical digest, or broadly repinning package changes. Live predecessor identity, aggregate storage compatibility and all release acceptance still require the guarded deployment checks described in `docs/yard-two-phase-release.md`.
