# Yard redesign: UI-only fixed-fixture preview

This is a separate diagnostic for the candidate's actual React component, CSS,
authored item images and RU/EN translations. It is **not release approval,
production API acceptance, live gameplay, or geometry/animation acceptance**.
The root workflow and application contracts are unchanged.

The workflow runs only on a push to the exact branch `qa/yard-redesign-preview`.
It has read-only repository permission, no credentials, no application server,
no deployment step and no mutation transport. It installs the existing lockfile
with `pnpm install --frozen-lockfile` and verifies React/ReactDOM 19.2.4.

`vite.config.mjs` serves a separate fixture entry and reads the repository's
existing `public` assets. CI uses a sparse checkout of the component, fixture
and still-image inputs, excluding actor atlases and source archives. It does not import the production Vite/PWA plugins,
change feature/release flags, run a production build, or copy the media tree.

The component and its styling remain unmodified. Fixture adapters replace the
store, translations provider, HUD-editor integration, scene, and presentation
boundary only inside this entry. Catalog definitions, strings, currency
formatting and the Escape-dismiss hook come from the actual repository.
The canvas is deliberately not a live scene. Placement success/failure outcomes
are explicit fixtures that test the UI's explanations, not the real validator.
Every attempted mutation returns an explicit blocked error; none returns success.

## Evidence

Artifacts and every screenshot filename identify `UI-only fixed fixture`.
The artifact keeps each original screenshot, metric, failure trace, tested commit, source hashes and this scope document once. Duplicate attachment copies and a separate HTML report are excluded.
320×568, 390×844 at DPR2, and 844×390 cover:

- Both large balances and accessible exact values
- Placed/occupied/worn items, inventory and mixed-price shop selection
- Food images and unavailable second-bowl controls
- Guests, all eight known portraits, album previews and helper
- Empty, loading, error and English states
- Valid/outside/collision/reserved placement explanation fixtures
- Real click, close and Escape interactions, and a rejected mutation attempt

Checks require loaded visible preview images, no horizontal scrolling or clipped
fixed controls, labels fitting their containers, and controls at least 44×44 CSS
pixels. Scrollable panel contents may naturally extend below the scrollport.
Screenshots are captured before layout assertions so failures remain reviewable.
Human comparison with the design reference is still necessary. The wooden UI surfaces are separate generated data-free assets. Item thumbnails are transparent-padding crops of the same runtime stills; existing authored visitor portraits are preserved. No replacement item or character art is introduced.
A green diagnostic does not change the active production fence or approve release.

## Run with the repository's installed dependencies

`pnpm exec playwright test --config tests/yard-redesign-preview/playwright.config.mjs`

This starts only the isolated Vite UI fixture on 127.0.0.1:4196. Run it in an
explicitly authorized browser-capable environment. Do not use this harness to
bypass a browser, network or execution restriction in another environment.
