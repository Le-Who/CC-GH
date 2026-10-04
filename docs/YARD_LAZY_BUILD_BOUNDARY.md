# Yard immutable-contract build boundary

## Failure and correction

The integrated Vite build first made the persistent Yard code graph reachable.
Its actor adapters import server-owned source contracts for exact calibration,
selection and source validation. Rollup previously combined those large JSON
contracts with executable adapters: the failing build reported a 12.26 MB family
chunk and a 1.49 MB Courtyard chunk.

Workbox's file-size selection runs before `manifestTransforms`. Filtering a
large dynamic chunk out of the final shell manifest is therefore too late to
prevent its size warning/error when the glob initially selects it. A size error
alone does not prove that the chunk actually belongs to the static startup graph.

The correction is build-only:

- `scripts/yard-contract-data.json` explicitly pins 29 JSON files and their
  original SHA-256 identities from the 95-file canonical browser-source closure.
- `manualChunks` assigns only these JSON modules to separate immutable-data
  chunks. `onlyExplicitManualChunks` remains enabled; dependencies are not
  implicitly pulled into those chunks.
- Outputs use `assets/yard-data/yard-data-…-[hash].js`. The unchanged nonrecursive
  Workbox `assets/*` glob excludes them before its unchanged default 2 MiB cap.
- The build plugin inspects every rendered module, including virtual and vendor
  modules. Any executable module, imports, CSS, assets, or static-shell reachability
  in a Yard data chunk fails the build. The graph's data-only classification also
  fails closed if its rendered-module count includes filtered-out modules.
- Game implementations, actor adapters and all `.mjs` code remain executable
  code. They receive no data exemption. The 75,000-byte per-game-chunk ceiling,
  initial JS/CSS limits and 64 MiB image-decode policy remain unchanged.
- The existing scene still imports the family adapter only when an exact family
  actor profile is registered. JSON splitting changes emitted filenames and
  module requests; it does not eagerly import the adapter or register an actor.

## Preserved evidence

No files under `src/`, `game-logic/`, `public/`, or `recovery-tools/` are changed.
All 95 canonical source-closure hashes remain identical. The 706 public media
files and their manifest/source identities are unchanged. No release/acceptance
flags or hashes are regenerated, and no frozen long-duration source checkout is
modified. This patch does not claim that the unexecuted production build passes.

## Required verification

Native: `node --test tests/yard-contract-data.test.mjs tests/sw-shell-precache.test.mjs tests/perf-build-guard.test.js tests/yard-public-media.test.mjs tests/yard-family-media.test.mjs`.
Negative controls cover mixed executable/server/vendor/virtual modules, CSS
imports, unknown JSON, wrong output paths and a static-shell dependency.

After the real `pnpm run build`, CI runs `tests/yard-lazy-built.test.mjs` against
actual Rollup graph and emitted files, rather than a filename-only assertion:

- Yard data chunks must be reachable from the Yard game, absent from every
  static startup entry, data-only in complete rendered-module metadata, and
  absent from built HTML and service-worker precache.
- Every chunk containing persistent Yard game code must remain at or below the
  existing 75 KB executable ceiling; data sizes are reported separately.
- `artifacts/perf/yard-lazy-build-report.json` records actual JSON transfer sizes
  and remaining executable chunk sizes. `perf:guard:build` independently applies
  all existing startup/chunk/media budgets and counts the whole reachable graph.
- Existing production Express media checks and final-container smoke still run.

Production browser smoke is still needed after successful bundling: verify
ordinary startup/service-worker installation fetches no Yard data, opening Yard
loads only the selected view, and accepted Yard actor playback remains lazy and
within existing decode/request limits. Source-level long-run evidence is
preserved, but it does not replace this built-delivery verification.


## Executable renderer boundary after the first real build

The first JSON-only split successfully cleared Workbox, but the actual built
regression reported `CourtyardGame-CHS6eeVi.js` at 100,319 executable bytes, above
the unchanged 75,000-byte limit. That failure is retained as evidence; source
JSON separation alone was not sufficient.

The next build-only change assigns the existing canvas-renderer subsystem to
`assets/yard-renderer-[hash].js`: scene, atlas/cache policy, actor-media,
presentation, projection, pose selection, edge opacity, clock and telemetry.
These ten modules are the exact local static `.mjs` closure of `scene.mjs`,
50,324 source bytes before bundling. React panels/controls remain in the Yard
entry; conditional family/Mochi/Pip adapters retain their separate import paths.
No source imports, behavior, gates, frozen identities or media bytes are edited.

The renderer is executable game code, never data-only. Shared executable
`game-logic/yard-v2/*.mjs` helpers are also explicitly classified as gameplay
code if Rollup emits them separately, closing a possible accidental omission
from the per-chunk cap. The post-build test applies the same 75 KB ceiling to
the entry, renderer and all such helpers, verifies the renderer stays outside
startup and does not statically depend back on its React entry. All reachable
bytes remain in the loading-graph report; no total transfer is concealed.

CI must establish the new actual sizes and run built/browser delivery checks.
The old 100,319-byte artifact is not a measurement of this new split. To make
any further failure diagnosable, an `always()` step records at most 2,048 emitted
JS/CSS filenames and raw lengths, and the always-preserved evidence artifact
includes this small summary and the complete emitted loading graph. No media,
source code, or full-dist payload archive is added.
