# Codex Handoff: Garden Shelf Mobile Detail Sheet

Date: 2026-05-05

## Repo And Branch

- Repo: `E:\Projects\CC-GH-SKILLS\CC-GH`
- Remote: `https://github.com/Le-Who/CC-GH.git`
- Branch: `codex/telegram-pixi-vps-migration`
- HEAD at handoff start: `b6f4ed0f5602f38e8be2e2d7d2f595f7b0920839` (`GS viewport fix`)
- Upstream state at handoff start: local branch was aligned with `origin/codex/telegram-pixi-vps-migration`
- Dirty state at handoff start: only untracked `tmp/visual-qa/`
- This handoff file is intentionally added under `docs/codex-handoffs/`

## Current Goal

Create a durable repo-local handoff before archiving Codex history.

The immediately preceding implementation goal was completed: harden the Garden Shelf mature-plant detail sheet for phone-sized and high-DPI mobile layouts while preserving existing gameplay cadence, plant progression, and sync behavior.

## Completed Work

- Portalized the Garden Shelf detail sheet/scrim to `document.body` so the sheet is viewport-bound instead of constrained by the animated/transformed game frame.
- Added explicit dialog semantics and accessibility state to the detail sheet:
  - `role="dialog"`
  - `aria-modal="true"`
  - `aria-label`
  - close-button focus when opened
- Kept dismissal paths reliable:
  - Escape key dismissal
  - outside tap dismissal through the shared dismiss helper
  - visible close button on the sheet itself
- Added/adjusted sheet CSS so it fits narrow mobile viewports:
  - dedicated `.garden-sheet-scrim` reset
  - `width: min(100vw, 560px)`
  - `svh`-aware height fallback
  - `touch-action: pan-y`
  - small-screen height constraints preserved
- Replaced stale Garden Shelf mobile regression assertions with focused high-DPI phone-sized sheet-contract coverage.
- Updated the Garden Shelf e2e test to use touch-aware interaction instead of generic desktop click assumptions for the mature plant path.
- Preserved the current combined reward-note contract: `.garden-floating-note.reward` / `.garden-detail-floating-note.reward`.

## Files Touched

Latest committed implementation (`b6f4ed0 GS viewport fix`):

- `src/games/garden-shelf/components/BottomPanel.tsx`
  - Imported `createPortal` from `react-dom`.
  - Rendered sheet/scrim through a portal.
  - Added close-button focus handling and dialog semantics.
  - Kept `useEscapeDismiss` and `useOutsideDismiss`.
- `src/games/garden-shelf/garden-shelf.css`
  - Added/reset `.garden-sheet-scrim`.
  - Tightened `.garden-bottom-sheet` dimensions, overflow, and mobile fit behavior.
  - Preserved existing Garden Shelf detail-panel styling while making the sheet fit phone layouts.
- `tests/e2e/garden-shelf.spec.js`
  - Added focused test: `keeps mature plant detail fitted and dismissible on phone-sized high-DPI layouts`.
  - Added reusable helpers around opening the detail sheet and asserting the sheet contract.
  - Covered `320x568` DSF 2, `390x844`, and `414x896` touch/mobile contexts.

Files investigated during the rollout:

- `src/games/garden-shelf/GardenShelfGame.tsx`
- `src/games/garden-shelf/components/BottomPanel.tsx`
- `src/games/garden-shelf/components/Garden.tsx`
- `src/games/garden-shelf/garden-shelf.css`
- `src/app/useDismissableLayer.js`
- `tests/e2e/garden-shelf.spec.js`
- Playwright config surface for `chromium` and `mobile-chrome`

Current untracked item not changed by this handoff:

- `tmp/visual-qa/blox-match3-regression-pass.mjs`
  - Appears to be an ad hoc visual QA helper for Blox/Match-3 regression passes.
  - It defaults to `VISUAL_QA_BASE_URL` or `http://127.0.0.1:5177`.
  - Decide whether to keep, move into a tracked script location, or delete later.

