/* ═══════════════════════════════════════════════════
 *  Game Hub — Farm Module (v5.0.0)
 *  Plots, planting, watering, harvesting, seed shop
 *  ─ Local growth timer, diff-update fix, farm badge
 *  ─ Diff-update plots (no blink), horizontal buy bar, plot dispatcher
 *  ─ GameStore integration (slice isolation, optimistic updates)
 *  v5: Native ES Module (was IIFE)
 * ═══════════════════════════════════════════════════ */
import { GameStore } from "./store.js";
import { HUB, api, showToast } from "./shared.js";
import { HUD } from "./hud.js";
import { PetCompanion } from "./pet.js";

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

  /** Sync server-side farm.harvested → resources.__harvested in GameStore */
  function syncHarvestedToStore(harvested) {
    if (!harvested) return;
    const res = GameStore.getState("resources") || {};
    GameStore.setState("resources", { ...res, __harvested: { ...harvested } });
  }
  /** Pull state from GameStore → local (deep clone to prevent shared refs)
   *  v4.16: Dirty check — skip clone + re-render when store state matches local.
   */
  let _lastStorePlotsSig = "";
  function syncFromStore() {
    {
      const storeState = GameStore.getState("farm");
      if (storeState) {
        // v4.16: Dirty flag — skip expensive clone if plots haven't changed
        const sig = JSON.stringify(storeState.plots);
        if (sig === _lastStorePlotsSig) return;
        _lastStorePlotsSig = sig;
        state = {
          ...storeState,
          plots: storeState.plots
            ? storeState.plots.map((p) => ({ ...p }))
            : [],
          harvested: storeState.harvested ? { ...storeState.harvested } : {},
        };
      }
    }
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
        window.__cropsCache = cached.data;
      }
    } catch (_) {}

    // Register farm slice in the store
    GameStore.registerSlice("farm", null);

    const cropsPromise = window.__cropsPromise || api("/api/content/crops");
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
      window.__cropsCache = cropsData; // Expose for energy modal
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
      // Bug 2 fix: sync server harvested → resources.__harvested
      syncHarvestedToStore(stateData.harvested);
      if (stateData.offlineReport) {
        showWelcomeBack(stateData.offlineReport);
      }
      syncToStore();
      render();
      renderShop();
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
      const plot = e.target.closest(".farm-plot");
      if (!plot || plot.classList.contains("skeleton")) return;
      const idx = parseInt(plot.dataset.index, 10);
      if (!isNaN(idx)) onPlotClick(idx);
      else if (plot.classList.contains("buy-plot-card")) buyPlot();
    });

    // Farm panel tab switching
    const tabInv = $("farm-tab-inv");
    const tabShop = $("farm-tab-shop");
    if (tabInv && tabShop) {
      tabInv.onclick = () => switchFarmTab("inv");
      tabShop.onclick = () => switchFarmTab("shop");
    }
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
          window.__cropsCache = cropsData;
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
      // Bug 2 fix: sync server harvested → resources.__harvested
      syncHarvestedToStore(data.harvested);
      if (data.offlineReport) {
        showWelcomeBack(data.offlineReport);
      }
      syncToStore();
      render();
      renderInventory();
    }
  }

  /* ─── Welcome Back Modal ─── */
  function showWelcomeBack(report) {
    // Build body lines
    const lines = [];
    lines.push(
      `<p class="text-dim" style="margin:0 0 8px">⏰ You were away for ${report.offlineMinutes || 0} min</p>`,
    );

    // Harvested crops
    const harvestedEntries = Object.entries(report.harvested || {});
    if (harvestedEntries.length > 0) {
      const items = harvestedEntries
        .map(([id, qty]) => {
          const c = crops[id];
          return c ? `${c.emoji}×${qty}` : `${id}×${qty}`;
        })
        .join(", ");
      lines.push(
        `<div style="margin:4px 0">🌾 <strong>Harvested:</strong> ${items}</div>`,
      );
    }

    // Planted crops
    const plantedEntries = Object.entries(report.planted || {});
    if (plantedEntries.length > 0) {
      const items = plantedEntries
        .map(([id, qty]) => {
          const c = crops[id];
          return c ? `${c.emoji}×${qty}` : `${id}×${qty}`;
        })
        .join(", ");
      lines.push(
        `<div style="margin:4px 0">🌱 <strong>Planted:</strong> ${items}</div>`,
      );
    }

    // Auto-watered
    if (report.autoWatered > 0) {
      lines.push(
        `<div style="margin:4px 0">💧 <strong>Watered:</strong> ${report.autoWatered} crop${report.autoWatered > 1 ? "s" : ""}</div>`,
      );
    }

    // Energy + XP
    if (report.energyConsumed > 0 || report.xpGained > 0) {
      const parts = [];
      if (report.energyConsumed > 0)
        parts.push(`⚡${report.energyConsumed} energy used`);
      if (report.xpGained > 0) parts.push(`✨${report.xpGained} XP gained`);
      lines.push(
        `<div style="margin:6px 0;opacity:0.7;font-size:0.8rem">${parts.join(" • ")}</div>`,
      );
    }

    // Create overlay
    const overlay = document.createElement("div");
    overlay.className = "overlay show";
    overlay.id = "welcome-back-overlay";
    overlay.innerHTML = `
      <div class="overlay-card" style="text-align:center;max-width:320px">
        <h2 style="margin:0 0 10px">🐾 Welcome Back!</h2>
        ${lines.join("")}
        <button class="btn btn-primary" style="margin-top:14px;width:100%" id="wb-dismiss">Let's Go!</button>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById("wb-dismiss").onclick = () => overlay.remove();
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
      div.innerHTML = `<div class="plot-empty-label">Empty Plot</div><div style="font-size:1.4rem;opacity:0.3">🌱</div>`;
      div.title = selectedSeed
        ? `Plant ${crops[selectedSeed]?.name || selectedSeed}`
        : "Select a seed first";
    }
  }

  /* ─── Seed Shop Grid ─── */
  function renderShop() {
    const grid = $("farm-shop-grid");
    grid.innerHTML = "";
    for (const [id, cfg] of Object.entries(crops)) {
      const count = state?.inventory?.[id] || 0;
      const card = document.createElement("div");
      const isSelected = selectedSeed === id;
      const isEmpty = count <= 0;
      card.className = `farm-seed-card${isSelected ? " selected" : ""}${isEmpty ? " no-seeds" : ""}`;
      card.innerHTML = `
        <div class="seed-emoji">${cfg.emoji}</div>
        <div class="seed-name">${cfg.name}</div>
        <div class="seed-price">🪙 ${cfg.seedPrice}</div>
        <div class="seed-count">×${count}</div>
        <button class="seed-quick-buy" data-crop="${id}" title="Buy 1 ${cfg.name}">🛒 Buy</button>
      `;
      card.onclick = (e) => {
        if (e.target.closest(".seed-quick-buy")) return; // let quick-buy handle itself
        selectSeed(id);
      };
      // v4.9: Quick-buy button handler (buy 1 seed instantly)
      const quickBuyBtn = card.querySelector(".seed-quick-buy");
      if (quickBuyBtn) {
        quickBuyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          // Select this seed + buy 1
          selectedSeed = id;
          buyQty = 1;
          buySeeds();
        });
      }
      grid.appendChild(card);
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
  }

  /* ─── Inventory Rendering (reads __harvested from resources slice) ─── */
  function renderInventory() {
    const grid = $("farm-inventory-grid");
    if (!grid) return;

    let harvested = {};
    {
      harvested = GameStore.getState("resources")?.__harvested || {};
    }

    const entries = Object.entries(harvested).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      grid.innerHTML =
        '<div class="farm-inv-empty">No crops harvested yet</div>';
      return;
    }

    grid.innerHTML = "";
    for (const [cropId, qty] of entries) {
      const cfg = crops[cropId] || {};
      // Sell price = ceil((seedPrice * 0.5) * (growthTimeSec * 0.25))
      const growSec = (cfg.growthTime || 15000) / 1000;
      const sellPrice = Math.ceil(
        (cfg.seedPrice || 0) * 0.5 * (growSec * 0.25),
      );
      const item = document.createElement("div");
      item.className = "farm-inv-item";
      item.innerHTML = `
        <span class="farm-inv-emoji">${cfg.emoji || "🌱"}</span>
        <div class="farm-inv-info">
          <div class="farm-inv-name">${cfg.name || cropId} <span class="farm-inv-qty">×${qty}</span></div>
        </div>
        <div class="farm-inv-actions">
          <button class="farm-inv-btn sell" data-crop="${cropId}" title="Sell for ${sellPrice}🪙">💰 Sell</button>
          <button class="farm-inv-btn feed" data-crop="${cropId}" title="Feed pet (+2⚡)">🍖 Feed</button>
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
    updateBuyBar();
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
    {
      const res = GameStore.getState("resources") || {};
      GameStore.setState("resources", { ...res, gold: res.gold - totalCost });
    }
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
          {
            const res = GameStore.getState("resources") || {};
            GameStore.setState("resources", { ...res, gold: prevGold });
          }
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

  function plant(plotId) {
    if (!selectedSeed) {
      showToast("Select a seed first!");
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

    // Bug 2 fix: write harvested crop to resources.__harvested in GameStore
    {
      const res = GameStore.getState("resources") || {};
      const harvested = { ...(res.__harvested || {}) };
      harvested[plotSnapshot.crop] = (harvested[plotSnapshot.crop] || 0) + 1;
      GameStore.setState("resources", { ...res, __harvested: harvested });
    }

    syncToStore();
    render();
    renderShop();
    updateBuyBar();
    renderInventory();

    // Bug 3 fix: toast shows only XP, no gold (harvest doesn't award gold)
    showToast(`${cfg?.emoji || "🌱"} Harvested! +${estimatedXP}XP`);

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
          // Sync server harvested → resources.__harvested
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

  /* ─── Sell Crop ─── */
  function sellCrop(cropId, sellPrice) {
    // GameStore always available in ESM
    const res = GameStore.getState("resources") || {};
    const harvested = { ...(res.__harvested || {}) };
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
      __harvested: harvested,
    });
    renderInventory();
    render();
    showToast(`💰 Sold! +${sellPrice}🪙`);
    {
      HUD.animateGoldChange(sellPrice);
      HUD.updateDisplay(GameStore.getState("resources"));
    }

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
    // Bug 2.3: block feeding at max energy
    if (e.current >= e.max) {
      showToast("⚡ Energy full! Can't feed yet.");
      return;
    }
    const harvested = { ...(res.__harvested || {}) };
    if (!harvested[cropId] || harvested[cropId] <= 0) {
      showToast("❌ No crops to feed!");
      return;
    }
    // Optimistic: deduct crop, add 2 energy (matches server FEED_ENERGY)
    harvested[cropId]--;
    if (harvested[cropId] <= 0) delete harvested[cropId];
    const newEnergy = { ...e, current: Math.min(e.max, e.current + 2) };
    GameStore.setState("resources", {
      ...res,
      energy: newEnergy,
      __harvested: harvested,
    });
    renderInventory();
    showToast(`🍖 Fed pet! +2⚡`);
    {
      HUD.updateDisplay(GameStore.getState("resources"));
    }

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
          if (typeof goToScreen === "function") goToScreen(FARM_SCREEN);
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
