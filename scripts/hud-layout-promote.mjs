import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VISIBLE_GAME_IDS } from "../src/app/gameRegistry.js";
import { hudLayoutRegistry } from "../src/app/hud-layout/registry.js";
import {
  HUD_LAYOUT_SCHEMA_VERSION,
  validateHudLayout,
  validateHudLayoutExport,
} from "../src/app/hud-layout/resolver.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultsDir = path.join(rootDir, "src", "app", "hud-layout", "defaultLayouts");
const args = process.argv.slice(2);
const allowUnknownRegions = args.includes("--allow-unknown-regions");
const inputPath = args.find((arg) => !arg.startsWith("--"));

if (!inputPath) {
  console.error("Usage: pnpm run hud-layout:promote -- path/to/export.json");
  console.error("       node scripts/hud-layout-promote.mjs path/to/export.json");
  process.exit(1);
}

let exported;
try {
  exported = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
} catch (error) {
  console.error(`[hud-layout] failed to read export JSON: ${error.message}`);
  process.exit(1);
}

const exportValidation = validateHudLayoutExport(exported, {
  knownRegionIds: hudLayoutRegistry.allRegionIds,
  knownGameIds: VISIBLE_GAME_IDS,
  source: allowUnknownRegions ? "import" : "repo",
});

if (!exportValidation.valid) {
  console.error("[hud-layout] export validation failed:");
  for (const error of exportValidation.errors) console.error(`- ${error}`);
  process.exit(1);
}

const games = exported.games || {};
const gameIds = Object.keys(games);
if (!gameIds.length) {
  console.error("[hud-layout] export contains no games");
  process.exit(1);
}

for (const gameId of gameIds) {
  if (!VISIBLE_GAME_IDS.includes(gameId)) {
    console.error(`[hud-layout] unknown game id ${gameId}`);
    process.exit(1);
  }
  const layout = {
    ...games[gameId],
    schemaVersion: HUD_LAYOUT_SCHEMA_VERSION,
    gameId,
  };
  const repoValidation = validateHudLayout(layout, {
    knownRegionIds: hudLayoutRegistry.allRegionIds,
    knownGameIds: VISIBLE_GAME_IDS,
    source: allowUnknownRegions ? "import" : "repo",
  });
  if (!repoValidation.valid) {
    console.error(`[hud-layout] ${gameId} validation failed:`);
    for (const error of repoValidation.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  if (repoValidation.warnings.length) {
    console.warn(`[hud-layout] ${gameId} warnings:`);
    for (const warning of repoValidation.warnings) console.warn(`- ${warning}`);
  }
  await mkdir(defaultsDir, { recursive: true });
  const outPath = path.join(defaultsDir, `${gameId}.json`);
  await writeFile(outPath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
  console.log(`[hud-layout] promoted ${gameId} -> ${path.relative(rootDir, outPath)}`);
}
