# Saved visit: real Scene lifecycle and ordinary app smoke

The source gate is off unless VITE_YARD_SAVED_VISITS is exactly true. The renderer vendor build guard additionally requires VITE_YARD_PIP_PREVIEW=true to include the reviewed engine. That second flag does not enable a manual fixture without its explicit preview URL; these tests use neither preview parameters nor a manual entry control.

## Checks already run locally

21 client/Scene/router tests pass, including the exact normal released-player fixture, controller validation, one quiet-state wake, no continuous quiet RAF, hidden elapsed time, context replacement, normal owner remount, pending/failure hide, false-toggle rejection, explicit account downgrade while hidden, and CSS visibility after replacement. The existing food and Scene-owner regression suite also passes 16 checks using only a local asset-path adapter. JSX syntax checks pass. The browser is blocked locally by the verified Chromium socket restriction; no native result is claimed for this new integration.

## Focused actual Scene harness

Run from an integrated repository with its existing locked dependencies and installed official Chromium:

```sh
VITE_YARD_SAVED_VISITS=true YARD_SOURCE_ROOT="$PWD" YARD_DEPENDENCY_ROOT="$PWD" \
YARD_SCENE_OUTPUT="$PWD/test-results/saved-visit-scene" \
node qa/saved-visit-scene/run.mjs
```

Before launch, preflight compiles all 152 currently reachable import modules in memory and hashes the full 162-resource closure, including literal URLs plus explicitly fetched JSON, GLSL and every GLB/background. Every served source response is checked against that fresh closure.

This harness imports the real scene-entry, SceneOwner and Pip Scene. It checks three viewports: 320×568, 390×844 DPR2, and 844×390. It captures automatic entry, one saved on-screen phase, leave/return, pending/recovery, WebGL context replacement, quiet/no-RAF state, resume after departure, and reload. Its two source compile-time definitions mirror a saved-enabled, preview-disabled build. It generates no trajectory or economic action. It is not a React component or full application navigation test.

## Ordinary App/Home/CourtyardGame smoke

First run the normal-runtime source test that exports `test-results/normal-runtime/qualified-app-snapshot.json`. The fixture must be the exact normal GET /api/player/snapshot handler export for the disposable onboarded account, with one genuinely admitted/replayed plan. No API-response field is edited by the browser test.

```sh
QUALIFIED_APP_SNAPSHOT="$PWD/test-results/normal-runtime/qualified-app-snapshot.json" \
pnpm exec playwright test --config playwright.yard-saved-visit-app.config.mjs
```

This config uses the repository's existing playwright-web-server script. It builds the actual app once and starts its local test server, with both compile-time flags true. Tests intercept only the normal snapshot boundary with the exported bytes, block mutations, and use ordinary Home cards plus Yard's actual Home button. They verify App → Home → Yard, one on-screen saved visit, Yard → Home → Garden → Home → Yard, and reload at the same three viewports. The existing read-only diagnostic API is observed; no store or navigation setter is called. Browser time is fast-forwarded to the actual saved plan's on-screen phase. This is fixture-backed actual UI evidence, not live backend end-to-end evidence or uninterrupted-duration acceptance.

Preserve `test-results/saved-visit-app/` and `test-results/saved-visit-scene/`, including failures. No seven-clip renderer rerun is needed for this checkpoint. Full UI matrix, all-phase actual-shell framing and real-device motion/performance remain separate acceptance gates before enabling the default.
