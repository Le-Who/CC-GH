import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { YARD_PANEL_REFERENCE, YARD_SCREEN_SLOT_MAPS } from "../src/games/companion-yard/yardPanelSlots.js";
import { arcadeGames, arcadeArt, renderArcadePresentation, findElements, textContent } from "./helpers/arcadePresentationHarness.js";

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

const requiredInternalMenuPanels = {
  cozyYard: {
    publicDir: "/games/companion-yard/menu-panels",
    screens: ["food", "goodies", "shop", "petbook", "album", "gifts", "repair", "remodel", "expansion", "daily", "companion", "settings"],
  },
  gardenShelf: {
    publicDir: "/games/garden-shelf/menu-panels",
    screens: ["plant-detail", "seed-shop-inventory", "quests", "settings", "reward", "offline-reward"],
  },
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

function assertFinalSelectorUsesAssetChrome(css, selector, filePath, expectedAssetPattern) {
  const blocks = findCssBlocksForSelector(css, selector);
  assert.ok(blocks.length > 0, `${filePath} is missing ${selector}`);
  const finalBlock = blocks
    .filter((block) => /background(?:-image)?\s*:/.test(block) || expectedAssetPattern.test(block))
    .at(-1) || blocks.at(-1);

  assert.match(
    finalBlock,
    expectedAssetPattern,
    `${filePath} ${selector} should bind its visible chrome to generated asset art`,
  );
  assert.doesNotMatch(
    finalBlock,
    /linear-gradient\s*\(/,
    `${filePath} ${selector} must not keep an old CSS-gradient panel over generated art`,
  );
  assert.doesNotMatch(
    finalBlock,
    /background(?:-image)?\s*:\s*(?:transparent|none)(?:\s*!important)?\s*;/,
    `${filePath} ${selector} must not rely on a transparent hitbox while the art lives elsewhere`,
  );
  assert.doesNotMatch(
    finalBlock,
    /(?:^|[\n;])\s*color\s*:\s*transparent(?:\s*!important)?\s*;/,
    `${filePath} ${selector} must keep runtime labels visible`,
  );
  assert.doesNotMatch(
    finalBlock,
    /(?:^|[\n;])\s*font-size\s*:\s*0(?:\s*!important)?\s*;/,
    `${filePath} ${selector} must not hide runtime labels by zeroing type`,
  );
}

function assertFinalSelectorKeepsContentChromeFree(css, selector, filePath, disallowedAssetPattern) {
  const blocks = findCssBlocksForSelector(css, selector);
  assert.ok(blocks.length > 0, `${filePath} is missing ${selector}`);
  const finalBlock = blocks
    .filter((block) => /background(?:-image)?\s*:|box-shadow\s*:|border\s*:/.test(block) || disallowedAssetPattern.test(block))
    .at(-1) || blocks.at(-1);

  assert.doesNotMatch(
    finalBlock,
    disallowedAssetPattern,
    `${filePath} ${selector} must not stretch metric-chip art inside the generated menu frame`,
  );
  assert.doesNotMatch(
    finalBlock,
    /linear-gradient\s*\(/,
    `${filePath} ${selector} must not fall back to old CSS-gradient panel chrome inside menu art`,
  );
  assert.match(
    finalBlock,
    /background(?:-image)?\s*:\s*(?:transparent|none)(?:\s*!important)?\s*;/,
    `${filePath} ${selector} should leave the generated outer frame to own the menu surface`,
  );
  assert.match(
    finalBlock,
    /box-shadow\s*:\s*none(?:\s*!important)?\s*;/,
    `${filePath} ${selector} should not add nested panel shadows inside menu art`,
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

test("Yard and Garden internal menus use one generated panel asset per screen", async () => {
  const manifestPath = path.join(root, "assets-source", "imagegen", "menu-panels", "menu-panel-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const seenAssets = new Set();

  for (const [gameId, config] of Object.entries(requiredInternalMenuPanels)) {
    const game = manifest.games?.[gameId];
    assert.ok(game, `${gameId} is missing from menu-panel-manifest.json`);

    for (const screenId of config.screens) {
      const entry = game.screens?.[screenId];
      assert.ok(entry, `${gameId}.${screenId} is missing from menu-panel-manifest.json`);
      assert.equal(
        entry.publicPath,
        `${config.publicDir}/${screenId}.png`,
        `${gameId}.${screenId} should use its own public panel file`,
      );
      assert.ok(!seenAssets.has(entry.publicPath), `${entry.publicPath} is shared by more than one menu`);
      seenAssets.add(entry.publicPath);
      assert.ok(existsSync(resolvePublicAsset(entry.publicPath)), `${entry.publicPath} does not exist under public/`);
      assert.equal(entry.generatedBy, "built-in image_gen", `${gameId}.${screenId} must come from the built-in image tool`);
    }
  }
});

test("Yard and Garden menu CSS binds screen-specific generated panels and keeps button labels visible", async () => {
  const yardCss = await readFile(path.join(root, "src", "games", "companion-yard", "companion-yard.css"), "utf8");
  const gardenCss = await readFile(path.join(root, "src", "games", "garden-shelf", "garden-shelf.css"), "utf8");

  for (const screenId of requiredInternalMenuPanels.cozyYard.screens) {
    assert.match(
      yardCss,
      new RegExp(`data-yard-screen="${escapeRegExp(screenId)}"[\\s\\S]*\\/games\\/companion-yard\\/menu-panels\\/${escapeRegExp(screenId)}\\.png`),
      `Yard ${screenId} should bind to its own generated menu panel`,
    );
  }

  for (const screenId of requiredInternalMenuPanels.gardenShelf.screens) {
    assert.match(
      gardenCss,
      new RegExp(`data-garden-panel="${escapeRegExp(screenId)}"[\\s\\S]*\\/games\\/garden-shelf\\/menu-panels\\/${escapeRegExp(screenId)}\\.png`),
      `Garden ${screenId} should bind to its own generated menu panel`,
    );
  }

  const gardenDetailActionBlocks = findCssBlocksForSelector(
    gardenCss,
    '.garden-bottom-sheet[data-asset-slot-surface="garden-plant-detail"] .garden-detail-actions .garden-action-button',
  );
  assert.ok(gardenDetailActionBlocks.length > 0, "Garden detail actions must have asset-surface slot safeguards");
  assert.ok(
    gardenDetailActionBlocks.every((block) => !/font-size\s*:\s*0\s*!important/.test(block)),
    "Garden detail action labels must remain visible and readable",
  );
  const evolveLabelBlocks = findCssBlocksForSelector(gardenCss, ".garden-detail-evolve .garden-evolve-btn-label");
  assert.ok(evolveLabelBlocks.length > 0, "Garden evolve label CSS block must be present");
  assert.ok(
    evolveLabelBlocks.every((block) => !/display\s*:\s*none\s*!important/.test(block)),
    "Garden evolve label must remain visible and readable",
  );
});

test("Garden generated panels reserve authored content lanes instead of overlaying chrome", async () => {
  const gardenCss = await readFile(path.join(root, "src", "games", "garden-shelf", "garden-shelf.css"), "utf8");
  const bottomPanel = await readFile(path.join(root, "src", "games", "garden-shelf", "components", "BottomPanel.tsx"), "utf8");
  const gardenGame = await readFile(path.join(root, "src", "games", "garden-shelf", "GardenShelfGame.tsx"), "utf8");
  const offlineWelcome = await readFile(path.join(root, "src", "games", "garden-shelf", "components", "OfflineWelcome.tsx"), "utf8");

  assert.match(
    gardenCss,
    /\.garden-bottom-sheet\[data-garden-panel\]\s*\{[\s\S]*?aspect-ratio:\s*2\s*\/\s*3/s,
    "Garden bottom sheets should keep the 2:3 generated panel geometry instead of stretching to content height",
  );
  assert.match(
    gardenCss,
    /\.garden-bottom-sheet\[data-garden-panel\]\s+\.garden-sheet-grabber\s*\{[\s\S]*?display:\s*none\s*!important/s,
    "Garden generated panels should not draw a generic sheet grabber over the carved header art",
  );
  assert.match(
    gardenCss,
    /\.garden-bottom-sheet\[data-garden-panel="plant-detail"\]\s+\.garden-detail-header\s*\{[\s\S]*?position:\s*absolute[\s\S]*?top:\s*var\(--garden-detail-title-top\)/s,
    "Garden plant detail title must sit in the authored hanging label lane",
  );
  assert.match(
    gardenCss,
    /\.garden-bottom-sheet\[data-garden-panel="plant-detail"\]\s+\.garden-detail-plant-stage\s*\{[\s\S]*?position:\s*absolute[\s\S]*?top:\s*var\(--garden-detail-stage-top\)/s,
    "Garden plant detail stage must be mapped to the generated arch opening",
  );
  assert.match(
    gardenCss,
    /\.garden-bottom-sheet\[data-garden-panel="plant-detail"\]\s+\.garden-detail-actions\s*\{[\s\S]*?position:\s*absolute[\s\S]*?bottom:\s*var\(--garden-detail-actions-bottom\)/s,
    "Garden plant detail actions must sit in the authored action slots",
  );
  assert.match(
    gardenCss,
    /\.garden-modal-card\[data-garden-panel\]\s*\{[\s\S]*?aspect-ratio:\s*2\s*\/\s*3/s,
    "Garden reward/offline panels should keep the generated portrait panel geometry",
  );
  assert.match(
    gardenCss,
    /\.garden-modal-card\[data-garden-panel\]\s+\.garden-card-row\s*\{[\s\S]*?background:\s*transparent\s*!important/s,
    "Garden reward values should use the generated reward slots, not a nested CSS pill",
  );
  assert.doesNotMatch(
    gardenCss,
    /\/games\/garden-shelf\/button_secondary\.png/,
    "Garden generated panel controls should not use the old sheet-cropped blue button with chromakey fringe",
  );
  assert.match(
    bottomPanel,
    /<div className="garden-detail-header[\s\S]*?<div className="garden-detail-meta/s,
    "Garden plant detail markup should expose title and metric lanes separately for the generated panel",
  );
  assert.match(
    gardenGame,
    /className="garden-modal-reward-icon/s,
    "Garden level reward modal should expose a dedicated icon lane for the generated reward panel",
  );
  assert.match(
    offlineWelcome,
    /className="garden-modal-reward-icon/s,
    "Garden offline reward modal should expose a dedicated icon lane for the generated reward panel",
  );
});

test("Yard generated panels use asset slots and keep dismiss controls icon-only", async () => {
  const yardCss = await readFile(path.join(root, "src", "games", "companion-yard", "companion-yard.css"), "utf8");
  const yardGame = await readFile(path.join(root, "src", "games", "companion-yard", "CompanionYardGame.jsx"), "utf8");

  assert.match(
    yardCss,
    /\.companion-yard-layout\s+\.yard-game-screen\s*\{[\s\S]*?aspect-ratio:\s*2\s*\/\s*3/s,
    "Yard game screens should preserve the 2:3 generated menu-panel geometry",
  );
  assert.match(
    yardCss,
    /\.companion-yard-layout\s+\.yard-game-screen\s*\{[\s\S]*?--yard-screen-bottom-reserve:[\s\S]*?bottom:\s*var\(--yard-screen-bottom-reserve\)\s*!important/s,
    "Yard game screens should reserve the bottom dock instead of extending generated panels underneath it",
  );
  assert.match(
    yardCss,
    /\.companion-yard-layout\s+\.yard-game-screen\s*\{[\s\S]*?width:\s*min\([^;]*var\(--yard-screen-available-height\)\s*\*\s*0\.6667/s,
    "Yard game screens should size portrait panel width from the available height so 2:3 art is not squeezed",
  );
  assert.match(
    yardCss,
    /\.companion-yard-layout\s+\.yard-screen-header\s*\{[\s\S]*?position:\s*absolute[\s\S]*?top:\s*var\(--yard-panel-title-top\)/s,
    "Yard screen titles should sit in the generated ribbon lane",
  );
  assert.match(
    yardCss,
    /\.companion-yard-layout\s+\.yard-screen-content\s*\{[\s\S]*?position:\s*absolute[\s\S]*?inset:\s*var\(--yard-panel-content-inset\)/s,
    "Yard screen content should be constrained to the panel body lane",
  );
  assert.match(
    yardCss,
    /\.companion-yard-layout\s+\.yard-game-screen\[data-yard-screen="food"\]\s+\.yard-card\s*\{[\s\S]*?display:\s*contents/s,
    "Yard food mechanics should flatten into the six authored food slots instead of nesting cards over the panel",
  );
  const yardCardBlocks = findCssBlocksForSelector(yardCss, ".companion-yard-layout .yard-card");
  assert.ok(yardCardBlocks.length > 0, "Yard generated card CSS block must be present");
  assert.ok(
    yardCardBlocks.some((block) => /background:\s*transparent\s*!important/.test(block)),
    "Yard menu rows/cards should not repaint opaque CSS rectangles over generated row art",
  );
  assert.ok(
    yardCardBlocks.every((block) => !/background:\s*linear-gradient/.test(block)),
    "Yard generated menus must not keep the old final-pass rectangular card fills",
  );
  assert.match(
    yardCss,
    /\.companion-yard-layout\s+\.yard-icon-button\[data-label-mode="hidden"\]\s+\.yard-icon-label\s*\{[\s\S]*?display:\s*none\s*!important/s,
    "Yard icon-only dismiss buttons should not show press tooltip text over panel art",
  );
  assert.match(
    yardGame,
    /<YardIconButton compact icon="close" label=\{text\("yard\.close", "Close"\)\} labelMode="hidden" onClick=\{closeScreen\}/,
    "Yard screen close button should remain accessible by aria-label while visually icon-only",
  );
});

test("Garden generated panels pin runtime controls to authored slots", async () => {
  const gardenCss = await readFile(path.join(root, "src", "games", "garden-shelf", "garden-shelf.css"), "utf8");
  const gardenGame = await readFile(path.join(root, "src", "games", "garden-shelf", "GardenShelfGame.tsx"), "utf8");
  const gardenBottomPanel = await readFile(path.join(root, "src", "games", "garden-shelf", "components", "BottomPanel.tsx"), "utf8");

  assert.match(
    gardenGame,
    /className="garden-settings-body"/,
    "Garden settings should expose a semantic body wrapper for the generated settings panel slots",
  );
  assert.match(
    gardenGame,
    /className="garden-settings-row garden-settings-sound-row"/,
    "Garden settings sound control should be addressable as a painted row slot",
  );
  assert.match(
    gardenGame,
    /className="garden-settings-language-grid"/,
    "Garden settings language buttons should be addressable as the painted two-button row",
  );
  assert.match(
    gardenCss,
    /\.garden-settings-dialog\[data-garden-panel="settings"\]\s+\.garden-settings-body\s*\{[\s\S]*?position:\s*absolute/s,
    "Garden settings content should be absolutely pinned inside the authored panel slots",
  );
  assert.match(
    gardenCss,
    /\.garden-quest-dialog\[data-garden-panel="quests"\]\s+\.garden-quest-card\s*\{[\s\S]*?grid-template-columns:/s,
    "Garden quest rows should map title, reward, progress, and action into the generated row lanes",
  );
  assert.match(
    gardenCss,
    /\.garden-quest-dialog\[data-garden-panel="quests"\]\s+\.garden-quest-card\s+>\s+\.flex\s*\{[\s\S]*?display:\s*contents/s,
    "Garden quest card flex wrappers should flatten so inner content can occupy authored row slots",
  );
  assert.match(
    gardenBottomPanel,
    /data-asset-slot-surface=\{isPlantDetail \? "garden-plant-detail" : "garden-seed-shop-inventory"\}/,
    "Garden seed shop/inventory and plant detail must expose mechanical asset slot surfaces",
  );
  assert.match(
    gardenBottomPanel,
    /gardenSeedRowAttrs\('garden-seed-shop-row',\s*rowIndex\)/,
    "Garden seed shop rows must be pinned to authored row slots instead of flowing between painted cells",
  );
  assert.match(
    gardenBottomPanel,
    /gardenSeedRowAttrs\('garden-inventory-row',\s*rowIndex\)/,
    "Garden inventory rows must be pinned to authored row slots instead of flowing between painted cells",
  );
  assert.match(
    gardenCss,
    /\.garden-bottom-sheet\[data-asset-slot-surface="garden-seed-shop-inventory"\]\s+\[data-asset-slot-group\]\s*\{[\s\S]*?position:\s*absolute/s,
    "Garden seed shop/inventory row slots should use absolute panel coordinates",
  );
});

test("Yard generated management screens declare screen-specific slot maps", async () => {
  const yardCss = await readFile(path.join(root, "src", "games", "companion-yard", "companion-yard.css"), "utf8");

  const screens = ["food", "goodies", "shop", "petbook", "album", "gifts", "repair", "remodel", "expansion", "daily", "companion", "settings"];
  for (const screen of screens) {
    assert.match(
      yardCss,
      new RegExp(`\\.companion-yard-layout\\s+\\.yard-game-screen\\[data-yard-screen="${screen}"\\]\\s*\\{[\\s\\S]*?--yard-panel-content-inset:`),
      `Yard ${screen} panel should define its own body inset instead of inheriting a generic overlay lane`,
    );
  }

  const slotSelectors = [
    ['goodies', 'yard-card', 'grid-template-rows:'],
    ['settings', 'yard-card', 'position:\\s*relative'],
    ['daily', 'yard-card', 'position:\\s*relative'],
    ['companion', 'yard-species-grid', 'grid-template-columns:\\s*repeat\\(3'],
    ['remodel', 'yard-screen-grid', 'grid-template-columns:\\s*repeat\\(2'],
    ['repair', 'yard-shop-row', 'grid-template-columns:'],
    ['expansion', 'yard-card', 'position:\\s*relative'],
  ];

  for (const [screen, selector, expectedRule] of slotSelectors) {
    assert.match(
      yardCss,
      new RegExp(`\\.companion-yard-layout\\s+\\.yard-game-screen\\[data-yard-screen="${screen}"\\]\\s+\\.${selector}\\s*\\{[\\s\\S]*?${expectedRule}`, "s"),
      `Yard ${screen} panel should map .${selector} into generated asset slots`,
    );
  }
});

test("Yard generated management screens use mechanical asset slot maps", async () => {
  const yardGame = await readFile(path.join(root, "src", "games", "companion-yard", "CompanionYardGame.jsx"), "utf8");
  const screens = requiredInternalMenuPanels.cozyYard.screens;

  assert.match(
    yardGame,
    /data-asset-slot-surface=\{`yard-\$\{activeScreen\}`\}/,
    "Yard generated panels must expose a screen-specific asset-slot surface",
  );
  assert.match(
    yardGame,
    /yardPanelSlotStyle/,
    "Yard generated panels must use the shared slot style helper for fixed panel lanes",
  );
  assert.match(
    yardGame,
    /yardPanelGroupSlotStyle/,
    "Yard generated panels must use the shared slot style helper for repeated row/card lanes",
  );
  const requiredRenderedGroups = {
    goodies: ["inventory-row", "placed-row"],
    shop: ["shop-food-row", "shop-goodies-row", "shop-background-row"],
  };
  for (const [screen, groupIds] of Object.entries(requiredRenderedGroups)) {
    for (const groupId of groupIds) {
      assert.match(
        yardGame,
        new RegExp(`yardGroupSlotAttrs\\("${screen}",\\s*"${groupId}"`),
        `Yard ${screen}.${groupId} must be applied to rendered rows, not only declared in the slot map`,
      );
    }
  }

  for (const screen of screens) {
    const map = YARD_SCREEN_SLOT_MAPS[screen];
    assert.ok(map, `Yard ${screen} must have a mechanical panel slot map`);
    assert.ok(map.slots["panel-title"], `Yard ${screen} must pin its title to the banner slot`);
    assert.ok(map.slots["panel-close"], `Yard ${screen} must pin its close control to the painted close slot`);

    for (const [slotId, slot] of Object.entries(map.slots)) {
      assert.ok(slot.x >= 0 && slot.y >= 0, `Yard ${screen}.${slotId} must stay inside the panel origin`);
      assert.ok(slot.x + slot.width <= YARD_PANEL_REFERENCE.width, `Yard ${screen}.${slotId} must not overflow panel width`);
      assert.ok(slot.y + slot.height <= YARD_PANEL_REFERENCE.height, `Yard ${screen}.${slotId} must not overflow panel height`);
    }

    for (const [groupId, slots] of Object.entries(map.groups || {})) {
      assert.ok(slots.length > 0, `Yard ${screen}.${groupId} must define at least one authored slot`);
      for (const [index, slot] of slots.entries()) {
        assert.ok(slot.x >= 0 && slot.y >= 0, `Yard ${screen}.${groupId}[${index}] must stay inside the panel origin`);
        assert.ok(slot.x + slot.width <= YARD_PANEL_REFERENCE.width, `Yard ${screen}.${groupId}[${index}] must not overflow panel width`);
        assert.ok(slot.y + slot.height <= YARD_PANEL_REFERENCE.height, `Yard ${screen}.${groupId}[${index}] must not overflow panel height`);
      }
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

  for (const gameId of arcadeGames) {
    const { prefix, skin, button } = arcadeArt[gameId];
    const cssPath = `src/games/${gameId}/${gameId}-presentation.css`;
    const css = await readFile(path.join(root, cssPath), "utf8");
    const buttonCss = findCssBlocksForSelector(css, `.${prefix}-button`).join("\n");
    assert.match(buttonCss, /min-width:\s*44px/);
    assert.match(buttonCss, /min-height:\s*48px/);
    assert.doesNotMatch(buttonCss, /(?:color:\s*transparent|font-size:\s*0(?:px)?\s*;|linear-gradient\s*\()/);
    for (const paused of [false, true]) {
      const { tree } = renderArcadePresentation(gameId, { gameActive: paused, paused, state: { gameActive: paused, score: 420, tray: [], board: [] } });
      const buttons = findElements(tree, (node) => node.type === "button" && node.props.className?.split(" ").includes(`${prefix}-button`));
      assert.ok(buttons.length >= 2, `${gameId} must expose real menu/pause buttons`);
      for (const control of buttons) {
        assert.equal(control.props.style.borderImageSource, skin(button).borderImageSource, `${gameId} buttons use the active v2 skin`);
        assert.ok(textContent(control).trim(), `${gameId} button labels must remain runtime text`);
        assert.equal(typeof control.props.onClick, "function", `${gameId} menu controls must be wired`);
      }
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

test("arcade mode choices expose labeled cards, selection state and mode callbacks", async () => {
  for (const gameId of ["match3", "bubbo"]) {
    const { prefix } = arcadeArt[gameId];
    const { tree, calls } = renderArcadePresentation(gameId, { gameActive: false, mode: "timed" });
    const modes = findElements(tree, (node) => node.props.className === `${prefix}-modes`);
    assert.equal(modes.length, 1, `${gameId} must render its mode selector`);
    const buttons = findElements(modes[0], (node) => node.type === "button");
    const ids = gameId === "match3" ? ["classic", "timed", "drop"] : ["classic", "timed"];
    assert.equal(buttons.length, ids.length);
    buttons.forEach((button, index) => {
      assert.equal(button.props["aria-pressed"], ids[index] === "timed");
      assert.match(textContent(button), new RegExp(`${gameId}\\.mode\\.${ids[index]}`));
      assert.equal(findElements(button, (node) => node.type === "strong").length, 1, "mode title remains visible");
      assert.equal(findElements(button, (node) => node.type === "span").length, 1, "mode hint remains visible");
      button.props.onClick();
      assert.deepEqual(calls.at(-1), { name: gameId === "match3" ? "ModeChange" : "Mode", args: [ids[index]] });
    });
    const css = await readFile(path.join(root, "src", "games", gameId, `${gameId}-presentation.css`), "utf8");
    const selector = gameId === "match3" ? ".m3-mode" : ".bb-modes>.bb-button";
    assert.match(findCssBlocksForSelector(css, selector).join("\n"), /flex-direction:\s*column/);
  }
});

test("visible mini-game menu chrome is owned by generated assets", async () => {
  const selectorsByFile = {



    "src/games/merge/merge.css": {
      dialog: /--hud-redesign-dialog-art|--merge-pause-art|\/games\/hud-redesign\/merge\/dialog-panel\.png/,
      metric: /--hud-redesign-metric-art|\/games\/hud-redesign\/merge\/metric-chip\.png/,
      dialogSelectors: [".game-shell .game-menu-overlay.merge-pause-overlay .game-menu-scaler"],
      contentSelectors: [
        ".merge-pause-overlay .panel-header",
        ".merge-pause-overlay .pause-menu-frame",
        ".merge-pause-overlay .pause-status-line span",
      ],
    },
    "src/games/trivia/trivia.css": {
      dialog: /--hud-redesign-dialog-art|--trivia-dialog-art|\/games\/(?:ui-surfaces|hud-redesign)\/trivia(?:-dialog-panel|\/dialog-panel)\.png/,
      metric: /--hud-redesign-metric-art|\/games\/hud-redesign\/trivia\/metric-chip\.png/,
      dialogSelectors: [".trivia-shell .trivia-pause-overlay .game-menu-scaler"],
      contentSelectors: [
        ".trivia-shell .trivia-pause-overlay .panel-header",
        ".trivia-shell .trivia-pause-overlay .pause-menu-frame",
        ".trivia-shell .trivia-pause-overlay .compact-list span",
        ".trivia-shell .trivia-pause-overlay .pause-status-line span",
      ],
    },
  };

  for (const [filePath, config] of Object.entries(selectorsByFile)) {
    const css = await readFile(path.join(root, filePath), "utf8");
    for (const selector of config.dialogSelectors) {
      assertFinalSelectorUsesAssetChrome(css, selector, filePath, config.dialog);
    }
    for (const selector of config.buttonSelectors || []) {
      assertFinalSelectorUsesAssetChrome(css, selector, filePath, config.button);
    }
    for (const selector of config.contentSelectors) {
      assertFinalSelectorKeepsContentChromeFree(css, selector, filePath, config.metric);
    }
  }

  for (const gameId of arcadeGames) {
    const { prefix, skin, dialog } = arcadeArt[gameId];
    const cssPath = `src/games/${gameId}/${gameId}-presentation.css`;
    const css = await readFile(path.join(root, cssPath), "utf8");
    const { tree } = renderArcadePresentation(gameId, { paused: true });
    const dialogs = findElements(tree, (node) => node.props.role === "dialog");
    assert.equal(dialogs.length, 1, `${gameId} must have one owning dialog frame`);
    assert.equal(dialogs[0].props.style.borderImageSource, skin(dialog).borderImageSource);
    const nestedSkins = findElements(dialogs[0].props.children, (node) => node.type !== "button" && node.props.style?.borderImageSource);
    assert.equal(nestedSkins.length, 0, `${gameId} content must not duplicate dialog/metric art`);
    assert.match(findCssBlocksForSelector(css, `.${prefix}-skin`).join("\n"), /background:\s*none/);
    assert.match(findCssBlocksForSelector(css, `.${prefix}-skin`).join("\n"), /box-shadow:\s*none/);
    const dialogCss = findCssBlocksForSelector(css, `.${prefix}-dialog`).join("\n");
    assert.doesNotMatch(dialogCss, /(?:linear-gradient\s*\(|background(?:-image)?:[^;]*url\()/);
    assert.match(findCssBlocksForSelector(css, `.${prefix}-dialog-scroll`).join("\n"), /overflow:\s*auto/);
  }
});

test("Bubbo active presentation assets have no stale button-skin URLs", async () => {
  const files = ["bubbo-presentation.css", "BubboPresentation.jsx", "bubboArt.js"];
  for (const file of files) {
    const source = await readFile(path.join(root, "src", "games", "bubbo", file), "utf8");
    assert.doesNotMatch(source, /\/games\/bubbo\//, `${file} must not use stale /games/bubbo/ URLs`);
    assert.doesNotMatch(source, /button_secondary\.png/, `${file} must not retain obsolete button layers`);
  }
});

test("Merge pause parchment keeps text in the generated reading lane", async () => {
  const css = await readFile(path.join(root, "src", "games", "merge", "merge.css"), "utf8");
  const positionedHeaderBlock = findCssBlocksForSelector(css, ".merge-pause-overlay .panel-header").find((block) => /top\s*:/.test(block)) || "";
  assert.doesNotMatch(
    positionedHeaderBlock,
    /top\s*:\s*13\.8%/,
    "Merge pause title must not sit on the top emblem/wood trim of the generated frame",
  );
  assert.match(
    positionedHeaderBlock,
    /top\s*:\s*(?:16|17|18)(?:\.\d+)?%/,
    "Merge pause title should start inside the parchment reading lane",
  );

  const finalContentBlock = findCssBlocksForSelector(css, ".merge-pause-overlay .pause-menu-frame").at(-1) || "";
  assert.doesNotMatch(
    finalContentBlock,
    /color\s*:\s*var\(--hud-redesign-ink/,
    "Merge pause parchment content must not inherit the light HUD ink used for dark frames",
  );
  assert.match(
    finalContentBlock,
    /color\s*:\s*#3b2518\s*!important/,
    "Merge pause parchment content should use dark ink over the light generated asset",
  );
});

test("Bubbo pause status exposes score, run limit and reward instead of mode-label duplication", () => {
  for (const mode of ["classic", "timed"]) {
    const { tree } = renderArcadePresentation("bubbo", { paused: true, mode });
    const metrics = findElements(tree, (node) => node.props.className === "bb-dialog-metrics");
    assert.equal(metrics.length, 1, "Bubbo pause metrics must be rendered");
    const values = findElements(metrics[0], (node) => node.props.className === "bb-metric").map(textContent);
    assert.deepEqual(values, ["common.score 420", mode === "timed" ? "common.time 31s" : "common.shots 17", "common.reward 12"]);
    assert.doesNotMatch(textContent(metrics[0]), /bubbo\.mode\./);
  }
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

  for (const gameId of arcadeGames) {
    for (const paused of [false, true]) {
      const { tree } = renderArcadePresentation(gameId, { paused });
      const controls = findElements(tree, (node) => node.type === "button" || node.props.as === "button");
      assert.ok(controls.length > 0, `${gameId} rendered controls must be inspected`);
      for (const control of controls) assert.equal(control.props.title, undefined, `${gameId} controls must avoid native title tooltips`);
    }
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
  assert.match(
    gardenCss,
    /\.garden-quest-card\s*\{[\s\S]*rgba\(250,\s*228,\s*177,\s*0\.84\)[\s\S]*color:\s*#3b2418\s*!important/s,
    "Garden quest rows should use a readable parchment row surface over the generated panel art",
  );
  assert.doesNotMatch(gardenCss, /\.garden-quest-card\s*\{[^}]*url\(/s, "Garden quest rows must not add nested image art");
  assert.match(gardenCss, /\.garden-quest-card \.garden-quest-claimable\s*\{/);
});

test("mini-game menus use neutral dialog art instead of blue slot panels", async () => {
  const cssByFile = {
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

  for (const gameId of arcadeGames) {
    const { assets, skin, dialog } = arcadeArt[gameId];
    const frame = skin(dialog).borderImageSource;
    assert.ok(frame.includes(`/games/${gameId}-v2/`), `${gameId} uses its neutral v2 panel/card frame`);
    assert.doesNotMatch(frame, /(?:slot|metric-chip)/, `${gameId} dialogs must not stretch slot art`);
    for (const assetPath of Object.values(assets)) {
      assert.ok(existsSync(resolvePublicAsset(assetPath)), `${gameId} active asset ${assetPath} must exist`);
    }
  }
});
