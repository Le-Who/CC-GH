# Pixel-Perfect Menu Scaling Design
Date: 2026-05-23

## 1. Problem Statement
The menu screens in several games (Building Blox, Gem Crush, Bubbo Bubbo, Brain Blitz) suffer from visual misalignment on responsive layouts. The root causes are:
1. **Incorrect Asset Usage:** CSS variables for dialog backgrounds (`--[game]-dialog-art`) are hardcoded to `merge-dialog-panel.png` across all games, ignoring the game-specific panels configured in `src/app/screenSurfaceAssets.js`.
2. **Text/Hitbox Drifting:** The background assets contain visually "baked" places for buttons. The DOM buttons are rendered as transparent hitboxes using absolute percentage positioning over these baked places. However, because font sizes (`rem`, `vw`) and button heights (`min-height: 44px`) do not scale proportionally when the parent overlay shrinks or changes aspect ratio on smaller viewports, the text and hitboxes drift out of the visual boundaries.

## 2. Proposed Solution (Pixel-Perfect CSS Transform)
We will lock the internal overlay content to a fixed virtual resolution (356x534, a 2:3 aspect ratio) and use a CSS `transform: scale(...)` driven by a `ResizeObserver`. This guarantees that text, hitboxes, and background art scale uniformly as a single unit without drift.

### 2.1 React Component Changes (`src/app/shell.jsx`)
In the `GameShell` component, we will:
- Introduce a `ResizeObserver` to monitor the dimensions of the `pauseOverlay` container.
- Calculate a uniform scale factor: `const scale = Math.min(width / 356, height / 534);`.
- Wrap the `overlay` content in a new `<div className="game-menu-scaler">` and apply the calculated `transform: translate(-50%, -50%) scale(...)`.

### 2.2 CSS Changes
In `src/index.css`:
- Make `.game-menu-overlay` a transparent, borderless host container.
- Define `.game-menu-scaler` with absolute positioning, `width: 356px`, `height: 534px`, and `transform-origin: center center`.

In game-specific CSS files (`blox.css`, `match3.css`, `bubbo.css`, `trivia.css`, `merge.css` if necessary):
- Migrate `::before` pseudo-elements containing the background art and drop-shadows from `.game-menu-overlay` to `.game-menu-scaler`.
- Update the background art variables to use their respective game-specific panels:
  - `--blox-dialog-art: url("/games/ui-surfaces/blox-dialog-panel.png");`
  - `--match3-dialog-art: url("/games/ui-surfaces/match3-dialog-panel.png");`
  - `--bubbo-dialog-art: url("/games/ui-surfaces/bubbo-dialog-panel.png");`
  - `--trivia-dialog-art: url("/games/ui-surfaces/trivia-dialog-panel.png");`

### 2.3 Test Updates (`tests/ui-screen-surfaces.test.js`)
Update the test `mini-game menus use neutral dialog art instead of blue slot panels` to:
- Verify that each game uses its matching dialog art surface (e.g., `blox-dialog-panel.png` for Blox).
- Remove the strict assertion forcing `merge-dialog-panel.png` globally.

## 3. Self-Review
- [x] No placeholders or ambiguous logic.
- [x] Scope is well-defined and constrained to fixing the dialog menu drifting issues.
- [x] HUD Layout Editor compatibility is preserved (the editor manipulates the outer `pauseOverlay`, which remains unaffected).
