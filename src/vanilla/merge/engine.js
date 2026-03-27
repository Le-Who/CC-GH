import { GameStore } from "../store.js";
import { api, HUB } from "../shared.js";
import { MERGE_CHAINS, ECONOMY } from "/game-logic.js";
import { HUD } from "../hud.js";

/* ─── Constants ─── */
export const BOARD_ROWS = 7;
export const BOARD_COLS = 9;

/* ─── Build fast lookup: itemId → { chainId, level, emoji, name, nextId } ─── */
export const ITEM_LOOKUP = {};
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

/* ─── Store Slice ─── */
export function registerSlice() {
  GameStore.registerSlice("merge", {
    board: Array.from({ length: BOARD_ROWS }, () =>
      Array(BOARD_COLS).fill(null),
    ),
    generators: ["textile"],
    inventory: [],
    lastFreePull: 0,
    generatorState: {
      textile: { tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT, cooldownEnd: 0 },
    },
  });
}

/**
 * v6.3.0: Background state reconciliation
 * Called after an optimistic update fails to self-heal any overlapping state desyncs.
 */
export async function syncMergeStateFallback() {
  try {
    const data = await api("/api/merge/state", { userId: HUB.userId });
    if (data?.merge) GameStore.setState("merge", data.merge);
    if (data?.resources) {
      GameStore.setState("resources", data.resources);
      HUD.updateDisplay(data.resources);
    }
  } catch (e) {
    // Offline or hard error, keep local rollback
  }
}
