import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");

const requiredScreens = {
  gameHub: ["hub", "navigation", "settings"],
  gardenShelf: ["live", "plantDetail", "seedShopInventory", "quests", "settings", "reward", "offlineReward"],
  blox: ["menu", "livePlayfield", "pause", "hud", "tray", "result"],
  match3: ["menu", "liveBoard", "pause", "hud", "modeSelect", "resultEnd"],
  merge: ["liveBoard", "hud", "pause", "inventory", "shop", "recipes", "recipeBook", "itemBook", "exchange"],
  bubbo: ["startMenu", "menu", "liveField", "pause", "hud", "result"],
  trivia: ["menu", "question", "answerReveal", "pause", "results", "duelRoom"],
  cozyYard: ["hud", "bottomDock", "food", "goodies", "shop", "petbook", "album", "gifts", "repair", "remodel", "expansion", "daily", "companion", "settings"],
  farmLegacy: ["hud", "shop", "bag", "plotDetail", "journal", "season"],
};

function resolvePublicAsset(assetPath) {
  assert.equal(assetPath.startsWith("/"), true, `${assetPath} must be a public-root absolute path`);
  return path.join(publicRoot, assetPath.slice(1).replace(/\//g, path.sep));
}

test("screen surface asset map covers every game screen family", async () => {
  const modulePath = pathToFileURL(path.join(root, "src", "app", "screenSurfaceAssets.js")).href;
  const { SCREEN_SURFACE_ASSETS } = await import(modulePath);

  for (const [gameId, screenIds] of Object.entries(requiredScreens)) {
    assert.ok(SCREEN_SURFACE_ASSETS[gameId], `${gameId} is missing from SCREEN_SURFACE_ASSETS`);

    for (const screenId of screenIds) {
      const screen = SCREEN_SURFACE_ASSETS[gameId][screenId];
      assert.ok(screen, `${gameId}.${screenId} is missing`);
      assert.equal(typeof screen.surface, "string", `${gameId}.${screenId}.surface must be a public asset`);
    }
  }
});

test("screen surface asset map only references committed public assets", async () => {
  const modulePath = pathToFileURL(path.join(root, "src", "app", "screenSurfaceAssets.js")).href;
  const { SCREEN_SURFACE_ASSETS } = await import(modulePath);
  const seen = new Set();

  for (const gameScreens of Object.values(SCREEN_SURFACE_ASSETS)) {
    for (const screen of Object.values(gameScreens)) {
      for (const assetPath of Object.values(screen).filter((value) => typeof value === "string")) {
        seen.add(assetPath);
      }
    }
  }

  for (const assetPath of [...seen].sort()) {
    assert.ok(existsSync(resolvePublicAsset(assetPath)), `${assetPath} does not exist under public/`);
  }
});

test("screen containers use generated textless UI surfaces", async () => {
  const modulePath = pathToFileURL(path.join(root, "src", "app", "screenSurfaceAssets.js")).href;
  const { SCREEN_SURFACE_ASSETS } = await import(modulePath);

  for (const [gameId, gameScreens] of Object.entries(SCREEN_SURFACE_ASSETS)) {
    for (const [screenId, screen] of Object.entries(gameScreens)) {
      assert.match(
        screen.surface,
        /^\/games\/ui-surfaces\//,
        `${gameId}.${screenId}.surface must use the generated screen-surface asset pack`,
      );
    }
  }
});

test("screen mockup reference manifest remains complete", async () => {
  const manifestPath = path.join(root, "assets-source", "imagegen", "screen-mockups", "screen-mockup-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const ids = new Set(manifest.atlases.map((atlas) => atlas.id));

  for (const id of Object.keys(requiredScreens)) {
    assert.ok(ids.has(id), `${id} is missing from the generated screen mockup manifest`);
  }
});
