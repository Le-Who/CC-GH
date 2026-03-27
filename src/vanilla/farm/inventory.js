/* ═══════════════════════════════════════════════════
 *  Farm Module — Inventory
 *  Renders harvested crop inventory, sell/feed actions.
 * ═══════════════════════════════════════════════════ */
import { GameStore } from "../store.js";
import { HUB, showToast, apiBatched } from "../shared.js";
import { CROPS as CROPS_CONFIG } from "/game-logic.js";
import { HUD } from "../hud.js";
import { $ } from "./utils.js";

let _crops = {};
let _actions = null;

export function setInventoryDeps(deps) { _actions = deps; }

export function syncInventoryState(crops) { _crops = crops; }

/** Sync server harvested → resources.harvested in GameStore */
export function syncHarvestedToStore(harvested) {
  if (!harvested) return;
  const res = GameStore.getState("resources") || {};
  GameStore.setState("resources", { ...res, harvested: { ...harvested } });
}

/* ─── Render Inventory ─── */
export function renderInventory() {
  const grid = $("farm-inventory-grid");
  if (!grid) return;
  const harvested = GameStore.getState("resources")?.harvested || {};
  const entries = Object.entries(harvested).filter(([, qty]) => qty > 0);

  if (entries.length === 0) {
    grid.innerHTML = '<div class="farm-inv-empty">No crops harvested yet</div>';
    return;
  }

  grid.innerHTML = "";
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
    sellAllBar.querySelector(".farm-sell-all-btn").addEventListener("click", sellAll);
    grid.appendChild(sellAllBar);
  }

  for (const [cropId, qty] of entries) {
    const cfg = _crops[cropId] || {};
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
      </div>`;
    item.querySelector(".farm-inv-btn.sell").addEventListener("click", () => sellCrop(cropId, sellPrice));
    item.querySelector(".farm-inv-btn.feed").addEventListener("click", () => feedPet(cropId));
    grid.appendChild(item);
  }
}

/* ─── Sell All ─── */
function sellAll() {
  const res = GameStore.getState("resources") || {};
  const harvested = { ...(res.harvested || {}) };
  const entries = Object.entries(harvested).filter(([, qty]) => qty > 0);
  if (entries.length === 0) { showToast("❌ Nothing to sell!"); return; }

  let totalGold = 0, totalItems = 0;
  for (const [cropId, qty] of entries) {
    totalGold += (CROPS_CONFIG[cropId]?.sellPrice || 0) * qty;
    totalItems += qty;
  }
  const newGold = (res.gold || 0) + totalGold;
  GameStore.setState("resources", { ...res, gold: newGold, harvested: {} });
  renderInventory();
  _actions?.render?.();
  showToast(`💰 Sold ${totalItems} crops for ${totalGold}🪙!`);
  HUD.animateGoldChange(totalGold);
  HUD.updateDisplay(GameStore.getState("resources"));

  for (const [cropId, qty] of entries) {
    apiBatched("/api/farm/sell-crop", { userId: HUB.userId, cropId, amount: qty })
      .then((data) => {
        if (data._optimistic) return;
        if (data?.success) {
          if (data.resources) HUD?.syncFromServer?.(data.resources);
          if (data.harvested) syncHarvestedToStore(data.harvested);
        }
      }).catch(() => {});
  }
}

/* ─── Sell Single Crop ─── */
export function sellCrop(cropId, sellPrice) {
  const res = GameStore.getState("resources") || {};
  const harvested = { ...(res.harvested || {}) };
  if (!harvested[cropId] || harvested[cropId] <= 0) { showToast("❌ No crops to sell!"); return; }
  harvested[cropId]--;
  if (harvested[cropId] <= 0) delete harvested[cropId];
  const newGold = (res.gold || 0) + sellPrice;
  GameStore.setState("resources", { ...res, gold: newGold, harvested });
  renderInventory();
  _actions?.render?.();
  showToast(`💰 Sold! +${sellPrice}🪙`);
  HUD.animateGoldChange(sellPrice);
  HUD.updateDisplay(GameStore.getState("resources"));

  apiBatched("/api/farm/sell-crop", { userId: HUB.userId, cropId, amount: 1 })
    .then((data) => {
      if (data._optimistic) return;
      if (data?.success) {
        if (data.resources) HUD?.syncFromServer?.(data.resources);
        if (data.harvested) syncHarvestedToStore(data.harvested);
        renderInventory();
      }
    }).catch(() => {});
}

/* ─── Feed Pet ─── */
export function feedPet(cropId) {
  const res = GameStore.getState("resources") || {};
  const e = res.energy || {};
  const cfg = CROPS_CONFIG[cropId];
  const energyYield = cfg ? cfg.energyYield : 1;
  const fullnessYield = cfg ? cfg.fullnessYield : 5;

  if (e.current >= e.max) { showToast("⚡ Energy full! Can't feed yet."); return; }
  const pet = GameStore.getState("pet");
  if (pet && (pet.stats?.fullness ?? 0) >= 100) { showToast("🤢 Pet is too full! Wait for digestion."); return; }

  const harvested = { ...(res.harvested || {}) };
  if (!harvested[cropId] || harvested[cropId] <= 0) { showToast("❌ No crops to feed!"); return; }
  harvested[cropId]--;
  if (harvested[cropId] <= 0) delete harvested[cropId];
  const newEnergy = { ...e, current: Math.min(e.max, e.current + energyYield) };
  GameStore.setState("resources", { ...res, energy: newEnergy, harvested });
  if (pet) {
    GameStore.setState("pet", {
      ...pet,
      stats: { ...pet.stats, fullness: Math.min(100, (pet.stats?.fullness ?? 0) + fullnessYield) },
      lastDigestionTimestamp: Date.now(),
    });
  }
  renderInventory();
  showToast(`🍖 Fed pet! +${energyYield}⚡`);
  HUD.updateDisplay(GameStore.getState("resources"));

  apiBatched("/api/pet/feed", { userId: HUB.userId, cropId })
    .then((data) => {
      if (data._optimistic) return;
      if (data?.success) {
        if (data.resources) HUD?.syncFromServer?.(data.resources);
        if (data.harvested) syncHarvestedToStore(data.harvested);
        renderInventory();
      }
    }).catch(() => {});
}
