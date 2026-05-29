# Asset Menu Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing production menu/HUD assets own the visible menu chrome across the visible CC-GH games instead of leaving old CSS gradient panels on top.

**Architecture:** Keep each game's React/Pixi mechanics and layout intact, but add an explicit asset-owned menu contract in the static tests and CSS. The shared shell remains responsible for overlay structure and HUD layout; game CSS may position content, while final visible panel/button/metric surfaces must use committed generated assets.

**Tech Stack:** React 19, Vite, PixiJS 8, Node test runner, Playwright.

---

### Task 1: Add Failing Asset Chrome Contract

**Files:**
- Modify: `tests/ui-screen-surfaces.test.js`

- [x] **Step 1: Write the failing test**

Add a test that reads the visible mini-game CSS files and asserts the final matching blocks for menu scaler, pause brief, header, metrics, and action buttons bind generated `hud-redesign` or `ui-surfaces` assets instead of linear-gradient panels.

- [x] **Step 2: Run the focused test**

Run: `pnpm exec node --test tests/ui-screen-surfaces.test.js`

Expected before implementation: FAIL because at least Blox, Bubbo, Match3, Merge, or Trivia still has final menu inner-surface rules whose visible background is a CSS gradient or transparent hitbox instead of generated art.

### Task 2: Move Shared Menu Chrome Onto Assets

**Files:**
- Modify: `src/app/hud-redesign.css`
- Modify: `src/games/blox/blox.css`
- Modify: `src/games/match3/match3.css`
- Modify: `src/games/bubbo/bubbo.css`
- Modify: `src/games/merge/merge.css`
- Modify: `src/games/trivia/trivia.css`
- Modify if cheap: `src/games/farm/farm.css`

- [x] **Step 1: Implement minimal CSS**

Use existing variables such as `--hud-redesign-dialog-art`, `--hud-redesign-button-art`, `--hud-redesign-metric-art`, `--hud-redesign-panel-art`, and per-game fallbacks. Preserve game-specific sizing, but make final visible surface rules use production PNG assets and keep labels visible.

- [x] **Step 2: Re-run focused test**

Run: `pnpm exec node --test tests/ui-screen-surfaces.test.js`

Expected after implementation: PASS.

### Task 3: Validate Layout Contract And Runtime Build

**Files:**
- No planned source changes unless validation exposes a specific defect.

- [x] **Step 1: Run HUD layout validation**

Run: `pnpm run hud-layout:validate`

Expected: PASS, with all visible games still covered.

- [x] **Step 2: Run focused Node suite**

Run: `pnpm test`

Expected: PASS.

- [x] **Step 3: Run production build**

Run: `pnpm run build`

Expected: PASS.

### Task 4: Run Mobile/WebView Visual QA

**Files:**
- No planned source changes unless browser QA exposes clipping, horizontal scroll, missing assets, or hidden controls.

- [x] **Step 1: Start local server**

Run: built `server.js` with `PORT=5174`, `NODE_ENV=test`, and dev auth enabled.

Expected: the production build serves locally without the Vite-only API fallback errors.

- [x] **Step 2: Run focused browser QA**

Check Blox, Gem Crush, Merge, Bubbo, Brain Blitz, and Cozy Yard at `320x568`, `360x800`, `390x844`, and one landscape viewport. Use one `deviceScaleFactor: 2` phone pass. Confirm no horizontal scroll, menu labels visible, button targets usable, and generated art loading.

- [x] **Step 3: Escalate to full matrix if broad shell behavior changed**

Run the full HUD/WebView matrix if visual inspection shows shell-wide movement or responsive regressions.
