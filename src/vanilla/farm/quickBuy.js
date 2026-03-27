/* ═══════════════════════════════════════════════════
 *  Farm Module — Quick Buy Bottom Sheet
 *  Contextual seed purchase + instant plant flow.
 * ═══════════════════════════════════════════════════ */
import { HUB, showToast, apiBatched } from "../shared.js";
import { CROPS as CROPS_CONFIG } from "/game-logic.js";
import { GameStore } from "../store.js";
import { HUD } from "../hud.js";
import {
  getTopSeeds, trackPurchase, getPurchaseHistory, formatGrowthTime,
} from "./utils.js";

let _state = null;
let _crops = {};
let _actions = null;
let _buySeedVersion = 0;

export function setQuickBuyDeps(deps) { _actions = deps; }
export function syncQuickBuyState(state, crops) { _state = state; _crops = crops; }

export function showQuickBuy(plotId) {
  if (!_crops || Object.keys(_crops).length === 0) {
    showToast("🛒 Loading seeds...");
    return;
  }
  const existing = document.getElementById("quick-buy-dialog");
  if (existing) existing.remove();

  const unlocked = _actions?.computeUnlocked?.() || [];
  const topSeeds = getTopSeeds(_crops, unlocked, 3);
  const goldAvail = HUD.getGold();

  const history = getPurchaseHistory();
  const counts = {};
  for (const { seedId } of history) counts[seedId] = (counts[seedId] || 0) + 1;
  const favSeed = Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0];

  const cards = topSeeds.map((id) => {
    const cfg = _crops[id];
    if (!cfg) return "";
    const canonicalGrowth = CROPS_CONFIG[id]?.growthTime || cfg.growthTime || 15000;
    const growthLabel = formatGrowthTime(canonicalGrowth);
    const canAfford = goldAvail >= (cfg.seedPrice || 0);
    const isFav = id === favSeed;
    const invCount = _state?.inventory?.[id] || 0;
    return `
      <button class="qb-seed-card${canAfford ? "" : " qb-muted"}" data-seed="${id}" ${canAfford ? "" : "disabled"}>
        <span class="qb-seed-emoji">${cfg.emoji}</span>
        <span class="qb-seed-info">
          <span class="qb-seed-name">${isFav ? "★ " : ""}${cfg.name}</span>
          <span class="qb-seed-meta">⏱ ${growthLabel}${invCount > 0 ? ` · 🎒${invCount}` : ""}</span>
        </span>
        <span class="qb-seed-price${canAfford ? "" : " qb-price-red"}">🪙 ${cfg.seedPrice || 0}</span>
      </button>`;
  }).join("");

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
    </div>`;

  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  dialog.querySelectorAll(".qb-seed-card:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => {
      const seedId = btn.dataset.seed;
      dialog.close();
      quickBuyAndPlant(seedId, plotId);
    });
  });

  dialog.querySelectorAll(".qb-seed-card[disabled]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const seedId = btn.dataset.seed;
      const cfg = _crops[seedId];
      const deficit = (cfg?.seedPrice || 0) - goldAvail;
      btn.classList.add("qb-shake");
      showToast(`Need ${deficit}🪙 more`);
      setTimeout(() => btn.classList.remove("qb-shake"), 400);
    });
  });

  dialog.querySelector("#qb-more")?.addEventListener("click", () => {
    dialog.close();
    _actions?.switchFarmTab?.("shop");
  });

  document.body.appendChild(dialog);
  import("../shared.js").then(({ safeShowModal }) => safeShowModal(dialog));
}

function quickBuyAndPlant(seedId, plotId) {
  const cfg = _crops[seedId];
  if (!cfg) return;
  const goldAvail = HUD.getGold();
  const price = cfg.seedPrice || 0;
  if (goldAvail < price) { showToast("❌ Not enough gold!"); return; }

  trackPurchase(seedId);

  // Optimistic: deduct gold + add to inventory
  const res = GameStore.getState("resources") || {};
  GameStore.setState("resources", { ...res, gold: res.gold - price });
  _state.inventory[seedId] = (_state.inventory[seedId] || 0) + 1;
  _actions?.syncToStore?.();
  HUD.animateGoldChange(-price);

  // Plant using the seed
  _actions?.setSelectedSeed?.(seedId);
  _actions?.plant?.(plotId);

  // Buy API call (fire-and-forget)
  const prevGold = goldAvail;
  const myVersion = ++_buySeedVersion;
  apiBatched("/api/farm/buy-seeds", { userId: HUB.userId, cropId: seedId, amount: 1 })
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
        _actions?.syncToStore?.();
        showToast(`❌ ${data.error}`);
      }
    })
    .catch(() => { if (_buySeedVersion === myVersion) _actions?.loadState?.(); });

  showToast(`Planted ${cfg.emoji} ${cfg.name}!`);
}
