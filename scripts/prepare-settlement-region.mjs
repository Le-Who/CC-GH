import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const rootDir = process.cwd();
const publicRoot = path.join(rootDir, "public", "games", "settlement");
const sourceRoot = path.join(rootDir, "assets-source", "imagegen", "settlement", "map");
const sourcePath = path.join(sourceRoot, "map-region-settlement-playable-source.png");
const promptPath = path.join(sourceRoot, "map-region-settlement-playable-prompt.md");
const manifestPath = path.join(sourceRoot, "playable-region-manifest.json");
const outputPath = path.join(publicRoot, "map-region-settlement-playable.webp");

const WORLD = { width: 4096, height: 2304 };

const prompt = `Use case: stylized-concept
Asset type: production 2D isometric game background for a browser settlement-builder, to be saved as a runtime WebP map region.
Input image: the mockup screenshot is the visual reference for composition, perspective, material richness, and fantasy village style. Do not copy its UI panels or text.

Primary request: Create one cohesive in-game playable region background matching the mockup direction: a richly detailed isometric fantasy village valley with the terrain, forests, river, waterfalls, cliffs, bridges, roads, central stone plaza, and building pads integrated into one continuous world. It must look like a real game map asset, not a symbolic board, node graph, diagram, or concept sketch.

Scene/backdrop: bright hand-painted fantasy settlement valley. Pine forests and rocky cliffs frame the edges. A blue river with small waterfalls runs along the left side and continues through the lower/right side as part of the same terrain plane. Wooden bridges connect paths naturally. The whole region is a single continuous landscape, not a floating island and not a transparent overlay.

Playable layout: central circular stone plaza with a large empty foundation pad for the town hall. Dirt roads radiate organically from the center to empty isometric rectangular/diamond building lots. Include about ten readable empty plots/foundation pads that line up visually with a settlement-builder: top center civic pad, top-left workshop pad, top-right market pad, left production pad, right quarry/forge pad, lower-left housing pad, lower-center shrine pad, lower-right farm/bridge pad. Roads should be broad enough for tiny villagers and should feel worn into the terrain.

Runtime constraints: no completed buildings, no characters, no UI, no buttons, no labels, no text, no resource icons, no panels, no selection cursor. Empty pads can include stone borders, faint construction markings, grass, barrels, flowers, fences, lanterns, benches, rocks, crates, and shrubs, but they must remain empty so separate runtime building sprites can be placed on top. No large foreground objects should block building pads.

Style: high-detail hand-painted mobile game art, warm golden daylight, crisp isometric perspective, readable at mobile size, rich green grass, tan dirt paths, gray stone plaza, turquoise river, varied trees and rocks, polished fantasy village aesthetic close to the mockup. Avoid flat vector shapes, circular node pads, abstract map-board style, excessive blur, dark vignette, UI screenshot composition, and any text.
`;

const webpOptions = {
  quality: 93,
  effort: 5,
  smartSubsample: true,
};

function relative(file) {
  return path.relative(rootDir, file).replaceAll(path.sep, "/");
}

async function hashFile(file) {
  const hash = crypto.createHash("sha256");
  hash.update(await fs.readFile(file));
  return hash.digest("hex");
}

async function main() {
  await fs.mkdir(publicRoot, { recursive: true });
  await fs.mkdir(sourceRoot, { recursive: true });

  const source = await fs.readFile(sourcePath);
  const sourceMetadata = await sharp(source).metadata();

  await sharp(source)
    .resize(WORLD.width, WORLD.height, { fit: "cover", position: "center" })
    .sharpen({ sigma: 0.7, m1: 0.8, m2: 1.4 })
    .webp(webpOptions)
    .toFile(outputPath);

  await fs.writeFile(promptPath, `${prompt.trim()}\n`, "utf8");

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: relative(sourcePath),
    prompt: relative(promptPath),
    output: relative(outputPath),
    sourceSha256: await hashFile(sourcePath),
    sourceDimensions: {
      width: sourceMetadata.width,
      height: sourceMetadata.height,
      format: sourceMetadata.format,
    },
    outputDimensions: WORLD,
    composition: {
      singleRuntimeAsset: true,
      aspect: "16:9",
      edgeFill: "none",
    },
    contract: [
      "One cohesive Settlement region asset; no separate forest-valley background is used at runtime.",
      "The generated map contains the terrain, rivers, waterfalls, cliffs, bridges, roads, plaza, and empty pads as one world plane.",
      "No UI, text, characters, completed buildings, selection overlays, or resource icons are baked into the asset.",
      "Runtime Pixi layers render buildings, props, villagers, VFX, selection rings, and HUD separately on top.",
    ],
    obsoleteAssetsReplaced: [
      "map-background-forest-valley.webp",
      "map-ground-settlement-base.webp",
      "map-field-settlement-playable.webp",
      "road-network-village.webp",
      "road-network-town.webp",
      "road-network-city.webp",
      "road-network-capital.webp",
      "road-main-isometric.webp",
      "road-cross-isometric.webp",
      "road-plaza-market.webp",
    ],
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Prepared ${relative(outputPath)}`);
  console.log(`Wrote ${relative(promptPath)}`);
  console.log(`Wrote ${relative(manifestPath)}`);
}

await main();
