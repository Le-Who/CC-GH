# Pause visibility in narrow Telegram windows

## Observed failure and correction

The user's 515×905 screenshot contains an approximately 495×772 game surface (x=10..505, y=77..849). Building Blox is playing with score 395, lines 15 and reward 55. The score panel, board and tray are visible; neither Rotate nor Pause is visible in the score panel's reserved right-hand area.

The actual `BloxPresentation` tree places `gameplayHud` and `bloxActions` as sibling `HudEditableRegion` elements. Both receive inline geometry from the same composition, and the portrait actions intentionally overlap the right side of the HUD. `HudRegion` applies the registered region's runtime style. The HUD has z-index 40 and filled panel art; the actions had an automatic stacking level. As a result, the panel paints over the controls. The panel's `pointer-events:none` lets clicks reach the controls, explaining why geometry and hit-target tests passed. Source-art inspection found center alpha 253/255, sufficient to obscure the lower controls almost completely.

`bloxActions` now uses registered z-index 41. Button positions, hit areas, art, gameplay and economy are unchanged. The actions stay inside the existing controls stacking context, beneath the pause dialog.

## Other active games audited

- Match3 renders `.m3-pause` inside `.m3-hud`, after the HUD metrics. Its 44×44 absolute button paints over its own parent's background. The HUD reserves horizontal space for it. No equivalent overlapping sibling cover was found.
- Bubbo renders the 44×44 `.bb-pause` inside the `.bb-stats` HUD grid, with a dedicated 44px column. It paints within the HUD rather than beneath a filled sibling.
- Merge V3 renders `ml-open-pause` in the final 48px (44px compact) column of `.ml-hud`, inside the flow workspace. Other workspace panels occupy separate grid areas. The workspace can scroll, and existing reachability checks remain.
- Trivia renders `trv2-pause` in its flow header, separate from the score and question panels. The header and all content can scroll on short screens. It does not use Blox's overlapping sibling arrangement.
- Garden, Yard and Settlement do not expose active round Pause controls. Yard and Settlement explicitly register `activeRun:false`; their persistent-world navigation and panel dismissal remain unchanged. This correction does not invent a pause mode for those games.

## Regression checks

The portable regression renders the actual Blox presentation and combines the emitted inline styles with the actual registered region styles. It verifies two real buttons, the Pause callback/name/enabled state, 44px action capacity, viewport containment and correct sibling ordering across 11 dimensions, both without and with safe insets. The old layout is a negative control: controls still exist and have callbacks, but the overlapping filled HUD paints above them. Swapping the actual original layout into the verification tree makes the new regression fail.

The integrated browser matrix retains its previous geometry, hit-target, pause, dialog, resume and exit assertions. It additionally compares each real Pause control's screenshot pixels against the same region with that control deliberately hidden. Rotate receives the same check. Changes smaller than 24 color levels are ignored, so the barely transmitting old HUD cover cannot appear visible just because a few faint pixels differ. More than 24 changed CSS pixels are required; paired cropped PNGs are attached for inspection. The helper checks safe bounds, loaded icons and a normal Playwright trial click as well.

Coverage includes the original nine viewport sizes plus the screenshot's 495×772 desktop-style inner viewport, 375×812 with safe insets and DPR2, and 568×320 with safe insets. A separate 495×772 browser negative control temporarily restores the original Blox layer, proves hitability while the pixel test detects the covered control, restores the corrected layer and pauses the game normally.

## Validation status

140 portable tests pass with no failures or skips, including the existing arcade suite, the retained Bubbo Telegram lifecycle tests and the new Blox tests. HUD layout validation passes with the existing unchanged Blox/Match3 reserve warnings. E2E source syntax checks pass.

The new screenshot comparisons and integrated browser cases are authored but not yet executed in this dependency-free worker environment. Physical Telegram behavior and the corrected runtime pixels still require CI/device verification. The supplied user screenshot was inspected; no synthetic image is presented as a verified corrected app screenshot.
