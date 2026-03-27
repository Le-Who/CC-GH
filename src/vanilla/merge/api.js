import { GameStore } from "../store.js";
import { api, showToast, HUB } from "../shared.js";
import { MERGE_CHAINS, ECONOMY } from "/game-logic.js";
import { HUD } from "../hud.js";
import { SoundEngine } from "../effects.js";
import { ITEM_LOOKUP, syncMergeStateFallback } from "./engine.js";

/**
 * Tap generator: deducts 1 energy + 1 crop, spawns 2-5 items server-side.
 */
export async function tapGenerator(chainId, cropId) {
  const res = GameStore.getState("resources");
  const mergeState = GameStore.getState("merge");
  if (!res || !mergeState) return { success: false };

  const chain = MERGE_CHAINS[chainId];
  if (!chain) return { success: false, reason: "UNKNOWN_CHAIN" };

  if (res.energy.current < 1) {
    showToast("⚡ Not enough energy!", "error");
    return { success: false, reason: "NO_ENERGY" };
  }
  const harvested = res.harvested || {};
  if (!cropId || !harvested[cropId] || harvested[cropId] <= 0) {
    showToast("🌱 No crops to fuel generator!", "error");
    return { success: false, reason: "NO_CROP" };
  }
  const gs = mergeState.generatorState?.[chainId];
  if (gs && gs.cooldownEnd > Date.now()) {
    const mins = Math.ceil((gs.cooldownEnd - Date.now()) / 60000);
    showToast(`⏳ Generator cooling down (${mins}m left)`, "error");
    return { success: false, reason: "COOLDOWN" };
  }

  // Optimistic
  const oldRes = { ...res };
  const newHarvested = { ...harvested };
  newHarvested[cropId] = (newHarvested[cropId] || 0) - 1;
  if (newHarvested[cropId] <= 0) delete newHarvested[cropId];

  GameStore.setState("resources", {
    ...res,
    energy: { ...res.energy, current: res.energy.current - 1 },
    harvested: newHarvested,
  });
  HUD.updateDisplay(GameStore.getState("resources"));

  try {
    const data = await api("/api/merge/tap", {
      userId: HUB.userId,
      chainId,
      cropId,
    });
    if (!data?.success) {
      GameStore.setState("resources", oldRes);
      HUD.updateDisplay(oldRes);
      syncMergeStateFallback();
      showToast(data?.error || "Tap failed", "error");
      return { success: false };
    }
    // Sync
    GameStore.setState("merge", data.merge);
    if (data.resources) {
      GameStore.setState("resources", {
        ...data.resources,
        harvested: data.harvested || {},
      });
      HUD.updateDisplay(data.resources);
    }
    showToast(
      `✨ Spawned ${data.spawned?.length || 0} items! (-1⚡)`,
      "success",
    );
    return { success: true, spawned: data.spawned };
  } catch (e) {
    GameStore.setState("resources", oldRes);
    HUD.updateDisplay(oldRes);
    syncMergeStateFallback();
    showToast("Network error", "error");
    return { success: false };
  }
}

/**
 * Merge two items
 */
