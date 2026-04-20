/* ═══════════════════════════════════════════════════
 *  Farm Module — Coordinator (index.js)
 *  Entry point for the Farm game module. Wires all
 *  sub-modules together, owns init/lifecycle, and
 *  preserves the public FarmGame API surface.
 *
 *  Replaces the 2400-line monolithic farm.js IIFE.
 * ═══════════════════════════════════════════════════ */
import { get, set } from "idb-keyval";
import { GameStore } from "../store.js";
import { HUB, api, apiBatched, showToast } from "../shared.js";
import { ACHIEVEMENTS } from "/game-logic.js";
import { HUD } from "../hud.js";
import { PetCompanion } from "../pet.js";
import { setCropsCache, getCropsData } from "../crops.js";
import { SoundEngine } from "../effects.js";
import { broadcastStateUpdate } from "../realtime.js";
import {
  adjustHarvestedCrop,
} from "../../services/inventoryService.js";

// ── Sub-modules ──
import {
  $,
  getLocalGrowth,
  getServerNow,
  updateClockDelta,
  formatGrowthTime,
} from "./utils.js";
import {
  render,
  showSkeleton,
  forceFullRebuild,
  setPlotGridDeps,
  syncPlotGridState,
  startLocalGrowthTick,
  stopLocalGrowthTick,
  updateFarmBadge,
  setJustPlantedPlot,
  animatePlant,
  animateHarvest,
  animateWater,
  getBuyPlotCost,
} from "./plotGrid.js";
import {
  renderShop,
  renderFeaturedShelf,
  renderBoosterButton,
  renderStreakBadge,
  applyThemeClass,
  setSeedShopDeps,
  syncSeedShopState,
  showShopSkeleton,
  selectSeed,
  buySeeds,
  getSelectedSeed,
  checkNewUnlocks,
  computeUnlocked,
} from "./seedShop.js";
import {
  renderInventory,
  syncHarvestedToStore,
  setInventoryDeps,
  syncInventoryState,
  sellCrop,
  feedPet,
} from "./inventory.js";
import { switchFarmTab, setTabsDeps, syncTabsState } from "./tabs.js";
import {
  showQuickBuy,
  setQuickBuyDeps,
  syncQuickBuyState,
} from "./quickBuy.js";

// ── Coordinator state ──
let state = null;
let crops = {};

// ── Concurrency guards (per-plot optimistic action tracking) ──
const plotPlantVersions = new Map();
const optimisticActionTimestamps = new Map();
const wateringInFlight = new Set();
const plantingInFlight = new Set();
const harvestingInFlight = new Set();
let harvestVersion = 0;
let waterVersion = 0;
let _lastLoadTime = 0; // for onEnter throttle

/**
 * RC2: Safe load guard — only fetch server state when no optimistic actions
 * are currently in-flight. Prevents loadState() from clobbering plots that
 * are mid-plant/water/harvest with stale server data (crop: null).
 */
function loadStateIfSafe() {
  if (plantingInFlight.size || harvestingInFlight.size || wateringInFlight.size) return;
  if (Date.now() - _lastLoadTime < 30_000) return;
  loadState();
}

/**
 * RC-E: Safe per-plot merge helper. Always used instead of `state = data`
 * so in-flight guards are respected even on the very first loadState call.
 * Server-authoritative fields (resources, meta) are always applied;
 * only per-plot data is guarded by in-flight + optimistic TTL checks.
 */
function _safeMergePlots(data) {
  if (!state) {
    // First load: still apply per-plot merge to respect any in-flight actions
    // that may have started before state was available.
    state = { ...data };
  } else {
    const oldPlots = [...state.plots];
    Object.assign(state, data);
    state.plots = oldPlots;
  }
  // Always merge server plots, skipping in-flight / recently-optimistic ones
  data.plots?.forEach((p, i) => {
    if (wateringInFlight.has(i)) return;
    if (plantingInFlight.has(i)) return;
    if (harvestingInFlight.has(i)) return;
    const lastOpt = optimisticActionTimestamps.get(i) || 0;
    if (Date.now() - lastOpt < 12_000) return;
    state.plots[i] = p;
  });
}

