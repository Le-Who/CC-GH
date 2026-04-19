/* ═══════════════════════════════════════════════════
 *  Farm Module — Plot Grid
 *  Renders the farm grid (plots), handles growth ticks,
 *  diff-updates, harvest-all FAB, and farm nav badge.
 * ═══════════════════════════════════════════════════ */
import { HUB, goToScreen } from "../shared.js";
import { spawnCoinFly, spawnWaterDroplets } from "../effects.js";
import { spawnDirtSplash, spawnFarmSparkle } from "./effects.js";
import { $, getLocalGrowth, formatTimeLeft } from "./utils.js";

// ── Module state ──
let firstRenderDone = false;
// RC-A fix: Map<plotId, expiryTimestamp> — protects the plant-burst animation
// window without races against the 500ms growth tick. Each entry expires after
// PLANT_ANIM_TTL ms; render() checks Date.now() instead of relying on timers.
const justPlantedExpiry = new Map();
const PLANT_ANIM_TTL = 1500; // ms — covers 500ms CSS burst + 2 tick intervals
let growthTickId = null;
let syncInterval = null;
let _lastReadyCount = -1;

// References injected by coordinator
let _state = null;
let _crops = {};
let _selectedSeed = null;
let _actions = null; // { plant, water, harvest, harvestAll, loadState, renderShop, renderInventory, getSelectedSeed }

export function setPlotGridDeps(deps) {
  _actions = deps;
}

export function syncPlotGridState(state, crops, selectedSeed) {
  _state = state;
  _crops = crops;
  _selectedSeed = selectedSeed;
}

/* ─── Skeleton Rendering ─── */
export function showSkeleton() {
  firstRenderDone = false;
  const grid = $("farm-plots");
  if (!grid) return;
  grid.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const div = document.createElement("div");
    div.className = "farm-plot skeleton";
    div.innerHTML = `<div class="skeleton-circle"></div><div class="skeleton-line"></div>`;
    grid.appendChild(div);
  }
}

/* ─── Render Plots (diff-update) ─── */
export function render() {
  if (!_state) return;
  const gold = _actions?.getGold?.() || 0;
  const coinsEl = $("farm-coins");
  const xpEl = $("farm-xp");
  const levelEl = $("farm-level");
  if (coinsEl) coinsEl.textContent = gold;
  if (xpEl) xpEl.textContent = _state.xp;
  if (levelEl) levelEl.textContent = `Lv${_state.level}`;

  const grid = $("farm-plots");
  if (!grid) return;
  const existing = grid.querySelectorAll(".farm-plot:not(.skeleton)");
  const isFirstRender = !firstRenderDone;

  if (existing.length === _state.plots.length && !isFirstRender) {
    _state.plots.forEach((plot, i) => {
      const div = existing[i];
      const pct = getLocalGrowth(plot);
      const isReady = plot.crop && pct >= 1;
      const serverGrowth = typeof plot.growth === "number" ? plot.growth : pct;
      const isAlmostReady = plot.crop && pct >= 0.95 && serverGrowth < 1;
      const currentCrop = div.dataset.crop || "";
      const currentWatered = div.dataset.watered === "true";
      const structureChanged = currentCrop !== (plot.crop || "");
      const wateredChanged = !!plot.watered !== currentWatered;

      if (structureChanged || wateredChanged) {
        rebuildPlot(div, plot, i, pct, isReady, false);
      } else if (plot.crop) {
        const fill = div.querySelector(".growth-bar-fill");
        // RC-A: Don't let the growth tick clobber the plant-burst animation.
        // justPlantedExpiry holds a wall-clock expiry — no timer races possible.
        const burstActive = justPlantedExpiry.has(i) && Date.now() < justPlantedExpiry.get(i);
        if (fill && !burstActive) {
          fill.style.width = Math.round(pct * 100) + "%";
          fill.classList.toggle("done", isReady);
        }
        if (!burstActive) justPlantedExpiry.delete(i); // GC expired entries
        const timeLabel = div.querySelector(".growth-time-label");
        if (isReady) {
          if (timeLabel) timeLabel.remove();
          const uprootBtn = div.querySelector(".farm-uproot-btn");
          if (uprootBtn) uprootBtn.remove();
        } else if (timeLabel) {
          timeLabel.textContent = formatTimeLeft(plot, pct);
        }
        const waterBtn = div.querySelector(".farm-water-btn");
        if (waterBtn && isReady) waterBtn.remove();
      }
      div.classList.toggle("empty", !plot.crop);
      div.classList.toggle("ready", !!isReady);
      div.classList.toggle("almost-ready", !!isAlmostReady);
      div.dataset.index = i;
    });
  } else {
    // Full rebuild (first render)
    grid.innerHTML = "";
    _state.plots.forEach((plot, i) => {
      const div = document.createElement("div");
      const pct = getLocalGrowth(plot);
      const isReady = plot.crop && pct >= 1;
      rebuildPlot(div, plot, i, pct, isReady, isFirstRender);
      grid.appendChild(div);
    });
    appendBuyPlotCard(grid);
    firstRenderDone = true;
  }

  _updateFarmNavDot();
  _updateHarvestAllButton();
}