export async function mergeItems(fromR, fromC, toR, toC) {
  const mergeState = GameStore.getState("merge");
  if (!mergeState) return { success: false };

  const board = mergeState.board;
  const src = board[fromR]?.[fromC];
  const dst = board[toR]?.[toC];
  if (!src || !dst) return { success: false, reason: "EMPTY_CELL" };
  if (src.chainId !== dst.chainId || src.level !== dst.level) {
    return { success: false, reason: "MISMATCH" };
  }
  const info = ITEM_LOOKUP[src.id];
  if (!info || !info.nextId) {
    showToast("✨ Max level reached!", "info");
    return { success: false, reason: "MAX_LEVEL" };
  }

  // Optimistic
  const oldBoard = structuredClone(board);
  const newBoard = structuredClone(board);
  const nextInfo = ITEM_LOOKUP[info.nextId];
  newBoard[toR][toC] = {
    id: info.nextId,
    chainId: src.chainId,
    level: nextInfo.level,
  };
  newBoard[fromR][fromC] = null;
  // Trigger board re-render automatically via store subscribe
  GameStore.setState("merge", { ...mergeState, board: newBoard });

  try {
    const data = await api("/api/merge/merge", {
      userId: HUB.userId,
      fromR,
      fromC,
      toR,
      toC,
    });
    if (!data?.success) {
      GameStore.setState("merge", { ...mergeState, board: oldBoard });
      syncMergeStateFallback();
      return { success: false };
    }
    GameStore.setState("merge", data.merge);
    SoundEngine.merge();
    return { success: true };
  } catch {
    GameStore.setState("merge", { ...mergeState, board: oldBoard });
    syncMergeStateFallback();
    return { success: false };
  }
}

/**
 * Roll gacha: costs tokens, spawns L0 item + unlocks chain.
 */
export async function rollGacha() {
  const res = GameStore.getState("resources");
  if (!res || (res.gachaTokens || 0) < ECONOMY.GACHA_PULL_COST) {
    showToast(`🎰 Need ${ECONOMY.GACHA_PULL_COST} Gacha Tokens!`, "error");
    return { success: false };
  }

  const oldTokens = res.gachaTokens;
  GameStore.setState("resources", {
    ...res,
    gachaTokens: res.gachaTokens - ECONOMY.GACHA_PULL_COST,
  });
  HUD.updateDisplay(GameStore.getState("resources"));

  try {
    const data = await api("/api/merge/gacha", { userId: HUB.userId });
    if (!data?.success) {
      GameStore.setState("resources", { ...res, gachaTokens: oldTokens });
      HUD.updateDisplay(GameStore.getState("resources"));
      syncMergeStateFallback();
      showToast(data?.error || "Gacha failed", "error");
      return { success: false };
    }
    GameStore.setState("merge", data.merge);
    GameStore.setState("resources", data.resources);
    HUD.updateDisplay(data.resources);
    showToast("🎰 Gacha roll! New item spawned!", "success");
    document.dispatchEvent(new CustomEvent("merge:gacha-drop"));
    return { success: true };
  } catch {
    GameStore.setState("resources", { ...res, gachaTokens: oldTokens });
    HUD.updateDisplay(GameStore.getState("resources"));
    syncMergeStateFallback();
    return { success: false };
  }
}

/**
 * Daily free pull
 */
export async function freePull() {
  try {
    const data = await api("/api/merge/free-pull", { userId: HUB.userId });
    if (!data?.success) {
      showToast(data?.error || "Free pull unavailable", "error");
      return { success: false };
    }
    GameStore.setState("merge", data.merge);
    showToast("🎁 Daily free item!", "success");
    document.dispatchEvent(new CustomEvent("merge:gacha-drop"));
    return { success: true };
  } catch (e) {
    showToast("Purchasing generator failed...", "error");
    return { success: false };
  }
}

/**
 * Trash item at (r,c). Anti-softlock.
 */
export async function trashMergeItem(r, c) {
  const mergeState = GameStore.getState("merge");
  if (!mergeState || !mergeState.board[r]?.[c]) return { success: false };

  const oldBoard = structuredClone(mergeState.board);
  const newBoard = structuredClone(mergeState.board);
  newBoard[r][c] = null;
  // Let subscribe handle render
  GameStore.setState("merge", { ...mergeState, board: newBoard });

  try {
    const data = await api("/api/merge/trash", { userId: HUB.userId, r, c });
    if (!data?.success) {
      GameStore.setState("merge", { ...mergeState, board: oldBoard });
      syncMergeStateFallback();
    }
    return { success: true };
  } catch {
    GameStore.setState("merge", { ...mergeState, board: oldBoard });
    syncMergeStateFallback();
    return { success: false };
  }
}
