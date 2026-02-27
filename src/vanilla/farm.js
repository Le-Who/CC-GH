/* ═══════════════════════════════════════════════════
 *  Game Hub — Farm Module (v6.2.1)
 *  Plots, planting, watering, harvesting, seed shop
 *  ─ Local growth timer, diff-update fix, farm badge
 *  ─ Diff-update plots (no blink), horizontal buy bar, plot dispatcher
 *  ─ GameStore integration (slice isolation, optimistic updates)
 *  v5: Native ES Module (was IIFE)
 * ═══════════════════════════════════════════════════ */
import { GameStore } from "./store.js";
import { HUB, api, showToast, goToScreen } from "./shared.js";
import {
  CROPS as CROPS_CONFIG,
  getUnlockedSeeds,
  ACHIEVEMENTS,
  SEASON_PASS,
  PLOT_THEMES,
  BOOSTER_CONFIG,
} from "/game-logic.js";
import { HUD } from "./hud.js";
import { PetCompanion } from "./pet.js";
import { getCropsData, setCropsCache } from "./crops.js";
import { SoundEngine, spawnCoinFly, spawnWaterDroplets } from "./effects.js";

const FarmGameImpl = (() => {
  // state is synced with GameStore 'farm' slice
  let state = null;
  let crops = {};
  let selectedSeed = null;
  let firstRenderDone = false;
  let buyQty = 1;
  let justPlantedPlot = -1; // Track freshly-planted plot for animation
  const plotPlantVersions = new Map(); // Per-plot version tracking (Bug 4 fix)
  let harvestVersion = 0; // Track rapid harvesting for stale response rejection
  let waterVersion = 0; // Track rapid watering for stale response rejection
  const wateringInFlight = new Set(); // Prevent duplicate auto-water requests

  /* ═══ v7.2: Progressive Seed Unlocking — Player Stats Helper ═══ */
  function _getPlayerStats() {
    const res = GameStore.getState("resources") || {};
    const harvested = res.harvested || {};
    const totalHarvests = Object.values(harvested).reduce((a, b) => a + b, 0);
    // Gold earned: approximate from current gold + total spent (not exact, but good enough)
    const goldEarned = res.gold || 0; // simplification: current gold as proxy
    const plotsBought = state?.plots?.length || 6;
    // Quest and days tracking from localStorage
    const questsCompleted = parseInt(
      localStorage.getItem("hub_quests_completed") || "0",
      10,
    );
    const daysActive = parseInt(
      localStorage.getItem("hub_days_active") || "1",
      10,
    );
    return {
      totalHarvests,
      goldEarned,
      questsCompleted,
      plotsBought,
      daysActive,
    };
  }

  function _computeUnlocked() {
    return getUnlockedSeeds(_getPlayerStats());
  }

  /** Check for fresh unlocks and show celebration toast */
  function _checkNewUnlocks() {
    const unlocked = _computeUnlocked();
    const seenKey = "hub_unlocked_seeds_seen";
    try {
      const seen = JSON.parse(localStorage.getItem(seenKey) || "[]");
      const fresh = unlocked.filter((id) => !seen.includes(id));
      if (fresh.length > 0) {
        for (const id of fresh) {
          const cfg = crops[id] || CROPS_CONFIG[id];
          if (cfg) showToast(`🔓 New seed unlocked: ${cfg.emoji} ${cfg.name}!`);
        }
        localStorage.setItem(seenKey, JSON.stringify(unlocked));
        renderShop(); // Re-render to show newly unlocked
      }
    } catch {
      /* localStorage error — skip */
    }
  }

  // ── Clock Desync Fix (v4.9) ──
  // Delta between server clock and client clock (ms). Positive = client is ahead.
  let clockDelta = 0;
  function getServerNow() {
    return Date.now() + clockDelta;
  }
  function updateClockDelta(serverTime) {
    if (typeof serverTime === "number" && serverTime > 0) {
      clockDelta = serverTime - Date.now();
    }
  }

  /** Push local state to GameStore (farm slice) */
  function syncToStore() {
    if (state) {
      GameStore.setState("farm", { ...state });
    }
  }

  /** Sync server-side farm.harvested → resources.harvested in GameStore */
  function syncHarvestedToStore(harvested) {
    if (!harvested) return;
    const res = GameStore.getState("resources") || {};
    GameStore.setState("resources", { ...res, harvested: { ...harvested } });
  }
  /** Pull state from GameStore → local (deep clone to prevent shared refs)
   *  v6.2.1: Fast O(1) reference equality replaces JSON.stringify(plots)
   *  which was serializing all plots ~3600×/hour during the growth timer tick.
   */
  let _lastStoreRef = null;
  function syncFromStore() {
    const storeState = GameStore.getState("farm");
    if (!storeState) return;
    // O(1) check — skip clone if the store state object reference hasn't changed
    if (storeState === _lastStoreRef) return;
    _lastStoreRef = storeState;
    state = {
      ...storeState,
      plots: storeState.plots ? storeState.plots.map((p) => ({ ...p })) : [],
      harvested: storeState.harvested ? { ...storeState.harvested } : {},
    };
  }

  const $ = (id) => document.getElementById(id);

  /* ─── localStorage helpers for seed quantities ─── */
  const QTY_STORAGE_KEY = "hub_buyQtys";
  function loadBuyQtys() {
    try {
      return JSON.parse(localStorage.getItem(QTY_STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }
  function saveBuyQty(seedId, qty) {
    const qtys = loadBuyQtys();
    qtys[seedId] = qty;
    localStorage.setItem(QTY_STORAGE_KEY, JSON.stringify(qtys));
  }

  /* ─── Skeleton Rendering ─── */
  function showSkeleton() {
    firstRenderDone = false;
    const grid = $("farm-plots");
    grid.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const div = document.createElement("div");
      div.className = "farm-plot skeleton";
      div.innerHTML = `<div class="skeleton-circle"></div><div class="skeleton-line"></div>`;
      grid.appendChild(div);
    }
    const shopGrid = $("farm-shop-grid");
    shopGrid.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const card = document.createElement("div");
      card.className = "farm-seed-card skeleton";
      card.innerHTML = `&nbsp;<br>&nbsp;`;
      shopGrid.appendChild(card);
    }
  }

  /* ─── Init (parallel loading) ─── */
  async function init() {
    showSkeleton();

    // Pre-populate crops from localStorage cache to prevent 🌱 fallback
    // emojis while the network request is in flight
    try {
      const cached = JSON.parse(localStorage.getItem("hub_crops_cache"));
      if (cached?.data && Object.keys(cached.data).length > 0) {
        crops = cached.data;
        setCropsCache(cached.data);
      }
    } catch (_) {}

    // Register farm slice in the store
    GameStore.registerSlice("farm", null);

    const cropsPromise = getCropsData();
    const statePromise = api("/api/farm/state", {
      userId: HUB.userId,
      username: HUB.username,
    });

    const [cropsData, stateData] = await Promise.all([
      cropsPromise,
      statePromise,
    ]);

    if (cropsData && !cropsData.error) {
      crops = cropsData;
      setCropsCache(cropsData); // Expose for energy modal
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
      updateClockDelta(stateData.serverTime); // v4.9: sync clock
      // Sync resources and pet to HUD/Pet modules
      if (stateData.resources) {
        HUD.syncFromServer(stateData.resources);
      }
      if (stateData.pet) {
        PetCompanion.syncFromServer(stateData.pet);
      }
      // Bug 2 fix: sync server harvested → resources.harvested
      syncHarvestedToStore(stateData.harvested);
      if (stateData.offlineReport) {
        showWelcomeBack(stateData.offlineReport);
      }
      syncToStore();
      render();
      renderShop();
      renderFeaturedShelf(); // v7.2: featured seed shelf
      _checkNewUnlocks(); // v7.2: detect fresh unlocks on load
      updateBuyBar();
    }

    // Event delegation: single click handler on grid (never lost during DOM rebuild)
    const grid = $("farm-plots");
    grid.addEventListener("click", (e) => {
      // v4.15.2: Water button handled via delegation (no per-element listeners)
      const waterBtn = e.target.closest(".farm-water-btn:not([disabled])");
      if (waterBtn) {
        e.stopPropagation();
        const plot = waterBtn.closest(".farm-plot");
        const idx = plot ? parseInt(plot.dataset.index, 10) : NaN;
        if (!isNaN(idx)) water(idx);
        return;
      }
      // Uproot button: start hold timer
      const uprootBtn = e.target.closest(".farm-uproot-btn");
      if (uprootBtn) {
        e.stopPropagation();
        return; // handled by pointerdown below
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

  async function loadState() {
    // Ensure crops cache is populated before rendering (prevents 🌱 fallback)
    if (Object.keys(crops).length === 0) {
      try {
        const cached = JSON.parse(localStorage.getItem("hub_crops_cache"));
        if (cached?.data) crops = cached.data;
      } catch (_) {}
      // If still empty, fetch from API
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
      state = data;
      updateClockDelta(data.serverTime); // v4.9: sync clock
      // Sync resources and pet
      if (data.resources) {
        HUD.syncFromServer(data.resources);
      }
      if (data.pet) {
        PetCompanion.syncFromServer(data.pet);
      }
      // Bug 2 fix: sync server harvested → resources.harvested
      syncHarvestedToStore(data.harvested);
      if (data.offlineReport) {
        showWelcomeBack(data.offlineReport);
      }

      // v7.3: Store new feature data
      if (data.streak) state._streak = data.streak;
      if (data.streakResult) state._streakResult = data.streakResult;
      if (data.newAchievements) state._newAchievements = data.newAchievements;
      if (data.seasonPass) state._seasonPass = data.seasonPass;
      if (data.cosmetics) state._cosmetics = data.cosmetics;
      if (data.boosters) state._boosters = data.boosters;
      if (data.journal) state._journal = data.journal;

      syncToStore();
      render();
      renderInventory();
      renderStreakBadge();
      renderBoosterButton();
      _applyThemeClass();

      // v7.3: Show streak toast
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
      // v7.3: Achievement toast
      if (data.newAchievements?.length > 0) {
        for (const id of data.newAchievements) {
          const badge = ACHIEVEMENTS[id];
          if (badge)
            showToast(`🏆 Badge unlocked: ${badge.emoji} ${badge.name}!`);
        }
      }
    }
  }

  /* ─── Welcome Back Modal (v7.1: Comfort-framed — warm, positive, never guilt) ─── */
  function showWelcomeBack(report) {
    // v7.1: Quick return (<30s) — skip modal entirely, let shared.js toast handle it
    if (
      HUB.lastActiveTimestamp &&
      Date.now() - HUB.lastActiveTimestamp < 30_000
    ) {
      return;
    }

    // Build comfort-framed body lines
    const lines = [];

    // Warm greeting (never mention how long they were away as guilt)
    const petName = GameStore.getState("pet")?.name || "Your pet";
    const offlineMins = report.offlineMinutes || 0;
    const offlineLabel =
      offlineMins >= 60
        ? `${Math.floor(offlineMins / 60)}h ${offlineMins % 60}m`
        : `${offlineMins}m`;
    lines.push(
      `<p class="text-dim" style="margin:0 0 8px;font-size:0.78rem">☀️ While you rested (${offlineLabel}), your world kept growing!</p>`,
    );

    // Harvested crops — frame as pet accomplishment
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

    // Planted crops — frame as growth
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

    // Auto-watered — frame as care
    if (report.autoWatered > 0) {
      lines.push(
        `<div style="margin:4px 0">💧 <strong>Stayed hydrated:</strong> ${report.autoWatered} crop${report.autoWatered > 1 ? "s" : ""} watered</div>`,
      );
    }

    // Pet summary — frame as companionship, not resource consumption
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
    if (summaryParts.length > 0) {
      lines.push(
        `<div style="margin:6px 0;opacity:0.7;font-size:0.8rem">${summaryParts.join(" • ")}</div>`,
      );
    }

    // Open Loops — reframed as excitement, not incomplete tasks
    if (report.openLoops && report.openLoops.length > 0) {
      lines.push(
        `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); text-align: left;">`,
        `<h3 style="font-size: 0.9rem; color: var(--brand-accent); margin: 0 0 8px;">🌟 Almost Ready to Harvest:</h3>`,
      );
      report.openLoops.forEach((ol) => {
        lines.push(
          `<div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px; margin-top: 6px;">`,
          `<span>${ol.name} is thriving!</span>`,
          `<span style="color: var(--ui-gold); font-weight: bold;">${ol.progress}%</span>`,
          `</div>`,
          `<div style="height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); width: 100%; overflow: hidden;"><div style="height: 100%; border-radius: 3px; width: ${ol.progress}%; background: var(--ui-gold);"></div></div>`,
        );
      });
      lines.push(`</div>`);
    }

    // Dynamic CTA based on last active game
    const gameEmojis = {
      trivia: "🧠",
      blox: "🧱",
      farm: "🌱",
      match3: "💎",
      merge: "✨",
    };
    const lastGame = HUB.screenNames[HUB.lastActiveGame] || "farm";
    const ctaEmoji = gameEmojis[lastGame] || "🌱";
    const ctaLabel =
      lastGame === "farm"
        ? "Back to Farming"
        : `Resume ${lastGame.charAt(0).toUpperCase() + lastGame.slice(1)}`;

    // v6.2.1: native <dialog> — consistent with project convention (v4.14+)
    const dialog = document.createElement("dialog");
    dialog.className = "modal welcome-back-dialog";
    dialog.innerHTML = `
      <div class="modal-card" style="text-align:center;max-width:320px">
        <h2 style="margin:0 0 10px">☀️ Welcome Back!</h2>
        ${lines.join("")}
        <button class="btn btn-primary" style="margin-top:14px;width:100%" id="wb-dismiss">${ctaEmoji} ${ctaLabel}</button>
      </div>
    `;
    dialog.addEventListener("close", () => dialog.remove());
    // Backdrop click-to-close (v6.2.0 convention)
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    document.body.appendChild(dialog);
    // Use centralised safeShowModal helper (closes any other open dialogs first)
    import("./shared.js").then(({ safeShowModal }) => safeShowModal(dialog));
    document
      .getElementById("wb-dismiss")
      ?.addEventListener("click", () => dialog.close());
  }

  /* ─── v7.3: Harvest All — Zeigarnik Effect closure ─── */
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
    // Harvest each one sequentially to avoid race conditions
    for (const idx of readyIndices) {
      if (state.plots[idx]?.crop && getLocalGrowth(state.plots[idx]) >= 1) {
        harvest(idx);
      }
    }
    showToast(`🌾 Harvested ${readyIndices.length} crops!`);
  }

  /* ─── v7.3: Sell All — Reduce friction for bulk inventory ─── */
  function sellAll() {
    const res = GameStore.getState("resources") || {};
    const harvested = { ...(res.harvested || {}) };
    const entries = Object.entries(harvested).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      showToast("❌ Nothing to sell!");
      return;
    }
    let totalGold = 0;
    let totalItems = 0;
    for (const [cropId, qty] of entries) {
      const sellPrice = CROPS_CONFIG[cropId]?.sellPrice || 0;
      totalGold += sellPrice * qty;
      totalItems += qty;
    }
    // Optimistic: clear all harvested, add gold
    const newGold = (res.gold || 0) + totalGold;
    GameStore.setState("resources", {
      ...res,
      gold: newGold,
      harvested: {},
    });
    renderInventory();
    render();
    showToast(`💰 Sold ${totalItems} crops for ${totalGold}🪙!`);
    HUD.animateGoldChange(totalGold);
    HUD.updateDisplay(GameStore.getState("resources"));
    // Fire requests for each crop type
    for (const [cropId, qty] of entries) {
      for (let j = 0; j < qty; j++) {
        api("/api/farm/sell-crop", { userId: HUB.userId, cropId })
          .then((data) => {
            if (data?.success) {
              if (data.resources) HUD?.syncFromServer?.(data.resources);
            }
          })
          .catch(() => {});
      }
    }
  }

  /* ─── Plot Click Dispatcher ─── */
  function onPlotClick(i) {
    const plot = state?.plots?.[i];
    if (!plot) return;
    const pct = getLocalGrowth(plot);
    // v4.11.1: Trust local growth for harvest readiness. Local growth uses
    // clock-corrected time (getServerNow) and is validated again server-side
    // on the harvest API call. Previous guard required stale `plot.growth`
    // from server (only refreshes every 30s), making crops un-harvestable
    // immediately when they finished growing.
    const isLocallyReady = plot.crop && pct >= 1;

    if (isLocallyReady) {
      harvest(i);
    } else if (plot.crop && !plot.watered && !isLocallyReady) {
      // v4.5: growing + unwatered = water it (click-to-water UX)
      water(i);
    } else if (plot.crop) {
      // Already watered and still growing
      showToast("💧 Already watered! Growing...");
    } else {
      // Empty plot — plant if seed selected
      plant(i);
    }
  }

  /* ─── Render Plots (diff-update to avoid blinking) ─── */
  function render() {
    if (!state) return;
    // Gold comes from HUD (unified resources), fallback to state.coins for compat
    const gold = HUD.getGold();
    $("farm-coins").textContent = gold;
    $("farm-xp").textContent = state.xp;
    $("farm-level").textContent = `Lv${state.level}`;

    const grid = $("farm-plots");
    const existing = grid.querySelectorAll(".farm-plot:not(.skeleton)");
    const isFirstRender = !firstRenderDone;

    if (existing.length === state.plots.length && !isFirstRender) {
      // Diff-update: only rebuild changed plots
      state.plots.forEach((plot, i) => {
        const div = existing[i];
        const pct = getLocalGrowth(plot);
        const isReady = plot.crop && pct >= 1;
        // v4.9: "almost ready" = local shows 100% but server says < 1
        const serverGrowth =
          typeof plot.growth === "number" ? plot.growth : pct;
        const isAlmostReady = plot.crop && pct >= 0.95 && serverGrowth < 1;
        const currentCrop = div.dataset.crop || "";
        const currentWatered = div.dataset.watered === "true";
        const structureChanged = currentCrop !== (plot.crop || "");
        const wateredChanged = !!plot.watered !== currentWatered;

        if (structureChanged || wateredChanged) {
          rebuildPlot(div, plot, i, pct, isReady, false);
        } else if (plot.crop) {
          // Update growth bar width + button state
          const fill = div.querySelector(".growth-bar-fill");
          if (fill) {
            fill.style.width = Math.round(pct * 100) + "%";
            fill.classList.toggle("done", isReady);
          }
          // Update growth time label (was static before this fix)
          const timeLabel = div.querySelector(".growth-time-label");
          if (isReady) {
            if (timeLabel) timeLabel.remove();
            // Also remove uproot button when ready
            const uprootBtn = div.querySelector(".farm-uproot-btn");
            if (uprootBtn) uprootBtn.remove();
          } else if (timeLabel) {
            timeLabel.textContent = formatTimeLeft(plot, pct);
          }
          const waterBtn = div.querySelector(".farm-water-btn");
          if (waterBtn && isReady) waterBtn.remove();
        }
        // Always update classes (no onclick — delegation handles it)
        div.className = `farm-plot${plot.crop ? "" : " empty"}${isReady ? " ready" : ""}${isAlmostReady ? " almost-ready" : ""}`;
        div.dataset.index = i;
      });
    } else {
      // Full rebuild (first render)
      grid.innerHTML = "";
      state.plots.forEach((plot, i) => {
        const div = document.createElement("div");
        const pct = getLocalGrowth(plot);
        const isReady = plot.crop && pct >= 1;
        rebuildPlot(div, plot, i, pct, isReady, isFirstRender);
        grid.appendChild(div);
      });
      // Append Buy Plot card if under max
      appendBuyPlotCard(grid);
      firstRenderDone = true;
    }

    // Task 7.1: Update farm nav notification dot
    _updateFarmNavDot();

    // v7.3: Harvest All button — show when ≥2 crops ready
    _updateHarvestAllButton();
  }

  function _updateHarvestAllButton() {
    const readyCount =
      state?.plots?.filter((p) => p.crop && getLocalGrowth(p) >= 1).length || 0;
    let btn = document.getElementById("farm-harvest-all-btn");
    if (readyCount >= 2) {
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "farm-harvest-all-btn";
        btn.className = "farm-harvest-all-fab";
        btn.addEventListener("click", harvestAll);
        // Insert before farm-plots grid
        const grid = $("farm-plots");
        if (grid) grid.parentNode.insertBefore(btn, grid);
      }
      btn.textContent = `🌾 Harvest All (${readyCount})`;
      btn.style.display = "";
    } else if (btn) {
      btn.style.display = "none";
    }
  }

  /** Task 7.1: Show green dot on Farm tab if any crop is ready to harvest */
  function _updateFarmNavDot() {
    const tab = document.getElementById("nav-tab-farm");
    if (!tab || !state?.plots) return;
    const hasReady = state.plots.some((p) => {
      if (!p.crop) return false;
      return getLocalGrowth(p) >= 1;
    });
    let dot = tab.querySelector(".nav-notify-dot");
    if (hasReady && !dot) {
      dot = document.createElement("span");
      dot.className = "nav-notify-dot dot-green";
      tab.appendChild(dot);
    } else if (!hasReady && dot) {
      dot.remove();
    }
  }

  function rebuildPlot(div, plot, i, pct, isReady, animate) {
    div.dataset.crop = plot.crop || "";
    div.dataset.watered = plot.watered ? "true" : "false";
    div.dataset.index = i;
    div.className = `farm-plot${animate ? " first-load" : ""}${plot.crop ? "" : " empty"}${isReady ? " ready" : ""}`;
    // No onclick — event delegation handles all clicks

    if (plot.crop) {
      const cfg = crops[plot.crop] || {};
      const isJustPlanted = justPlantedPlot === i;
      const displayPct = isJustPlanted ? 100 : Math.round(pct * 100);
      div.innerHTML = `
        <div class="crop-emoji">${cfg.emoji || "🌱"}</div>
        <div class="crop-name">${cfg.name || plot.crop}</div>
        <div class="growth-bar"><div class="growth-bar-fill${isReady ? " done" : ""}${isJustPlanted ? " plant-burst" : ""}" style="width:${displayPct}%"></div></div>
        ${!isReady ? `<div class="growth-time-label">${formatTimeLeft(plot, pct)}</div>` : ""}
        ${!isReady ? '<button class="farm-uproot-btn" title="Hold 2.5s to uproot">💣</button>' : ""}
        ${!plot.watered && !isReady ? '<button class="farm-water-btn" title="Water">💧</button>' : ""}
        ${plot.watered ? '<button class="farm-water-btn watered" disabled>💧</button>' : ""}
      `;
      // Animate rollback: 100% → real value
      if (isJustPlanted) {
        justPlantedPlot = -1;
        const fill = div.querySelector(".growth-bar-fill");
        if (fill) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              fill.classList.remove("plant-burst");
              fill.style.width = Math.round(pct * 100) + "%";
            }, 500);
          });
        }
      }
      // v4.15.2: Water button handled by grid event delegation — no per-element listener
      div.title = isReady ? "Click to harvest!" : "Growing...";
    } else {
      // v7.3: Activation Energy — clear CTA replaces passive label
      const hasSeeds =
        selectedSeed && (state?.inventory?.[selectedSeed] || 0) > 0;
      const ctaText = hasSeeds
        ? `Plant ${crops[selectedSeed]?.emoji || "🌱"} ${crops[selectedSeed]?.name || selectedSeed}`
        : "Tap to Plant 🌱";
      div.innerHTML = `<div class="plot-empty-label">${ctaText}</div><div style="font-size:1.4rem;opacity:0.3">🌱</div>`;
      div.title = hasSeeds
        ? `Plant ${crops[selectedSeed]?.name || selectedSeed}`
        : "Select a seed from the shop";
    }
  }

  /* ─── Growth Time Formatter ─── */
  function _formatGrowthTime(ms) {
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hours > 0) {
      let s = `${hours}h`;
      if (mins > 0) s += ` ${mins}m`;
      if (secs > 0) s += ` ${secs}s`;
      return s;
    }
    if (secs > 0) return `${mins}m ${secs}s`;
    return `${mins}m`;
  }
  /* ═══ v7.2: Featured Seed Shelf — 4-seed rotating strip ═══ */
  let _shelfTimerInterval = null;

  function renderFeaturedShelf() {
    const container = $("featured-shelf-container");
    if (!container) return;
    const unlocked = _computeUnlocked();
    if (unlocked.length < 3) {
      container.innerHTML = ""; // Too few seeds to feature
      return;
    }

    // Deterministic rotation: changes every 4 hours
    const ROTATION_MS = 4 * 3600_000;
    const rotationKey = Math.floor(Date.now() / ROTATION_MS);

    // Seeded shuffle using rotation key
    const seeded = [...unlocked].sort((a, b) => {
      const ha =
        ((rotationKey * 2654435761 + a.charCodeAt(0) * 31) >>> 0) % 1000;
      const hb =
        ((rotationKey * 2654435761 + b.charCodeAt(0) * 31) >>> 0) % 1000;
      return ha - hb;
    });

    // Pick 4 seeds: prioritize 1 untried seed + fill with profit-ranked
    const history = _getPurchaseHistory();
    const purchased = new Set(history.map((h) => h.seedId));
    const untried = seeded.filter((id) => !purchased.has(id));
    const tried = seeded.filter((id) => purchased.has(id));

    // Sort tried by sell/cost ratio (best profit first)
    const profitRanked = tried.sort((a, b) => {
      const cfgA = crops[a] || CROPS_CONFIG[a] || {};
      const cfgB = crops[b] || CROPS_CONFIG[b] || {};
      const ratioA = (cfgA.sellPrice || 1) / (cfgA.seedPrice || 1);
      const ratioB = (cfgB.sellPrice || 1) / (cfgB.seedPrice || 1);
      return ratioB - ratioA;
    });

    const picks = [];
    // Add 1 untried seed if available
    if (untried.length > 0) picks.push(untried[0]);
    // Fill with profit-ranked tried seeds
    for (const id of profitRanked) {
      if (picks.length >= 4) break;
      if (!picks.includes(id)) picks.push(id);
    }
    // If still short, fill from seeded order
    for (const id of seeded) {
      if (picks.length >= 4) break;
      if (!picks.includes(id)) picks.push(id);
    }

    // Countdown to next rotation
    const nextRotation = (rotationKey + 1) * ROTATION_MS;
    const msLeft = nextRotation - Date.now();
    const hLeft = Math.floor(msLeft / 3600_000);
    const mLeft = Math.floor((msLeft % 3600_000) / 60_000);
    const timerText = hLeft > 0 ? `⟳ ${hLeft}h ${mLeft}m` : `⟳ ${mLeft}m`;

    // Build shelf HTML — compact inline pill format
    const cards = picks
      .map((id) => {
        const cfg = crops[id] || CROPS_CONFIG[id] || {};
        const isNew = !purchased.has(id);
        return `
        <div class="featured-shelf-card${isNew ? " fs-untried" : ""}" data-seed="${id}">
          <span class="fs-emoji">${cfg.emoji || "🌱"}</span>
          <span class="fs-name">${cfg.name || id}</span>
          <span class="fs-price">🪙${cfg.seedPrice || "?"}</span>
        </div>
      `;
      })
      .join("");

    container.innerHTML = `
      <div class="featured-shelf-header">
        <span class="featured-shelf-title">🌟 Featured</span>
        <span class="featured-shelf-timer">${timerText}</span>
        <button class="shelf-collapse-btn" title="Hide featured seeds">✕</button>
      </div>
      <div class="featured-shelf">${cards}</div>
    `;

    // Collapse toggle
    const collapseBtn = container.querySelector(".shelf-collapse-btn");
    if (collapseBtn) {
      collapseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        container.classList.toggle("shelf-collapsed");
      });
    }

    // Tap handler — opens quick-buy with pre-selected seed
    container.querySelectorAll(".featured-shelf-card").forEach((card) => {
      card.addEventListener("click", () => {
        const seedId = card.dataset.seed;
        if (seedId) {
          selectedSeed = seedId;
          // Find first empty plot for quick-buy context
          const emptyIdx = state?.plots?.findIndex((p) => !p.crop);
          if (emptyIdx >= 0) {
            showQuickBuy(emptyIdx);
          } else {
            // All plots full — buy 1 seed into inventory (don't just select)
            const prevQty = buyQty;
            buyQty = 1;
            buySeeds(seedId);
            buyQty = prevQty;
          }
        }
      });
    });

    // Refresh timer every minute
    if (_shelfTimerInterval) clearInterval(_shelfTimerInterval);
    _shelfTimerInterval = setInterval(() => {
      const now = Date.now();
      const currentKey = Math.floor(now / ROTATION_MS);
      if (currentKey !== rotationKey) {
        renderFeaturedShelf(); // Rotation changed — re-render
        return;
      }
      const ms = (currentKey + 1) * ROTATION_MS - now;
      const h = Math.floor(ms / 3600_000);
      const m = Math.floor((ms % 3600_000) / 60_000);
      const timerEl = container.querySelector(".featured-shelf-timer");
      if (timerEl) timerEl.textContent = h > 0 ? `⟳ ${h}h ${m}m` : `⟳ ${m}m`;
    }, 60_000);
  }

  /* ─── Seed Shop Grid (v7.2 UX overhaul) ─── */
  function renderShop() {
    const grid = $("farm-shop-grid");
    grid.innerHTML = "";
    // Filter out non-crop entries (e.g. __hash from API response)
    const allEntries = Object.entries(crops).filter(
      ([id, cfg]) =>
        typeof cfg === "object" && cfg !== null && !id.startsWith("__"),
    );

    // v7.2: Progressive unlock — compute which seeds are available
    const unlocked = _computeUnlocked();

    // Compute profit ratio for each seed — use authoritative CROPS_CONFIG.sellPrice
    const withProfit = allEntries.map(([id, cfg]) => {
      const growSec =
        (CROPS_CONFIG[id]?.growthTime || cfg.growthTime || 15000) / 1000;
      const sellPrice = CROPS_CONFIG[id]?.sellPrice || cfg.sellPrice || 0;
      const ratio = cfg.seedPrice > 0 ? sellPrice / cfg.seedPrice : 0;
      return { id, cfg, sellPrice, ratio, growSec };
    });

    // Find the "Best Pick" — highest profit ratio among unlocked seeds
    const unlockedWithProfit = withProfit.filter((s) =>
      unlocked.includes(s.id),
    );
    const bestPick =
      unlockedWithProfit.length > 0
        ? unlockedWithProfit.reduce((best, s) =>
            s.ratio > best.ratio ? s : best,
          )
        : null;

    // Group: Quick Grow (< 60s), Best Value (top 3 profit), then All
    const quickGrow = unlockedWithProfit
      .filter((s) => s.growSec < 60)
      .sort((a, b) => a.growSec - b.growSec);
    const bestValue = [...unlockedWithProfit]
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3);

    // Build sections
    const sections = [];
    if (bestValue.length > 0)
      sections.push({ label: "💰 Best Value", seeds: bestValue });
    if (quickGrow.length > 0)
      sections.push({ label: "⚡ Quick Grow", seeds: quickGrow });
    // All seeds sorted by price
    const allSorted = [...withProfit].sort(
      (a, b) => (a.cfg.seedPrice || 0) - (b.cfg.seedPrice || 0),
    );
    sections.push({ label: "🌱 All Seeds", seeds: allSorted });

    // Track which seeds have been rendered (avoid duplicates across sections)
    const rendered = new Set();

    for (const section of sections) {
      const sectionSeeds = section.seeds.filter(
        (s) => !rendered.has(s.id) || section.label === "🌱 All Seeds",
      );
      if (sectionSeeds.length === 0) continue;

      // Section header
      const header = document.createElement("div");
      header.className = "shop-section-header";
      header.textContent = section.label;
      grid.appendChild(header);

      for (const { id, cfg, sellPrice, ratio } of sectionSeeds) {
        if (section.label !== "🌱 All Seeds" && rendered.has(id)) continue;
        rendered.add(id);

        const isLocked = !unlocked.includes(id);
        const count = state?.inventory?.[id] || 0;
        const card = document.createElement("div");
        const isSelected = selectedSeed === id;
        const isEmpty = count <= 0;
        const isBest = bestPick && id === bestPick.id;
        const canonicalGrowth =
          CROPS_CONFIG[id]?.growthTime || cfg.growthTime || 15000;
        const growthLabel = _formatGrowthTime(canonicalGrowth);

        if (isLocked) {
          const condition = CROPS_CONFIG[id]?.unlockCondition;
          card.className = "farm-seed-card locked";
          card.innerHTML = `
            <div class="seed-emoji">🔒</div>
            <div class="seed-info-col">
              <div class="seed-name">${cfg.name}</div>
              <div class="seed-lock-label">${condition?.label || "Locked"}</div>
            </div>
          `;
          grid.appendChild(card);
          continue;
        }

        card.className = `farm-seed-card${isSelected ? " selected" : ""}${isEmpty ? " no-seeds" : ""}${isBest ? " best-pick" : ""}`;
        // Profit color indicator
        const profitClass =
          ratio >= 2 ? "profit-high" : ratio >= 1 ? "profit-ok" : "profit-low";
        card.innerHTML = `
          <div class="seed-emoji">${cfg.emoji}</div>
          <div class="seed-info-col">
            <div class="seed-name">${isBest ? "⭐ " : ""}${cfg.name}${count > 0 ? ` <span class="seed-inv-badge">×${count}</span>` : ""}</div>
            <div class="seed-meta-row">
              <span class="seed-grow-time">⏰ ${growthLabel}</span>
              <span class="seed-profit ${profitClass}">📈 ${sellPrice}🪙</span>
            </div>
          </div>
          <div class="seed-price-col">
            <div class="seed-price">🪙 ${cfg.seedPrice}</div>
            <button class="seed-quick-buy" data-crop="${id}" title="Buy 1 ${cfg.name}">Buy</button>
          </div>
        `;
        card.onclick = (e) => {
          if (e.target.closest(".seed-quick-buy")) return;
          if (e.target.closest(".seed-buy-expanded")) return;
          selectSeed(id);
        };
        const quickBuyBtn = card.querySelector(".seed-quick-buy");
        if (quickBuyBtn) {
          quickBuyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            selectedSeed = id;
            buyQty = 1;
            buySeeds(id);
          });
        }
        // v7.3: Inline stepper — expands inside selected card
        if (isSelected) {
          const totalCost = cfg.seedPrice * buyQty;
          const goldAvail = HUD.getGold();
          const canAfford = goldAvail >= totalCost;
          const expandRow = document.createElement("div");
          expandRow.className = "seed-buy-expanded";
          expandRow.innerHTML = `
            <button class="sbe-step" data-d="-10">−10</button>
            <button class="sbe-step" data-d="-1">−</button>
            <span class="sbe-qty">${buyQty}</span>
            <button class="sbe-step" data-d="1">+</button>
            <button class="sbe-step" data-d="10">+10</button>
            <span class="sbe-cost">🪙 ${totalCost}</span>
            <button class="sbe-buy${canAfford ? "" : " disabled"}">Buy</button>
          `;
          expandRow.querySelectorAll(".sbe-step").forEach((btn) => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const d = parseInt(btn.dataset.d, 10);
              buyQty = Math.max(1, Math.min(99, buyQty + d));
              if (selectedSeed) saveBuyQty(selectedSeed, buyQty);
              renderShop();
            });
          });
          const buyBtn = expandRow.querySelector(".sbe-buy");
          if (buyBtn) {
            buyBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (canAfford) buySeeds(id);
            });
          }
          card.appendChild(expandRow);
        }
        grid.appendChild(card);
      }
    }
  }

  /* ─── Farm Panel Tab Switching ─── */
  function switchFarmTab(tab) {
    // Toggle active tab button
    const tabs = document.querySelectorAll(".farm-tab");
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    // Toggle active content
    const contents = document.querySelectorAll(".farm-tab-content");
    contents.forEach((c) =>
      c.classList.toggle("active", c.id === `farm-tab-content-${tab}`),
    );
    if (tab === "inv") renderInventory();
    if (tab === "badges") renderBadges();
    if (tab === "journal") renderJournal();
    if (tab === "season") renderSeasonPass();
  }

  /* ─── Inventory Rendering (reads harvested from resources slice) ─── */
  function renderInventory() {
    const grid = $("farm-inventory-grid");
    if (!grid) return;

    let harvested = {};
    harvested = GameStore.getState("resources")?.harvested || {};

    const entries = Object.entries(harvested).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      grid.innerHTML =
        '<div class="farm-inv-empty">No crops harvested yet</div>';
      return;
    }

    grid.innerHTML = "";
    // v7.3: Sell All header button when ≥2 items
    const totalItems = entries.reduce((sum, [, qty]) => sum + qty, 0);
    if (totalItems >= 2) {
      const totalGold = entries.reduce((sum, [cropId, qty]) => {
        return sum + (CROPS_CONFIG[cropId]?.sellPrice || 0) * qty;
      }, 0);
      const sellAllBar = document.createElement("div");
      sellAllBar.className = "farm-sell-all-bar";
      sellAllBar.innerHTML = `
        <span class="sell-all-label">📦 ${totalItems} crops</span>
        <button class="farm-sell-all-btn" id="farm-sell-all-btn">💰 Sell All (${totalGold}🪙)</button>
      `;
      sellAllBar
        .querySelector(".farm-sell-all-btn")
        .addEventListener("click", sellAll);
      grid.appendChild(sellAllBar);
    }
    for (const [cropId, qty] of entries) {
      const cfg = crops[cropId] || {};
      // v7.3: Use authoritative sell price from CROPS_CONFIG (fixes client/server desync)
      const sellPrice = CROPS_CONFIG[cropId]?.sellPrice || cfg.sellPrice || 0;
      const item = document.createElement("div");
      item.className = "farm-inv-item";
      item.innerHTML = `
        <span class="farm-inv-emoji">${cfg.emoji || "🌱"}</span>
        <div class="farm-inv-info">
          <div class="farm-inv-name">${cfg.name || cropId} <span class="farm-inv-qty">×${qty}</span></div>
        </div>
        <div class="farm-inv-actions">
          <button class="farm-inv-btn sell" data-crop="${cropId}" title="Sell for ${sellPrice}🪙">💰 Sell</button>
          <button class="farm-inv-btn feed" data-crop="${cropId}" title="Feed pet (+${CROPS_CONFIG[cropId]?.energyYield || 1}⚡)">🍖 Feed</button>
        </div>
      `;
      // Sell handler
      item
        .querySelector(".farm-inv-btn.sell")
        .addEventListener("click", () => sellCrop(cropId, sellPrice));
      // Feed handler
      item
        .querySelector(".farm-inv-btn.feed")
        .addEventListener("click", () => feedPet(cropId));
      grid.appendChild(item);
    }
  }

  /* ─── v7.3: Streak Badge ─── */
  function renderStreakBadge() {
    const streak = state?._streak;
    if (!streak || streak.current < 1) return;
    let badge = document.getElementById("farm-streak-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "farm-streak-badge";
      badge.className = "farm-streak-badge";
      const statsBar = document.querySelector(".farm-stats");
      if (statsBar) statsBar.appendChild(badge);
    }
    const mult =
      streak.bonusMultiplier > 1 ? ` (${streak.bonusMultiplier}×)` : "";
    badge.innerHTML = `🔥 ${streak.current}-day streak${mult}`;
  }

  /* ─── v7.3: Booster Button ─── */
  function renderBoosterButton() {
    const boosters = state?._boosters;
    let btn = document.getElementById("farm-booster-btn");
    const fertCfg = BOOSTER_CONFIG?.fertilizer;
    if (!fertCfg) return;
    const isActive =
      boosters?.fertilizer?.active &&
      boosters.fertilizer.expiresAt > Date.now();
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "farm-booster-btn";
      btn.className = "farm-booster-btn";
      btn.addEventListener("click", async () => {
        if (isActive) return;
        const data = await api("/api/farm/activate-booster", {
          userId: HUB.userId,
          boosterId: "fertilizer",
        });
        if (data?.success) {
          state._boosters = data.boosters;
          if (data.resources) HUD.syncFromServer(data.resources);
          renderBoosterButton();
          showToast("⚡ Fertilizer activated! Growth speed doubled for 1h!");
        } else {
          showToast(`❌ ${data?.error || "Failed to activate"}`);
        }
      });
      const statsBar = document.querySelector(".farm-stats");
      if (statsBar) statsBar.appendChild(btn);
    }
    if (isActive) {
      const remaining = Math.max(
        0,
        Math.ceil((boosters.fertilizer.expiresAt - Date.now()) / 60_000),
      );
      btn.textContent = `⚡ Active (${remaining}m)`;
      btn.classList.add("active");
    } else {
      btn.textContent = `⚡ Fertilizer (${fertCfg.cost}🪙)`;
      btn.classList.remove("active");
    }
  }

  /* ─── v7.3: Apply Theme Class ─── */
  function _applyThemeClass() {
    const grid = $("farm-plots");
    if (!grid) return;
    const themeId = state?._cosmetics?.activePlotTheme || "default";
    // Remove all theme classes
    grid.className = grid.className.replace(/\bfarm-theme-\S+/g, "").trim();
    if (themeId !== "default") {
      grid.classList.add(`farm-theme-${themeId}`);
    }
  }

  /* ─── v7.3: Render Badges Tab ─── */
  function renderBadges() {
    const grid = $("farm-badges-grid");
    if (!grid) return;
    const achievements = state?.achievements || {};
    grid.innerHTML = "";
    for (const [id, badge] of Object.entries(ACHIEVEMENTS)) {
      const unlocked = !!achievements[id];
      const claimed = achievements[id]?.seen;
      const card = document.createElement("div");
      card.className = `farm-badge-card${unlocked ? " unlocked" : " locked"}${claimed ? " claimed" : ""}`;
      card.innerHTML = `
        <div class="badge-emoji">${unlocked ? badge.emoji : "🔒"}</div>
        <div class="badge-name">${badge.name}</div>
        <div class="badge-desc">${badge.desc}</div>
        ${unlocked && !claimed ? `<button class="badge-claim-btn">🎁 Claim ${badge.reward.gold ? badge.reward.gold + "🪙" : badge.reward.gachaTokens + "🎫"}</button>` : ""}
        ${claimed ? '<div class="badge-claimed">✅ Claimed</div>' : ""}
      `;
      if (unlocked && !claimed) {
        card
          .querySelector(".badge-claim-btn")
          .addEventListener("click", async () => {
            const data = await api("/api/achievements/claim", {
              userId: HUB.userId,
              badgeId: id,
            });
            if (data?.success) {
              state.achievements[id] = {
                ...state.achievements[id],
                seen: true,
              };
              if (data.resources) HUD.syncFromServer(data.resources);
              renderBadges();
              showToast(`🏆 Claimed: ${badge.emoji} ${badge.name}!`);
            }
          });
      }
      grid.appendChild(card);
    }
  }

  /* ─── v7.3: Render Journal Tab ─── */
  function renderJournal() {
    const grid = $("farm-journal-grid");
    if (!grid) return;
    const discovered = state?._journal?.discovered || [];
    grid.innerHTML = "";
    const allCrops = Object.values(CROPS_CONFIG);
    for (const cfg of allCrops) {
      const found = discovered.includes(cfg.id);
      const card = document.createElement("div");
      card.className = `farm-journal-card${found ? " discovered" : " undiscovered"}`;
      card.innerHTML = found
        ? `<div class="journal-emoji">${cfg.emoji}</div>
           <div class="journal-name">${cfg.name}</div>
           <div class="journal-lore">${cfg.lore || ""}</div>
           <div class="journal-stats">🪙${cfg.sellPrice} · ⏱${Math.round(cfg.growthTime / 60000)}m · ⭐${cfg.xp}XP</div>`
        : `<div class="journal-emoji">❓</div>
           <div class="journal-name">???</div>
           <div class="journal-lore">Grow this crop to discover it!</div>`;
      grid.appendChild(card);
    }
  }

  /* ─── v7.3: Render Season Pass Tab ─── */
  function renderSeasonPass() {
    const container = $("farm-season-pass");
    if (!container) return;
    const sp = state?._seasonPass || { season: 1, xp: 0, tier: 0, claimed: [] };
    const tiers = SEASON_PASS.tiers;
    const maxXp = tiers[tiers.length - 1].xp;
    const pct = Math.min(100, Math.round((sp.xp / maxXp) * 100));

    let html = `
      <div class="season-header">
        <span class="season-title">⭐ ${SEASON_PASS.name}</span>
        <span class="season-xp">${sp.xp} / ${maxXp} XP</span>
      </div>
      <div class="season-progress-bar">
        <div class="season-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="season-tiers">
    `;
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const unlocked = sp.xp >= t.xp;
      const claimed = sp.claimed?.includes(i);
      const rewardText = t.reward.gold
        ? `${t.reward.gold}🪙`
        : t.reward.theme
          ? `🎨 ${t.reward.theme}`
          : t.reward.seeds
            ? "🌱 Seeds"
            : t.reward.gachaTokens
              ? `${t.reward.gachaTokens}🎫`
              : t.reward.title || "";
      html += `
        <div class="season-tier${unlocked ? " unlocked" : ""}${claimed ? " claimed" : ""}" data-tier="${i}">
          <div class="tier-label">${t.label}</div>
          <div class="tier-reward">${rewardText}</div>
          <div class="tier-xp">${t.xp} XP</div>
          ${unlocked && !claimed ? `<button class="tier-claim-btn" data-tier-idx="${i}">🎁 Claim</button>` : ""}
          ${claimed ? '<div class="tier-claimed">✅</div>' : ""}
        </div>
      `;
    }
    html += "</div>";
    container.innerHTML = html;

    // Claim handlers
    container.querySelectorAll(".tier-claim-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.tierIdx);
        const data = await api("/api/season-pass/claim", {
          userId: HUB.userId,
          tierIndex: idx,
        });
        if (data?.success) {
          state._seasonPass = data.seasonPass;
          if (data.resources) HUD.syncFromServer(data.resources);
          renderSeasonPass();
          showToast(`⭐ Season reward claimed: ${tiers[idx].label}!`);
        }
      });
    });
  }

  function selectSeed(id) {
    // Toggle: clicking same seed deselects it
    if (selectedSeed === id) {
      selectedSeed = null;
    } else {
      selectedSeed = id;
      // Restore qty from localStorage (or default 1)
      const stored = loadBuyQtys();
      buyQty = stored[id] || 1;
    }
    renderShop();
    // v7.3: Hide global buy bar — stepper is inline per card now
    const bar = $("farm-buy-bar");
    if (bar) bar.style.display = "none";
    render(); // Re-render plots to update titles
  }

  /* ─── Horizontal Buy Bar ─── */
  function updateBuyBar() {
    const bar = $("farm-buy-bar");
    if (!bar) return;

    if (!selectedSeed || !crops[selectedSeed]) {
      bar.style.display = "none";
      return;
    }

    bar.style.display = "";
    const cfg = crops[selectedSeed];
    const totalCost = cfg.seedPrice * buyQty;
    const goldAvail = HUD.getGold();
    const canAfford = goldAvail >= totalCost;

    bar.innerHTML = `
      <span class="buy-bar-seed">${cfg.emoji} ${cfg.name}</span>
      <span class="buy-bar-stepper">
        <button class="step-lg" id="buy-qty-m10">−10</button>
        <button id="buy-qty-minus">−</button>
        <span class="qty-display" id="buy-qty-val">${buyQty}</span>
        <button id="buy-qty-plus">+</button>
        <button class="step-lg" id="buy-qty-p10">+10</button>
      </span>
      <span class="buy-bar-total">🪙 ${totalCost}</span>
      <button class="buy-bar-btn${canAfford ? "" : " disabled"}" id="buy-bar-go">${canAfford ? "Buy" : "💰?"}</button>
    `;

    function setQty(q) {
      buyQty = Math.max(1, Math.min(99, q));
      if (selectedSeed) saveBuyQty(selectedSeed, buyQty);
      updateBuyBar();
    }
    $("buy-qty-m10").onclick = () => setQty(buyQty - 10);
    $("buy-qty-minus").onclick = () => setQty(buyQty - 1);
    $("buy-qty-plus").onclick = () => setQty(buyQty + 1);
    $("buy-qty-p10").onclick = () => setQty(buyQty + 10);
    $("buy-bar-go").onclick = () => {
      if (canAfford) buySeeds(selectedSeed);
    };
  }

  /* ─── Actions ─── */
  let buySeedVersion = 0;
  function buySeeds(cropId) {
    const cfg = crops[cropId];
    if (!cfg) return;
    const totalCost = cfg.seedPrice * buyQty;
    const goldAvail = HUD.getGold();
    if (goldAvail < totalCost) {
      showToast("❌ Not enough gold!");
      return;
    }
    // Bug 1 fix: immediately deduct gold from GameStore for instant UI
    const prevGold = goldAvail;
    const res = GameStore.getState("resources") || {};
    GameStore.setState("resources", { ...res, gold: res.gold - totalCost });
    // Optimistic update (instant UI)
    const prevInventory = { ...state.inventory };
    const savedQty = buyQty;
    state.inventory[cropId] = (state.inventory[cropId] || 0) + savedQty;
    syncToStore();
    render();
    renderShop();
    showToast(`Bought ${savedQty}× ${cfg.emoji} ${cfg.name} seeds`);
    HUD.animateGoldChange(-totalCost);
    buyQty = 1;
    if (selectedSeed) saveBuyQty(selectedSeed, 1);
    updateBuyBar();

    // Fire-and-forget with version guard
    const myVersion = ++buySeedVersion;
    api("/api/farm/buy-seeds", {
      userId: HUB.userId,
      cropId,
      amount: savedQty,
    })
      .then((data) => {
        if (buySeedVersion !== myVersion) return;
        if (data.success) {
          // Silently sync server state
          if (data.resources) {
            HUD.syncFromServer(data.resources);
          }
          state.inventory = data.inventory;
          syncToStore();
        } else {
          // Rollback gold + inventory
          const res = GameStore.getState("resources") || {};
          GameStore.setState("resources", { ...res, gold: prevGold });
          state.inventory = prevInventory;
          syncToStore();
          render();
          renderShop();
          showToast(`❌ ${data.error}`);
        }
      })
      .catch(() => {
        if (buySeedVersion === myVersion) loadState();
      });
  }

  /* ═══════════════════════════════════════════════════
   *  v7.1: Contextual Quick-Buy — Bottom Sheet
   *  Shows top 3 seeds when tapping an empty plot.
   *  Single tap = buy 1 seed + plant instantly.
   * ═══════════════════════════════════════════════════ */
  const PURCHASE_HISTORY_KEY = "farm_purchase_history";
  const PURCHASE_HISTORY_MAX = 50;

  function _getPurchaseHistory() {
    try {
      return JSON.parse(localStorage.getItem(PURCHASE_HISTORY_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function _trackPurchase(seedId) {
    const history = _getPurchaseHistory();
    history.push({ seedId, ts: Date.now() });
    // FIFO cap
    while (history.length > PURCHASE_HISTORY_MAX) history.shift();
    localStorage.setItem(PURCHASE_HISTORY_KEY, JSON.stringify(history));
  }

  /** Get top N most-purchased seed IDs. Fallback: cheapest N. */
  function _getTopSeeds(n = 3) {
    const history = _getPurchaseHistory();
    // v7.2: Only consider unlocked seeds
    const unlocked = _computeUnlocked();
    // Count purchases per seed
    const counts = {};
    for (const { seedId } of history) {
      counts[seedId] = (counts[seedId] || 0) + 1;
    }
    // Sort by purchase count descending, filter to unlocked only
    const ranked = Object.entries(counts)
      .filter(
        ([id]) => crops[id] && !id.startsWith("__") && unlocked.includes(id),
      )
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => id);

    if (ranked.length >= n) return ranked.slice(0, n);

    // Fallback: fill with cheapest unlocked seeds not already in the list
    const allSeeds = Object.entries(crops)
      .filter(
        ([id, cfg]) =>
          typeof cfg === "object" &&
          cfg !== null &&
          !id.startsWith("__") &&
          unlocked.includes(id),
      )
      .sort(([, a], [, b]) => (a.seedPrice || 0) - (b.seedPrice || 0))
      .map(([id]) => id);
    const merged = [...ranked];
    for (const id of allSeeds) {
      if (merged.length >= n) break;
      if (!merged.includes(id)) merged.push(id);
    }
    return merged.slice(0, n);
  }

  function showQuickBuy(plotId) {
    // Don't show if no crops loaded
    if (!crops || Object.keys(crops).length === 0) {
      showToast("🛒 Loading seeds...");
      return;
    }
    // Prevent duplicate sheets
    const existing = document.getElementById("quick-buy-dialog");
    if (existing) existing.remove();

    const topSeeds = _getTopSeeds(3);
    const goldAvail = HUD.getGold();

    // Find most-purchased seed for "★" indicator
    const history = _getPurchaseHistory();
    const counts = {};
    for (const { seedId } of history)
      counts[seedId] = (counts[seedId] || 0) + 1;
    const favSeed = Object.entries(counts).sort(
      ([, a], [, b]) => b - a,
    )[0]?.[0];

    // Build seed cards
    const cards = topSeeds
      .map((id) => {
        const cfg = crops[id];
        if (!cfg) return "";
        const canonicalGrowth =
          CROPS_CONFIG[id]?.growthTime || cfg.growthTime || 15000;
        const growthLabel = _formatGrowthTime(canonicalGrowth);
        const canAfford = goldAvail >= (cfg.seedPrice || 0);
        const isFav = id === favSeed;
        const invCount = state?.inventory?.[id] || 0;

        return `
        <button class="qb-seed-card${canAfford ? "" : " qb-muted"}" data-seed="${id}" ${canAfford ? "" : "disabled"}>
          <span class="qb-seed-emoji">${cfg.emoji}</span>
          <span class="qb-seed-info">
            <span class="qb-seed-name">${isFav ? "★ " : ""}${cfg.name}</span>
            <span class="qb-seed-meta">⏱ ${growthLabel}${invCount > 0 ? ` · 🎒${invCount}` : ""}</span>
          </span>
          <span class="qb-seed-price${canAfford ? "" : " qb-price-red"}">🪙 ${cfg.seedPrice || 0}</span>
        </button>
      `;
      })
      .join("");

    const dialog = document.createElement("dialog");
    dialog.id = "quick-buy-dialog";
    dialog.className = "modal quick-buy-sheet";
    dialog.innerHTML = `
      <div class="qb-card">
        <div class="qb-header">
          <span class="qb-title">🌱 Quick Plant</span>
          <span class="qb-balance">🪙 ${goldAvail}</span>
        </div>
        ${cards}
        <button class="qb-more-link" id="qb-more">⋯ More in Seed Shop</button>
      </div>
    `;

    // Event handlers
    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });

    // Seed card tap → buy 1 + plant instantly
    dialog.querySelectorAll(".qb-seed-card:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        const seedId = btn.dataset.seed;
        dialog.close();
        _quickBuyAndPlant(seedId, plotId);
      });
    });

    // Muted card tap → shake + tooltip
    dialog.querySelectorAll(".qb-seed-card[disabled]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const seedId = btn.dataset.seed;
        const cfg = crops[seedId];
        const deficit = (cfg?.seedPrice || 0) - goldAvail;
        btn.classList.add("qb-shake");
        showToast(`Need ${deficit}🪙 more`);
        setTimeout(() => btn.classList.remove("qb-shake"), 400);
      });
    });

    // "More in Seed Shop" link
    dialog.querySelector("#qb-more")?.addEventListener("click", () => {
      dialog.close();
      if (FarmGameImpl.switchFarmTab) FarmGameImpl.switchFarmTab("shop");
      else {
        const shopEl = document.querySelector(".farm-shop");
        if (shopEl) shopEl.scrollIntoView({ behavior: "smooth" });
      }
    });

    document.body.appendChild(dialog);
    import("./shared.js").then(({ safeShowModal }) => safeShowModal(dialog));
  }

  /** Buy 1 seed + plant it in the given plot (single-tap flow) */
  function _quickBuyAndPlant(seedId, plotId) {
    const cfg = crops[seedId];
    if (!cfg) return;
    const goldAvail = HUD.getGold();
    const price = cfg.seedPrice || 0;
    if (goldAvail < price) {
      showToast("❌ Not enough gold!");
      return;
    }

    // Track purchase for history-based recommendations
    _trackPurchase(seedId);

    // Optimistic: deduct gold + add to inventory
    const res = GameStore.getState("resources") || {};
    GameStore.setState("resources", { ...res, gold: res.gold - price });
    state.inventory[seedId] = (state.inventory[seedId] || 0) + 1;
    syncToStore();
    HUD.animateGoldChange(-price);

    // Now plant using the seed
    selectedSeed = seedId;
    plant(plotId);
    // plant() will deduct 1 from inventory and call the plant API

    // Buy API call (fire-and-forget, same pattern as buySeeds)
    const prevGold = goldAvail;
    const myVersion = ++buySeedVersion;
    api("/api/farm/buy-seeds", {
      userId: HUB.userId,
      cropId: seedId,
      amount: 1,
    })
      .then((data) => {
        if (buySeedVersion !== myVersion) return;
        if (data.success) {
          if (data.resources) HUD.syncFromServer(data.resources);
          state.inventory = data.inventory;
          syncToStore();
        } else {
          // Rollback gold only — do NOT re-render farm grid
          // (plant API handles inventory; re-rendering here would
          //  overwrite the already-planted optimistic plot state)
          const res = GameStore.getState("resources") || {};
          GameStore.setState("resources", { ...res, gold: prevGold });
          syncToStore();
          showToast(`❌ ${data.error}`);
        }
      })
      .catch(() => {
        if (buySeedVersion === myVersion) loadState();
      });

    // Show feedback
    showToast(`Planted ${cfg.emoji} ${cfg.name}!`);
  }

  function plant(plotId) {
    if (!selectedSeed) {
      // v7.1: Contextual Quick-Buy — show bottom sheet instead of scrolling to shop
      showQuickBuy(plotId);
      return;
    }
    const seedCount = state?.inventory?.[selectedSeed] || 0;
    if (seedCount <= 0) {
      showToast("🌾 No seeds left! Buy more in the shop ↓");
      const shopEl = document.querySelector(".farm-shop");
      if (shopEl) shopEl.scrollIntoView({ behavior: "smooth" });
      return;
    }
    // Optimistic update (instant UI feedback)
    const cropId = selectedSeed;
    state.plots[plotId] = {
      ...state.plots[plotId],
      crop: cropId,
      plantedAt: getServerNow(), // v4.9: use server-corrected time for optimistic plant
      watered: false,
      growthTime: crops[cropId]?.growthTime || 15000,
    };
    state.inventory[cropId] = Math.max(0, seedCount - 1);
    justPlantedPlot = plotId;
    syncToStore();
    render();
    renderShop();
    updateBuyBar();

    // Phase 2 Item 5: Dirt Splash particle on plant
    const plotDiv = document.querySelector(
      `.farm-plot[data-index="${plotId}"]`,
    );
    if (plotDiv) {
      const cropEmoji = plotDiv.querySelector(".crop-emoji");
      if (cropEmoji) cropEmoji.classList.add("planted-bounce");
      spawnDirtSplash(plotDiv);
    }

    // Fire-and-forget with PER-PLOT version guard (Bug 4 fix)
    const ver = (plotPlantVersions.get(plotId) || 0) + 1;
    plotPlantVersions.set(plotId, ver);
    api("/api/farm/plant", {
      userId: HUB.userId,
      plotId,
      cropId,
    })
      .then((data) => {
        // Only process if this plot hasn't been re-planted since
        if (plotPlantVersions.get(plotId) !== ver) return;
        if (data.success) {
          // Silently sync server state — NO re-render (optimistic UI is correct)
          state.plots = data.plots;
          state.inventory = data.inventory;
          syncToStore();
        } else {
          // Error: full resync from server
          const msg =
            data.error === "no seeds"
              ? "🌾 No seeds left! Buy more in the shop ↓"
              : data.error === "plot occupied"
                ? "🚫 This plot is already in use"
                : `❌ ${data.error}`;
          showToast(msg);
          loadState();
        }
      })
      .catch(() => {
        if (plotPlantVersions.get(plotId) === ver) loadState();
      });
  }

  function water(plotId) {
    // Race guard: skip if already watering this plot
    if (wateringInFlight.has(plotId)) return;
    wateringInFlight.add(plotId);

    // Optimistic update (instant UI)
    state.plots[plotId] = { ...state.plots[plotId], watered: true };
    syncToStore();
    render();

    // v7.1: Farm Juice — water shimmer + droplets
    const plotDiv = document.querySelector(
      `.farm-plot[data-index="${plotId}"]`,
    );
    if (plotDiv) {
      plotDiv.classList.add("water-shimmer");
      setTimeout(() => plotDiv.classList.remove("water-shimmer"), 1300);
      spawnWaterDroplets(plotDiv, 3);
    }

    showToast(`💧 Watered! Growth ~30% faster`);

    // Bug 4.1 fix: timeout fallback to release lock even if server is slow
    const fallbackTimer = setTimeout(
      () => wateringInFlight.delete(plotId),
      3000,
    );

    // Fire-and-forget with version guard
    const myVersion = ++waterVersion;
    api("/api/farm/water", { userId: HUB.userId, plotId })
      .then((data) => {
        clearTimeout(fallbackTimer);
        wateringInFlight.delete(plotId);
        if (waterVersion !== myVersion) return;
        if (data.success) {
          state.plots = data.plots;
          syncToStore();
        } else {
          loadState();
        }
      })
      .catch(() => {
        clearTimeout(fallbackTimer);
        wateringInFlight.delete(plotId);
        if (waterVersion === myVersion) loadState();
      });
  }

  function harvest(plotId) {
    // Optimistic: clear plot + show estimated reward instantly
    const plotSnapshot = { ...state.plots[plotId] };
    const cfg = crops[plotSnapshot.crop];
    const estimatedCoins = cfg?.sellPrice || 0;
    const estimatedXP = cfg?.xp || 0;

    state.plots[plotId] = { crop: null, plantedAt: null, watered: false };
    state.xp += estimatedXP;

    // Bug 2 fix: write harvested crop to resources.harvested in GameStore
    const res = GameStore.getState("resources") || {};
    const harvested = { ...(res.harvested || {}) };
    harvested[plotSnapshot.crop] = (harvested[plotSnapshot.crop] || 0) + 1;
    GameStore.setState("resources", { ...res, harvested: harvested });

    // v7.2: Check if harvest unlocked a new seed
    _checkNewUnlocks();

    syncToStore();

    // Phase 2 Item 5: Sparkle particle on harvest
    const plotDiv = document.querySelector(
      `.farm-plot[data-index="${plotId}"]`,
    );
    if (plotDiv) spawnFarmSparkle(plotDiv);

    // v7.1: Farm Juice — harvest pop animation + coin fly to HUD
    if (plotDiv) {
      const emoji = plotDiv.querySelector(".crop-emoji");
      if (emoji) emoji.classList.add("harvest-pop");
      spawnCoinFly(plotDiv, 3);
    }

    render();
    renderShop();
    updateBuyBar();
    renderInventory();

    // Bug 3 fix: toast shows only XP, no gold (harvest doesn't award gold)
    showToast(`${cfg?.emoji || "🌱"} Harvested! +${estimatedXP}XP`);
    SoundEngine.harvest(); // v6.2.1: audio + haptic feedback

    // Fire-and-forget with version guard
    const myVersion = ++harvestVersion;
    api("/api/farm/harvest", { userId: HUB.userId, plotId })
      .then((data) => {
        if (harvestVersion !== myVersion) return;
        if (data.success) {
          state.plots = data.plots;
          state.xp = data.xp;
          state.level = data.level;
          if (data.resources) {
            HUD.syncFromServer(data.resources);
          }
          // Sync server harvested → resources.harvested
          if (data.harvested) syncHarvestedToStore(data.harvested);
          syncToStore();
          renderInventory();
          if (data.leveledUp) showToast(`🎉 Level Up! Lv${data.level}`);
        } else {
          loadState();
        }
      })
      .catch(() => {
        if (harvestVersion === myVersion) loadState();
      });
  }

  /* ─── Uproot (💣) ─── */
  async function uproot(plotId) {
    const plot = state?.plots?.[plotId];
    if (!plot || !plot.crop) return;
    const pct = getLocalGrowth(plot);
    if (pct >= 1) {
      showToast("🌾 Already ready — harvest it!");
      return;
    }

    // Optimistic: clear the plot (NO seed refund)
    const oldPlot = { ...plot };
    state.plots[plotId] = { crop: null, plantedAt: null, watered: false };
    syncToStore();
    render();
    showToast("💣 Uprooted! No refund.");

    try {
      const data = await api("/api/farm/uproot", {
        userId: HUB.userId,
        plotId,
      });
      if (data?.success) {
        state.plots = data.plots;
        if (data.resources) HUD.syncFromServer(data.resources);
        syncToStore();
        render();
      } else {
        // Rollback
        state.plots[plotId] = oldPlot;
        syncToStore();
        render();
        showToast(data?.error || "Uproot failed", "error");
      }
    } catch {
      state.plots[plotId] = oldPlot;
      syncToStore();
      render();
      showToast("Network error", "error");
    }
  }

  /* ─── Sell Crop ─── */
  function sellCrop(cropId, sellPrice) {
    // GameStore always available in ESM
    const res = GameStore.getState("resources") || {};
    const harvested = { ...(res.harvested || {}) };
    if (!harvested[cropId] || harvested[cropId] <= 0) {
      showToast("❌ No crops to sell!");
      return;
    }
    // Optimistic: deduct crop, add gold
    harvested[cropId]--;
    if (harvested[cropId] <= 0) delete harvested[cropId];
    const newGold = (res.gold || 0) + sellPrice;
    GameStore.setState("resources", {
      ...res,
      gold: newGold,
      harvested: harvested,
    });
    renderInventory();
    render();
    showToast(`💰 Sold! +${sellPrice}🪙`);
    HUD.animateGoldChange(sellPrice);
    HUD.updateDisplay(GameStore.getState("resources"));

    api("/api/farm/sell-crop", { userId: HUB.userId, cropId })
      .then((data) => {
        if (data?.success) {
          if (data.resources) HUD?.syncFromServer?.(data.resources);
          if (data.harvested) syncHarvestedToStore(data.harvested);
          renderInventory();
        }
      })
      .catch(() => {});
  }

  /* ─── Feed Pet (crop → energy) ─── */
  function feedPet(cropId) {
    // GameStore always available in ESM
    const res = GameStore.getState("resources") || {};
    const e = res.energy || {};
    const cfg = CROPS_CONFIG[cropId];
    const energyYield = cfg ? cfg.energyYield : 1;
    const fullnessYield = cfg ? cfg.fullnessYield : 5;

    // Bug 2.3: block feeding at max energy
    if (e.current >= e.max) {
      showToast("⚡ Energy full! Can't feed yet.");
      return;
    }
    // Satiety guard: block feeding if pet is full
    const pet = GameStore.getState("pet");
    if (pet && (pet.stats?.fullness ?? 0) >= 100) {
      showToast("🤢 Pet is too full! Wait for digestion.");
      return;
    }
    const harvested = { ...(res.harvested || {}) };
    if (!harvested[cropId] || harvested[cropId] <= 0) {
      showToast("❌ No crops to feed!");
      return;
    }
    // Optimistic: deduct crop, add dynamic energy
    harvested[cropId]--;
    if (harvested[cropId] <= 0) delete harvested[cropId];
    const newEnergy = {
      ...e,
      current: Math.min(e.max, e.current + energyYield),
    };
    GameStore.setState("resources", {
      ...res,
      energy: newEnergy,
      harvested: harvested,
    });
    // Optimistic: update pet fullness
    if (pet) {
      GameStore.setState("pet", {
        ...pet,
        stats: {
          ...pet.stats,
          fullness: Math.min(100, (pet.stats?.fullness ?? 0) + fullnessYield),
        },
        lastDigestionTimestamp: Date.now(),
      });
    }
    renderInventory();
    showToast(`🍖 Fed pet! +${energyYield}⚡`);
    HUD.updateDisplay(GameStore.getState("resources"));

    api("/api/pet/feed", { userId: HUB.userId, cropId })
      .then((data) => {
        if (data?.success) {
          if (data.resources) HUD?.syncFromServer?.(data.resources);
          if (data.harvested) syncHarvestedToStore(data.harvested);
          renderInventory();
        }
      })
      .catch(() => {});
  }

  /* ─── 7.4: Growth Time Estimate ─── */
  function formatTimeLeft(plot, pct) {
    if (pct >= 1) return "Ready!";
    const mult = plot.watered ? plot.wateringMultiplier || 0.7 : 1;
    const totalMs = (plot.growthTime || 15000) * mult;
    const remainMs = totalMs * (1 - pct);
    const secs = Math.ceil(remainMs / 1000);
    if (secs <= 0) return "Ready!";
    if (secs < 60) return `~${secs}s left`;
    const mins = Math.ceil(secs / 60);
    return `~${mins}m left`;
  }

  /* ─── Local Growth Computation (Issue 5, v4.9: clock-corrected) ─── */
  function getLocalGrowth(plot) {
    if (!plot.crop || !plot.plantedAt) return 0;
    const elapsed = getServerNow() - plot.plantedAt; // v4.9: use server-corrected time
    const mult = plot.watered ? plot.wateringMultiplier || 0.7 : 1;
    const gt = plot.growthTime || 15000;
    return Math.min(1, elapsed / (gt * mult));
  }

  /* ─── Local Growth Tick (replaces 2s polling) ─── */
  let growthTickId = null;
  let syncInterval = null;
  let _lastReadyCount = -1; // v4.15.2: Badge throttle

  function startLocalGrowthTick() {
    stopLocalGrowthTick();
    let prevHadGrowing = true; // assume growing on start
    growthTickId = setInterval(() => {
      if (!state?.plots) return;
      // v4.15.2: Skip render when farm screen is not active
      if (HUB.currentScreen !== 2) return;
      const hasGrowing = state.plots.some(
        (p) => p.crop && getLocalGrowth(p) < 1,
      );
      if (!hasGrowing && !prevHadGrowing) return; // nothing changed, skip
      // v4.11.1: Always render when transitioning from growing→done
      prevHadGrowing = hasGrowing;
      render();
      // v4.15.2: Throttle badge — only update when ready count changes
      const readyCount = state.plots.filter(
        (p) => p.crop && getLocalGrowth(p) >= 1,
      ).length;
      if (readyCount !== _lastReadyCount) {
        _lastReadyCount = readyCount;
        updateFarmBadge();
      }
    }, 500);
    // Lazy server sync every 30s for drift correction
    syncInterval = setInterval(async () => {
      if (HUB.userId) await loadState();
    }, 30000);
  }

  function stopLocalGrowthTick() {
    if (growthTickId) {
      clearInterval(growthTickId);
      growthTickId = null;
    }
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  }

  /* ─── Farm Badge Notification (Issue 7) ─── */
  function updateFarmBadge() {
    if (!state?.plots) return;
    const readyCount = state.plots.filter(
      (p) => p.crop && getLocalGrowth(p) >= 1,
    ).length;
    // Farm is screen index 2 (trivia=0, blox=1, farm=2, match3=3)
    const FARM_SCREEN = 2;
    const dot = document.querySelectorAll(".nav-dot")[FARM_SCREEN];
    const badge = document.getElementById("farm-ready-badge");
    if (dot) {
      dot.classList.toggle(
        "has-notification",
        readyCount > 0 && HUB.currentScreen !== FARM_SCREEN,
      );
    }
    if (badge) {
      if (readyCount > 0 && HUB.currentScreen !== FARM_SCREEN) {
        badge.textContent = `🌾 ×${readyCount}`;
        badge.classList.add("show");
        // Direction: screens 0,1 are LEFT of farm → point right; screen 3 is RIGHT → point left
        badge.classList.toggle("point-right", HUB.currentScreen < FARM_SCREEN);
        badge.classList.toggle("point-left", HUB.currentScreen > FARM_SCREEN);
        badge.onclick = () => {
          goToScreen(FARM_SCREEN);
        };
      } else {
        badge.classList.remove("show", "point-left", "point-right");
      }
    }
  }

  /* ─── Buy Plot Card ─── */
  const BUY_PLOT_BASE = 200;
  const MAX_PLOTS = 12;

  function getBuyPlotCost() {
    const n = state?.plots?.length ?? 6;
    return BUY_PLOT_BASE * Math.pow(2, n - 6);
  }

  function appendBuyPlotCard(grid) {
    if (!state || state.plots.length >= MAX_PLOTS) return;
    const cost = getBuyPlotCost();
    const gold = HUD.getGold();
    const canAfford = gold >= cost;
    const card = document.createElement("div");
    card.className = `farm-plot buy-plot-card${canAfford ? "" : " disabled"}`;
    card.innerHTML = `
      <div style="font-size:1.6rem;opacity:0.5">➕</div>
      <div class="plot-empty-label">Buy Plot</div>
      <div class="seed-price">🪙 ${cost}</div>
    `;
    card.title = canAfford
      ? `Buy new plot for ${cost} gold`
      : `Need ${cost} gold`;
    if (canAfford) {
      card.onclick = () => buyPlot();
    }
    grid.appendChild(card);
  }

  function buyPlot() {
    if (!state || state.plots.length >= MAX_PLOTS) return;
    const cost = getBuyPlotCost();
    const gold = HUD.getGold();
    if (gold < cost) {
      showToast("❌ Not enough gold!");
      return;
    }

    // Optimistic: add empty plot instantly
    const prevPlots = [...state.plots];
    state.plots.push({ crop: null, plantedAt: null, watered: false });
    syncToStore();
    firstRenderDone = false; // Force full rebuild to add new plot
    render();
    showToast(`🌱 New plot unlocked! (${state.plots.length}/${MAX_PLOTS})`);
    HUD.animateGoldChange(-cost);

    // Fire-and-forget
    api("/api/farm/buy-plot", { userId: HUB.userId })
      .then((data) => {
        if (data?.success) {
          state.plots = data.plots;
          if (data.resources) {
            HUD.syncFromServer(data.resources);
          }
          syncToStore();
        } else {
          // Rollback
          state.plots = prevPlots;
          syncToStore();
          firstRenderDone = false;
          render();
          showToast(`❌ ${data?.error || "Failed to buy plot"}`);
        }
      })
      .catch(() => loadState());
  }

  /* ─── Phase 2 Item 5: Visual Effects (Bounce, Splash, Sparkle) ─── */
  function spawnDirtSplash(targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height - 20;

    for (let i = 0; i < 6; i++) {
      const particle = document.createElement("div");
      particle.className = "farm-dirt-particle";
      particle.style.left = `${cx}px`;
      particle.style.top = `${cy}px`;
      particle.style.setProperty("--vx", `${(Math.random() - 0.5) * 80}px`);
      particle.style.setProperty("--vy", `${-(Math.random() * 40 + 20)}px`);
      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 600);
    }
  }

  function spawnFarmSparkle(targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    for (let i = 0; i < 8; i++) {
      const particle = document.createElement("div");
      particle.className = "farm-sparkle-particle";
      particle.textContent = "✨";
      particle.style.left = `${cx}px`;
      particle.style.top = `${cy}px`;
      particle.style.setProperty("--vx", `${(Math.random() - 0.5) * 100}px`);
      particle.style.setProperty("--vy", `${(Math.random() - 0.5) * 100}px`);
      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 800);
    }
  }

  /* ─── Screen Enter/Exit ─── */
  function onEnter() {
    // Sync with server on enter, then rely on local timer
    loadState();
    startLocalGrowthTick();
  }

  return {
    init,
    onEnter,
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
})();

export const FarmGame = FarmGameImpl;
