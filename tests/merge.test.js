import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mergeStore, ITEM_LOOKUP } from "../src/hooks/useMergeEngine.js";

describe("Merge Engine Hooks (useMergeEngine)", () => {
  beforeEach(() => {
    // Reset store before each test
    mergeStore.setState({
      board: Array.from({ length: 7 }, () => Array(9).fill(null)),
      generators: ["textile"],
      generatorState: {
        textile: { tapsLeft: 30, cooldownEnd: 0 },
      },
      inventory: [],
      lastFreePull: 0,
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

  describe("Actions: syncFromServer", () => {
    it("syncs subset of fields from server while preserving others", () => {
      const serverData = {
        generators: ["textile", "wood"],
        lastFreePull: 123456789,
      };

      mergeStore.getState().syncFromServer(serverData);
      const state = mergeStore.getState();

      assert.deepStrictEqual(state.generators, ["textile", "wood"]);
      assert.strictEqual(state.lastFreePull, 123456789);
      // Ensure other fields are intact
      assert.strictEqual(state.trashMode, false);
      assert.strictEqual(state.boardItemCount(), 0);
    });
  });
});
