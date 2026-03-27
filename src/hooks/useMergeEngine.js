/**
 * ═══════════════════════════════════════════════════════
 *  useMergeEngine — React/Zustand hook for Gacha Merge state
 *
 *  Owns: board (7×9), generators, generatorState, inventory,
 *  lastFreePull, trashMode.
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
import { MERGE_CHAINS, ECONOMY } from "../../game-logic.js";

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
  generators: ["textile"],
  generatorState: {
    textile: { tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT, cooldownEnd: 0 },
  },
  inventory: [],
  lastFreePull: 0,
  trashMode: false,
  selectedFuel: {}, // chainId → cropId

  // ─── Computed ───
  getItemInfo: (itemId) => ITEM_LOOKUP[itemId] || null,

  canMerge: (fromR, fromC, toR, toC) => {
    const { board } = get();
    const src = board[fromR]?.[fromC];
    const dst = board[toR]?.[toC];
    if (!src || !dst) return false;
    if (src.chainId !== dst.chainId || src.level !== dst.level) return false;
    const info = ITEM_LOOKUP[src.id];
    return info?.nextId != null;
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
      inventory: mergeData.inventory || get().inventory,
      lastFreePull: mergeData.lastFreePull || get().lastFreePull,
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
    if (!src) return null;
    const info = ITEM_LOOKUP[src.id];
    if (!info?.nextId) return null;

    const oldBoard = structuredClone(s.board);
    const newBoard = structuredClone(s.board);
    const nextInfo = ITEM_LOOKUP[info.nextId];
    newBoard[toR][toC] = {
      id: info.nextId,
      chainId: src.chainId,
      level: nextInfo.level,
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
      inventory: get().inventory,
      lastFreePull: get().lastFreePull,
    }),

  rollback: (snap) => set(snap),
}));

export function useMergeEngine() {
  return mergeStore();
}

export const useMergeBoard = () => mergeStore((s) => s.board);
export const useMergeGenerators = () => mergeStore((s) => s.generators);
export const useMergeTrashMode = () => mergeStore((s) => s.trashMode);
export { ITEM_LOOKUP };
