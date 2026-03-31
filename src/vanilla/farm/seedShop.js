/* ═══════════════════════════════════════════════════
 *  Farm Module — Seed Shop
 *  Shop grid, featured shelf, seed selection, buy logic.
 * ═══════════════════════════════════════════════════ */
import { HUB, showToast, apiBatched } from "../shared.js";
import {
  CROPS as CROPS_CONFIG,
  getUnlockedSeeds,
  BOOSTER_CONFIG,
} from "/game-logic.js";
import { GameStore } from "../store.js";
import { HUD } from "../hud.js";
import {
  $,
  formatGrowthTime,
  loadBuyQtys,
  saveBuyQty,
  getPurchaseHistory,
} from "./utils.js";

// ── Module state ──
let _state = null;
let _crops = {};
let _selectedSeed = null;
let _buyQty = 1;
let _shelfTimerInterval = null;
let _buySeedVersion = 0;
let _actions = null;

export function setSeedShopDeps(deps) {
  _actions = deps;
}

export function syncSeedShopState(state, crops) {
  _state = state;
  _crops = crops;
}

export function getSelectedSeed() {
  return _selectedSeed;
}

export function getBuyQty() {
  return _buyQty;
}

/* ═══ Player Stats Helper ═══ */
function _getPlayerStats() {
  const res = GameStore.getState("resources") || {};
  const harvested = res.harvested || {};
  let totalHarvests = 0;
  for (const key in harvested) {
    if (Object.hasOwn(harvested, key)) {
      totalHarvests += harvested[key];
    }
  }
  const goldEarned = res.gold || 0;
  const plotsBought = _state?.plots?.length || 6;

  // Authority order: server-synced state → localStorage fallback
  // _state.questsCompleted is populated from /api/farm/state and
  // from quest submit responses. localStorage is kept in sync.
  const serverQuests = typeof _state?.questsCompleted === "number"
    ? _state.questsCompleted
    : null;
  const lsQuests = parseInt(
    localStorage.getItem("hub_quests_completed") || "0",
    10,
  );
  const questsCompleted = serverQuests !== null
    ? Math.max(serverQuests, lsQuests)
    : lsQuests;

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

export function computeUnlocked() {
  return getUnlockedSeeds(_getPlayerStats());
}

/** Check for fresh unlocks and show celebration toast */
export function checkNewUnlocks() {
  const unlocked = computeUnlocked();
  const seenKey = "hub_unlocked_seeds_seen";
  try {
    const seen = JSON.parse(localStorage.getItem(seenKey) || "[]");
    const fresh = unlocked.filter((id) => !seen.includes(id));
    if (fresh.length > 0) {
      for (const id of fresh) {
        const cfg = _crops[id] || CROPS_CONFIG[id];
        if (cfg) showToast(`🔓 New seed unlocked: ${cfg.emoji} ${cfg.name}!`);
      }
      localStorage.setItem(seenKey, JSON.stringify(unlocked));
      renderShop();
    }
  } catch {
    /* localStorage error — skip */
  }
}

/* ─── Select Seed ─── */
export function selectSeed(id) {
  if (_selectedSeed === id) {
    _selectedSeed = null;
  } else {
    _selectedSeed = id;
    const stored = loadBuyQtys();
    _buyQty = stored[id] || 1;
  }
  renderShop();
  const bar = $("farm-buy-bar");
  if (bar) bar.style.display = "none";
  _actions?.render?.();
}

/* ─── Buy Seeds ─── */
export function buySeeds(cropId) {
  const cfg = _crops[cropId];
  if (!cfg) return;
  const totalCost = cfg.seedPrice * _buyQty;
  const goldAvail = HUD.getGold();
  if (goldAvail < totalCost) {
    showToast("❌ Not enough gold!");
    return;
  }
  const prevGold = goldAvail;
  const res = GameStore.getState("resources") || {};
  GameStore.setState("resources", { ...res, gold: res.gold - totalCost });
  const prevInventory = { ..._state.inventory };
  const savedQty = _buyQty;
  _state.inventory[cropId] = (_state.inventory[cropId] || 0) + savedQty;
  _actions?.syncToStore?.();
  _actions?.render?.();
  renderShop();
  showToast(`Bought ${savedQty}× ${cfg.emoji} ${cfg.name} seeds`);
  HUD.animateGoldChange(-totalCost);
  _buyQty = 1;
  if (_selectedSeed) saveBuyQty(_selectedSeed, 1);

  const myVersion = ++_buySeedVersion;
  apiBatched("/api/farm/buy-seeds", {
    userId: HUB.userId,
    cropId,
    amount: savedQty,
  })
    .then((data) => {
      if (_buySeedVersion !== myVersion || data._optimistic) return;
      if (data.success) {
        if (data.resources) HUD.syncFromServer(data.resources);
        if (_buySeedVersion === myVersion && data.inventory) {
          _state.inventory = data.inventory;
        }
        _actions?.syncToStore?.();
      } else {
        const res = GameStore.getState("resources") || {};
        GameStore.setState("resources", { ...res, gold: prevGold });
        _state.inventory = prevInventory;
        _actions?.syncToStore?.();
        _actions?.render?.();
        renderShop();
        showToast(`❌ ${data.error}`);
      }
    })
    .catch(() => {
      if (_buySeedVersion === myVersion) _actions?.loadState?.();
    });
}

/* ═══ Featured Seed Shelf ═══ */
export function renderFeaturedShelf() {
  const container = $("featured-shelf-container");
  if (!container) return;
  const unlocked = computeUnlocked();
  if (unlocked.length < 3) {
    container.innerHTML = "";
    return;
  }

  const ROTATION_MS = 4 * 3600_000;
  const rotationKey = Math.floor(Date.now() / ROTATION_MS);
  const seeded = [...unlocked].sort((a, b) => {
    const ha = ((rotationKey * 2654435761 + a.charCodeAt(0) * 31) >>> 0) % 1000;
    const hb = ((rotationKey * 2654435761 + b.charCodeAt(0) * 31) >>> 0) % 1000;
    return ha - hb;
  });

  const history = getPurchaseHistory();
  const purchased = new Set(history.map((h) => h.seedId));
  const untried = seeded.filter((id) => !purchased.has(id));
  const tried = seeded.filter((id) => purchased.has(id));
  const profitRanked = tried.sort((a, b) => {
    const cfgA = _crops[a] || CROPS_CONFIG[a] || {};
    const cfgB = _crops[b] || CROPS_CONFIG[b] || {};
    return (
      (cfgB.sellPrice || 1) / (cfgB.seedPrice || 1) -
      (cfgA.sellPrice || 1) / (cfgA.seedPrice || 1)
    );
  });

  const picks = [];
  if (untried.length > 0) picks.push(untried[0]);
  for (const id of profitRanked) {
    if (picks.length >= 4) break;
    if (!picks.includes(id)) picks.push(id);
  }
  for (const id of seeded) {
    if (picks.length >= 4) break;
    if (!picks.includes(id)) picks.push(id);
  }

  const nextRotation = (rotationKey + 1) * ROTATION_MS;
  const msLeft = nextRotation - Date.now();
  const hLeft = Math.floor(msLeft / 3600_000);
  const mLeft = Math.floor((msLeft % 3600_000) / 60_000);
  const timerText = hLeft > 0 ? `⟳ ${hLeft}h ${mLeft}m` : `⟳ ${mLeft}m`;

  const cards = picks
    .map((id) => {
      const cfg = _crops[id] || CROPS_CONFIG[id] || {};
      const isNew = !purchased.has(id);
      return `<div class="featured-shelf-card${isNew ? " fs-untried" : ""}" data-seed="${id}">
      <span class="fs-emoji">${cfg.emoji || "🌱"}</span>
      <span class="fs-name">${cfg.name || id}</span>
      <span class="fs-price">🪙${cfg.seedPrice || "?"}</span>
    </div>`;
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

  const collapseBtn = container.querySelector(".shelf-collapse-btn");
  if (collapseBtn) {
    collapseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      container.classList.toggle("shelf-collapsed");
    });
  }

  container.querySelectorAll(".featured-shelf-card").forEach((card) => {
    card.addEventListener("click", () => {
      const seedId = card.dataset.seed;
      if (seedId) {
        _selectedSeed = seedId;
        const emptyIdx = _state?.plots?.findIndex((p) => !p.crop);
        if (emptyIdx >= 0) {
          _actions?.showQuickBuy?.(emptyIdx);
        } else {
          const prevQty = _buyQty;
          _buyQty = 1;
          buySeeds(seedId);
          _buyQty = prevQty;
        }
      }
    });
  });

  if (_shelfTimerInterval) clearInterval(_shelfTimerInterval);
  _shelfTimerInterval = setInterval(() => {
    const now = Date.now();
    const currentKey = Math.floor(now / ROTATION_MS);
    if (currentKey !== rotationKey) {
      renderFeaturedShelf();
      return;
    }
    const ms = (currentKey + 1) * ROTATION_MS - now;
    const h = Math.floor(ms / 3600_000);
    const m = Math.floor((ms % 3600_000) / 60_000);
    const timerEl = container.querySelector(".featured-shelf-timer");
    if (timerEl) timerEl.textContent = h > 0 ? `⟳ ${h}h ${m}m` : `⟳ ${m}m`;
  }, 60_000);
}

/* ─── Shop Grid ─── */
export function renderShop() {
  const grid = $("farm-shop-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const allEntries = Object.entries(_crops).filter(
    ([id, cfg]) =>
      typeof cfg === "object" && cfg !== null && !id.startsWith("__"),
  );
  const unlocked = computeUnlocked();

  const withProfit = allEntries.map(([id, cfg]) => {
    const growSec =
      (CROPS_CONFIG[id]?.growthTime || cfg.growthTime || 15000) / 1000;
    const sellPrice = CROPS_CONFIG[id]?.sellPrice || cfg.sellPrice || 0;
    const ratio = cfg.seedPrice > 0 ? sellPrice / cfg.seedPrice : 0;
    return { id, cfg, sellPrice, ratio, growSec };
  });

  const unlockedWithProfit = withProfit.filter((s) => unlocked.includes(s.id));
  const bestPick =
    unlockedWithProfit.length > 0
      ? unlockedWithProfit.reduce((best, s) =>
          s.ratio > best.ratio ? s : best,
        )
      : null;

  const quickGrow = unlockedWithProfit
    .filter((s) => s.growSec < 60)
    .sort((a, b) => a.growSec - b.growSec);
  const bestValue = [...unlockedWithProfit]
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3);
  const sections = [];
  if (bestValue.length > 0)
    sections.push({ label: "💰 Best Value", seeds: bestValue });
  if (quickGrow.length > 0)
    sections.push({ label: "⚡ Quick Grow", seeds: quickGrow });
  const allSorted = [...withProfit].sort(
    (a, b) => (a.cfg.seedPrice || 0) - (b.cfg.seedPrice || 0),
  );
  sections.push({ label: "🌱 All Seeds", seeds: allSorted });

  const rendered = new Set();
  for (const section of sections) {
    const sectionSeeds = section.seeds.filter(
      (s) => !rendered.has(s.id) || section.label === "🌱 All Seeds",
    );
    if (sectionSeeds.length === 0) continue;
    const header = document.createElement("div");
    header.className = "shop-section-header";
    header.textContent = section.label;
    grid.appendChild(header);

    for (const { id, cfg, sellPrice, ratio } of sectionSeeds) {
      if (section.label !== "🌱 All Seeds" && rendered.has(id)) continue;
      rendered.add(id);
      const isLocked = !unlocked.includes(id);
      const count = _state?.inventory?.[id] || 0;
      const card = document.createElement("div");
      const isSelected = _selectedSeed === id;
      const isEmpty = count <= 0;
      const isBest = bestPick && id === bestPick.id;
      const canonicalGrowth =
        CROPS_CONFIG[id]?.growthTime || cfg.growthTime || 15000;
      const growthLabel = formatGrowthTime(canonicalGrowth);

      if (isLocked) {
        const condition = CROPS_CONFIG[id]?.unlockCondition;
        card.className = "farm-seed-card locked";
        card.innerHTML = `
          <div class="seed-emoji">🔒</div>
          <div class="seed-info-col">
            <div class="seed-name">${cfg.name}</div>
            <div class="seed-lock-label">${condition?.label || "Locked"}</div>
          </div>`;
        grid.appendChild(card);
        continue;
      }

      card.className = `farm-seed-card${isSelected ? " selected" : ""}${isEmpty ? " no-seeds" : ""}${isBest ? " best-pick" : ""}`;
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
        </div>`;
      card.onclick = (e) => {
        if (e.target.closest(".seed-quick-buy")) return;
        if (e.target.closest(".seed-buy-expanded")) return;
        selectSeed(id);
      };
      const quickBuyBtn = card.querySelector(".seed-quick-buy");
      if (quickBuyBtn) {
        quickBuyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          _selectedSeed = id;
          _buyQty = 1;
          buySeeds(id);
        });
      }
      if (isSelected) {
        const totalCost = cfg.seedPrice * _buyQty;
        const goldAvail = HUD.getGold();
        const canAfford = goldAvail >= totalCost;
        const expandRow = document.createElement("div");
        expandRow.className = "seed-buy-expanded";
        expandRow.innerHTML = `
          <div class="sbe-stepper">
            <button class="sbe-step step-outer" data-d="-10">−10</button>
            <button class="sbe-step" data-d="-1">−</button>
            <span class="sbe-qty">${_buyQty}</span>
            <button class="sbe-step" data-d="1">+</button>
            <button class="sbe-step step-outer" data-d="10">+10</button>
          </div>
          <div class="sbe-actions">
            <span class="sbe-cost">🪙 ${totalCost}</span>
            <button class="sbe-buy${canAfford ? "" : " disabled"}">Buy</button>
          </div>`;
        expandRow.querySelectorAll(".sbe-step").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const d = parseInt(btn.dataset.d, 10);
            _buyQty = Math.max(1, Math.min(99, _buyQty + d));
            if (_selectedSeed) saveBuyQty(_selectedSeed, _buyQty);
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

/* ─── Booster Button ─── */
export function renderBoosterButton(api) {
  const boosters = _state?._boosters;
  let btn = document.getElementById("farm-booster-btn");
  const fertCfg = BOOSTER_CONFIG?.fertilizer;
  if (!fertCfg) return;
  const isActive =
    boosters?.fertilizer?.active && boosters.fertilizer.expiresAt > Date.now();
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
        _state._boosters = data.boosters;
        if (data.resources) HUD.syncFromServer(data.resources);
        renderBoosterButton(api);
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

/* ─── Streak Badge ─── */
export function renderStreakBadge() {
  const streak = _state?._streak;
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

/* ─── Theme Application ─── */
export function applyThemeClass() {
  const grid = $("farm-plots");
  if (!grid) return;
  const themeId = _state?._cosmetics?.activePlotTheme || "default";
  grid.className = grid.className.replace(/\bfarm-theme-\S+/g, "").trim();
  if (themeId !== "default") {
    grid.classList.add(`farm-theme-${themeId}`);
  }
}

/* ─── Shop Skeleton ─── */
export function showShopSkeleton() {
  const shopGrid = $("farm-shop-grid");
  if (!shopGrid) return;
  shopGrid.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const card = document.createElement("div");
    card.className = "farm-seed-card skeleton";
    card.innerHTML = `&nbsp;<br>&nbsp;`;
    shopGrid.appendChild(card);
  }
}
