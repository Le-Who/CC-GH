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

function assertVisibleButtonSelector(css, selector, filePath, expectedArtPath) {
  const blocks = findCssBlocksForSelector(css, selector);
  assert.ok(blocks.length > 0, `${filePath} is missing ${selector}`);

  const combined = blocks
    .filter((block) => /background(?:-image)?\s*:/.test(block) || block.includes(expectedArtPath))
    .at(-1) || blocks.at(-1);
  assert.doesNotMatch(
    combined,
    /background(?:-image)?\s*:\s*(?:transparent|none)(?:\s*!important)?\s*;/,
    `${filePath} ${selector} must not become an invisible transparent hitbox`,
  );
  assert.doesNotMatch(
    combined,
    /(?:^|[\n;])\s*color\s*:\s*transparent(?:\s*!important)?\s*;/,
    `${filePath} ${selector} must keep its label visible`,
  );
  assert.doesNotMatch(
    combined,
    /(?:^|[\n;])\s*font-size\s*:\s*0(?:\s*!important)?\s*;/,
    `${filePath} ${selector} must not hide its label by zeroing type`,
  );
  assert.match(
    combined,
    new RegExp(`url\\("${escapeRegExp(expectedArtPath)}"\\)`),
    `${filePath} ${selector} should use the generated button art`,
  );
  assert.doesNotMatch(
    combined,
    /linear-gradient\s*\(/,
    `${filePath} ${selector} must not paint rectangular CSS fill behind transparent button art`,
  );
}

function assertNoNativeSharedHudTooltip(shellSource) {
  const blocks = [
    ["PanelButton", "export function PanelButton", "export function Stat"],
    ["Stat", "export function Stat", "function GamePlayStat"],
    ["GamePlayStat", "function GamePlayStat", "export function PauseBrief"],
  ];

  for (const [name, startMarker, endMarker] of blocks) {
    const start = shellSource.indexOf(startMarker);
    const end = shellSource.indexOf(endMarker);
    assert.ok(start >= 0 && end > start, `${name} source block was not found`);
    assert.doesNotMatch(
      shellSource.slice(start, end),
      /\n\s+title=\{/,
      `${name} should use the shared press/focus tooltip, not native browser title tooltips`,
    );
  }
}

function assertNoNativeButtonTitles(source, filePath) {
  assert.doesNotMatch(
    source,
    /<button\b[^>]*\btitle=/,
    `${filePath} should not attach native browser title tooltips to game controls`,
  );
  assert.doesNotMatch(
    source,
    /<HudEditableRegion\b(?=[^>]*\bas="button")[^>]*\btitle=/,
    `${filePath} should not attach native browser title tooltips to HudEditableRegion buttons`,
  );
}

function assertSelectorDoesNotPaintAsset(css, selector, assetPattern, filePath) {
  const blocks = findCssBlocksForSelector(css, selector);
  assert.ok(blocks.length > 0, `${filePath} is missing ${selector}`);
  const combined = blocks.join("\n");
  assert.doesNotMatch(
    combined,
    assetPattern,
    `${filePath} ${selector} must not duplicate generated art on the outer hit-area shell`,
  );
}

function assertModeSelectorCard(css, selector, filePath, actionButtonArtPath) {
  const blocks = findCssBlocksForSelector(css, selector);
  assert.ok(blocks.length > 0, `${filePath} is missing ${selector}`);
  const combined = blocks.join("\n");
  assert.doesNotMatch(
    combined,
    new RegExp(escapeRegExp(actionButtonArtPath)),
    `${filePath} ${selector} should be a centered mode card, not an action-button sprite`,
  );
  assert.doesNotMatch(
    combined,
    /linear-gradient\s*\([^;]*\)\s*,\s*url\(/,
    `${filePath} ${selector} must not stack CSS rectangles under generated art`,
  );
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

test("mini-game menu controls use visible generated button chrome", async () => {
  const visibleButtonSelectorsByFile = {
    "src/games/trivia/trivia.css": {
      art: "/games/hud-redesign/trivia/primary-button.png",
      selectors: [
        ".trivia-shell .trivia-pause-overlay .panel-button",
        ".trivia-shell .trivia-pause-overlay .panel-button.subtle",
        ".trivia-shell .trivia-pause-overlay .panel-button.danger",
        ".trivia-card .panel-button",
        ".trivia-shell[data-trivia-view=\"menu\"] .trivia-card .panel-button",
      ],
    },
    "src/games/blox/blox.css": {
      art: "/games/hud-redesign/blox/primary-button.png",
      selectors: [
        ".blox-menu-overlay .panel-button",
        ".blox-menu-overlay .panel-button.pause-primary",
        ".blox-menu-overlay .panel-button:not(.subtle):not(.danger)",
        ".blox-menu-overlay .panel-button.danger",
        ".blox-menu-overlay[data-menu-phase=\"menu\"] .panel-button",
      ],
    },
    "src/games/bubbo/bubbo.css": {
      art: "/games/hud-redesign/bubbo/primary-button.png",
      selectors: [
        ".bubbo-shell .game-menu-overlay .panel-button",
        ".bubbo-shell .game-menu-overlay .panel-button.danger",
        ".bubbo-shell .game-menu-overlay[data-menu-phase=\"menu\"]:not(.bubbo-result-overlay) .panel-button",
      ],
    },
    "src/games/match3/match3.css": {
      art: "/games/hud-redesign/match3/primary-button.png",
      selectors: [
        ".match3-menu-overlay .panel-button",
        ".match3-menu-overlay .panel-button.pause-primary",
        ".match3-menu-overlay .panel-button:not(.subtle):not(.danger)",
        ".match3-menu-overlay .panel-button.danger",
        ".match3-menu-overlay[data-menu-phase=\"menu\"]:not(.match3-pause-compact) .panel-button",
      ],
    },
    "src/games/merge/merge.css": {
      art: "/games/hud-redesign/merge/primary-button.png",
      selectors: [
        ".merge-pause-overlay .panel-button",
        ".merge-pause-overlay .panel-button.pause-primary",
        ".merge-pause-overlay .panel-button:not(.subtle):not(.danger)",
        ".merge-pause-overlay .panel-button.danger",
        ".merge-pause-overlay .panel-button.active",
      ],
    },
  };

  for (const [filePath, { art, selectors }] of Object.entries(visibleButtonSelectorsByFile)) {
    const css = await readFile(path.join(root, filePath), "utf8");
    for (const selector of selectors) {
      assertVisibleButtonSelector(css, selector, filePath, art);
    }
  }
});

test("mini-game menu shells do not duplicate dialog panel art", async () => {
  const hudRedesignCss = await readFile(path.join(root, "src", "app", "hud-redesign.css"), "utf8");
  assertSelectorDoesNotPaintAsset(
    hudRedesignCss,
    ".game-shell .game-menu-overlay",
    /--hud-redesign-dialog-art/,
    "src/app/hud-redesign.css",
  );
  assertSelectorDoesNotPaintAsset(
    hudRedesignCss,
    ".trivia-shell .trivia-pause-overlay",
    /--hud-redesign-dialog-art/,
    "src/app/hud-redesign.css",
  );
});

test("Trivia live question content does not stack a second panel surface", async () => {
  const triviaCss = await readFile(path.join(root, "src", "games", "trivia", "trivia.css"), "utf8");
  const livePanelBlocks = findCssBlocksForSelector(
    triviaCss,
    '.trivia-shell[data-trivia-playing="true"] .question-panel',
  ).join("\n");
  const liveSurfaceBlocks = findCssBlocksForSelector(
    triviaCss,
    '.trivia-shell[data-trivia-playing="true"] .trivia-question-surface-asset',
  ).join("\n");
  assert.match(livePanelBlocks, /background:\s*transparent/);
  assert.match(livePanelBlocks, /border:\s*0/);
  assert.match(liveSurfaceBlocks, /display:\s*none/);
});

test("mode selector choices use centered card layouts instead of action button art", async () => {
  const modeSelectorsByFile = {
    "src/games/match3/match3.css": {
      art: "/games/hud-redesign/match3/primary-button.png",
      selectors: [
        ".match3-menu-overlay .mode-grid button",
        ".match3-menu-overlay[data-menu-phase=\"menu\"]:not(.match3-pause-compact) .mode-grid button",
      ],
    },
    "src/games/bubbo/bubbo.css": {
      art: "/games/hud-redesign/bubbo/primary-button.png",
      selectors: [
        ".bubbo-shell .game-menu-overlay .mode-grid button",
      ],
    },
  };

  for (const [filePath, { art, selectors }] of Object.entries(modeSelectorsByFile)) {
    const css = await readFile(path.join(root, filePath), "utf8");
    for (const selector of selectors) {
      assertModeSelectorCard(css, selector, filePath, art);
    }
  }
});

test("Bubbo menu buttons do not keep stale unresolved button-skin URLs", async () => {
  const css = await readFile(path.join(root, "src", "games", "bubbo", "bubbo.css"), "utf8");
  assert.doesNotMatch(css, /\/games\/bubbo\//, "Bubbo CSS should use /games/bubbo-bubbo/ or hud-redesign assets, not stale /games/bubbo/ URLs");
  assert.doesNotMatch(css, /button_secondary\.png/, "Bubbo menu buttons should not retain obsolete secondary-button layers under generated button art");
});

test("shared shell HUD controls avoid native browser title tooltips", async () => {
  const shell = await readFile(path.join(root, "src", "app", "shell.jsx"), "utf8");
  assertNoNativeSharedHudTooltip(shell);
});

test("mini-game direct controls avoid native browser title tooltips", async () => {
  const gameFiles = [
    "src/App.jsx",
    "src/games/blox/BloxGame.jsx",
    "src/games/match3/Match3Game.jsx",
    "src/games/merge/MergeGame.jsx",
    "src/games/bubbo/BubboGame.jsx",
    "src/games/trivia/TriviaGame.jsx",
    "src/games/garden-shelf/components/Garden.tsx",
    "src/games/companion-yard/CompanionYardGame.jsx",
    "src/games/settlement/SettlementGame.jsx",
  ];

  for (const filePath of gameFiles) {
    const source = await readFile(path.join(root, filePath), "utf8");
    assertNoNativeButtonTitles(source, filePath);
  }
});

test("Garden Shelf shell chrome uses garden assets without obscuring quest dialog art", async () => {
  const app = await readFile(path.join(root, "src", "App.jsx"), "utf8");
  const shell = await readFile(path.join(root, "src", "app", "shell.jsx"), "utf8");
  const indexCss = await readFile(path.join(root, "src", "index.css"), "utf8");
  const gardenCss = await readFile(path.join(root, "src", "games", "garden-shelf", "garden-shelf.css"), "utf8");

  assert.match(app, /image:\s*semanticHudIconPath\("garden",\s*"gold"\)/);
  assert.match(app, /image:\s*semanticHudIconPath\("garden",\s*"levelXp"\)/);
  assert.match(app, /image:\s*semanticHudIconPath\("garden",\s*"quest"\)/);
  assert.match(shell, /gold:\s*"stat-gold"/);
  assert.match(shell, /quest:\s*"stat-quest"/);
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
