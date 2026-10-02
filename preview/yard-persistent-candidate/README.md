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

`fixtures/runtime-media.json` supports route/pose metadata tests only. It is exposed at its original import URL by the test loader and is not copied into production public assets. The copied presentation and atlas suites run their source-only checks, including served binding/calibration equality, stale cached-media refusal, loop aliases, pose tiles and cache disposal/reload. Only their two checks that read real image files are explicitly skipped. The full image proofs remain in the separate staging/art package.

Publishing these inactive source files does not authorize activating their overrides. An eventual integration still needs an explicit source rebase, production entrypoint changes, full build/browser/data checks and release approval.