## Commands And Tests Already Run

Recovered from the completed rollout:

```powershell
pnpm exec playwright test tests/e2e/garden-shelf.spec.js --project=mobile-chrome --workers=1 -g "keeps mature plant detail"
pnpm exec playwright test tests/e2e/garden-shelf.spec.js --project=mobile-chrome --workers=1
pnpm exec playwright test tests/e2e/garden-shelf.spec.js --project=chromium --workers=1 -g "keeps mature plant detail"
pnpm run build
git diff --check
```

Reported outcomes from that rollout:

- Focused mobile high-DPI Garden Shelf detail-sheet test passed.
- Full `tests/e2e/garden-shelf.spec.js` passed in `mobile-chrome` with 8 tests.
- Focused desktop Chromium detail-sheet test passed.
- `pnpm run build` passed and generated 198 runtime assets.
- `git diff --check` passed, with only Git CRLF normalization warnings.

Commands run while preparing this handoff:

```powershell
git branch --show-current
git status --short --branch
git log --oneline --decorate -n 12
git show --stat --oneline --decorate --name-only HEAD
git show --name-status --format=fuller HEAD
git remote -v
rg -n "garden-detail|garden-bottom-sheet|garden-sheet-scrim|createPortal|keeps mature plant detail|assertSheetContract|openDetailSheet" src/games/garden-shelf/components/BottomPanel.tsx src/games/garden-shelf/garden-shelf.css tests/e2e/garden-shelf.spec.js
git diff --check
```

Handoff-file whitespace check: `git diff --check` passed after this file was added.

## Known Errors, Warnings, And Failing Checks

No current failing tracked check is known at handoff time.

Known historical issues from the completed rollout:

- First mobile e2e run failed because the old test expected `.garden-floating-note.gold` / `.xp`, but runtime now emits combined `.reward` notes.
- First layout probe measured the sheet mid-animation, which made the sheet look out of bounds before the settled state was checked.
- A direct `position: fixed` sheet inside the animated `active-game-frame` was affected by the ancestor transform; portal rendering fixed the viewport-bound overlay issue.
- An ad hoc probe initially imported bare `playwright`; this repo exposes the browser test dependency through `@playwright/test`.
- `git diff --check` emitted CRLF normalization warnings but passed.

Current caveat:

- `tmp/visual-qa/` is untracked. Do not assume it is safe to delete without checking whether the user wants to keep that helper.

## Open Decisions

- Decide what to do with `tmp/visual-qa/blox-match3-regression-pass.mjs`:
  - keep as local scratch,
  - promote into a tracked script/test helper,
  - or delete if obsolete.
- Decide whether this handoff file should be committed on the current branch or left as a local archive artifact.
- If future UI work touches Blox/Match-3 or shared shell surfaces, run the full viewport QA order again rather than relying on the Garden Shelf-specific pass.
- If this branch needs release completion beyond the already pushed `b6f4ed0`, confirm whether a PR/deploy step is desired before creating one.

## Constraints, Preferences, And Do-Not-Touch Areas

Session-specific constraints:

- Treat UI, HUD, Pixi scene, bottom dock, responsive layout, and touch interaction changes as mobile-first.
- Use `playwright-interactive` for iterative UI debugging on UI work.
- Verify explicit viewport passes first:
  - `320x568`
  - `390x844`
  - `414x896`
  - `768x1024`
  - `1024x768`
  - `1280x720`
- Include at least one high-DPI pass with `deviceScaleFactor: 2`.
- Use `isMobile: true` and `hasTouch: true` for touch behavior.
- For Telegram-like constraints, verify no horizontal scroll at 320px, bottom dock label/icon fit, HUD/playfield separation, reachable/focusable dialogs, practical 44x44 tap targets, pointer cleanup on blur/visibility changes, and resize/redraw after viewport changes.
- Run visual QA separately from functional QA.
- Treat visible clipping, cut-off controls, unreadable labels, weak contrast, broken layering, and awkward motion as bugs even if tests pass.