/* ─── Push local state to GameStore ─── */
function syncToStore(broadcast = true) {
  if (state) {
    GameStore.setState("farm", { ...state });
    if (broadcast) {
      broadcastStateUpdate({ plots: state.plots, inventory: state.inventory, achievements: state.achievements });
    }
  }
}

/* ─── Achievements Global Sync ─── */
function processAchievements(data) {
  if (!state || !data) return;
  if (data.achievements) {
    state.achievements = { ...state.achievements, ...data.achievements };
  }
  if (data.newAchievements?.length > 0) {
    if (!state._newAchievements) state._newAchievements = [];
    state._newAchievements.push(...data.newAchievements);
    for (const id of data.newAchievements) {
      const badge = ACHIEVEMENTS[id];
      if (badge) showToast(`🏆 Badge unlocked: ${badge.emoji} ${badge.name}!`);
    }
  }
}

/* ─── Shared action interface injected into sub-modules ─── */
const sharedActions = {
  render: () => {
    _syncSubModules();
    render();
  },
  renderShop,
  renderInventory,
  syncToStore,
  loadState,
  harvestAll,
  buyPlot,
  getGold: () => HUD.getGold(),
  getSelectedSeed,
  showQuickBuy,
  switchFarmTab,
  plant,
  setSelectedSeed: (_id) => {
    /* noop here, delegated to seedShop */
  },
  computeUnlocked,
};

/* ─── Wire sub-module dependencies ─── */
function _wireModules() {
  setPlotGridDeps(sharedActions);
  setSeedShopDeps(sharedActions);
  setInventoryDeps(sharedActions);
  setTabsDeps(sharedActions);
  setQuickBuyDeps(sharedActions);
}

/* ─── Push current state down into sub-modules ─── */
function _syncSubModules() {
  syncPlotGridState(state, crops, getSelectedSeed());
  syncSeedShopState(state, crops);
  syncInventoryState(crops);
  syncTabsState(state);
  syncQuickBuyState(state, crops);
}

