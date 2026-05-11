# Garden Shelf Expanded Plant Prompt Pack

This is the production prompt pack for the expanded Garden Shelf catalog. It preserves the eight existing plants and adds six new plant families as isolated one-family sheets so the cutout step does not mix neighboring sprites.

## Runtime Contract

- Final transparent sheet: `public/games/garden-shelf/assets_transparent.png`
- Keyed review sheet: `public/games/garden-shelf/plants_sheet.png`
- Clean transparent copy: `public/games/garden-shelf/plants_sheet_clean.png`
- Sprite rectangles: `public/games/garden-shelf/sprites.json`
- Existing eight-plant source: `assets-source/imagegen/garden-shelf/existing-8-transparent.png`
- New family source sheets: `assets-source/imagegen/garden-shelf/families/*-source.png` or legacy `*-keyed.png`
- New family transparent sources: `assets-source/imagegen/garden-shelf/families/*-transparent.png`
- Client resolver: `src/games/garden-shelf/lib/sprites.ts`
- Plant order: `daisy`, `lavender`, `basil`, `rosemary`, `monstera`, `succulent`, `pothos`, `strawberry`, `bonsai`, `string_of_pearls`, `orchid`, `venus_flytrap`, `moon_cactus`, `fern`

Generate Garden Shelf in its own image-generation calls. Never combine these sheets with Match-3, Merge/Alchemy Table, HUD parts, or reference art sheets.

## Cutout Rule

Prefer source art with real transparency. If the generator paints a visual checkerboard or a flat background instead of alpha, remove that background locally by sampling the sheet border and flood-filling background-like pixels. Do not require a fixed chroma-key color such as `#123456`; if a temporary flat background is unavoidable, choose a per-sheet color that does not appear in the plant, pot, flowers, soil, cords, or accents.

```text
Transparent background preferred. If transparency is not available, use one simple removable background color chosen for this sheet only, with no shadows, gradients, texture, reflections, floor plane, lighting variation, vignette, or fake transparent checkerboard. Do not use that removable background color anywhere in the plants, pots, strings, leaves, flowers, soil, or decorations. No cast shadow, no contact shadow, no glow bleeding into the background.
```

Use border-sampled background removal plus connected-component alpha cutouts. Source-sheet quarters may locate the four growth phases, but final phase bounds must come from visible pixels plus safe padding rather than fixed equal boxes. Avoid broad global color scrubs that can shift legitimate internal colors.

## Shared Family Prompt Template

Use this template once per new plant family.

```text
Use case: game-asset-sheet
Asset type: production Garden Shelf plant growth sprites
Primary request: Create one potted plant family as a 1 row x 4 column growth sprite sheet with real transparency preferred. If real alpha is not available, use a simple removable background color chosen for this sheet only.

Canvas and layout: exactly four separate sprites in one horizontal row. Left to right phases are sprout, young, growing, mature. The quarters are only placement guides; each exported phase will be cropped by connected visible pixels plus safe padding. Keep each phase fully separated with wide transparent-ready gutters. The plant and pot must be fully visible, centered, bottom anchored unless the family is a hanging plant. No labels, no numbers, no grid lines.

Style: cozy indoor shelf garden, hand-painted storybook mobile game sprite, readable silhouette at 80x128 shelf scale, crisp edges, warm ceramic or glazed pot, gentle natural shading, no scenery, no shelf, no tools, no coins, no faces, no text, no watermark.

Background: transparent preferred. If a removable flat background is used, choose a color absent from the sprite and keep it perfectly flat.

Avoid: no 3-phase shortcuts, no duplicate phases, no cropped pot, no cropped leaves or vines, no objects touching another phase, no glow or shadow on the removable background.
```

## Family Prompts

### Bonsai

```text
Apply the shared Garden Shelf family prompt. Plant family: bonsai. Show a miniature sculpted tree with a twisted trunk, rounded green canopy pads, and a shallow decorative bonsai pot. Phase 1 is a tiny sprout in the shallow pot, phase 2 has a short trunk and small canopy, phase 3 has a visible curved trunk and several canopy pads, phase 4 is a mature compact bonsai with a strong silhouette. Keep the canopy inside its slot with generous left and right padding.
```

### String Of Pearls

```text
Apply the shared Garden Shelf family prompt. Plant family: string of pearls hanging plant. Use a small hanging planter with visible cords and bead-like trailing strands. Anchor the planter near the top of each sprite and let the strands grow downward across phases while staying fully inside the slot. Phase 1 has a small hanging pot and a few beads, phase 4 has several readable trailing strands, but no strand may touch the slot border.
```

### Orchid

```text
Apply the shared Garden Shelf family prompt. Plant family: orchid. Use broad base leaves, elegant upright stems, and pink orchid flowers in a purple or cream ceramic pot. Phase 1 has a bud and one leaf cluster, phase 4 has multiple open flowers and a readable mature orchid silhouette. Keep the pink flowers fully inside the plant silhouette, not bleeding into the removable background.
```

### Venus Flytrap

```text
Apply the shared Garden Shelf family prompt. Plant family: Venus flytrap. Use bright green carnivorous leaves with red trap interiors and small tooth details. Phase 1 has one closed trap, phase 4 has several open traps with clear red interiors. Keep every trap inside its slot with no cropped teeth or leaves.
```

### Moon Cactus

```text
Apply the shared Garden Shelf family prompt. Plant family: moon cactus. Use an upright green cactus with a bright orange/red grafted top in a compact collectible pot. Phase 1 is a tiny cactus nub, phase 4 is a mature moon cactus with a large colorful top. Keep the cactus compact and readable, with no extra desert scenery.
```

### Fern

```text
Apply the shared Garden Shelf family prompt. Plant family: fern. Use layered arching green fronds with many small leaflets in a muted ceramic pot. Phase 1 has a small frond cluster, phase 4 has a broad mature fern silhouette. Keep the widest fronds away from the left and right slot boundaries so no leaflets are clipped.
```

## Local Generation And Cutout Workflow

1. Generate each new family in a separate image-generation call.
2. Save source files as `assets-source/imagegen/garden-shelf/families/<family>-source.png`; keep `*-keyed.png` only for compatibility with older local scripts.
3. Convert each family sheet to transparent alpha by sampling the sheet border, flood-filling background-like pixels, and cropping the four phase components from their connected visible pixels with safe padding; save `assets-source/imagegen/garden-shelf/families/<family>-transparent.png`.
4. Run the local composer; it should consume the transparent family sheets, filter stray neighboring components, and compose the final `1672 x 1645` runtime sheet.
5. Run `pnpm run assets:build` so `gardenShelf.sheet.transparent` points at the regenerated runtime WebP.

## Acceptance Criteria

- The eight existing plants remain visually preserved from `existing-8-transparent.png`.
- Bonsai and string of pearls are real new catalog entries, not replacements for `rosemary` or `pothos`.
- The +4 additional plants are visually distinct: orchid, Venus flytrap, moon cactus, fern.
- Every new family has exactly four readable phases.
- No plant touches the runtime crop edge; component checks should report zero alpha on the new-frame edges.
- Runtime unlocks all 14 plants by Garden level 30.
