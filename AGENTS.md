\## UI, Mobile, DPI, and Telegram WebView QA



For any UI, HUD, Pixi scene, bottom dock, responsive layout, or touch interaction change, treat the task as mobile-first.



Use this verification order:



1\. Apply the `playwright-interactive` skill for iterative UI debugging.

2\. Use explicit viewport passes first:

&#x20;  - 320x568 small mobile

&#x20;  - 390x844 common mobile

&#x20;  - 414x896 large mobile

&#x20;  - 768x1024 tablet portrait

&#x20;  - 1024x768 tablet landscape

&#x20;  - 1280x720 desktop smoke

3\. For high-DPI checks, run at least one pass with `deviceScaleFactor: 2`.

4\. For touch behavior, use `isMobile: true` and `hasTouch: true`.

5\. For Telegram-like constraints, verify:

&#x20;  - no horizontal scroll at 320px

&#x20;  - bottom dock does not clip labels/icons

&#x20;  - HUD does not overlap the Pixi playfield

&#x20;  - dialogs are reachable and focusable

&#x20;  - tap targets are at least 44x44 CSS px where practical

&#x20;  - pointer sessions clean up on blur/visibility changes

&#x20;  - resize/redraw happens after viewport changes

6\. Run a visual QA pass separately from functional QA.

7\. Treat visible clipping, cut-off controls, unreadable labels, weak contrast, broken layering, or awkward motion as bugs even if tests pass.


For CC-GH specifically:

\- Never optimize only for desktop Chrome.

\- Do not rely on hover-only affordances.

\- Keep live-game events in the lower HUD/action log unless the game intentionally uses a modal/dialog.

\- Keep thumb-reachable controls clear of the Pixi playfield.

\- Validate Pixi canvas resizing after WebView viewport changes.


## HUD/UI Layout Contract

The shared HUD layout system owns viewport/orientation profiles, safe-area and reserve contracts, editor persistence, repo defaults, export/import, and validation.

Games may keep custom UI implementation, animation, Pixi-native surfaces, flow layouts, and game-specific composition. Do not make future changes say or imply that all UI must use `HudRegion`.

If a UI region affects layout, safe area, bottom dock, playfield reserves, or pre-deploy positioning, register it in the layout system or document it as an intentional exception.

If a visual asset, panel skin, Pixi frame, background, in-game image, or high-value button art needs pre-deploy positioning, scale, opacity, rotation, or visibility tuning, expose it as an asset-capable layout region or document why it is intentionally fixed.

Do not add one-off viewport magic numbers for HUD/playfield spacing when a layout default or profile should own the value.

New visible games must add:

- default layout coverage;
- semantic orientation profiles or a documented fallback;
- relevant region registrations/adapters;
- at least one meaningful asset-capable region when the game has tunable visual assets;
- validation tests.

Pixi scenes should consume safe/reserve values through `sceneState`, `hudReserves`, or a clear adapter instead of directly depending on unrelated DOM measurements when avoidable. Pixi visual assets that need editor tuning should use the shared Pixi asset adapter or a documented custom adapter; do not add per-scene one-off debug handles.

The HUD editor must stay dev/admin/debug only. Local overrides must not affect ordinary production players.

Validate portrait and landscape separately. Landscape is not squeezed portrait. Tablet portrait and tablet landscape may need distinct defaults.

No horizontal scroll at 320px. Tap targets should be at least 44x44 CSS px where practical. Do not rely on hover-only affordances.

Keep live-game events in the lower HUD/action log unless intentional modal/dialog behavior is used.

Visual QA is separate from functional QA.

If a future UI needs a new layout mode, extend the layout system instead of bypassing it silently.

If a future visual asset needs a new edit primitive, extend asset-region capabilities instead of bypassing the editor with local CSS transforms.

### How To Add A New HUD/UI Region

1. Decide whether it is visual-only, asset-tunable, layout-affecting, safe-area-affecting, Pixi-affecting, or an intentional exception.
2. Register the region id and capabilities in `src/app/hud-layout/registry.js`.
3. Add a base default in `src/app/hud-layout/defaultLayouts/{gameId}.json`.
4. Add profile overrides only where the base default is not enough.
5. Render through `HudRegion`, `HudEditableRegion`, `useHudRegion`, a `data-hud-region` fallback, the Pixi asset adapter, or a custom adapter.
6. Add validation or test coverage for the region/default.
7. Run viewport/orientation QA, including 320px portrait and at least one landscape pass.