/* ─── Init (parallel loading) ─── */
async function init() {
  _wireModules();

  // IDB Offline-First: show cached state instantly
  try {
    const idbState = await get("hub_farm_state_" + HUB.userId);
    if (idbState) {
      state = idbState;
      updateClockDelta(idbState.serverTime || Date.now());
      if (idbState.resources) HUD.syncFromServer(idbState.resources);
      if (idbState.pet) PetCompanion.syncFromServer(idbState.pet);
      syncHarvestedToStore(idbState.harvested);
      syncToStore(false);
      _syncSubModules();
      render();
      renderShop();
      renderFeaturedShelf();
      checkNewUnlocks();
    } else {
      showSkeleton();
      showShopSkeleton();
    }
  } catch (_) {
    showSkeleton();
    showShopSkeleton();
  }

  // Pre-populate crops from localStorage cache
  try {
    const cached = JSON.parse(localStorage.getItem("hub_crops_cache"));
    if (cached?.data && Object.keys(cached.data).length > 0) {
      crops = cached.data;
      setCropsCache(cached.data);
    }
  } catch (_) {}

  GameStore.registerSlice("farm", null);

  const [cropsData, stateData] = await Promise.all([
    getCropsData(),
    api("/api/farm/state", { userId: HUB.userId, username: HUB.username }),
  ]);

  if (cropsData && !cropsData.error) {
    crops = cropsData;
    setCropsCache(cropsData);
    try {
      localStorage.setItem(
        "hub_crops_cache",
        JSON.stringify({
          data: cropsData,
          hash: cropsData.__hash || null,
          cachedAt: Date.now(),
        }),
      );
    } catch (_) {}
  }

  if (stateData && !stateData.error) {
    state = stateData;
    updateClockDelta(stateData.serverTime);
    if (stateData.resources) HUD.syncFromServer(stateData.resources);
    if (stateData.pet) PetCompanion.syncFromServer(stateData.pet);
    syncHarvestedToStore(stateData.harvested);
    if (stateData.offlineReport) showWelcomeBack(stateData.offlineReport);
    // Sync questsCompleted from server to state & localStorage
    if (typeof stateData.questsCompleted === "number") {
      state.questsCompleted = stateData.questsCompleted;
      try {
        localStorage.setItem("hub_quests_completed", String(stateData.questsCompleted));
      } catch (_) {}
    }
    syncToStore();
    _syncSubModules();
    render();
    renderShop();
    renderFeaturedShelf();
    checkNewUnlocks();
    set("hub_farm_state_" + HUB.userId, stateData).catch(() => {});
  }

  // Desync auto-heal listener
  // RC-E: use loadStateIfSafe() — if a plant/water/harvest is in-flight,
  // a desync event must not overwrite the optimistic plot with stale crop:null.
  document.addEventListener("hub:state-desync", () => {
    showToast("🔄 Syncing...");
    loadStateIfSafe();
  });

  // Handle immediate UI updates when a quest is completed
  document.addEventListener("quest-completed", (e) => {
    if (state && typeof e.detail?.questsCompleted === "number") {
      state.questsCompleted = e.detail.questsCompleted;
      checkNewUnlocks();
      renderShop();
    }
  });

  // Periodic clock re-sync
  const CLOCK_SYNC_INTERVAL = 5 * 60 * 1000;
  let _clockSyncTimer = null;
  function _startClockSync() {
    if (_clockSyncTimer) return;
    _clockSyncTimer = setInterval(async () => {
      try {
        const data = await api("/api/farm/state", {
          userId: HUB.userId,
          username: HUB.username,
        });
        if (data?.serverTime) updateClockDelta(data.serverTime);
      } catch (_) {}
    }, CLOCK_SYNC_INTERVAL);
  }
  function _stopClockSync() {
    if (_clockSyncTimer) {
      clearInterval(_clockSyncTimer);
      _clockSyncTimer = null;
    }
  }
  _startClockSync();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      _stopClockSync();
    } else {
      api("/api/farm/state", { userId: HUB.userId, username: HUB.username })
        .then((data) => {
          if (data?.serverTime) updateClockDelta(data.serverTime);
        })
        .catch(() => {});
      _startClockSync();
    }
  });

  // Event delegation: single click handler on grid
  const grid = $("farm-plots");
  if (grid) {
    grid.addEventListener("click", (e) => {
      const waterBtn = e.target.closest(".farm-water-btn:not([disabled])");
      if (waterBtn) {
        e.stopPropagation();
        const plot = waterBtn.closest(".farm-plot");
        const idx = plot ? parseInt(plot.dataset.index, 10) : NaN;
        if (!isNaN(idx)) water(idx);
        return;
      }
      const uprootBtn = e.target.closest(".farm-uproot-btn");
      if (uprootBtn) {
        e.stopPropagation();
        return;
      }
      const plot = e.target.closest(".farm-plot");
      if (!plot || plot.classList.contains("skeleton")) return;
      const idx = parseInt(plot.dataset.index, 10);
      if (!isNaN(idx)) onPlotClick(idx);
      else if (plot.classList.contains("buy-plot-card")) buyPlot();
    });

    // Uproot hold-to-confirm (2.5s)
    let _uprootTimer = null;
    let _uprootTarget = null;
    grid.addEventListener("pointerdown", (e) => {
      const btn = e.target.closest(".farm-uproot-btn");
      if (!btn) return;
      e.preventDefault();
      const plot = btn.closest(".farm-plot");
      const idx = plot ? parseInt(plot.dataset.index, 10) : NaN;
      if (isNaN(idx)) return;
      _uprootTarget = btn;
      btn.classList.add("farm-uproot-holding");
      _uprootTimer = setTimeout(() => {
        btn.classList.remove("farm-uproot-holding");
        uproot(idx);
        _uprootTarget = null;
      }, 2500);
    });
    const cancelUproot = () => {
      if (_uprootTimer) {
        clearTimeout(_uprootTimer);
        _uprootTimer = null;
      }
      if (_uprootTarget) {
        _uprootTarget.classList.remove("farm-uproot-holding");
        _uprootTarget = null;
      }
    };
    grid.addEventListener("pointerup", cancelUproot);
    grid.addEventListener("pointercancel", cancelUproot);
    grid.addEventListener("pointerleave", cancelUproot);
  }

  // Farm panel tab switching
  const tabInv = $("farm-tab-inv");
  const tabShop = $("farm-tab-shop");
  if (tabInv && tabShop) {
    tabInv.onclick = () => switchFarmTab("inv");
    tabShop.onclick = () => switchFarmTab("shop");
  }
  const tabBadges = $("farm-tab-badges");
  const tabJournal = $("farm-tab-journal");
  const tabSeason = $("farm-tab-season");
  if (tabBadges) tabBadges.onclick = () => switchFarmTab("badges");
  if (tabJournal) tabJournal.onclick = () => switchFarmTab("journal");
  if (tabSeason) tabSeason.onclick = () => switchFarmTab("season");
  renderInventory();
}

