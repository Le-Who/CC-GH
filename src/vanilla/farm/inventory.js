/* ═══════════════════════════════════════════════════
 *  Farm Module — Inventory
 *  Renders harvested crop inventory, sell/feed actions.
 * ═══════════════════════════════════════════════════ */
import { HUB, showToast, apiBatched } from "../shared.js";
import { CROPS as CROPS_CONFIG } from "/game-logic.js";
import { HUD } from "../hud.js";
import {
  feedPetWithHarvestedCropLocally,
  listHarvestedCrops,
  replaceHarvestedCrops,
  sellAllHarvestedCropsLocally,
  sellHarvestedCropLocally,
} from "../../services/inventoryService.js";
import { $ } from "./utils.js";

let _crops = {};
let _actions = null;

export function setInventoryDeps(deps) {
  _actions = deps;
}

export function syncInventoryState(crops) {
  _crops = crops;
}

/** Sync server harvested → resources.harvested in GameStore */
export function syncHarvestedToStore(harvested) {
  if (!harvested) return;
  replaceHarvestedCrops(harvested);
}

/* ─── Render Inventory ─── */
export function renderInventory() {
  const grid = $("farm-inventory-grid");
  if (!grid) return;
  const entries = listHarvestedCrops();

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
    sellAllBar
      .querySelector(".farm-sell-all-btn")
      .addEventListener("click", sellAll);
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
    item
      .querySelector(".farm-inv-btn.sell")
      .addEventListener("click", () => sellCrop(cropId, sellPrice));
    item
      .querySelector(".farm-inv-btn.feed")
      .addEventListener("click", () => feedPet(cropId));
    grid.appendChild(item);
  }
}

/* ─── Sell All ─── */
function sellAll() {
  const sellAllResult = sellAllHarvestedCropsLocally(
    (cropId) => CROPS_CONFIG[cropId]?.sellPrice || 0,
  );
  if (!sellAllResult.success) {
    showToast("❌ Nothing to sell!");
    return;
  }

  renderInventory();
  _actions?.render?.();
  showToast(
    `💰 Sold ${sellAllResult.totalItems} crops for ${sellAllResult.totalGold}🪙!`,
  );
  HUD.animateGoldChange(sellAllResult.totalGold);
  HUD.updateDisplay(sellAllResult.resources);

  for (const [cropId, qty] of sellAllResult.entries) {
    apiBatched("/api/farm/sell-crop", {
      userId: HUB.userId,
      cropId,
      amount: qty,
    })
      .then((data) => {
        if (data._optimistic) return;
        if (data?.success) {
          if (data.resources) HUD?.syncFromServer?.(data.resources);
          if (data.harvested) syncHarvestedToStore(data.harvested);
        }
      })
      .catch(() => {});
  }
}

/* ─── Sell Single Crop ─── */
export function sellCrop(cropId, sellPrice) {
  const sellResult = sellHarvestedCropLocally({
    cropId,
    amount: 1,
    sellPrice,
  });
  if (!sellResult.success) {
    showToast("❌ No crops to sell!");
    return;
  }
  renderInventory();
  _actions?.render?.();
  showToast(`💰 Sold! +${sellPrice}🪙`);
  HUD.animateGoldChange(sellPrice);
  HUD.updateDisplay(sellResult.resources);

  apiBatched("/api/farm/sell-crop", { userId: HUB.userId, cropId, amount: 1 })
    .then((data) => {
      if (data._optimistic) return;
      if (data?.success) {
        if (data.resources) HUD?.syncFromServer?.(data.resources);
        if (data.harvested) syncHarvestedToStore(data.harvested);
        renderInventory();
      }
    })
    .catch(() => {});
}

/* ─── Feed Pet ─── */
export function feedPet(cropId) {
  const cfg = CROPS_CONFIG[cropId];
  const energyYield = cfg ? cfg.energyYield : 1;
  const fullnessYield = cfg ? cfg.fullnessYield : 5;
  const feedResult = feedPetWithHarvestedCropLocally({
    cropId,
    energyYield,
    fullnessYield,
  });
  if (!feedResult.success) {
    if (feedResult.reason === "ENERGY_FULL") {
      showToast("⚡ Energy full! Can't feed yet.");
    } else if (feedResult.reason === "PET_FULL") {
      showToast("🤢 Pet is too full! Wait for digestion.");
    } else {
      showToast("❌ No crops to feed!");
    }
    return;
  }
  renderInventory();
  showToast(`🍖 Fed pet! +${energyYield}⚡`);
  HUD.updateDisplay(feedResult.resources);

  apiBatched("/api/pet/feed", { userId: HUB.userId, cropId })
    .then((data) => {
      if (data._optimistic) return;
      if (data?.success) {
        if (data.resources) HUD?.syncFromServer?.(data.resources);
        if (data.harvested) syncHarvestedToStore(data.harvested);
        renderInventory();
      }
    })
    .catch(() => {});
}
