# Inactive persistent Yard candidate

This is a source-only CI candidate based on e5030d2028feeb7f65b1e6b317366b0fb8f910bf. It does not activate persistent Yard. The production room loader, API routes, playerManager, shared store, HUD registration, package scripts, default tests and public images remain unchanged. New yard-v2 and Courtyard modules are unreferenced by the production entrypoints.

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

This checks the actual production file bytes, not the overlays, and confirms that room still imports `companion-yard/CompanionYardGame.jsx`. The base contract must be deliberately rebased if one of these protected production paths changes.

## Scope of the source-only proof

- Fresh e5030d source export plus this patch: 314 candidate tests passed; two real-image checks explicitly skipped
- Separate unchanged production tests without candidate overlays: 201 passed
- Local component compile: blocked by absent installed esbuild/dependencies; script syntax passed
- Real image-byte/hash and atlas-existence checks: exactly two named checks explicitly skipped, not passed; those belong to the separate art closure
- Browser, full application build, mobile/WebView QA, real PostgreSQL and deployment: not run

`fixtures/runtime-media.json` is byte-identical to the canonical served Mika metadata. Real canonical media is materialized from the already-reviewed local QA asset copies using `node scripts/yard-materialize-canonical-media.mjs`; `--check` performs a read-only full hash preflight. The old two real-image skips are removed. Adding these data-free public assets does not register the candidate component or activate a visitor.

Publishing these inactive source files does not authorize activating their overrides. An eventual integration still needs an explicit source rebase, production entrypoint changes, full build/browser/data checks and release approval.


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