/* ─── Load State ─── */
async function loadState() {
  if (Object.keys(crops).length === 0) {
    try {
      const cached = JSON.parse(localStorage.getItem("hub_crops_cache"));
      if (cached?.data) crops = cached.data;
    } catch (_) {}
    if (Object.keys(crops).length === 0) {
      const cropsData = await api("/api/content/crops");
      if (cropsData && !cropsData.error) {
        crops = cropsData;
        setCropsCache(cropsData);
      }
    }
  }

  const data = await api("/api/farm/state", {
    userId: HUB.userId,
    username: HUB.username,
  });
  if (data && !data.error) {
    // RC-E: always use _safeMergePlots — respects in-flight guards on first
    // load too (previously `state = data` skipped all guards on first call).
    _safeMergePlots(data);
    updateClockDelta(data.serverTime);
    if (data.resources) HUD.syncFromServer(data.resources);
    if (data.pet) PetCompanion.syncFromServer(data.pet);
    HUB._onboarded = data._onboarded || false;
    syncHarvestedToStore(data.harvested);
    if (data.offlineReport) showWelcomeBack(data.offlineReport);

    if (data.streak) state._streak = data.streak;
    if (data.streakResult) state._streakResult = data.streakResult;
    if (data.newAchievements) state._newAchievements = data.newAchievements;
    if (data.seasonPass) state._seasonPass = data.seasonPass;
    if (data.cosmetics) state._cosmetics = data.cosmetics;
    if (data.boosters) state._boosters = data.boosters;
    if (data.journal) state._journal = data.journal;
    // Sync questsCompleted from server into state & localStorage
    if (typeof data.questsCompleted === "number") {
      state.questsCompleted = data.questsCompleted;
      try {
        localStorage.setItem("hub_quests_completed", String(data.questsCompleted));
      } catch (_) {}
    }

    syncToStore();
    _syncSubModules();
    render();
    renderInventory();
    renderStreakBadge();
    renderBoosterButton(api);
    applyThemeClass();
    set("hub_farm_state_" + HUB.userId, data).catch(() => {});
    _lastLoadTime = Date.now();

    if (data.streakResult?.continued && data.streak?.current > 1) {
      showToast(
        `🔥 ${data.streak.current}-day streak! (${data.streak.bonusMultiplier}× gold)`,
      );
    }
    if (data.streakResult?.bonusUnlocked) {
      showToast(
        `🎉 Streak milestone: ${data.streakResult.bonusUnlocked.label}!`,
      );
    }
    processAchievements(data);
  }
}

