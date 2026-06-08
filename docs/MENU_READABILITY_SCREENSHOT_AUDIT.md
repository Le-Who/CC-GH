# Menu Readability Screenshot Audit

Date: 2026-06-08

## Evidence

Screenshots supplied by the user show two failure classes:

- Runtime DOM content is still not using the authored slots of generated menu art.
- Text is visually clipped, too small, or layered over unrelated controls and decoration.

## Findings From Screenshots

| Surface | Screenshot symptom | Status |
|---|---|---|
| Garden Shelf `plant-detail` | Title/meta are cramped inside the hanging plaque; hint text crosses the income panel; action labels and evolve price sit too low near frame decoration. | Patched CSS lane positions, absolute slot widths, plant button scale, and text sizing in `garden-shelf.css`; added fixed-slot collision e2e coverage. |
| Garden Shelf `seed-shop-inventory` | Plant copy was effectively missing/clipped because row content used a three-column grid while the copy DOM occupied only the narrow image lane. | Patched row grid so plant thumbnail and copy span the readable content lanes, with the price button in the action lane. |
| Garden Shelf `quests` | Quest title/body/reward/progress/action lanes visually collide; localized kind labels overlap the title/body columns; body text is hard to read at mobile width. | Patched quest card column distribution, font sizes, clamps, and icon-only kind slot in `garden-shelf.css`; added row collision e2e coverage. |
| Cozy Yard `shop` | Food/decor/background sections show repeated row content overlapping; price and buy controls collide with labels. | Added late-loaded `companion-yard-alignment.css` row/card lane safeguards. |
| Cozy Yard `decorations` | Inventory/placed rows are too dense; text, icons, and action buttons overlap inside the generated panel rows. | Added late-loaded `companion-yard-alignment.css` row/card lane safeguards. |
| Cozy Yard `petbook` | Guest cards show names/species/tags crossing card slots and adjacent content. | Added petbook/album card grid and text clamps in `companion-yard-alignment.css`. |
| Cozy Yard `remodel/backgrounds` | Remodel cards show preview art and buttons not isolated in their intended lanes. | Covered by late Yard asset-surface row/card overrides; verified by the Russian management panel e2e. |
| Cozy Yard `companion` | Name input, title, save state, and companion choice labels collide with panel art and each other. | Added companion input/label overflow and readable font safeguards; verified by the Russian management panel e2e. |
| Blox live HUD | Title/record label are too small and layered into the top HUD ornament. | Added late-loaded HUD readability CSS; verified by HUD art visual regression guard. |
| Match3 live HUD | Top chips crowd horizontally; score label and pause control visually overlap the bar. | Added late-loaded HUD readability CSS; verified by HUD art visual regression guard. |

## Completion Criteria

- Every screenshot surface must have either a code fix with visual QA evidence or a documented intentional exception.
- Runtime QA must include at least `320x568`, one common phone viewport, one landscape viewport, and one high-DPI/touch pass for the affected HUD/menu surfaces.
- Passing static tests are not enough for this goal; screenshots show readable text and layering problems that require rendered visual checks.
- Asset-backed rows/cards/fixed slots must have rendered collision guards that fail when visible child DOM or text lands between painted cells.
- Long localized labels must not be placed in narrow icon slots; use icon-only visuals with accessible labels or a tested bounded text lane.

## Verification Run

- `node --test tests/ui-screen-surfaces.test.js`
- `pnpm run build`
- `npx playwright test tests/e2e/hud-art-visual-regressions.spec.js --project=chromium --workers=1`
- `npx playwright test tests/e2e/garden-shelf.spec.js --project=chromium --workers=1`
- `npx playwright test tests/e2e/companion-yard.spec.js --project=chromium --workers=1`
- `npx playwright test tests/e2e/mobile-ui-matrix.spec.js --project=chromium --workers=1`

Focused guards added in this pass:

- `garden-shelf.spec.js`: seed-shop row collision guard, quest row collision guard, and plant-detail fixed-slot collision guard.
- `companion-yard.spec.js`: Yard management panel aggregate collision guard across food, goodies, shop, petbook, album, gifts, repair, remodel, companion, and settings surfaces.
