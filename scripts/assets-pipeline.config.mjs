import fs from "node:fs/promises";
import path from "node:path";

function entry(key, source, outputDir, bundle = null, formats = ["webp", "png"], options = {}) {
  return { key, source, outputDir, bundle, formats, ...options };
}

function runtimeWebpOnly(options = {}) {
  return {
    formats: ["webp"],
    raster: {
      webp: {
        quality: 90,
        effort: 6,
        ...options,
      },
    },
  };
}

const PNG_EXTENSIONS = new Set([".png"]);
const SVG_EXTENSIONS = new Set([".svg"]);
const WEBP_ONLY_FORMATS = ["webp"];
const GACHA_MERGE_RUNTIME_BACKGROUND_IDS = new Set(["table"]);
const GACHA_MERGE_RUNTIME_UI_IDS = new Set([
  "libraryRail",
  "libraryPanel",
  "exchangePanel",
  "actionDock",
  "hudBar",
  "hudIconItems",
  "hudIconRecipes",
  "hudIconExchange",
  "hudIconEssence",
  "hudIconMode",
  "hudIconPause",
  "actionIconGenerate",
  "actionIconDaily",
  "actionIconTokens",
  "actionIconTrash",
  "boardFrame",
  "cellEmpty",
  "cellOccupied",
  "cellSelected",
  "cellTarget",
]);
const GACHA_MERGE_RUNTIME_FX_IDS = new Set(["essenceOrb", "recipeGlow"]);
const assetEntryCache = new Map();

async function fileExists(rootDir, source) {
  try {
    await fs.access(path.resolve(rootDir, source));
    return true;
  } catch {
    return false;
  }
}

async function existingEntries(rootDir, assetEntries) {
  const exists = await Promise.all(assetEntries.map((assetEntry) => fileExists(rootDir, assetEntry.source)));
  return assetEntries.filter((_, index) => exists[index]);
}

async function walkFiles(rootDir, relativeDir, extensions) {
  const absoluteDir = path.resolve(rootDir, relativeDir);
  const files = [];
  let items;
  try {
    items = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const item of items) {
    const child = path.join(relativeDir, item.name);
    if (item.isDirectory()) {
      files.push(...await walkFiles(rootDir, child, extensions));
    } else if (extensions.has(path.extname(item.name).toLowerCase())) {
      files.push(child.replace(/\\/g, "/"));
    }
  }

  return files.sort();
}

async function collectPixiEntries(rootDir) {
  const compactRuntimeImage = runtimeWebpOnly();
  const pixiEntries = [
    entry("match3.special.blast", "public/games/puzzling-potions/images/special-blast.png", "puzzling-potions", "pixi.match3", compactRuntimeImage.formats, compactRuntimeImage),
    entry("match3.special.column", "public/games/puzzling-potions/images/special-column.png", "puzzling-potions", "pixi.match3", compactRuntimeImage.formats, compactRuntimeImage),
    entry("match3.special.colour", "public/games/puzzling-potions/images/special-colour.png", "puzzling-potions", "pixi.match3", compactRuntimeImage.formats, compactRuntimeImage),
    entry("match3.special.row", "public/games/puzzling-potions/images/special-row.png", "puzzling-potions", "pixi.match3", compactRuntimeImage.formats, compactRuntimeImage),
    entry("match3.fx.clearBurst", "public/games/puzzling-potions/images/fx-clear-burst.png", "puzzling-potions", "pixi.match3", compactRuntimeImage.formats, compactRuntimeImage),
    entry("match3.drop.gold", "public/games/puzzling-potions/images/drop-gold.png", "puzzling-potions", "pixi.match3", compactRuntimeImage.formats, compactRuntimeImage),
    entry("match3.drop.seeds", "public/games/puzzling-potions/images/drop-seeds.png", "puzzling-potions", "pixi.match3", compactRuntimeImage.formats, compactRuntimeImage),
    entry("match3.drop.energy", "public/games/puzzling-potions/images/drop-energy.png", "puzzling-potions", "pixi.match3", compactRuntimeImage.formats, compactRuntimeImage),
  ];
  return existingEntries(rootDir, pixiEntries);
}