/* ─── Welcome Back Modal ─── */
function showWelcomeBack(report) {
  if (HUB.lastActiveTimestamp && Date.now() - HUB.lastActiveTimestamp < 30_000)
    return;
  if (HUB.currentScreen !== 2) {
    showToast("🌱 Your farm grew while you were away!");
    return;
  }

  const lines = [];
  const petName = GameStore.getState("pet")?.name || "Your pet";
  const offlineMins = report.offlineMinutes || 0;
  const offlineLabel =
    offlineMins >= 60
      ? `${Math.floor(offlineMins / 60)}h ${offlineMins % 60}m`
      : `${offlineMins}m`;
  lines.push(
    `<p class="text-dim" style="margin:0 0 8px;font-size:0.78rem">☀️ While you rested (${offlineLabel}), your world kept growing!</p>`,
  );

  const harvestedEntries = Object.entries(report.harvested || {});
  if (harvestedEntries.length > 0) {
    const items = harvestedEntries
      .map(([id, qty]) => {
        const c = crops[id];
        return c ? `${c.emoji}×${qty}` : `${id}×${qty}`;
      })
      .join(", ");
    lines.push(
      `<div style="margin:4px 0">🐾 <strong>${petName} harvested:</strong> ${items}</div>`,
    );
  }
  const plantedEntries = Object.entries(report.planted || {});
  if (plantedEntries.length > 0) {
    const items = plantedEntries
      .map(([id, qty]) => {
        const c = crops[id];
        return c ? `${c.emoji}×${qty}` : `${id}×${qty}`;
      })
      .join(", ");
    lines.push(
      `<div style="margin:4px 0">🌱 <strong>Sprouted while away:</strong> ${items}</div>`,
    );
  }
  if (report.autoWatered > 0) {
    lines.push(
      `<div style="margin:4px 0">💧 <strong>Stayed hydrated:</strong> ${report.autoWatered} crop${report.autoWatered > 1 ? "s" : ""} watered</div>`,
    );
  }
  const summaryParts = [];
  const foodEntries = Object.entries(report.foodEaten || {});
  if (foodEntries.length > 0) {
    const foodItems = foodEntries
      .map(([id, qty]) => {
        const c = crops[id];
        return c ? `${c.emoji}×${qty}` : `${id}×${qty}`;
      })
      .join(", ");
    summaryParts.push(`🍖 ${petName} snacked on: ${foodItems}`);
  }
  if (report.xpGained > 0)
    summaryParts.push(`✨ +${report.xpGained} XP earned`);
  if (summaryParts.length > 0)
    lines.push(
      `<div style="margin:6px 0;opacity:0.7;font-size:0.8rem">${summaryParts.join(" • ")}</div>`,
    );

  if (report.openLoops?.length > 0) {
    lines.push(
      `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); text-align: left;">`,
    );
    lines.push(
      `<h3 style="font-size: 0.9rem; color: var(--brand-accent); margin: 0 0 8px;">🌟 Almost Ready to Harvest:</h3>`,
    );
    report.openLoops.forEach((ol) => {
      lines.push(
        `<div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px; margin-top: 6px;"><span>${ol.name} is thriving!</span><span style="color: var(--ui-gold); font-weight: bold;">${ol.progress}%</span></div>`,
      );
      lines.push(
        `<div style="height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); width: 100%; overflow: hidden;"><div style="height: 100%; border-radius: 3px; width: ${ol.progress}%; background: var(--ui-gold);"></div></div>`,
      );
    });
    lines.push(`</div>`);
  }

  const dialog = document.createElement("dialog");
  dialog.className = "modal welcome-back-dialog";
  dialog.innerHTML = `
    <div class="modal-card" style="text-align:center;max-width:320px">
      <h2 style="margin:0 0 10px">☀️ Welcome Back!</h2>
      ${lines.join("")}
      <button class="btn btn-primary" style="margin-top:14px;width:100%" id="wb-dismiss">🌱 Back to Farming</button>
    </div>`;
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  document.body.appendChild(dialog);
  import("../shared.js").then(({ safeShowModal }) => safeShowModal(dialog));
  document
    .getElementById("wb-dismiss")
    ?.addEventListener("click", () => dialog.close());
}

/* ─── Plot Click Dispatcher ─── */
function onPlotClick(i) {
  const plot = state?.plots?.[i];
  if (!plot) return;
  const pct = getLocalGrowth(plot);
  const isLocallyReady = plot.crop && pct >= 1;
  if (isLocallyReady) {
    harvest(i);
  } else if (plot.crop && !plot.watered && !isLocallyReady) {
    water(i);
  } else if (plot.crop) {
    showToast("💧 Already watered! Growing...");
  } else {
    plant(i);
  }
}

