import { GameStore } from "../store.js";
import { HUB, api } from "../shared.js";
import { HUD } from "../hud.js";

import { registerSlice } from "./engine.js";
import {
  createBoardDOM,
  renderBoard,
  handleLeave as boardOnLeave,
} from "./board.js";
import { renderGeneratorPanel, handleCooldownTimers } from "./panel.js";
import {
  tapGenerator,
  mergeItems,
  rollGacha,
  freePull,
  trashMergeItem,
} from "./api.js";
import {
  syncMergeState,
  syncResourcesState,
} from "../../services/inventoryService.js";

/* ═══════════════════════════════════════════════════
 *  Init & Lifecycle
 * ═══════════════════════════════════════════════════ */
function init() {
  registerSlice();
  createBoardDOM();
  renderGeneratorPanel();

  // Subscribe to merge state changes
  // v6.2.1: split board vs panel subscription
  let _prevGenState = null;
  let _prevResourceKey = null;

  GameStore.subscribe("merge", (next) => {
    renderBoard();
    const nextGenKey = JSON.stringify({
      g: next?.generators || [],
      gs: next?.generatorState || {},
      lp: next?.lastFreePull || 0,
      lft: next?.lastFreeTaps || 0,
      ftc: next?.freeTapCharges || 0,
    });
    if (nextGenKey !== _prevGenState) {
      _prevGenState = nextGenKey;
      renderGeneratorPanel();
    }
  });

  GameStore.subscribe("resources", (next) => {
    const nextResourceKey = JSON.stringify({
      harvested: next?.harvested || {},
      gachaTokens: next?.gachaTokens || 0,
    });
    if (nextResourceKey !== _prevResourceKey) {
      _prevResourceKey = nextResourceKey;
      renderGeneratorPanel();
    }
  });

  // Periodically refresh cooldown timers
  handleCooldownTimers(HUB);
}

async function onEnter() {
  // Fetch latest merge + resource state from server
  try {
    const data = await api("/api/merge/state", { userId: HUB.userId });
    if (data?.merge) syncMergeState(data.merge);
    if (data?.resources) {
      syncResourcesState(data.resources);
      HUD.updateDisplay(data.resources);
    }
  } catch {
    // Use cached state
  }
  renderBoard();
  renderGeneratorPanel();
}

/** v6.2.1: Clean up timers when leaving the merge screen */
function onLeave() {
  boardOnLeave();
  // We keep cooldown timers running in the background but panel timer checks if document is hidden
}

/* ═══════════════════════════════════════════════════
 *  Public API
 * ═══════════════════════════════════════════════════ */
export const MergeGame = {
  init,
  onEnter,
  onLeave,
  tapGenerator,
  mergeItems,
  rollGacha,
  freePull,
  trashMergeItem,
};