export function forceFullRebuild() {
  firstRenderDone = false;
}

function _updateHarvestAllButton() {
  const readyCount =
    _state?.plots?.filter((p) => p.crop && getLocalGrowth(p) >= 1).length || 0;
  let btn = document.getElementById("farm-harvest-all-btn");
  if (readyCount >= 2) {
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "farm-harvest-all-btn";
      btn.className = "farm-harvest-all-fab";
      btn.addEventListener("click", () => _actions?.harvestAll?.());
      const grid = $("farm-plots");
      if (grid) grid.parentNode.insertBefore(btn, grid);
    }
    btn.textContent = `🌾 Harvest All (${readyCount})`;
    btn.style.display = "";
  } else if (btn) {
    btn.style.display = "none";
  }
}

function _updateFarmNavDot() {
  const tab = document.getElementById("nav-tab-farm");
  if (!tab || !_state?.plots) return;
  const hasReady = _state.plots.some((p) => {
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

  if (plot.crop) {
    const cfg = _crops[plot.crop] || {};
    const isJustPlanted = justPlantedExpiry.has(i) && Date.now() < justPlantedExpiry.get(i);
    const displayPct = isJustPlanted ? 100 : Math.round(pct * 100);

    div.innerHTML = `
      <div class="crop-emoji ${isJustPlanted || (pct > 0 && pct < 1) ? "animate-grow" : ""}">${cfg.emoji || "🌱"}</div>
      <div class="crop-name">${cfg.name || plot.crop}</div>
      <div class="growth-bar"><div class="growth-bar-fill${isReady ? " done" : ""}${isJustPlanted ? " plant-burst" : ""}" style="width:${displayPct}%"></div></div>
      ${!isReady ? `<div class="growth-time-label">${formatTimeLeft(plot, pct)}</div>` : ""}
      ${!isReady ? '<button class="farm-uproot-btn" title="Hold 2.5s to uproot">💣</button>' : ""}
      ${!plot.watered && !isReady ? '<button class="farm-water-btn" title="Water">💧</button>' : ""}
      ${plot.watered ? '<button class="farm-water-btn watered" disabled>💧</button>' : ""}
    `;
    div.title = isReady ? "Click to harvest!" : "Growing...";
  } else {
    const selectedSeed = _actions?.getSelectedSeed?.() || _selectedSeed;
    const hasSeeds =
      selectedSeed && (_state?.inventory?.[selectedSeed] || 0) > 0;
    const ctaText = hasSeeds
      ? `Plant ${_crops[selectedSeed]?.emoji || "🌱"} ${_crops[selectedSeed]?.name || selectedSeed}`
      : "Tap to Plant 🌱";
    div.innerHTML = `<div class="plot-empty-label">${ctaText}</div>`;
    div.title = hasSeeds
      ? `Plant ${_crops[selectedSeed]?.name || selectedSeed}`
      : "Select a seed from the shop";
  }
}

/** RC-A: Mark a plot as freshly planted; protects its bar from growth-tick zeroing
 *  for PLANT_ANIM_TTL ms using wall-clock time (no timers, no races). */
export function setJustPlantedPlot(plotId) {
  justPlantedExpiry.set(plotId, Date.now() + PLANT_ANIM_TTL);
}

/* ─── Buy Plot Card ─── */
const BUY_PLOT_BASE = 200;
const MAX_PLOTS = 12;

export function getBuyPlotCost(plotCount) {
  const n = plotCount ?? 6;
  return BUY_PLOT_BASE * Math.pow(2, n - 6);
}

function appendBuyPlotCard(grid) {
  if (!_state || _state.plots.length >= MAX_PLOTS) return;
  const cost = getBuyPlotCost(_state.plots.length);
  const gold = _actions?.getGold?.() || 0;
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
    card.onclick = () => _actions?.buyPlot?.();
  }
  grid.appendChild(card);
}

/* ─── Farm Badge Notification ─── */
export function updateFarmBadge() {
  if (!_state?.plots) return;
  const readyCount = _state.plots.filter(
    (p) => p.crop && getLocalGrowth(p) >= 1,
  ).length;
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
      badge.classList.toggle("point-right", HUB.currentScreen < FARM_SCREEN);
      badge.classList.toggle("point-left", HUB.currentScreen > FARM_SCREEN);
      badge.onclick = () => goToScreen(FARM_SCREEN);
    } else {
      badge.classList.remove("show", "point-left", "point-right");
    }
  }
}