/* ─── Actions (with per-plot optimistic rollback) ─── */
function plant(plotId) {
  if (plantingInFlight.has(plotId)) return;
  plantingInFlight.add(plotId);
  const currentSeed = getSelectedSeed();
  if (!currentSeed) {
    plantingInFlight.delete(plotId);
    showQuickBuy(plotId);
    return;
  }
  const seedCount = state?.inventory?.[currentSeed] || 0;
  if (seedCount <= 0) {
    plantingInFlight.delete(plotId);
    showToast("🌾 No seeds left! Buy more in the shop ↓");
    return;
  }
  // Per-plot snapshot for granular rollback
  const plotSnap = { ...state.plots[plotId] };
  const prevInventory = { ...state.inventory };
  const cropId = currentSeed;

  // Optimistic update — use local growthTime as a placeholder; server response
  // will overlay effectiveGrowthTime (authoritative, includes boosters + scale)
  const optimisticPlantedAt = getServerNow();
  state.plots[plotId] = {
    ...state.plots[plotId],
    crop: cropId,
    plantedAt: optimisticPlantedAt,
    watered: false,
    growthTime: crops[cropId]?.growthTime || 15000,
  };
  state.inventory[cropId] = Math.max(0, seedCount - 1);
  setJustPlantedPlot(plotId);
  optimisticActionTimestamps.set(plotId, Date.now());
  // RC-C: do NOT broadcast cross-tab yet — other tabs would see crop:null from
  // their stale state. Broadcast only after server ack (below).
  syncToStore(false);
  _syncSubModules();
  render();
  renderShop();
  // RC4: Defer animatePlant so it runs after the browser has committed the
  // freshly-rendered DOM — guarantees querySelector finds the new elements.
  requestAnimationFrame(() => animatePlant(plotId));

  const ver = (plotPlantVersions.get(plotId) || 0) + 1;
  plotPlantVersions.set(plotId, ver);
  apiBatched("/api/farm/plant", { userId: HUB.userId, plotId, cropId })
    .then((data) => {
      if (plotPlantVersions.get(plotId) !== ver) {
        // A newer plant() superseded this one — just clean up inflight.
        plantingInFlight.delete(plotId);
        return;
      }
      if (data._optimistic) {
        // Batch timed out (15s safety) — optimistic state already visible;
        // server will save eventually. Release inflight so future syncs work.
        plantingInFlight.delete(plotId);
        // RC-C: broadcast optimistic state now that we've given up waiting
        broadcastStateUpdate({ plots: state.plots, inventory: state.inventory });
        return;
      }
      if (data.success) {
        if (data.plots) {
          // RC-B: merge BEFORE releasing inflight — closes the race window
          // where loadState() would see inflight=false and overwrite with null.
          // RC-D: spread server's effectiveGrowthTime + wateringMultiplier for
          // booster accuracy, but always keep our clock-corrected plantedAt.
          const { plantedAt: _serverTs, ...serverPlot } = data.plots[plotId] || {};
          state.plots[plotId] = {
            ...state.plots[plotId],
            ...serverPlot,
            plantedAt: optimisticPlantedAt, // always use local clock-corrected ts
          };
        }
        if (data.inventory) {
          let anyNewer = false;
          for (const [, pVer] of plotPlantVersions.entries()) {
            if (pVer > ver) anyNewer = true;
          }
          if (!anyNewer) state.inventory = data.inventory;
        }
        // RC-B: release inflight AFTER merge is stable
        plantingInFlight.delete(plotId);
        
        processAchievements(data);

        // RC-C: now broadcast the confirmed, server-merged state to other tabs
        syncToStore(true);
      } else {
        // Granular rollback: only this plot + inventory
        // RC-B: release inflight AFTER rollback so no sync sneaks in between
        state.plots[plotId] = plotSnap;
        state.inventory = prevInventory;
        plantingInFlight.delete(plotId);
        syncToStore(true);
        _syncSubModules();
        render();
        renderShop();
        showToast(
          data.error === "no seeds" ? "🌾 No seeds left!" : `❌ ${data.error}`,
        );
      }
    })
    .catch(() => {
      plantingInFlight.delete(plotId);
      if (plotPlantVersions.get(plotId) === ver) loadState();
    });
}