async function collectGardenEntries(rootDir) {
  const compactRuntimeImage = runtimeWebpOnly();
  const gardenEntries = [
    entry("gardenShelf.sheet.transparent", "public/games/garden-shelf/assets_transparent.png", "garden-shelf", null, WEBP_ONLY_FORMATS, compactRuntimeImage),
  ];

  return existingEntries(rootDir, gardenEntries);
}

async function collectCompanionYardEntries(rootDir) {
  const root = "public/games/companion-yard";
  const files = await walkFiles(rootDir, root, PNG_EXTENSIONS);
  const compactRuntimeImage = runtimeWebpOnly();
  const entries = [];
  if (await fileExists(rootDir, `${root}/HUD.png`)) {
    entries.push(entry("companionYard.ui.hudSheet", `${root}/HUD.png`, "companion-yard/ui", null, compactRuntimeImage.formats, {
      raster: compactRuntimeImage.raster,
    }));
  }
  for (const file of files) {
    const parts = file.slice(`${root}/`.length).split("/");
    if (parts.length !== 2) continue;
    const [type, fileName] = parts;
    if (!["backgrounds", "foods", "goodies", "visitors", "companions", "expressions", "mementos", "ui", "fx"].includes(type)) continue;
    const id = path.basename(fileName, path.extname(fileName));
    entries.push(entry(`companionYard.${type}.${id}`, file, `companion-yard/${type}`, null, compactRuntimeImage.formats, {
      raster: compactRuntimeImage.raster,
    }));
  }
  return entries;
}

async function collectGachaMergeEntries(rootDir) {
  const root = "public/games/gacha-merge";
  const [pngFiles, svgFiles] = await Promise.all([
    walkFiles(rootDir, root, PNG_EXTENSIONS),
    walkFiles(rootDir, root, SVG_EXTENSIONS),
  ]);
  const sectionKeys = {
    backgrounds: "background",
    ui: "ui",
    fx: "fx",
    items: "items",
  };
  const compactRuntimeImage = runtimeWebpOnly();
  const entries = [];
  for (const file of [...pngFiles, ...svgFiles].sort()) {
    const parts = file.slice(`${root}/`.length).split("/");
    if (parts.length !== 2) continue;
    const [folder, fileName] = parts;
    const section = sectionKeys[folder];
    if (!section) continue;
    const extension = path.extname(fileName).toLowerCase();
    const id = path.basename(fileName, extension);
    if (
      (section === "background" && !GACHA_MERGE_RUNTIME_BACKGROUND_IDS.has(id)) ||
      (section === "ui" && !GACHA_MERGE_RUNTIME_UI_IDS.has(id)) ||
      (section === "fx" && !GACHA_MERGE_RUNTIME_FX_IDS.has(id))
    ) {
      continue;
    }
    const formats = extension === ".svg" ? ["svg"] : compactRuntimeImage.formats;
    const options = extension === ".svg" ? {} : { raster: compactRuntimeImage.raster };
    entries.push(entry(`gachaMerge.${section}.${id}`, file, `gacha-merge/${folder}`, "pixi.merge", formats, options));
  }
  return entries;
}

export async function loadAssetPipelineEntries(rootDir = process.cwd()) {
  const resolvedRoot = path.resolve(rootDir);
  const cached = assetEntryCache.get(resolvedRoot);
  if (cached) return cached;

  const entriesPromise = Promise.all([
    collectPixiEntries(resolvedRoot),
    collectGardenEntries(resolvedRoot),
    collectCompanionYardEntries(resolvedRoot),
    collectGachaMergeEntries(resolvedRoot),
  ]).then((groups) => groups.flat());

  assetEntryCache.set(resolvedRoot, entriesPromise);
  try {
    return await entriesPromise;
  } catch (error) {
    assetEntryCache.delete(resolvedRoot);
    throw error;
  }
}
