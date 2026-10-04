# Settlement illustrated source integration

Status: candidate preparation. Source tests are evidence of wiring and provenance, not final visual acceptance. No merge or deployment is implied.

## What changes

- Eight genuine imagegen originals remain immutable in the owner's Library. The runtime manifest identifies each Library source, source SHA-256, delivery SHA-256, dimensions and encoder recipe.
- Technical delivery exports total 369,470 bytes. They use standard resampling and WebP quality88; they are derivatives, not native generator outputs. No crop, repaint or new composition was baked into their pixels.
- City task panel, building cards, goals, warehouse summary, council, construction, research and expedition cards use the compact parchment through a nine-piece runtime UV view. Control handlers and saved state stay unchanged.
- Existing rail/dock icons use the generated navigation tile. World uses the generated archipelago, four expedition scenes and compass. Thumbnails are actual lazy images with declared dimensions, without a resource icon covering the scene.
- World images never enter the city Pixi preload set. Source checks enforce this separation; actual network/decode measurements remain required.

## Material geometry

The native parchment is2172×724 with useful artwork at x0,y129,width2172,height465. Its1086×362 derivative uses x0,y64.5,width1086,height232.5 and48px native corners. Nine-slicing adapts the center and edges without stretching the corners or editing the source pixels. Rendered seams and alpha fringes must still be inspected at DPR1 and DPR2.

The map remains2:1. Runtime marker anchors stay forest25%/66%, ruins43%/43%, volcano69%/58%, ice82%/36%. Verify the center contacts dry terrain for each intended route, especially the corrected ruined terrace. The card's48px source corner is rendered at16CSSpx unless a component explicitly chooses another size.

## Legacy retirement boundary

The six old World image URLs are replaced in assetRegistry. The legacy SVG generator writes only its old ui/map paths; it cannot overwrite the new ui/illustrated-v2 files. Existing historical assets and manifests are retained until the new runtime screenshots are approved. Then remove only the proven-unused six image definitions and outputs together; preserve original source history. Do not present the SVG placeholders as imagegen output.

## Required acceptance

1. Existing normal CI source, mobile, navigation/input, HUD, persistence and gameplay groups must pass at the exact candidate head.
2. Run the actual Settlement capture on RU/EN320×568,360×800,390×844 DPR2,414×896,375×812,568×320,844×390,768×1024,1024×768 and1280×720.
3. Inspect real first-paint City, Building, Goals, Inventory, Council, Construction, Research, World, Shop and News. Check44px targets, scroll reachability, selected/locked/disabled states, text contrast, hierarchy, artwork seams and no broken backgrounds.
4. Confirm every warehouse control and construction hint remains reachable; compare always-visible controls with existing tests. No weakened thresholds or forced clicks.
5. Record cold City entry requests/bytes and World-open requests/bytes. New City material+navigation upper bound62,050bytes; all eight369,470bytes. Measure decode timing and actual layout rather than assuming compressed bytes alone prove performance.
   The report's decodeProbeMs is a separate cached Image.decode probe, not original first-paint decode time. estimatedRgbaBytes is width×height×4, not measured GPU allocation. Encoded-byte checks require positive ResourceTiming observations for both City assets; zero/unavailable observations fail that measurement gate. DOM-referenced and decodable imagery still needs screenshot inspection to establish actual visible quality.
6. Review original-reference likeness and before/after screenshots. The base city scene and buildings remain their existing genuine art; these sources complete missing UI and World imagery.

## Remaining product scope

- Current phase-A goal presentation preserves legacy one-time claim IDs/balances. It does not implement new achievement eligibility or a daily reset system. Any deeper goal system requires a separately agreed save-compatible product design.
- Research retains actual level/prerequisite/prestige behavior; unsupported advertised bonuses were removed. Implementing those bonuses would be a separate balance/mechanics decision.
- Shop purchases, gift grants and special-item storage are unavailable where no supported mechanism exists. Do not restore decorative controls that pretend to perform those actions.
- After Settlement acceptance, perform the requested final RU/EN interface-copy pass, including Garden's unclear Chapters wording, then the full-game acceptance pass. Keep necessary truthful messages plain and brief.