function water(plotId) {
  if (wateringInFlight.has(plotId)) return;
  wateringInFlight.add(plotId);
  // Per-plot snapshot
  const plotSnap = { ...state.plots[plotId] };
  optimisticActionTimestamps.set(plotId, Date.now());
  state.plots[plotId] = { ...state.plots[plotId], watered: true };
  syncToStore();
  _syncSubModules();
  render();
  animateWater(plotId);
  showToast("💧 Watered! Growth ~30% faster");

  const fallbackTimer = setTimeout(() => wateringInFlight.delete(plotId), 3000);
  const myVersion = ++waterVersion;
  apiBatched("/api/farm/water", { userId: HUB.userId, plotId })
    .then((data) => {
      clearTimeout(fallbackTimer);
      if (!data._optimistic) wateringInFlight.delete(plotId);
      if (waterVersion !== myVersion || data._optimistic) return;
      if (data.success) {
        if (data.plots?.[plotId] && waterVersion === myVersion) {
          state.plots[plotId] = {
            ...state.plots[plotId],
            ...data.plots[plotId],
          };
        }
        processAchievements(data);
        syncToStore();
      } else {
        state.plots[plotId] = plotSnap;
        syncToStore();
        _syncSubModules();
        render();
      }
    })
    .catch(() => {
      clearTimeout(fallbackTimer);
      wateringInFlight.delete(plotId);
      if (waterVersion === myVersion) {
        state.plots[plotId] = plotSnap;
        syncToStore();
        _syncSubModules();
        render();
      }
    });
}

function harvest(plotId) {
  if (harvestingInFlight.has(plotId)) return;
  harvestingInFlight.add(plotId);
  // Per-plot snapshot + XP compensation
  const plotSnap = { ...state.plots[plotId] };
  const cfg = crops[plotSnap.crop];
  const estimatedXP = cfg?.xp || 0;
  const prevXp = state.xp;

  state.plots[plotId] = { crop: null, plantedAt: null, watered: false };
  state.xp += estimatedXP;

  adjustHarvestedCrop(plotSnap.crop, 1);

  checkNewUnlocks();
  optimisticActionTimestamps.set(plotId, Date.now());
  syncToStore();
  _syncSubModules();
  animateHarvest(plotId);
  render();
  renderShop();
  renderInventory();
  showToast(`${cfg?.emoji || "🌱"} Harvested! +${estimatedXP}XP`);
  SoundEngine.harvest();

  const myVersion = ++harvestVersion;
  apiBatched("/api/farm/harvest", { userId: HUB.userId, plotId })
    .then((data) => {
      harvestingInFlight.delete(plotId);
      if (harvestVersion !== myVersion || data._optimistic) return;
      if (data.success) {
        if (data.plots?.[plotId] && harvestVersion === myVersion) {
          state.plots[plotId] = data.plots[plotId];
        }
        state.xp = data.xp;
        state.level = data.level;
        if (data.resources) HUD.syncFromServer(data.resources);
        if (data.harvested) syncHarvestedToStore(data.harvested);
        processAchievements(data);
        syncToStore();
        renderInventory();
        if (data.leveledUp) showToast(`🎉 Level Up! Lv${data.level}`);
      } else {
        // Granular rollback: restore plot + xp
        if (
          data.error === "not ready" ||
          data.error === "NOT_READY" ||
          data.error === "crop not grown"
        ) {
          if (data.serverTime) updateClockDelta(data.serverTime);
          state.plots[plotId] = plotSnap;
          state.xp = prevXp;
          // Rollback harvested count
          adjustHarvestedCrop(plotSnap.crop, -1);
          syncToStore();
          _syncSubModules();
          render();
          renderInventory();
          const remainLabel =
            data.remainingMs > 0
              ? formatGrowthTime(data.remainingMs)
              : "a moment";
          showToast(`⏳ Not quite ready — ${remainLabel} left`);
        } else {
          loadState();
        }
      }
    })
    .catch(() => {
      harvestingInFlight.delete(plotId);
      if (harvestVersion === myVersion) loadState();
    });
}

function harvestAll() {
  if (!state?.plots) return;
  const readyIndices = state.plots
    .map((p, i) => ({ i, p }))
    .filter(({ p }) => p.crop && getLocalGrowth(p) >= 1)
    .map(({ i }) => i);
  if (readyIndices.length === 0) {
    showToast("🌾 No crops ready!");
    return;
  }
  for (const idx of readyIndices) {
    if (state.plots[idx]?.crop && getLocalGrowth(state.plots[idx]) >= 1)
      harvest(idx);
  }
  showToast(`🌾 Harvested ${readyIndices.length} crops!`);
}

