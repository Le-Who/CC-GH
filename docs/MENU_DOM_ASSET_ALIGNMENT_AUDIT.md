# Menu DOM/Asset Alignment Audit

Date: 2026-06-08

## Scope

Audit target: generated or asset-backed menus where runtime DOM content is laid over panel art with painted rows, cards, slots, or controls.

The failure mode is DOM content using an independent flow layout while the image asset already contains authored cells. In that state, a list container can be inside the panel while individual rows land between painted cells.

## Findings

| Area | Evidence | Status |
|---|---|---|
| Cozy Yard `shop` | `YARD_SCREEN_SLOT_MAPS.shop` declared `shop-food-row`, `shop-goodies-row`, and `shop-background-row`, but rendered `YardShopRow` nodes were only inside large list containers. | Fixed: rendered rows now receive `yardGroupSlotAttrs(...)` and e2e checks measure row groups. |
| Cozy Yard `goodies` | `YARD_SCREEN_SLOT_MAPS.goodies` declared `inventory-row` and `placed-row`, but inventory/placed DOM rows flowed inside `inventory-list` and `placed-list`. | Fixed: rendered rows now receive `yardGroupSlotAttrs(...)` and e2e checks measure row groups. |
| Garden Shelf `seed-shop-inventory` | The generated panel was bound through `data-garden-panel="seed-shop-inventory"`, but shop/inventory rows used a flex list without asset slot row coordinates. | Fixed: sheet exposes `data-asset-slot-surface="garden-seed-shop-inventory"` and rows use `assetSlotStyle(...)` through `gardenSeedRowAttrs(...)`. |
| Garden Shelf `quests` | Quest panel already uses panel and row slot coordinates via `assetSlotStyle(...)`. | Verified, no production change needed. |
| Garden Shelf `plant-detail` | Single-detail surface uses named percentage lanes for title, plant stage, metrics, and actions. It does not have repeated painted row cells. | Documented exception; keep monitored by existing static/mobile checks. |
| Garden Shelf `settings`, `reward`, `offline-reward` | Simple fixed dialogs use percentage slots and do not contain repeated dynamic rows. | Documented exception; acceptable unless new painted cells or repeated dynamic content are added. |
| Mini-game pause/menu overlays | Blox, Match3, Bubbo, Merge, and Trivia menu shells use generated dialog art and game-specific CSS slot lanes. | Existing static coverage remains in `tests/ui-screen-surfaces.test.js`; no new defect found in this pass. |
| Settlement right panels | Settlement uses asset-backed `HudFrame` and panel chrome with game-specific layout. The audited issue was not row art with independent DOM flow in generated menu-panel assets. | No change in this pass; future row-art changes should use registered layout regions or a documented adapter. |
| Farm legacy panels | Hidden compatibility surface uses legacy panels and card/list flows, not the new generated menu-panel contract. | No change in this pass; treat as a documented legacy compatibility exception until re-exposed. |

## Contract Added

- If a generated panel contains repeated painted rows/cards, each runtime row must receive a row-level slot attribute and measured slot coordinates.
- A large list container alone is not enough evidence of alignment.
- Static tests must prove row-slot hooks exist; browser tests should measure row group rectangles where the surface is reachable in e2e.
- Compact landscape can shrink portrait panel row art below the 44px tap-target floor. In that case runtime hit zones may grow to the tap floor, but row top/left/width must still stay pinned to the authored lane and the row must cover the painted lane.

## Verification Targets

- `tests/ui-screen-surfaces.test.js` checks static slot contract coverage for Yard and Garden.
- `tests/e2e/companion-yard.spec.js` checks Yard panel row group rectangles against `YARD_SCREEN_SLOT_MAPS`.
- `tests/e2e/garden-shelf.spec.js` checks Garden seed-shop row groups against generated panel lanes across small phone, common phone, and landscape viewports.
- Mobile QA should include `320x568`, a common phone viewport, and landscape for these panels after UI changes.
