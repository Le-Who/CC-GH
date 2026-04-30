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
  let items = [];
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
  const pixiEntries = [
    entry("bubbo.background.tile", "public/games/bubbo-bubbo/images/background-tile.png", "bubbo", "pixi.bubbo"),
    entry("bubbo.bubble.blue", "public/games/bubbo-bubbo/images/bubble-blue.png", "bubbo", "pixi.bubbo"),
    entry("bubbo.bubble.green", "public/games/bubbo-bubbo/images/bubble-green.png", "bubbo", "pixi.bubbo"),
    entry("bubbo.bubble.red", "public/games/bubbo-bubbo/images/bubble-red.png", "bubbo", "pixi.bubbo"),
    entry("bubbo.bubble.yellow", "public/games/bubbo-bubbo/images/bubble-yellow.png", "bubbo", "pixi.bubbo"),
    entry("bubbo.balls.sheet", "public/games/bubbo-bubbo/assets_bubbo_balls.png", "bubbo", "pixi.bubbo"),
    entry("bubbo.bottomTray", "public/games/bubbo-bubbo/images/bottom-tray.png", "bubbo", "pixi.bubbo"),
    entry("bubbo.cannon.main", "public/games/bubbo-bubbo/images/cannon-main.png", "bubbo", "pixi.bubbo"),
    entry("match3.piece.dragon", "public/games/puzzling-potions/images/piece-dragon.png", "puzzling-potions", "pixi.match3"),
    entry("match3.piece.frog", "public/games/puzzling-potions/images/piece-frog.png", "puzzling-potions", "pixi.match3"),
    entry("match3.piece.newt", "public/games/puzzling-potions/images/piece-newt.png", "puzzling-potions", "pixi.match3"),
    entry("match3.piece.snake", "public/games/puzzling-potions/images/piece-snake.png", "puzzling-potions", "pixi.match3"),
    entry("match3.piece.spider", "public/games/puzzling-potions/images/piece-spider.png", "puzzling-potions", "pixi.match3"),
    entry("match3.piece.yeti", "public/games/puzzling-potions/images/piece-yeti.png", "puzzling-potions", "pixi.match3"),
    entry("match3.shelf.block", "public/games/puzzling-potions/images/shelf-block.png", "puzzling-potions", "pixi.match3"),
    entry("match3.special.blast", "public/games/puzzling-potions/images/special-blast.png", "puzzling-potions", "pixi.match3"),
    entry("match3.special.column", "public/games/puzzling-potions/images/special-column.png", "puzzling-potions", "pixi.match3"),
    entry("match3.special.colour", "public/games/puzzling-potions/images/special-colour.png", "puzzling-potions", "pixi.match3"),
    entry("match3.special.row", "public/games/puzzling-potions/images/special-row.png", "puzzling-potions", "pixi.match3"),
  ];

  return existingEntries(rootDir, pixiEntries);
}

async function collectGardenEntries(rootDir) {
  const gardenEntries = [
    entry("gardenShelf.sheet.transparent", "public/games/garden-shelf/assets_transparent.png", "garden-shelf", null, WEBP_ONLY_FORMATS),
    entry("gardenShelf.shelf", "public/games/garden-shelf/assets_shelf.png", "garden-shelf", null, WEBP_ONLY_FORMATS),
    entry("gardenShelf.sign", "public/games/garden-shelf/assets_garden_sign.png", "garden-shelf", null, WEBP_ONLY_FORMATS),
    entry("gardenShelf.bottomPlank", "public/games/garden-shelf/assets_garden_bottom_plank.png", "garden-shelf", null, WEBP_ONLY_FORMATS),
    entry("gardenShelf.settingsCog", "public/games/garden-shelf/assets_garden_cog.png", "garden-shelf", null, WEBP_ONLY_FORMATS),
  ];

  return existingEntries(rootDir, gardenEntries);
}

async function collectCompanionYardEntries(rootDir) {
  const root = "public/games/companion-yard";
  const files = await walkFiles(rootDir, root, PNG_EXTENSIONS);
  const compactRuntimeImage = runtimeWebpOnly();
  const entries = [];
  for (const file of files) {
    const parts = file.slice(`${root}/`.length).split("/");
    if (parts.length !== 2) continue;
    const [type, fileName] = parts;
    if (!["backgrounds", "foods", "goodies", "visitors", "companions"].includes(type)) continue;
    const id = path.basename(fileName, path.extname(fileName));
    entries.push(entry(`companionYard.${type}.${id}`, file, `companion-yard/${type}`, null, compactRuntimeImage.formats, {
      raster: compactRuntimeImage.raster,
    }));
  }
  return entries;
}

async function collectSvgEntries(rootDir) {
  const [petFiles, assetFiles] = await Promise.all([
    walkFiles(rootDir, "public/pets", SVG_EXTENSIONS),
    walkFiles(rootDir, "public/assets", SVG_EXTENSIONS),
  ]);
  const files = [...petFiles, ...assetFiles];
  const entries = [];
  for (const file of files) {
    const key = file
      .replace(/^public\//, "")
      .replace(/\.svg$/i, "")
      .replace(/\//g, ".");
    entries.push(entry(key, file, path.dirname(file).replace(/^public\//, ""), null, ["svg"]));
  }
  return entries;
}

async function collectIconEntries(rootDir) {
  const files = await walkFiles(rootDir, "public/icons", PNG_EXTENSIONS);
  const entries = [];
  for (const file of files) {
    const id = path.basename(file, path.extname(file)).replace(/-/g, "");
    entries.push(entry(`icons.${id}`, file, "icons", null, WEBP_ONLY_FORMATS));
  }
  return entries;
}

export async function loadAssetPipelineEntries(rootDir = process.cwd()) {
  const groups = await Promise.all([
    collectPixiEntries(rootDir),
    collectGardenEntries(rootDir),
    collectCompanionYardEntries(rootDir),
    collectSvgEntries(rootDir),
    collectIconEntries(rootDir),
  ]);
  return groups.flat();
}