async function uproot(plotId) {
  const plot = state?.plots?.[plotId];
  if (!plot || !plot.crop) return;
  if (getLocalGrowth(plot) >= 1) {
    showToast("🌾 Already ready — harvest it!");
    return;
  }

  const oldPlot = { ...plot };
  optimisticActionTimestamps.set(plotId, Date.now());
  state.plots[plotId] = { crop: null, plantedAt: null, watered: false };
  syncToStore();
  _syncSubModules();
  render();
  showToast("💣 Uprooted! No refund.");

  try {
    const data = await apiBatched("/api/farm/uproot", {
      userId: HUB.userId,
      plotId,
    });
    if (data._optimistic) return;
    if (data?.success) {
      if (data.plots?.[plotId]) state.plots[plotId] = data.plots[plotId];
      if (data.resources) HUD.syncFromServer(data.resources);
      syncToStore();
      _syncSubModules();
      render();
    } else {
      state.plots[plotId] = oldPlot;
      syncToStore();
      _syncSubModules();
      render();
      showToast(data?.error || "Uproot failed", "error");
    }
  } catch {
    state.plots[plotId] = oldPlot;
    syncToStore();
    _syncSubModules();
    render();
    showToast("Network error", "error");
  }
}

function buyPlot() {
  const MAX_PLOTS = 12;
  if (!state || state.plots.length >= MAX_PLOTS) return;
  const cost = getBuyPlotCost(state.plots.length);
  const gold = HUD.getGold();
  if (gold < cost) {
    showToast("❌ Not enough gold!");
    return;
  }

  const prevPlots = [...state.plots];
  state.plots.push({ crop: null, plantedAt: null, watered: false });
  syncToStore();
  forceFullRebuild();
  _syncSubModules();
  render();
  showToast(`🌱 New plot unlocked! (${state.plots.length}/${MAX_PLOTS})`);
  HUD.animateGoldChange(-cost);

  api("/api/farm/buy-plot", { userId: HUB.userId })
    .then((data) => {
      if (data?.success) {
        state.plots = data.plots;
        if (data.resources) HUD.syncFromServer(data.resources);
        processAchievements(data);
        syncToStore();
      } else {
        state.plots = prevPlots;
        syncToStore();
        forceFullRebuild();
        _syncSubModules();
        render();
        showToast(`❌ ${data?.error || "Failed to buy plot"}`);
      }
    })
    .catch(() => loadState());
}

/* ─── Screen Enter/Exit ─── */
function onEnter() {
  // RC2: Use safe guard so a plant/water/harvest in-flight isn't overwritten
  // by the re-entry state refresh (which would show an empty plot for ~800ms).
  loadStateIfSafe();
  startLocalGrowthTick();
}
function onLeave() {
  stopLocalGrowthTick();
}

/* ─── Cross-tab Realtime sync ─── */
document.addEventListener("farm_state_sync", (e) => {
  const payload = e.detail;
  if (state && payload) {
    if (payload.plots) {
      payload.plots.forEach((p, i) => {
        // RC3: Match the same in-flight guards as loadState() — cross-tab sync
        // was missing plantingInFlight/harvestingInFlight checks and used a
        // too-short 5s window (vs 12s everywhere else).
        if (wateringInFlight.has(i)) return;
        if (plantingInFlight.has(i)) return;
        if (harvestingInFlight.has(i)) return;
        const lastOpt = optimisticActionTimestamps.get(i) || 0;
        if (Date.now() - lastOpt < 12_000) return; // RC3: was 5000
        state.plots[i] = p;
      });
    }
    if (payload.inventory) state.inventory = payload.inventory;
    GameStore.setState("farm", { ...state });
    _syncSubModules();
    render();
    renderShop();
  }
});

/* ─── Public API (backward compatible with FarmGame) ─── */
export const FarmGame = {
  init,
  onEnter,
  onLeave,
  plant,
  water,
  harvest,
  harvestAll,
  buySeeds,
  buyPlot,
  selectSeed,
  updateFarmBadge,
  getLocalGrowth,
  sellCrop,
  feedPet,
  switchFarmTab,
};
