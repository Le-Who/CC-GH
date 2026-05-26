## UI, Mobile, DPI, and Telegram WebView QA

For any UI, HUD, Pixi scene, bottom dock, responsive layout, or touch interaction change, treat the task as mobile-first. Do not optimize only for desktop Chrome.

Use QA scope that matches the change:

- Instruction/docs-only changes: inspect the rendered text/diff and run the narrowest relevant static check. Browser QA is not required unless the instructions change executable UI expectations.
- Small contained UI changes: run a focused viewport slice that includes `320x568`, one common phone viewport (`360x800` or `390x844`), and any affected orientation or device class.
- HUD, Pixi, bottom dock, responsive shell, dialog, or touch changes: use the full HUD/WebView QA matrix below.
- New visible games, broad shell changes, or release-risk changes: use the full matrix plus one extended/rotating phone viewport.

For iterative UI debugging, apply the `playwright-interactive` skill when the change requires browser inspection or interaction.

Full HUD/WebView QA matrix:

- `320x568` small mobile floor
- `360x800` common Android mobile
- `390x844` common mobile
- `414x896` large mobile
- `568x320` compact phone landscape
- `844x390` common phone landscape
- `768x1024` tablet portrait
- `1024x768` tablet landscape
- `1280x720` desktop smoke

Extended/rotating phone viewports for high-risk typography, dock, and HUD work:

- `375x812`
- `384x832`
- `393x873`
- `412x915`
- `430x932`

For high-DPI checks, run at least one pass with `deviceScaleFactor: 2`, preferably on a common phone viewport. For touch behavior, use `isMobile: true` and `hasTouch: true` on phone and tablet passes.

For Telegram-like constraints, verify:

- Telegram host window minimum width/height is not controllable by the app; use viewport mounting, `expandViewport()`, optional fullscreen where supported, safe-area CSS vars, stable viewport height, and adaptive inner layout instead.
- no horizontal scroll at `320px`;
- bottom dock labels/icons are not clipped;
- HUD and transient feedback do not overlap hittable Pixi/gameplay areas;
- dialogs are reachable, focusable, and have a visible dismiss/exit path;
- app controls, HUD controls, dock buttons, and dialog buttons use at least `44x44` CSS px tap targets where practical;
- canvas/gameplay objects may be visually smaller than `44x44` when the mechanic requires it, but the interaction zone or alternate control must remain usable;
- pointer sessions clean up on `pointercancel`, blur, and visibility changes;
- resize/redraw happens after viewport, `visualViewport`, and orientation changes.

Run visual QA separately from functional QA. Treat visible clipping, cut-off controls, unreadable labels, weak contrast, broken layering, awkward motion, or hover-only affordances as bugs even if tests pass.

For CC-GH specifically:

- Do not rely on hover-only affordances.
- Keep thumb-reachable controls clear of the Pixi playfield.
- Transient live-game feedback should stay in a reserved lower HUD/action area, or another tested non-overlapping surface. Use modal/dialog behavior only when intentional.
- Validate Pixi canvas resizing after WebView viewport changes.

## HUD/UI Layout Contract

The shared HUD layout system owns viewport/orientation profiles, safe-area and reserve contracts, editor persistence, repo defaults, export/import, and validation.

Games may keep custom UI implementation, animation, Pixi-native surfaces, flow layouts, and game-specific composition. Do not make future changes say or imply that all UI must use `HudRegion`.

If a UI region affects layout, safe area, bottom dock, playfield reserves, or pre-deploy positioning, register it in the layout system or document it as an intentional exception.

If a visual asset, panel skin, Pixi frame, background, in-game image, or high-value button art needs pre-deploy positioning, scale, opacity, rotation, or visibility tuning, expose it as an asset-capable layout region or document why it is intentionally fixed.

If gameplay-facing placement anchors need pre-deploy tuning, such as Settlement construction slots, building ghost anchors, built-building default positions, spawn anchors, or similar map coordinates, expose them as coordinate-space layout regions with a custom adapter. Do not leave these as unregistered one-off `x/y` constants when the editor is the intended calibration tool.

Do not add one-off viewport magic numbers for HUD/playfield spacing when a layout default or profile should own the value. Game-internal geometry constants are acceptable when they do not control cross-surface layout, safe areas, docks, or editor-tunable placement.

New visible games must add:

- default layout coverage;
- semantic orientation profiles or a documented fallback;
- relevant region registrations/adapters;
- at least one meaningful asset-capable region when the game has tunable visual assets, or a documented exception when it does not;
- coordinate-space placement regions for authored anchors that must be tuned in the editor;
- validation tests.

Pixi scenes should consume safe/reserve values through `sceneState`, `hudReserves`, or a clear adapter instead of directly depending on unrelated DOM measurements when avoidable. Pixi visual assets that need editor tuning should use the shared Pixi asset adapter or a documented custom adapter; do not add per-scene one-off debug handles.

Map-coordinate adapters must keep their coordinate system explicit, for example `coordinateSpace: "settlementMap"`, and convert editor drag deltas back into that source coordinate space before writing overrides.

The HUD editor is a pre-deploy/debug tool. Ordinary production players must not receive local overrides, and browser-side editor exports must not write source files or affect other users. If a future editor path gains server writes or shared persistence, gate it behind explicit dev/admin authorization.

Validate portrait and landscape separately. Landscape is not squeezed portrait. Tablet portrait and tablet landscape may need distinct defaults.

No horizontal scroll at `320px`. Tap targets for visible app controls should be at least `44x44` CSS px where practical. Do not rely on hover-only affordances.

Visual QA is separate from functional QA.

If a future UI needs a new layout mode, extend the layout system instead of bypassing it silently.

If a future visual asset needs a new edit primitive, extend asset-region capabilities instead of bypassing the editor with local CSS transforms.

### How To Add A New HUD/UI Region

1. Decide whether it is visual-only, asset-tunable, coordinate/anchor-tunable, layout-affecting, safe-area-affecting, Pixi-affecting, or an intentional exception.
2. Register the region id and capabilities in `src/app/hud-layout/registry.js`.
3. Add a base default in `src/app/hud-layout/defaultLayouts/{gameId}.json`.
4. Add profile overrides only where the base default is not enough.
5. Render through `HudRegion`, `HudEditableRegion`, `useHudRegion`, a `data-hud-region` fallback, the Pixi asset adapter, or a custom adapter.
6. Add validation or test coverage for the region/default.
7. Run `pnpm run hud-layout:validate` when layout defaults, registry entries, profiles, or editor-tunable regions change.
8. Run viewport/orientation QA, including `320x568`, one common phone viewport, and at least one landscape pass. Use the full matrix for broad HUD/Pixi/shell changes.
