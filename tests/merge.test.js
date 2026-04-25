import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeStore, ITEM_LOOKUP } from "../src/hooks/useMergeEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Merge Engine Hooks (useMergeEngine)", () => {
  beforeEach(() => {
    // Reset store before each test
    mergeStore.setState({
      board: Array.from({ length: 7 }, () => Array(9).fill(null)),
      generators: ["textile"],
      generatorState: {
        textile: { tapsLeft: 30, cooldownEnd: 0 },
      },
      mergeInventory: [],
      lastFreePull: 0,
      lastFreeTaps: 0,
      freeTapCharges: 0,
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
      newBoard[0][0] = { id: "textile_1", chainId: "textile", level: 0 };

      mergeStore.getState().setBoard(newBoard);
      const { board } = mergeStore.getState();
      assert.deepStrictEqual(board[0][0], { id: "textile_1", chainId: "textile", level: 0 });
      assert.strictEqual(mergeStore.getState().boardItemCount(), 1);
    });

    it("setGenerators updates the generators list", () => {
      mergeStore.getState().setGenerators(["textile", "wood"]);
      assert.deepStrictEqual(mergeStore.getState().generators, ["textile", "wood"]);
    });

    it("setGeneratorState updates the generator states", () => {
      const newState = { textile: { tapsLeft: 5, cooldownEnd: 1000 } };
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
      mergeStore.getState().setSelectedFuel("textile", "strawberry");
      assert.deepStrictEqual(mergeStore.getState().selectedFuel, { textile: "strawberry" });

      mergeStore.getState().setSelectedFuel("wood", "corn");
      assert.deepStrictEqual(mergeStore.getState().selectedFuel, { textile: "strawberry", wood: "corn" });
    });
  });

  describe("Computed Properties", () => {
    it("getItemInfo returns correct info or null", () => {
      const info = mergeStore.getState().getItemInfo("thread");
      assert.ok(info);
      assert.strictEqual(info.chainId, "textile");
      assert.strictEqual(info.level, 0);

      const invalid = mergeStore.getState().getItemInfo("invalid_item");
      assert.strictEqual(invalid, null);
    });

    it("isOnCooldown correctly identifies active cooldowns", () => {
      const chainId = "textile";

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
      newBoard[0][0] = { id: "textile_1", chainId: "textile", level: 0 };
      newBoard[0][1] = { id: "textile_2", chainId: "textile", level: 1 };
      newBoard[0][2] = { id: "wood_1", chainId: "wood", level: 0 };
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
  });

  describe("Snapshot & Rollback", () => {
    it("snapshot returns a deep copy and rollback restores state", () => {
      const originalState = mergeStore.getState().snapshot();

      // Modify state
      mergeStore.getState().setGenerators(["wood"]);
      mergeStore.getState().setLastFreePull(999);

      const modifiedState = mergeStore.getState();
      assert.deepStrictEqual(modifiedState.generators, ["wood"]);
      assert.strictEqual(modifiedState.lastFreePull, 999);

      // Rollback
      mergeStore.getState().rollback(originalState);
      const restoredState = mergeStore.getState();
      assert.deepStrictEqual(restoredState.generators, ["textile"]);
      assert.strictEqual(restoredState.lastFreePull, 0);
    });
  });

  describe("Actions: syncFromServer", () => {
    it("syncs subset of fields from server while preserving others", () => {
      const serverData = {
        generators: ["textile", "wood"],
        lastFreePull: 123456789,
        freeTapCharges: 7,
      };

      mergeStore.getState().syncFromServer(serverData);
      const state = mergeStore.getState();

      assert.deepStrictEqual(state.generators, ["textile", "wood"]);
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
      assert.deepStrictEqual(state.generators, ["textile"]);
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
      const cssPath = path.join(__dirname, "..", "src", "index.css");
      const scenesPath = path.join(__dirname, "..", "src", "game-runtime", "scenes.js");
      const hostPath = path.join(__dirname, "..", "src", "game-runtime", "PixiGameHost.jsx");
      const app = fs.readFileSync(appPath, "utf-8");
      const css = fs.readFileSync(cssPath, "utf-8");
      const scenes = fs.readFileSync(scenesPath, "utf-8");
      const host = fs.readFileSync(hostPath, "utf-8");

      assert.ok(app.includes("function GameShell"), "GameShell should centralize play/menu/pause states");
      assert.ok(app.includes('gameId="match3"'), "Match-3 should use the shared shell");
      assert.ok(app.includes('gameId="blox"'), "Blox should use the shared shell");
      assert.ok(app.includes('gameId="merge"'), "Merge should use the shared shell");
      assert.ok(css.includes("top: max(8px, calc(var(--safe-top) + 8px))"), "HUD should stay off the lower thumb zone");
      assert.ok(css.includes("game-shell-cycle.svg"), "Cycle-inspired shell art should be wired");
      assert.ok(css.includes("game-shell-meditation.svg"), "Meditation-inspired shell art should be wired");
      assert.ok(scenes.includes('app.stage.on("pointercancel", cancel)'), "Pixi pointer cancellations must clear sessions");
      assert.ok(host.includes("onLostPointerCapture"), "DOM pointer capture loss should release Telegram swipe suppression");
    });
  });
});
