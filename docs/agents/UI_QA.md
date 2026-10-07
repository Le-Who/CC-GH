# Mobile-first UI acceptance

## Select coverage

- Small contained UI change: `320x568`, `360x800` or `390x844`, plus every affected orientation/device class.
- HUD, Pixi, dock, responsive shell, dialog, or touch change: full matrix.
- New visible game, broad shell, or release-risk change: full matrix plus one rotating phone viewport. Use rotating coverage for high-risk typography, dock, and HUD work.

Full matrix: `320x568`, `360x800`, `390x844`, `414x896`, `568x320`, `844x390`, `768x1024`, `1024x768`, `1280x720`.

Rotating phones: `375x812`, `384x832`, `393x873`, `412x915`, `430x932`.

Include one `deviceScaleFactor: 2` pass, preferably a common phone. Phone/tablet touch passes use `isMobile: true` and `hasTouch: true`. For iterative browser inspection/interaction, apply the available `playwright-interactive` skill; if unavailable, report the gap rather than claiming its checks ran.

## Verify behavior and appearance separately

- Telegram host minimum size is outside app control. Use viewport mounting, `expandViewport()`, supported optional fullscreen, safe-area CSS variables, stable viewport height, and adaptive inner layout.
- At 320px, no horizontal scroll. Dock labels/icons remain visible; labels are readable with sufficient contrast.
- Thumb controls, HUD, and transient feedback stay clear of hittable Pixi/gameplay areas. Put live feedback in the reserved lower HUD/action area or another tested non-overlapping surface; use modals intentionally.
- Dialogs are reachable, focusable, and visibly dismissible. App/HUD/dock/dialog tap targets are at least 44×44 CSS px where practical. Smaller gameplay objects still need usable interaction zones or alternate controls. Controls work without hover.
- Pointer sessions clean up on pointer cancellation, blur, and visibility changes. Resize/redraw, including Pixi canvas resizing, follows viewport, visual viewport, and orientation changes.
- Check ordinary and interrupted interaction, pause, movement, obstacles, item placement, and WebGL recovery when affected. Real scroll tests must scroll the actual scrollable list, not move a fixed panel to conceal a defect.
- Visible clipping, cut-off controls, weak contrast, broken layering, awkward motion, or hover-only affordances fail visual acceptance even when functional tests pass. Check compact phone, wide landscape, and tablet framing/labels.
- A screenshot cannot establish absence of a flash: use continuous recording including the first frame after closing the affected window.

## Register and validate a region

1. Classify visual-only, asset-tunable, coordinate-tunable, layout-, safe-area-, and Pixi-affecting capabilities, or record the intentional exception.
2. Find the current registry and default layouts in the checkout. Register the ID/capabilities, add the game's base default, then only necessary profile overrides.
3. Render through the appropriate region component, hook, data attribute, shared Pixi adapter, or documented custom adapter.
4. Add validation/tests. Discover and run the checkout's HUD-layout validation script whenever defaults, registry entries, profiles, or editor-tunable regions change.
5. Test `320x568`, a common phone, and landscape; apply the full matrix when the coverage rules above require it. Record visual and functional outcomes independently.

## Preflight new or changed browser harnesses

1. Record each expected outcome and its requirement or independent oracle before running: observation (computed visibility and actual control state), lifecycle (retire/recreate versus restore), and scope (Yard commands versus unrelated navigation traffic). Read the current owners/helpers to choose the observation point; product output is evidence, not the expected answer. Preserve exact economy, nonce, ownership, and negative assertions.
2. Run the existing resource-closure/import checks against the exact publishable tree, including runtime-fetched shaders, models, JSON, and fixture provenance. A local overlay passing is insufficient if its files are absent from the branch. Reuse existing preflights rather than adding another test framework.
3. For a newly authored path, first select one compact-phone case with the existing runner filter in the already-authorized diagnostic route. If local Chromium is blocked, use the existing authorized CI route; a blocked local run is not a pass. Then run the required complete acceptance matrix on the final revision. A one-viewport diagnostic detects shared harness assumptions; it does not establish race freedom, visual acceptance, or other-device behavior.
4. Capture failure evidence before closing the browser: original error, URL/query keys, computed visibility, relevant selector counts, visible controls/dialog state, last relevant response metadata, diagnostics, and screenshot. Record capture failures separately and rethrow the original failure. Persist comparison inputs before assertions, including native before/after pixels.
5. Classify using evidence: missing fixture/resource, incorrect observation/selector, mismatched lifecycle/policy scope, product defect, or unclassified. Keep product regressions and strict assertions. After shared prerequisite gates succeed, let independent checks report their own results; distinguish failed from skipped. A harness correction requires a fresh run and does not convert the earlier failure into a pass.

