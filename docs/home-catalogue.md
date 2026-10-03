# Home catalogue

Home is a full-viewport navigation dialog containing the eight existing games. Garden remains a game, with its own inventory, currency display and settings. The initial game and last-tab URL behavior remain unchanged.

The catalogue uses warm neutral CSS surfaces, two columns on phones and four on tablets and short landscape screens. Current production artwork appears only inside lazy 256×144 WebP thumbnails. Shared gold, energy and tokens, profile information, theme and audio controls are below the catalogue. Local game wallets and settings remain in their games.

Opening Home pauses an active run and retains the same mounted game beneath an inert surface. Late Start responses and Trivia polling reassert pause while Home is visible. Close, Escape, Telegram Back and browser Back dismiss Home without resuming the run. The player resumes through the game's existing Resume control.

Selecting another game is serialized. It requires the current account's loaded outbox, no busy or pending actions, no storage failure, and a matching mounted controller. Active rounds show Finish & open. Blox, Match3 and Bubbo await their existing end actions; acknowledged saved Match3/Bubbo rounds also finish on leave. Trivia awaits `controller.leave(true)`. Merge requires its custom transport/recovery to settle. Town's shell adapter awaits its existing `persist.rehydrate()` command-lock barrier and rejects persistence failures. Account session, active game and pending readiness are checked again after retiring Home's history entry and before committing the target.

Garden opens Home from its existing header. Immersive games open it from their existing menu/pause controls; no persistent catalogue overlay covers Blox, Match3 or Bubbo. Legacy Yard opens it from its settings panel. Town opens Home from a 44px All games button inside its existing top HUD, and also supports Telegram Back and Escape. The header keeps the same playfield reserve and all six local resources.

`gardenHomeButton` and `settlementHomeButton` are registered in the HUD registry/defaults and can be moved/exported in the editor. Fine control handles remain selectable over artwork. Home itself is an intentional HUD-layout exception: a viewport-sized scrolling navigation dialog using the shared four-axis safe-area CSS variables. It is not a gameplay HUD or Pixi placement region. The debug HUD editor hides while Home is open; game components remain mounted.

The global `bottomDock` registrations/defaults and rendered bottom tabs are removed. The old Yard panel is still a live game asset and is retained. No Yard migrations, account fences, game economics, SW/cache policy or Settlement commands/save formats change.

## Verification

Run the normal repository unit command, `node scripts/hud-layout-validate.mjs`, and the navigation suite with `node node_modules/@playwright/test/cli.js test --config=playwright.home.config.js` against an already running local app. `HOME_PREVIEW_URL` overrides the default `http://127.0.0.1:3315`. The included `scripts/home-preview-server.mjs` starts Vite with an API proxy; `HOME_API_PORT` defaults to 3314. Use the repository's existing browser and dependency installation.

The browser suite checks mounted-game retention, inert/focus behavior, Back/Close, deferred Start responses, saved runs, denied/retried saves, rapid transitions/reload, and ten touch/DPR2 viewport cases. It saves native PNGs and JSON evidence under `output/playwright`. Blox/Match3/Bubbo navigation fixtures execute production mutation/receipt code at the player API boundary because this environment has no Postgres. This does not validate real database durability or a native Telegram client.

Thumbnails can be reproduced with `node scripts/home-thumbnails.mjs` using the existing Sharp dependency. The source hashes and byte counts are recorded in `public/games/home-thumbnails/manifest.json`. The separate `preview/home.html` renders the same catalogue component for design review; its values are examples.

Historical Blox verification retains the immutable gameplay preview. Its expected AST adds only the exact acknowledged `safeLeave` property and `performAction` memo dependency, and changes one menu label from Exit to All games. The actual adapter is executed separately against deferred, failed and successful responses. Core hashes use the existing LF-normalized reader so Windows CRLF does not change the oracle. Performance budgets remain unchanged.

Retired Home history entries remain explicitly owned. A narrow popstate guard repairs only these entries to the still-mounted game URL, including Forward after later successful switches. Unrelated history is untouched; this never selects or resumes a game. The switch destination is committed only after the existing acknowledged-leave and account/storage checks. Listener cleanup retains the registered capture flag.