CC-GH-specific constraints:

- Never optimize only for desktop Chrome.
- Do not rely on hover-only affordances.
- Keep live-game events in the lower HUD/action log unless a game intentionally uses a modal/dialog.
- Keep thumb-reachable controls clear of the Pixi playfield.
- Validate Pixi canvas resizing after WebView viewport changes.
- Preserve external gameplay contracts unless explicitly asked to change them.
- Preserve Garden Shelf mature-tap cadence: do not change the current 500ms mature-tap cadence unless a future task explicitly authorizes it.
- Preserve plant progression and sync behavior.
- Keep regression coverage focused when the task is specifically about the sheet/close contract.
- Avoid broad refactors across `routes/player.js`, `game-logic/*`, or shared runtime surfaces unless the requested change truly needs it.
- Do not loosen performance or build budgets to make a check pass.

## Next Concrete Steps

1. Run `git status --short --branch` and confirm the only intended local changes are this handoff file plus any consciously retained `tmp/visual-qa/` scratch.
2. Decide whether to commit this handoff. If yes, stage only `docs/codex-handoffs/2026-05-05-garden-shelf-mobile-sheet-handoff.md` unless the user explicitly asks to include `tmp/visual-qa/`.
3. If continuing Garden Shelf sheet work, start from `tests/e2e/garden-shelf.spec.js` and the `openDetailSheet()` / `assertSheetContract()` helpers instead of adding another broad e2e path.
4. For any new UI/HUD/Pixi/touch change, apply the viewport QA order listed above before claiming completion.
5. If Blox/Match-3 visual regression work resumes, inspect `tmp/visual-qa/blox-match3-regression-pass.mjs`, decide whether it belongs in the repo, and run it only against a live dev server at the expected base URL.
6. If branch publication is needed, confirm whether the target is commit/push only or PR/deploy; the current branch already matched origin at handoff start.
7. If a fresh Codex chat continues from this handoff, have it read this file first, then verify live git state before editing.

## Reactivation Prompt

Paste this into a fresh Codex chat:

```text
We are continuing work in E:\Projects\CC-GH-SKILLS\CC-GH on branch codex/telegram-pixi-vps-migration.

First read docs/codex-handoffs/2026-05-05-garden-shelf-mobile-sheet-handoff.md, then run git status --short --branch and git log --oneline --decorate -n 5 to verify the live state. Do not rely on old chat history.

Context: the latest completed implementation was b6f4ed0 "GS viewport fix", which portalized the Garden Shelf mature-plant detail sheet to document.body, fixed phone/high-DPI sheet fit and dismissal reliability, and updated tests/e2e/garden-shelf.spec.js with focused mobile sheet-contract coverage. The branch was aligned with origin/codex/telegram-pixi-vps-migration at handoff start. There was an untracked tmp/visual-qa/blox-match3-regression-pass.mjs helper; do not delete or commit it unless I explicitly ask.

Hard constraints: UI/HUD/Pixi/touch work is mobile-first. Use playwright-interactive for iterative UI debugging. Verify 320x568, 390x844, 414x896, 768x1024, 1024x768, and 1280x720; include at least one DSF 2 pass; use isMobile/hasTouch for touch behavior. For Telegram-like constraints, check no 320px horizontal scroll, bottom dock fit, HUD/playfield separation, reachable/focusable dialogs, practical 44x44 tap targets, pointer cleanup on blur/visibility changes, and resize/redraw after viewport changes. Treat clipping, unreadable labels, weak contrast, broken layering, or awkward motion as bugs. Preserve Garden Shelf's 500ms mature-tap cadence, plant progression, and sync behavior. Do not loosen budgets.

Start by summarizing the current git state and then continue with the specific task I give next.
```
