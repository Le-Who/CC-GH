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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findCssBlocksForSelector(css, selector) {
  const blockPattern = new RegExp(`(?:^|\\n)[^{}]*${escapeRegExp(selector)}[^{}]*\\{([^{}]*)\\}`, "g");
  return Array.from(css.matchAll(blockPattern), (match) => match[1]);
}

function assertTransparentSlotSelector(css, selector, filePath) {
  const blocks = findCssBlocksForSelector(css, selector);
  assert.ok(blocks.length > 0, `${filePath} is missing ${selector}`);

  let sawTransparentBackground = false;
  for (const block of blocks) {
    assert.doesNotMatch(block, /url\s*\(/, `${filePath} ${selector} must not use a button-art background`);
    assert.doesNotMatch(block, /linear-gradient\s*\(/, `${filePath} ${selector} must not use a CSS button fill`);

    if (!/background(?:-image)?\s*:/.test(block)) {
      continue;
    }

    assert.match(
      block,
      /background\s*:\s*(?:transparent(?:\s*!important)?|none)\s*;/,
      `${filePath} ${selector} must be a transparent hitbox or disabled pseudo layer`,
    );
    sawTransparentBackground = true;
  }

  assert.ok(sawTransparentBackground, `${filePath} ${selector} must explicitly set a transparent background`);
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

test("screen slot controls stay transparent over generated panel art", async () => {
  const slotSelectorsByFile = {
    "src/games/trivia/trivia.css": [
      ".trivia-shell .trivia-pause-overlay .panel-button",
      ".trivia-shell .trivia-pause-overlay .panel-button.subtle",
      ".trivia-shell .trivia-pause-overlay .panel-button.danger",
      ".trivia-card .panel-button",
      ".trivia-shell[data-trivia-view=\"menu\"] .trivia-card .panel-button",
    ],
    "src/games/blox/blox.css": [
      ".blox-menu-overlay .panel-button",
      ".blox-menu-overlay .panel-button.pause-primary",
      ".blox-menu-overlay .panel-button:not(.subtle):not(.danger)",
      ".blox-menu-overlay .panel-button.danger",
      ".blox-menu-overlay .panel-button:disabled",
      ".blox-menu-overlay[data-menu-phase=\"menu\"] .panel-button",
    ],
    "src/games/bubbo/bubbo.css": [
      ".bubbo-shell .game-menu-overlay .panel-button",
      ".bubbo-shell .game-menu-overlay .panel-button.danger",
      ".bubbo-shell .game-menu-overlay .panel-button:disabled",
      ".bubbo-shell .game-menu-overlay .mode-grid button",
      ".bubbo-shell .game-menu-overlay[data-menu-phase=\"menu\"]:not(.bubbo-result-overlay) .panel-button",
    ],
    "src/games/match3/match3.css": [
      ".match3-menu-overlay .panel-button",
      ".match3-menu-overlay .panel-button.pause-primary",
      ".match3-menu-overlay .panel-button:not(.subtle):not(.danger)",
      ".match3-menu-overlay .panel-button.danger",
      ".match3-menu-overlay .mode-grid button",
      ".match3-menu-overlay[data-menu-phase=\"menu\"]:not(.match3-pause-compact) .panel-button",
    ],
    "src/games/merge/merge.css": [
      ".merge-pause-overlay .panel-button",
      ".merge-pause-overlay .panel-button.pause-primary",
      ".merge-pause-overlay .panel-button:not(.subtle):not(.danger)",
      ".merge-pause-overlay .panel-button.danger",
      ".merge-pause-overlay .panel-button.active",
    ],
  };

  for (const [filePath, selectors] of Object.entries(slotSelectorsByFile)) {
    const css = await readFile(path.join(root, filePath), "utf8");
    for (const selector of selectors) {
      assertTransparentSlotSelector(css, selector, filePath);
    }
  }
});

test("Garden Shelf shell chrome uses garden assets without obscuring quest dialog art", async () => {
  const app = await readFile(path.join(root, "src", "App.jsx"), "utf8");
  const shell = await readFile(path.join(root, "src", "app", "shell.jsx"), "utf8");
  const indexCss = await readFile(path.join(root, "src", "index.css"), "utf8");
  const gardenCss = await readFile(path.join(root, "src", "games", "garden-shelf", "garden-shelf.css"), "utf8");

  assert.match(app, /image:\s*"\/games\/garden-shelf\/icon_collect\.png"/);
  assert.match(app, /image:\s*"\/games\/garden-shelf\/icon_quest\.png"/);
  assert.match(shell, /className="stat-icon-image"/);
  assert.match(
    indexCss,
    /\.telegram-app\[data-active-tab="garden"\]\s+\.stat-chip\s*\{[^}]*\/games\/garden-shelf\/quest_panel\.png/s,
  );
  assert.doesNotMatch(
    indexCss,
    /\.telegram-app\[data-active-tab="garden"\]\s+\.stat-chip\s*\{[^}]*hub-panel\.png/s,
    "Garden stats must not inherit the Game Hub panel art",
  );
  assert.match(gardenCss, /\.garden-quest-dialog \.garden-icon-button[\s\S]*\/games\/garden-shelf\/icon_close\.png/s);
  assert.match(gardenCss, /\.garden-quest-card\s*\{[^}]*background:\s*transparent\s*!important/s);
  assert.doesNotMatch(
    gardenCss,
    /\.garden-quest-card\s*\{[^}]*linear-gradient/s,
    "Garden quest rows should not use CSS fill panels over the dialog art",
  );
  assert.match(gardenCss, /\.garden-quest-card \.garden-quest-claimable\s*\{/);
});

test("mini-game menus use neutral dialog art instead of blue slot panels", async () => {
  const cssByFile = {
    "src/games/blox/blox.css": ["--blox-dialog-art", "blox-dialog-panel.png"],
    "src/games/match3/match3.css": ["--match3-dialog-art", "match3-dialog-panel.png"],
    "src/games/bubbo/bubbo.css": ["--bubbo-dialog-art", "bubbo-dialog-panel.png"],
    "src/games/trivia/trivia.css": ["--trivia-dialog-art", "trivia-dialog-panel.png"],
  };

  for (const [filePath, [variableName, expectedAsset]] of Object.entries(cssByFile)) {
    const css = await readFile(path.join(root, filePath), "utf8");
    assert.match(
      css,
      new RegExp(`${escapeRegExp(variableName)}:\\s*url\\("\\/games\\/ui-surfaces\\/${escapeRegExp(expectedAsset)}"\\)`),
      `${filePath} should use the ${expectedAsset} dialog frame for menu overlays`,
    );
  }
});
