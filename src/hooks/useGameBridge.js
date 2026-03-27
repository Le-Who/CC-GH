/**
 * ═══════════════════════════════════════════════════════
 *  useGameBridge — Bidirectional sync between legacy
 *  GameStore slices and new typed Zustand hook stores.
 *
 *  Purpose: Enables progressive migration from the legacy
 *  GameStore.registerSlice('farm') pattern to typed hooks
 *  (useFarmEngine, useMatch3Engine, etc.) WITHOUT modifying
 *  existing vanilla JS code.
 *
 *  How it works:
 *  1. GameStore slice write → syncs to hook store
 *  2. Hook store write → syncs to GameStore slice
 *  3. Circular sync prevented by reference equality check
 *
 *  Usage:
 *    import { initGameBridge } from '@/hooks/useGameBridge';
 *    initGameBridge(); // Call once during app initialization
 *
 *  After calling initGameBridge():
 *  - React components can use useFarmEngine() to read farm state
 *    that was written by vanilla farm.js via GameStore.setState('farm', ...)
 *  - Vanilla code calling GameStore.getState('merge') sees data
 *    written by React components via mergeStore.getState().setBoard(...)
 * ═══════════════════════════════════════════════════════
 */
import { GameStore } from "../store/gameStore.js";
import { farmStore } from "./useFarmEngine.js";
import { match3Store } from "./useMatch3Engine.js";
import { bloxStore } from "./useBloxEngine.js";
import { mergeStore } from "./useMergeEngine.js";
import { hudStore } from "./useHUDEngine.js";

let _bridgeInitialized = false;

/**
 * Suppress circular sync: when bridge writes to store B because
 * store A changed, we don't want store B's change to write back to A.
 */
let _syncing = false;

/**
 * Initialize bidirectional sync between GameStore slices and hook stores.
 * Safe to call multiple times — idempotent.
 */
export function initGameBridge() {
  if (_bridgeInitialized) return;
  _bridgeInitialized = true;

  // ─── Farm: GameStore('farm') ↔ farmStore ───
  _bridgeSliceToHook("farm", farmStore, (sliceData) => {
    if (!sliceData) return;
    return {
      plots: sliceData.plots || [],
      inventory: sliceData.inventory || {},
      harvested: sliceData.harvested || {},
      coins: sliceData.coins || 0,
      xp: sliceData.xp || 0,
      level: sliceData.level || 1,
      isLoading: false,
    };
  });

  _bridgeHookToSlice("farm", farmStore, (hookState) => ({
    plots: hookState.plots,
    inventory: hookState.inventory,
    harvested: hookState.harvested,
    coins: hookState.coins,
    xp: hookState.xp,
    level: hookState.level,
  }));

  // ─── Match-3: GameStore('match3') ↔ match3Store ───
  _bridgeSliceToHook("match3", match3Store, (sliceData) => {
    if (!sliceData) return;
    return {
      gameMode: sliceData.mode || "classic",
      score: sliceData.score ?? 0,
      movesLeft: sliceData.movesLeft ?? 30,
      combo: sliceData.combo ?? 0,
      highScore: sliceData.highScore ?? 0,
      gameActive: sliceData.gameActive ?? false,
    };
  });

  _bridgeHookToSlice("match3", match3Store, (hookState) => ({
    mode: hookState.gameMode,
    score: hookState.score,
    movesLeft: hookState.movesLeft,
    combo: hookState.combo,
    highScore: hookState.highScore,
    gameActive: hookState.gameActive,
  }));

  // ─── Blox: GameStore('blox') ↔ bloxStore ───
  _bridgeSliceToHook("blox", bloxStore, (sliceData) => {
    if (!sliceData) return;
    return {
      score: sliceData.score ?? 0,
      linesCleared: sliceData.linesCleared ?? 0,
      highScore: sliceData.highScore ?? 0,
      gameActive: sliceData.gameActive ?? false,
    };
  });

  _bridgeHookToSlice("blox", bloxStore, (hookState) => ({
    score: hookState.score,
    linesCleared: hookState.linesCleared,
    highScore: hookState.highScore,
    gameActive: hookState.gameActive,
  }));

  // ─── Merge: GameStore('merge') ↔ mergeStore ───
  _bridgeSliceToHook("merge", mergeStore, (sliceData) => {
    if (!sliceData) return;
    return {
      board: sliceData.board || mergeStore.getState().board,
      generators: sliceData.generators || mergeStore.getState().generators,
      generatorState:
        sliceData.generatorState || mergeStore.getState().generatorState,
      inventory: sliceData.inventory || [],
      lastFreePull: sliceData.lastFreePull || 0,
    };
  });

  _bridgeHookToSlice("merge", mergeStore, (hookState) => ({
    board: hookState.board,
    generators: hookState.generators,
    generatorState: hookState.generatorState,
    inventory: hookState.inventory,
    lastFreePull: hookState.lastFreePull,
  }));

  // ─── HUD Resources: GameStore('resources') ↔ hudStore ───
  _bridgeSliceToHook("resources", hudStore, (sliceData) => {
    if (!sliceData) return;
    return {
      gold: sliceData.gold ?? 0,
      energy: sliceData.energy ?? {
        current: 0,
        max: 20,
        lastRegenTimestamp: Date.now(),
      },
      harvested: sliceData.harvested ?? {},
      gachaTokens: sliceData.gachaTokens ?? 0,
    };
  });

  _bridgeHookToSlice("resources", hudStore, (hookState) => ({
    gold: hookState.gold,
    energy: hookState.energy,
    harvested: hookState.harvested,
    gachaTokens: hookState.gachaTokens,
  }));
}

/**
 * When GameStore slice changes → update hook store
 */
function _bridgeSliceToHook(sliceKey, hookStore, mapper) {
  GameStore.subscribe(sliceKey, (newSlice) => {
    if (_syncing) return;
    const mapped = mapper(newSlice);
    if (!mapped) return;
    _syncing = true;
    try {
      hookStore.setState(mapped);
    } finally {
      _syncing = false;
    }
  });
}

/**
 * When hook store changes → update GameStore slice
 */
function _bridgeHookToSlice(sliceKey, hookStore, mapper) {
  hookStore.subscribe((state, prevState) => {
    if (_syncing) return;
    // Only sync if mapped fields actually changed
    const next = mapper(state);
    const prev = mapper(prevState);
    // Shallow compare to avoid unnecessary GameStore updates
    let changed = false;
    for (const key of Object.keys(next)) {
      if (next[key] !== prev[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    _syncing = true;
    try {
      GameStore.setState(sliceKey, next);
    } finally {
      _syncing = false;
    }
  });
}

/**
 * Tear down all subscriptions (for testing/cleanup).
 */
export function destroyGameBridge() {
  _bridgeInitialized = false;
  // Note: Zustand unsubscriptions would need to be tracked
  // if destroy is needed. For now, this just prevents re-init.
}