/* ─── Local Growth Tick ─── */
export function startLocalGrowthTick() {
  stopLocalGrowthTick();
  let prevHadGrowing = true;
  growthTickId = setInterval(() => {
    if (!_state?.plots) return;
    if (HUB.currentScreen !== 2) return;
    const hasGrowing = _state.plots.some(
      (p) => p.crop && getLocalGrowth(p) < 1,
    );
    if (!hasGrowing && !prevHadGrowing) return;
    prevHadGrowing = hasGrowing;
    render();
    const readyCount = _state.plots.filter(
      (p) => p.crop && getLocalGrowth(p) >= 1,
    ).length;
    if (readyCount !== _lastReadyCount) {
      _lastReadyCount = readyCount;
      updateFarmBadge();
    }
  }, 500);
  syncInterval = setInterval(async () => {
    if (HUB.userId) _actions?.loadState?.();
  }, 30000);
}

export function stopLocalGrowthTick() {
  if (growthTickId) {
    clearInterval(growthTickId);
    growthTickId = null;
  }
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/** Animate a plot after planting (bounce + dirt splash) */
export function animatePlant(plotId) {
  const plotDiv = document.querySelector(`.farm-plot[data-index="${plotId}"]`);
  if (plotDiv) {
    const cropEmoji = plotDiv.querySelector(".crop-emoji");
    if (cropEmoji) cropEmoji.classList.add("planted-bounce");
    spawnDirtSplash(plotDiv);
  }
}

/** Animate a plot after harvesting (sparkle + coin fly) */
export function animateHarvest(plotId) {
  const plotDiv = document.querySelector(`.farm-plot[data-index="${plotId}"]`);
  if (plotDiv) {
    spawnFarmSparkle(plotDiv);
    const emoji = plotDiv.querySelector(".crop-emoji");
    if (emoji) emoji.classList.add("harvest-pop");
    spawnCoinFly(plotDiv, 3);
  }
}

/** Animate a plot after watering (shimmer + droplets) */
export function animateWater(plotId) {
  const plotDiv = document.querySelector(`.farm-plot[data-index="${plotId}"]`);
  if (plotDiv) {
    plotDiv.classList.add("water-shimmer");
    setTimeout(() => plotDiv.classList.remove("water-shimmer"), 1300);
    spawnWaterDroplets(plotDiv, 3);
  }
}
