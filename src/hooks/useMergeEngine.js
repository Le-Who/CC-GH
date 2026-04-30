/**
 * ═══════════════════════════════════════════════════════
 *  useMergeEngine — React/Zustand hook for Gacha Merge state
 *
 *  Owns: board (7×9), generators, generatorState, mergeInventory,
 *  lastFreePull, lastFreeTaps, trashMode.
 *
 *  Server-authoritative: all mutations go through API calls.
 *  Hook provides optimistic state + rollback.
 *
 *  Usage in React:
 *    const { board, generators, tapGenerator } = useMergeEngine();
 *
 *  Usage in Vanilla JS:
 *    import { mergeStore } from '@/hooks/useMergeEngine';
 *    mergeStore.getState().setBoard(serverBoard);
 * ═══════════════════════════════════════════════════════
 */
import { create } from "zustand";
import {
  MERGE_CHAINS,
  ECONOMY,
  MERGE_START_CHAIN_ID,
  MERGE_WILD_GENERATOR_ID,
  getMergePairResult,
  getStarterMergeItemIds,
  getStarterMergeRecipeIds,
} from "../../game-logic.js";

const BOARD_ROWS = 7;
const BOARD_COLS = 9;

/** Build item lookup from chains */
const ITEM_LOOKUP = {};
for (const chain of Object.values(MERGE_CHAINS)) {
  for (let lvl = 0; lvl < chain.items.length; lvl++) {
    ITEM_LOOKUP[chain.items[lvl]] = {
      chainId: chain.id,
      level: lvl,
      emoji: chain.emoji[lvl],
      name: chain.names[lvl],
      nextId: lvl < chain.items.length - 1 ? chain.items[lvl + 1] : null,
    };
  }
}

export const mergeStore = create((set, get) => ({
  // ─── State ───
  board: Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null)),
  generators: [MERGE_START_CHAIN_ID],
  generatorState: {
    [MERGE_START_CHAIN_ID]: { tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT, cooldownEnd: 0 },
    [MERGE_WILD_GENERATOR_ID]: { tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT, cooldownEnd: 0 },
  },
  mergeInventory: [],
  lastFreePull: 0,
  lastFreeTaps: 0,
  freeTapCharges: 0,
  discoveredItems: getStarterMergeItemIds(),
  discoveredRecipes: getStarterMergeRecipeIds(),
  trashMode: false,
  selectedFuel: {}, // chainId → cropId

  // ─── Computed ───
  getItemInfo: (itemId) => ITEM_LOOKUP[itemId] || null,

  canMerge: (fromR, fromC, toR, toC) => {
    const { board } = get();
    const src = board[fromR]?.[fromC];
    const dst = board[toR]?.[toC];
    if (!src || !dst) return false;
    return !!getMergePairResult(src, dst);
  },

  isOnCooldown: (chainId) => {
    const gs = get().generatorState[chainId];
    return gs ? gs.cooldownEnd > Date.now() : false;
  },

  canFreePull: () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const lastStr = new Date(get().lastFreePull || 0)
      .toISOString()
      .slice(0, 10);
    return lastStr !== todayStr;
  },

  boardItemCount: () => {
    const { board } = get();
    let count = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell) count++;
      }
    }
    return count;
  },

  // ─── Actions ───
  setBoard: (board) => set({ board }),
  setGenerators: (generators) => set({ generators }),
  setGeneratorState: (generatorState) => set({ generatorState }),
  setLastFreePull: (lastFreePull) => set({ lastFreePull }),
  setLastFreeTaps: (lastFreeTaps) => set({ lastFreeTaps }),
  setFreeTapCharges: (freeTapCharges) => set({ freeTapCharges }),
  setMergeInventory: (mergeInventory) => set({ mergeInventory }),
  toggleTrashMode: () => set((s) => ({ trashMode: !s.trashMode })),
  setSelectedFuel: (chainId, cropId) =>
    set((s) => ({
      selectedFuel: { ...s.selectedFuel, [chainId]: cropId },
    })),

  // Bulk sync from server response (merge state object)
  syncFromServer: (mergeData) => {
    if (!mergeData) return;
    set({
      board: mergeData.board || get().board,
      generators: mergeData.generators || get().generators,
      generatorState: mergeData.generatorState || get().generatorState,
      mergeInventory:
        mergeData.mergeInventory || mergeData.inventory || get().mergeInventory,
      lastFreePull: mergeData.lastFreePull || get().lastFreePull,
      lastFreeTaps: mergeData.lastFreeTaps || get().lastFreeTaps,
      freeTapCharges:
        mergeData.freeTapCharges ?? get().freeTapCharges,
      discoveredItems: mergeData.discoveredItems || get().discoveredItems,
      discoveredRecipes: mergeData.discoveredRecipes || get().discoveredRecipes,
    });
  },

  // Optimistic cell update
  clearCell: (r, c) =>
    set((s) => {
      const newBoard = structuredClone(s.board);
      newBoard[r][c] = null;
      return { board: newBoard };
    }),

  // Optimistic merge
  mergeOptimistic: (fromR, fromC, toR, toC) => {
    const s = get();
    const src = s.board[fromR]?.[fromC];
    const dst = s.board[toR]?.[toC];
    const result = getMergePairResult(src, dst);
    if (!result) return null;

    const oldBoard = structuredClone(s.board);
    const newBoard = structuredClone(s.board);
    newBoard[toR][toC] = {
      id: result.id,
      chainId: result.chainId,
      level: result.level,
    };
    newBoard[fromR][fromC] = null;
    set({ board: newBoard });
    return oldBoard; // Return for rollback
  },

  // Snapshot for rollback
  snapshot: () =>
    structuredClone({
      board: get().board,
      generators: get().generators,
      generatorState: get().generatorState,
      mergeInventory: get().mergeInventory,
      lastFreePull: get().lastFreePull,
      lastFreeTaps: get().lastFreeTaps,
      freeTapCharges: get().freeTapCharges,
      discoveredItems: get().discoveredItems,
      discoveredRecipes: get().discoveredRecipes,
    }),

  rollback: (snap) => set(snap),
}));

export function useMergeEngine() {
  return mergeStore();
}

export const useMergeBoard = () => mergeStore((s) => s.board);
export const useMergeGenerators = () => mergeStore((s) => s.generators);
export const useMergeInventory = () => mergeStore((s) => s.mergeInventory);
export const useMergeTrashMode = () => mergeStore((s) => s.trashMode);
export { ITEM_LOOKUP };
