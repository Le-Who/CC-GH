import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MERGE_CHAINS,
  MERGE_EXCHANGE_OFFERS,
  MERGE_GENERATOR_CHAIN_IDS,
  MERGE_RECIPES,
  MERGE_START_CHAIN_ID,
  MERGE_WILD_GENERATOR_ID,
  calculateMergeEssenceReward,
  getMergePairResult,
  normalizeMergeItem,
} from "../game-logic.js";
import { mergeStore, ITEM_LOOKUP } from "../src/hooks/useMergeEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSceneRuntimeText() {
  const files = [path.join(__dirname, "..", "src", "game-runtime", "scenes.js")];
  const scenesDir = path.join(__dirname, "..", "src", "game-runtime", "scenes");
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.name.endsWith(".js")) files.push(fullPath);
    }
  };
  visit(scenesDir);
  return files.map((file) => fs.readFileSync(file, "utf-8")).join("\n");
}

describe("Merge Engine Hooks (useMergeEngine)", () => {
  beforeEach(() => {
    // Reset store before each test
    mergeStore.setState({
      board: Array.from({ length: 7 }, () => Array(9).fill(null)),
      generators: [MERGE_START_CHAIN_ID],
      generatorState: {
        [MERGE_START_CHAIN_ID]: { tapsLeft: 30, cooldownEnd: 0 },
        [MERGE_WILD_GENERATOR_ID]: { tapsLeft: 30, cooldownEnd: 0 },
      },
      mergeInventory: [],
      lastFreePull: 0,
      lastFreeTaps: 0,
      freeTapCharges: 0,
      alchemyEssence: 0,
      trashMode: false,
      selectedFuel: {},
    });
  });

  describe("Initial State & Basic Actions", () => {
    it("initializes with an empty 7x9 board", () => {
      const { board } = mergeStore.getState();
      assert.strictEqual(board.length, 7);
      assert.strictEqual(board[0].length, 9);
      assert.strictEqual(mergeStore.getState().boardItemCount(), 0);
    });

    it("toggleTrashMode flips trashMode state", () => {
      const state1 = mergeStore.getState();
      assert.strictEqual(state1.trashMode, false);

      state1.toggleTrashMode();
      assert.strictEqual(mergeStore.getState().trashMode, true);

      mergeStore.getState().toggleTrashMode();
      assert.strictEqual(mergeStore.getState().trashMode, false);
    });

    it("setBoard updates the board", () => {
      const newBoard = Array.from({ length: 7 }, () => Array(9).fill(null));
      newBoard[0][0] = { id: "seed", chainId: "flora", level: 0 };

      mergeStore.getState().setBoard(newBoard);
      const { board } = mergeStore.getState();
      assert.deepStrictEqual(board[0][0], { id: "seed", chainId: "flora", level: 0 });
      assert.strictEqual(mergeStore.getState().boardItemCount(), 1);
    });

    it("setGenerators updates the generators list", () => {
      mergeStore.getState().setGenerators(["flora", "earth"]);
      assert.deepStrictEqual(mergeStore.getState().generators, ["flora", "earth"]);
    });

    it("setGeneratorState updates the generator states", () => {
      const newState = { flora: { tapsLeft: 5, cooldownEnd: 1000 } };
      mergeStore.getState().setGeneratorState(newState);
      assert.deepStrictEqual(mergeStore.getState().generatorState, newState);
    });

    it("setLastFreePull updates the last free pull timestamp", () => {
      const now = Date.now();
      mergeStore.getState().setLastFreePull(now);
      assert.strictEqual(mergeStore.getState().lastFreePull, now);
    });

    it("setFreeTapCharges updates remaining free taps", () => {
      mergeStore.getState().setFreeTapCharges(12);
      assert.strictEqual(mergeStore.getState().freeTapCharges, 12);
    });

    it("setSelectedFuel updates fuel selection for a chain", () => {
      mergeStore.getState().setSelectedFuel("flora", "strawberry");
      assert.deepStrictEqual(mergeStore.getState().selectedFuel, { flora: "strawberry" });

      mergeStore.getState().setSelectedFuel("earth", "corn");
      assert.deepStrictEqual(mergeStore.getState().selectedFuel, { flora: "strawberry", earth: "corn" });
    });
  });

  describe("Computed Properties", () => {
    it("getItemInfo returns correct info or null", () => {
      const info = mergeStore.getState().getItemInfo("seed");
      assert.ok(info);
      assert.strictEqual(info.chainId, "flora");
      assert.strictEqual(info.level, 0);

      const invalid = mergeStore.getState().getItemInfo("invalid_item");
      assert.strictEqual(invalid, null);
    });

    it("isOnCooldown correctly identifies active cooldowns", () => {
      const chainId = "flora";

      // No cooldown
      mergeStore.getState().setGeneratorState({ [chainId]: { tapsLeft: 0, cooldownEnd: 0 } });
      assert.strictEqual(mergeStore.getState().isOnCooldown(chainId), false);

      // Past cooldown
      mergeStore.getState().setGeneratorState({ [chainId]: { tapsLeft: 0, cooldownEnd: Date.now() - 1000 } });
      assert.strictEqual(mergeStore.getState().isOnCooldown(chainId), false);

      // Future cooldown
      mergeStore.getState().setGeneratorState({ [chainId]: { tapsLeft: 0, cooldownEnd: Date.now() + 10000 } });
      assert.strictEqual(mergeStore.getState().isOnCooldown(chainId), true);

      // Missing chain
      assert.strictEqual(mergeStore.getState().isOnCooldown("unknown"), false);
    });

    it("canFreePull correctly compares dates", () => {
      const now = new Date();

      // Never pulled
      mergeStore.getState().setLastFreePull(0);
      assert.strictEqual(mergeStore.getState().canFreePull(), true);

      // Pulled yesterday
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      mergeStore.getState().setLastFreePull(yesterday.getTime());
      assert.strictEqual(mergeStore.getState().canFreePull(), true);

      // Pulled today
      mergeStore.getState().setLastFreePull(now.getTime());
      assert.strictEqual(mergeStore.getState().canFreePull(), false);
    });

    it("boardItemCount returns correct count of non-null cells", () => {
      assert.strictEqual(mergeStore.getState().boardItemCount(), 0);

      const newBoard = Array.from({ length: 7 }, () => Array(9).fill(null));
      newBoard[0][0] = { id: "item1" };
      newBoard[1][1] = { id: "item2" };
      mergeStore.getState().setBoard(newBoard);

      assert.strictEqual(mergeStore.getState().boardItemCount(), 2);
    });
  });

  describe("Computed: canMerge", () => {
    it("returns false if source or destination is empty", () => {
      const { canMerge } = mergeStore.getState();
      assert.strictEqual(canMerge(0, 0, 0, 1), false);
    });

    it("returns false if items have different chainIds or levels", () => {
      const newBoard = Array.from({ length: 7 }, () => Array(9).fill(null));
      newBoard[0][0] = { id: "seed", chainId: "flora", level: 0 };
      newBoard[0][1] = { id: "sprout", chainId: "flora", level: 1 };
      newBoard[0][2] = { id: "ember", chainId: "fire", level: 0 };
      mergeStore.getState().setBoard(newBoard);

      const { canMerge } = mergeStore.getState();
      assert.strictEqual(canMerge(0, 0, 0, 1), false, "Different levels");
      assert.strictEqual(canMerge(0, 0, 0, 2), false, "Different chains");
    });

    it("returns false if item has no nextId (max level)", () => {
      // Find a max level item from ITEM_LOOKUP
      const maxLevelItemId = Object.keys(ITEM_LOOKUP).find(id => ITEM_LOOKUP[id].nextId === null);
      if (maxLevelItemId) {
        const info = ITEM_LOOKUP[maxLevelItemId];
        const newBoard = Array.from({ length: 7 }, () => Array(9).fill(null));
        newBoard[0][0] = { id: maxLevelItemId, chainId: info.chainId, level: info.level };
        newBoard[0][1] = { id: maxLevelItemId, chainId: info.chainId, level: info.level };
        mergeStore.getState().setBoard(newBoard);

        const { canMerge } = mergeStore.getState();
        assert.strictEqual(canMerge(0, 0, 0, 1), false);
      }
    });

    it("returns true for mergeable items", () => {
      const mergeableItemId = Object.keys(ITEM_LOOKUP).find(id => ITEM_LOOKUP[id].nextId !== null);
      if (mergeableItemId) {
        const info = ITEM_LOOKUP[mergeableItemId];
        const newBoard = Array.from({ length: 7 }, () => Array(9).fill(null));
        newBoard[0][0] = { id: mergeableItemId, chainId: info.chainId, level: info.level };
        newBoard[0][1] = { id: mergeableItemId, chainId: info.chainId, level: info.level };
        mergeStore.getState().setBoard(newBoard);

        const { canMerge } = mergeStore.getState();
        assert.strictEqual(canMerge(0, 0, 0, 1), true);
      }
    });

    it("returns true for alchemy recipe pairs", () => {
      const newBoard = Array.from({ length: 7 }, () => Array(9).fill(null));
      newBoard[0][0] = { id: "sand", chainId: "earth", level: 1 };
      newBoard[0][1] = { id: "flame", chainId: "fire", level: 1 };
      mergeStore.getState().setBoard(newBoard);

      const { canMerge } = mergeStore.getState();
      assert.strictEqual(canMerge(0, 0, 0, 1), true);
    });

    it("returns false for out-of-bounds coordinates", () => {
      const { canMerge } = mergeStore.getState();
      assert.strictEqual(canMerge(-1, 0, 0, 0), false);
      assert.strictEqual(canMerge(0, 0, 7, 0), false);
      assert.strictEqual(canMerge(0, 0, 0, 9), false);
    });
  });

  describe("Cell Operations", () => {
    it("clearCell removes item from specified coordinates", () => {
      const newBoard = Array.from({ length: 7 }, () => Array(9).fill(null));
      newBoard[3][3] = { id: "some_item" };
      mergeStore.getState().setBoard(newBoard);
      assert.strictEqual(mergeStore.getState().board[3][3].id, "some_item");

      mergeStore.getState().clearCell(3, 3);
      assert.strictEqual(mergeStore.getState().board[3][3], null);
    });
  });

  describe("Actions: mergeOptimistic & rollback", () => {
    it("returns null if source is empty or unmergeable", () => {
      const { mergeOptimistic } = mergeStore.getState();
      assert.strictEqual(mergeOptimistic(0, 0, 0, 1), null);

      const maxLevelItemId = Object.keys(ITEM_LOOKUP).find(id => ITEM_LOOKUP[id].nextId === null);
      if (maxLevelItemId) {
        const info = ITEM_LOOKUP[maxLevelItemId];
        const newBoard = Array.from({ length: 7 }, () => Array(9).fill(null));
        newBoard[0][0] = { id: maxLevelItemId, chainId: info.chainId, level: info.level };
        mergeStore.getState().setBoard(newBoard);

        assert.strictEqual(mergeStore.getState().mergeOptimistic(0, 0, 0, 1), null);
      }
    });

    it("performs optimistic merge and returns old board for rollback", () => {
      const mergeableItemId = Object.keys(ITEM_LOOKUP).find(id => ITEM_LOOKUP[id].nextId !== null);
      if (!mergeableItemId) return;

      const info = ITEM_LOOKUP[mergeableItemId];
      const nextInfo = ITEM_LOOKUP[info.nextId];

      const newBoard = Array.from({ length: 7 }, () => Array(9).fill(null));
      newBoard[0][0] = { id: mergeableItemId, chainId: info.chainId, level: info.level };
      newBoard[0][1] = { id: mergeableItemId, chainId: info.chainId, level: info.level };
      mergeStore.getState().setBoard(newBoard);

      const oldBoard = mergeStore.getState().mergeOptimistic(0, 0, 0, 1);

      const stateAfterMerge = mergeStore.getState();
      assert.strictEqual(stateAfterMerge.board[0][0], null);
      assert.deepStrictEqual(stateAfterMerge.board[0][1], {
        id: info.nextId,
        chainId: info.chainId,
        level: nextInfo.level,
      });

      // Rollback
      const snapshot = mergeStore.getState().snapshot();
      snapshot.board = oldBoard;
      mergeStore.getState().rollback(snapshot);

      const stateAfterRollback = mergeStore.getState();
      assert.deepStrictEqual(stateAfterRollback.board[0][0], { id: mergeableItemId, chainId: info.chainId, level: info.level });
      assert.deepStrictEqual(stateAfterRollback.board[0][1], { id: mergeableItemId, chainId: info.chainId, level: info.level });
    });

    it("performs optimistic recipe merges", () => {
      const newBoard = Array.from({ length: 7 }, () => Array(9).fill(null));
      newBoard[0][0] = { id: "sand", chainId: "earth", level: 1 };
      newBoard[0][1] = { id: "flame", chainId: "fire", level: 1 };
      mergeStore.getState().setBoard(newBoard);

      const oldBoard = mergeStore.getState().mergeOptimistic(0, 0, 0, 1);

      assert.ok(oldBoard);
      assert.strictEqual(mergeStore.getState().board[0][0], null);
      assert.deepStrictEqual(mergeStore.getState().board[0][1], {
        id: "glass",
        chainId: "alchemy",
        level: 2,
      });
    });
  });

  describe("Snapshot & Rollback", () => {
    it("snapshot returns a deep copy and rollback restores state", () => {
      const originalState = mergeStore.getState().snapshot();

      // Modify state
      mergeStore.getState().setGenerators(["earth"]);
      mergeStore.getState().setLastFreePull(999);

      const modifiedState = mergeStore.getState();
      assert.deepStrictEqual(modifiedState.generators, ["earth"]);
      assert.strictEqual(modifiedState.lastFreePull, 999);

      // Rollback
      mergeStore.getState().rollback(originalState);
      const restoredState = mergeStore.getState();
      assert.deepStrictEqual(restoredState.generators, ["flora"]);
      assert.strictEqual(restoredState.lastFreePull, 0);
    });
  });

  describe("Actions: syncFromServer", () => {
    it("syncs subset of fields from server while preserving others", () => {
      const serverData = {
        generators: ["flora", "earth"],
        lastFreePull: 123456789,
        freeTapCharges: 7,
      };

      mergeStore.getState().syncFromServer(serverData);
      const state = mergeStore.getState();

      assert.deepStrictEqual(state.generators, ["flora", "earth"]);
      assert.strictEqual(state.lastFreePull, 123456789);
      assert.strictEqual(state.freeTapCharges, 7);
      // Ensure other fields are intact
      assert.strictEqual(state.trashMode, false);
      assert.strictEqual(state.boardItemCount(), 0);
    });

    it("handles null or undefined mergeData gracefully", () => {
      const initialState = mergeStore.getState().snapshot();
      mergeStore.getState().syncFromServer(null);
      assert.deepStrictEqual(mergeStore.getState().snapshot(), initialState);

      mergeStore.getState().syncFromServer(undefined);
      assert.deepStrictEqual(mergeStore.getState().snapshot(), initialState);
    });

    it("uses existing state when fields are missing from mergeData", () => {
      const partialData = { inventory: ["gold_item"] };
      mergeStore.getState().syncFromServer(partialData);
      const state = mergeStore.getState();
      assert.deepStrictEqual(state.mergeInventory, ["gold_item"]);
      assert.deepStrictEqual(state.generators, ["flora"]);
    });
  });

  describe("Alchemy recipe graph", () => {
    it("resolves every published recipe to its configured output", () => {
      for (const recipe of MERGE_RECIPES) {
        const [firstId, secondId] = recipe.ingredients;
        const first = normalizeMergeItem({ id: firstId });
        const second = normalizeMergeItem({ id: secondId });
        const result = getMergePairResult(first, second);
        const chain = MERGE_CHAINS[recipe.result.chainId];

        assert.ok(first, `Missing first ingredient ${firstId}`);
        assert.ok(second, `Missing second ingredient ${secondId}`);
        assert.ok(result, `Recipe ${recipe.id} did not resolve`);
        assert.equal(result.id, chain.items[recipe.result.level]);
        assert.equal(result.chainId, recipe.result.chainId);
        assert.equal(result.level, recipe.result.level);
        assert.equal(result.recipeId, recipe.id);
      }
    });

    it("keeps recipe metadata visible for the recipe book", () => {
      assert.ok(MERGE_RECIPES.length >= 10);
      assert.ok(MERGE_RECIPES.some((recipe) => recipe.discovered === true), "Starter recipes should be visible immediately");
      assert.ok(MERGE_RECIPES.some((recipe) => recipe.discovered === false), "Advanced recipes should have locked slots");
      for (const recipe of MERGE_RECIPES) {
        assert.ok(recipe.name, `${recipe.id} should have a name`);
        assert.ok(recipe.hint, `${recipe.id} should have a hint`);
        assert.equal(typeof recipe.discovered, "boolean", `${recipe.id} should declare starter visibility`);
      }
    });

    it("keeps alchemy out of random generator pools so it stays recipe-only", () => {
      assert.ok(!MERGE_GENERATOR_CHAIN_IDS.includes("alchemy"));
      assert.ok(MERGE_GENERATOR_CHAIN_IDS.every((chainId) => MERGE_CHAINS[chainId]));
    });

    it("publishes Essence exchange offers and server-side reward math", () => {
      const treatsOffer = MERGE_EXCHANGE_OFFERS.find((offer) => offer.id === "yard_treats_small");
      const shinyOffer = MERGE_EXCHANGE_OFFERS.find((offer) => offer.id === "yard_shiny_treat");

      assert.ok(treatsOffer, "Treat exchange offer should exist");
      assert.ok(shinyOffer, "Shiny Treat exchange offer should exist");
      assert.equal(treatsOffer.targetGame, "yard");
      assert.equal(shinyOffer.targetGame, "yard");
      assert.ok(treatsOffer.cost > 0);
      assert.ok(shinyOffer.cost > treatsOffer.cost);
      assert.ok(treatsOffer.reward.treats > 0);
      assert.ok(shinyOffer.reward.shinyTreats > 0);
      assert.equal(calculateMergeEssenceReward({ chainId: "alchemy", level: 2 }, { recipeDiscovered: true }), 18);
      assert.equal(calculateMergeEssenceReward({ chainId: "flora", level: 3 }, { recipeDiscovered: false }), 4);
    });

    it("maps legacy persisted items into the new alchemy taxonomy", () => {
      assert.deepEqual(normalizeMergeItem({ id: "thread", chainId: "textile", level: 0 }), {
        id: "seed",
        chainId: "flora",
        level: 0,
      });
      assert.deepEqual(normalizeMergeItem({ id: "lightning", chainId: "storm", level: 3 }), {
        id: "lightning",
        chainId: "air",
        level: 4,
      });
      assert.deepEqual(normalizeMergeItem({ id: "loom", chainId: "craft", level: 3 }), {
        id: "vial",
        chainId: "alchemy",
        level: 3,
      });
    });
  });

  describe("Mobile Drag Regression Guards", () => {
    it("game surfaces opt out of viewport swipe leakage during drag", () => {
      const cssPath = path.join(__dirname, "..", "src", "index.css");
      const platformPath = path.join(__dirname, "..", "src", "platform", "telegram.js");
      const css = fs.readFileSync(cssPath, "utf-8");
      const platform = fs.readFileSync(platformPath, "utf-8");
      assert.ok(
        css.includes("overscroll-behavior: none"),
        "Game shell should prevent page swipe leakage",
      );
      assert.ok(
        platform.includes("disableVerticalSwipes"),
        "Telegram vertical swipes should be disabled while dragging a game surface",
      );
    });

    it("keeps migrated game menus in the shared overlay shell instead of external panels", () => {
      const appPath = path.join(__dirname, "..", "src", "App.jsx");
      const shellPath = path.join(__dirname, "..", "src", "app", "shell.jsx");
      const bloxPath = path.join(__dirname, "..", "src", "games", "blox", "BloxGame.jsx");
      const match3Path = path.join(__dirname, "..", "src", "games", "match3", "Match3Game.jsx");
      const mergePath = path.join(__dirname, "..", "src", "games", "merge", "MergeGame.jsx");
      const bubboPath = path.join(__dirname, "..", "src", "games", "bubbo", "BubboGame.jsx");
      const gardenGamePath = path.join(__dirname, "..", "src", "games", "garden-shelf", "GardenShelfGame.tsx");
      const gardenCssPath = path.join(__dirname, "..", "src", "games", "garden-shelf", "garden-shelf.css");
      const cssPath = path.join(__dirname, "..", "src", "index.css");
      const scenesPath = path.join(__dirname, "..", "src", "game-runtime", "scenes.js");
      const hostPath = path.join(__dirname, "..", "src", "game-runtime", "PixiGameHost.jsx");
      const app = fs.readFileSync(appPath, "utf-8");
      const shell = fs.readFileSync(shellPath, "utf-8");
      const bloxGame = fs.readFileSync(bloxPath, "utf-8");
      const match3Game = fs.readFileSync(match3Path, "utf-8");
      const mergeGame = fs.readFileSync(mergePath, "utf-8");
      const bubboGame = fs.readFileSync(bubboPath, "utf-8");
      const gardenGame = fs.readFileSync(gardenGamePath, "utf-8");
      const gardenCss = fs.readFileSync(gardenCssPath, "utf-8");
      const css = fs.readFileSync(cssPath, "utf-8");
      const scenes = readSceneRuntimeText();
      const host = fs.readFileSync(hostPath, "utf-8");

      assert.ok(shell.includes("export function GameShell"), "GameShell should centralize play/menu/pause states");
      assert.ok(match3Game.includes('gameId="match3"'), "Match-3 should use the shared shell");
      assert.ok(bloxGame.includes('gameId="blox"'), "Blox should use the shared shell");
      assert.ok(mergeGame.includes('gameId="merge"'), "Merge should use the shared shell");
      assert.ok(bubboGame.includes('gameId="bubbo"'), "Bubbo should use the shared shell");
      assert.ok(css.includes("top: max(8px, calc(var(--safe-top) + 8px))"), "HUD should stay off the lower thumb zone");
      assert.ok(css.includes("--glass-surface"), "Shared glass tokens should own menu and HUD styling");
      assert.ok(css.includes(':root[data-ui-theme="dark"]'), "The Garden Shelf matte palette should exist as a global dark UI theme");
      assert.ok(app.includes("ThemeToggle"), "Players should be able to switch the global UI theme");
      assert.ok(gardenGame.includes("garden-shelf.css"), "Garden Shelf should load its route-local shared-glass styling");
      assert.ok(gardenCss.includes("garden-glass-sheet"), "Garden Shelf sheets should stay on the shared glass surface");
      assert.ok(gardenCss.includes("--glass-surface"), "Garden Shelf sheets should keep using shared glass tokens");
      assert.ok(css.includes("game-shell-cycle.svg"), "Cycle-inspired shell art should be wired");
      assert.ok(css.includes("game-shell-meditation.svg"), "Meditation-inspired shell art should be wired");
      assert.ok(scenes.includes('app.stage.on("pointercancel", cancel)'), "Pixi pointer cancellations must clear sessions");
      assert.ok(host.includes("onLostPointerCapture"), "DOM pointer capture loss should release Telegram swipe suppression");
    });

    it("keeps accidental end-run controls out of Blox and Gem Crush live HUDs", () => {
      const bloxPath = path.join(__dirname, "..", "src", "games", "blox", "BloxGame.jsx");
      const match3Path = path.join(__dirname, "..", "src", "games", "match3", "Match3Game.jsx");
      const bloxGame = fs.readFileSync(bloxPath, "utf-8");
      const match3Game = fs.readFileSync(match3Path, "utf-8");
      const bloxHud = bloxGame.match(/<GamePlayHud[\s\S]*?\/>/)?.[0] || "";
      const match3Hud = match3Game.match(/<GamePlayHud[\s\S]*?\/>/)?.[0] || "";

      assert.ok(!bloxHud.includes("onFinish"), "Blox live HUD should only expose Pause, with End Run in the pause menu");
      assert.ok(!match3Hud.includes("onFinish"), "Gem Crush live HUD should only expose Pause, with End Run in the pause menu");
      assert.ok(bloxGame.includes("t(\"common.endRun\")"), "Blox pause menu should still expose End Run");
      assert.ok(match3Game.includes("t(\"common.endRun\")"), "Gem Crush pause menu should still expose End Run");
    });

    it("styles mode selectors as explicit clickable controls instead of stat cards", () => {
      const cssPath = path.join(__dirname, "..", "src", "index.css");
      const css = fs.readFileSync(cssPath, "utf-8");

      assert.ok(css.includes(".mode-grid button::before"), "Mode buttons should have a dedicated button affordance layer");
      assert.ok(css.includes("mode-choice-selected"), "Active mode buttons should render an explicit selected marker");
    });

    it("listens for Cozy Yard reward drops from the authoritative Merge action result", () => {
      const mergePath = path.join(__dirname, "..", "src", "games", "merge", "MergeGame.jsx");
      const i18nPath = path.join(__dirname, "..", "src", "app", "i18n.jsx");
      const mergeGame = fs.readFileSync(mergePath, "utf-8");
      const i18n = fs.readFileSync(i18nPath, "utf-8");

      assert.ok(mergeGame.includes("result.yardDrop"), "Merge feedback should use the current yardDrop field");
      assert.ok(mergeGame.includes("lastMergeReward"), "Merge HUD should expose the latest Yard reward");
      assert.ok(mergeGame.includes("merge-recipe-book"), "Merge menu should expose a compact recipe book");
      assert.ok(mergeGame.includes("merge-library-rail"), "Merge should expose the library inside the active scene");
      assert.ok(mergeGame.includes("merge-exchange-panel"), "Merge should expose the exchange shop inside the active scene");
      assert.ok(mergeGame.includes("merge-essence-beaker"), "Merge should show crafted Essence progress in the active scene");
      assert.ok(mergeGame.includes("merge.exchange"), "Merge exchange should use the authoritative action pipeline");
      assert.ok(i18n.includes('"merge.alchemyTable"'), "Alchemy Table title should be localizable");
      assert.ok(i18n.includes('"merge.essence"'), "Essence label should be localizable");
      assert.ok(!mergeGame.includes("result.roomDrop"), "Old Room-drop naming should not drive Merge rewards");
      assert.ok(i18n.includes('"merge.reward"'), "Merge reward status should be localizable");
    });
  });
});
