/* ═══════════════════════════════════════════════════
 *  Game Hub — HUD Module (v6.2.0)
 *  TopHUD for Energy & Gold display
 *  Registers 'resources' slice in GameStore
 *  v5: Native ES Module (was IIFE)
 * ═══════════════════════════════════════════════════ */
import { GameStore } from "./store.js";
import { getCropsCache, loadCropsFromStorage } from "./crops.js";
import { HUB, api, goToScreen, showToast, safeShowModal } from "./shared.js";
import { CROPS, MERGE_CHAINS } from "/game-logic.js";

/* ─── Merge item display lookup (for quest requirement names) ─── */
const _MERGE_DISPLAY = {};
for (const chain of Object.values(MERGE_CHAINS)) {
  for (let i = 0; i < chain.items.length; i++) {
    _MERGE_DISPLAY[chain.items[i]] = {
      emoji: chain.emoji[i],
      name: chain.names[i],
    };
  }
}
function _formatReq(r) {
  if (r.type === "crop") {
    const c = CROPS[r.id];
    return `${c?.emoji || "🌿"} ${c?.name || r.id} ×${r.qty}`;
  }
  const m = _MERGE_DISPLAY[r.id];
  return `${m?.emoji || "🧩"} ${m?.name || r.id} ×${r.qty}`;
}
function _formatReward(rw) {
  const parts = [];
  if (rw.gold) parts.push(`+${rw.gold}🪙`);
  if (rw.affectionXp) parts.push(`+${rw.affectionXp}💕`);
  if (rw.gachaTokens) parts.push(`+${rw.gachaTokens}🎰`);
  if (rw.energyMaxBoost) parts.push(`+${rw.energyMaxBoost}⚡max`);
  return parts.join(" ") || "—";
}

let regenTimerId = null;

// v4.15.2: Cached DOM refs (eliminates per-second getElementById calls)
let $regenFill = null;
let _lastRegenWidth = "";

/* ─── GameStore Slice Registration ─── */
function registerSlice() {
  GameStore.registerSlice("resources", {
    gold: 0,
    energy: { current: 0, max: 20, lastRegenTimestamp: Date.now() },
    gachaTokens: 0,
  });
}

/* ─── Fetch from server ─── */
async function fetchResources() {
  try {
    const data = await api("/api/resources/state");
    if (data && data.resources) {
      GameStore.setState("resources", data.resources);
      updateDisplay(data.resources);
      return data;
    }
  } catch (e) {
    console.warn("HUD: failed to fetch resources", e);
  }
  return null;
}

/* ─── Update Display ─── */
function updateDisplay(res) {
  if (!res) return;
  // React HUD listens to GameStore directly.
  // We mirror the critical values to a 'shared' slice for the React layer to read easily.
  const shared = GameStore.getState("shared") || {
    energy: 0,
    maxEnergy: 20,
    gold: 0,
    activeQuests: 0,
  };
  GameStore.setState("shared", {
    ...shared,
    energy: res.energy?.current || 0,
    maxEnergy: res.energy?.max || 20,
    gold: res?.gold || 0,
  });
}

function _formatGold(amount) {
  if (amount >= 10000) return (amount / 1000).toFixed(1) + "k";
  return String(amount);
}

/* ─── Regen Timer ─── */
function _updateTooltip(res) {
  const tooltip = document.getElementById("hud-energy-tooltip");
  if (!tooltip) return;

  if (res.energy.current >= res.energy.max) {
    tooltip.textContent = "Energy full!";
    return;
  }

  const elapsed = Date.now() - res.energy.lastRegenTimestamp;
  const interval = 150 * 1000; // 2.5 min — matches game-logic.js ENERGY_REGEN_INTERVAL_MS
  const remaining = interval - (elapsed % interval);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  tooltip.textContent = `Next +1⚡ in ${mins}:${String(secs).padStart(2, "0")}`;
}

function startRegenTimer() {
  stopRegenTimer();
  regenTimerId = setInterval(() => {
    const res = GameStore.getState("resources");
    if (res) {
      const e = { ...res.energy };
      const now = Date.now();
      const interval = 150 * 1000; // 2.5 min — matches game-logic.js
      // v4.15.2: Early return when energy is full (skip all DOM ops)
      if (e.current >= e.max) {
        if (_lastRegenWidth !== "0%") {
          if (!$regenFill)
            $regenFill = document.getElementById("hud-energy-regen-fill");
          if ($regenFill) {
            $regenFill.style.width = "0%";
            // v4.15.3: Stop aurora animation when energy full
            $regenFill.classList.remove("aurora-active");
          }
          _lastRegenWidth = "0%";
        }
        return;
      }
      const delta = now - e.lastRegenTimestamp;
      const ticks = Math.floor(delta / interval);
      if (ticks > 0) {
        e.current = Math.min(e.max, e.current + ticks);
        if (e.current < e.max) {
          e.lastRegenTimestamp = now - (delta % interval);
        } else {
          e.lastRegenTimestamp = now;
        }
        GameStore.setState("resources", { ...res, energy: e });
      }
      // Update regen micro-progress bar
      const elapsed = now - e.lastRegenTimestamp;
      const pct = Math.min(100, (elapsed / interval) * 100);
      const newWidth = `${pct}%`;
      if (newWidth !== _lastRegenWidth) {
        if (!$regenFill)
          $regenFill = document.getElementById("hud-energy-regen-fill");
        if ($regenFill) {
          $regenFill.style.width = newWidth;
          // v4.15.3: Start aurora animation when regenerating
          if (!$regenFill.classList.contains("aurora-active")) {
            $regenFill.classList.add("aurora-active");
          }
        }
        _lastRegenWidth = newWidth;
      }
      updateDisplay({ ...res, energy: e });
    }
  }, 1000);
}

function stopRegenTimer() {
  if (regenTimerId) {
    clearInterval(regenTimerId);
    regenTimerId = null;
  }
}

/* ─── Gold Animation ─── */
function animateGoldChange(amount) {
  const goldEl = document.querySelector(".hud-gold");
  if (!goldEl) return;

  // Glassmorphism Spring Bump (Peak-End / Dopamine hit)
  goldEl.classList.remove("bump");
  void goldEl.offsetWidth; // Trigger reflow
  goldEl.classList.add("bump");

  const float = document.createElement("span");
  float.className = "hud-gold-change" + (amount < 0 ? " negative" : "");
  float.textContent = (amount > 0 ? "+" : "") + amount;
  goldEl.style.position = "relative";
  goldEl.appendChild(float);
  setTimeout(() => float.remove(), 1500);
}

/* ─── Energy Check (for gatekeeping) ─── */
function hasEnergy(amount) {
  const res = GameStore.getState("resources");
  return res && res.energy.current >= amount;
}

function getGold() {
  const res = GameStore.getState("resources");
  return res ? res.gold : 0;
}

/* ─── Update from server response ─── */
function syncFromServer(resources) {
  if (!resources) return;
  // Smart merge: trust server for energy.current and gold, but only
  // update lastRegenTimestamp if server's is newer — prevents the
  // regen bar from jumping backward when local timer is ahead.
  const local = GameStore.getState("resources");
  const merged = { ...resources };
  if (local?.energy?.lastRegenTimestamp && resources.energy) {
    const serverTs = resources.energy.lastRegenTimestamp || 0;
    const localTs = local.energy.lastRegenTimestamp || 0;
    if (localTs > serverTs) {
      merged.energy = { ...resources.energy, lastRegenTimestamp: localTs };
    }
  }
  // Preserve local harvested (farm inventory state)
  if (local?.harvested && !merged.harvested) {
    merged.harvested = local.harvested;
  }
  GameStore.setState("resources", merged);
  updateDisplay(resources);
}

/* ─── Init ─── */
async function init() {
  registerSlice();
  const data = await fetchResources();
  if (data && data.resources) {
    updateDisplay(data.resources);
  }
  startRegenTimer();

  // Subscribe to store changes
  GameStore.subscribe("resources", (newState) => {
    updateDisplay(newState);
  });

  // Quest Log button
  const questLogBtn = document.getElementById("quest-log-btn");
  if (questLogBtn) questLogBtn.addEventListener("click", _openQuestLog);

  // Bind to the new Quest UI component
  document.addEventListener("quest-submit", async (e) => {
    await _submitQuestOrder(e.detail);
    _updateQuestBadge();
  });
  document.addEventListener("quest-generate", async () => {
    await _generateQuestOrders();
  });

  // Badge update: check periodically and on store changes
  GameStore.subscribe("pet", _updateQuestBadge);
  GameStore.subscribe("resources", _updateQuestBadge);
  setInterval(_updateQuestBadge, 5000);

  // v4.15.2: Pause regen timer when tab hidden (save CPU)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopRegenTimer();
    } else {
      startRegenTimer(); // Resume + catch up on missed ticks
    }
  });
}

/* ─── Quick-Feed Energy Modal ─── */
let _energyModalPlayCb = null;
let _energyModalRequired = 0;

function showEnergyModal(requiredEnergy, onPlayCallback) {
  _energyModalRequired = requiredEnergy;
  _energyModalPlayCb = onPlayCallback;

  const modal = document.getElementById("energy-modal");
  const itemsEl = document.getElementById("energy-modal-items");
  const playEl = document.getElementById("energy-modal-play");
  const descEl = document.getElementById("energy-modal-desc");
  if (!modal || !itemsEl) return;

  // Get harvested crops from resources slice (unified source)
  const harvested = GameStore.getState("resources")?.harvested || {};

  const res = GameStore.getState("resources");
  const currentEnergy = res ? res.energy.current : 0;
  const needed = requiredEnergy - currentEnergy;

  descEl.textContent = `Need ${needed} more ⚡ — Feed your pet to restore energy!`;

  const cropsCache = getCropsCache() || loadCropsFromStorage();
  const entries = Object.entries(harvested).filter(([, qty]) => qty > 0);
  if (entries.length === 0) {
    itemsEl.innerHTML =
      '<p class="text-dim" style="font-size:0.82rem;margin:12px 0">No food available. Harvest some crops first!</p>';
  } else {
    itemsEl.innerHTML = entries
      .map(([cropId, qty]) => {
        const crop = cropsCache ? cropsCache[cropId] : null;
        const cfg = CROPS[cropId];
        const emoji = crop ? crop.emoji : cfg ? cfg.emoji : "🌿";
        const name = crop ? crop.name : cfg ? cfg.name : cropId;
        const ey = cfg ? cfg.energyYield : 1;
        return `
        <div class="energy-feed-item" data-crop="${cropId}">
          <span class="feed-icon">${emoji}</span>
          <div class="feed-info">
            <div class="feed-name">${name}</div>
            <div class="feed-qty">×${qty} • +${ey}⚡</div>
          </div>
          <button class="feed-btn" data-crop="${cropId}">Eat</button>
        </div>`;
      })
      .join("");
  }

  // Play button (hidden initially)
  playEl.style.display = "none";
  playEl.innerHTML = "";

  // Check if we already have enough
  _checkEnergyPlayReady();

  // Bind events
  itemsEl.onclick = (e) => {
    const btn = e.target.closest(".feed-btn");
    if (!btn || btn.disabled) return;
    const cropId = btn.dataset.crop;
    _feedFromModal(cropId, btn);
  };

  document.getElementById("energy-modal-farm").onclick = () => {
    hideEnergyModal();
    goToScreen(2); // Fix Bug 5: 2 is Farm, 1 was Blox
  };
  const closeBtn = document.getElementById("energy-modal-close");
  if (closeBtn) closeBtn.onclick = hideEnergyModal;

  safeShowModal(modal);
}

function hideEnergyModal() {
  const modal = document.getElementById("energy-modal");
  if (modal && modal.open) {
    modal.close();
  }
  _energyModalPlayCb = null;
}

async function _feedFromModal(cropId, btn) {
  btn.disabled = true;
  btn.textContent = "…";

  // Satiety guard: block feeding if pet is full
  const pet = GameStore.getState("pet");
  if (pet && (pet.stats?.fullness ?? 0) >= 100) {
    showToast("🤢 Pet is too full! Wait for digestion.", "error");
    btn.disabled = false;
    btn.textContent = "Eat";
    return;
  }

  // Dynamic yield from crop config
  const cfg = CROPS[cropId];
  const energyYield = cfg ? cfg.energyYield : 1;
  const fullnessYield = cfg ? cfg.fullnessYield : 5;

  // Optimistic: add dynamic energy locally
  const res = GameStore.getState("resources");
  if (res) {
    const updated = {
      ...res,
      energy: {
        ...res.energy,
        current: Math.min(res.energy.max, res.energy.current + energyYield),
      },
    };
    syncFromServer(updated);
  }

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

  // Optimistic: decrement harvested count (unified resources slice)
  const resAfter = GameStore.getState("resources");
  if (resAfter && resAfter.harvested && resAfter.harvested[cropId]) {
    const updated = { ...resAfter, harvested: { ...resAfter.harvested } };
    updated.harvested[cropId]--;
    if (updated.harvested[cropId] <= 0) delete updated.harvested[cropId];
    GameStore.setState("resources", updated);
  }

  try {
    // Server call
    const data = await api("/api/pet/feed", {
      cropId,
      userId: HUB.userId,
    });

    if (data && data.success) {
      if (data.resources) syncFromServer(data.resources);
    }
  } finally {
    // v6.2.0: Guaranteed refresh — re-enables buttons even on network error
    _refreshModalItems();
    _checkEnergyPlayReady();
  }
}

function _refreshModalItems() {
  const itemsEl = document.getElementById("energy-modal-items");
  if (!itemsEl) return;

  const harvested = GameStore.getState("resources")?.harvested || {};

  // Update quantities and disable empty ones
  itemsEl.querySelectorAll(".energy-feed-item").forEach((item) => {
    const cropId = item.dataset.crop;
    const qty = harvested[cropId] || 0;
    const cfg = CROPS[cropId];
    const ey = cfg ? cfg.energyYield : 1;
    const qtyEl = item.querySelector(".feed-qty");
    const btn = item.querySelector(".feed-btn");
    if (qty <= 0) {
      item.style.opacity = "0.4";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Empty";
      }
    } else {
      item.style.opacity = "1";
      if (qtyEl) qtyEl.textContent = `×${qty} • +${ey}⚡`;
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Eat";
      }
    }
  });
}

function _checkEnergyPlayReady() {
  const playEl = document.getElementById("energy-modal-play");
  if (!playEl) return;

  const res = GameStore.getState("resources");
  const current = res ? res.energy.current : 0;

  if (current >= _energyModalRequired && _energyModalPlayCb) {
    playEl.style.display = "block";
    playEl.innerHTML = '<button class="energy-play-btn">▶️ PLAY NOW</button>';
    playEl.querySelector(".energy-play-btn").onclick = () => {
      const cb = _energyModalPlayCb;
      hideEnergyModal();
      if (cb) cb();
    };
  }
}

/* ─── Quest Log ─── */
function _updateQuestBadge() {
  const pet = GameStore.getState("pet");
  const orders = pet?.activeOrders || [];
  const canSubmitAny = orders.some((o) => _canFulfillOrder(o));

  // Inform React layer
  const shared = GameStore.getState("shared") || { activeQuests: 0 };
  if (shared.activeQuests !== (canSubmitAny ? 1 : 0)) {
    GameStore.setState("shared", {
      ...shared,
      activeQuests: canSubmitAny ? 1 : 0,
    });
  }
}

function _canFulfillOrder(order) {
  const res = GameStore.getState("resources");
  const harvested = res?.harvested || {};
  const mergeState = GameStore.getState("merge");
  for (const req of order.requirements) {
    if (req.type === "crop") {
      if (!harvested[req.id] || harvested[req.id] < req.qty) return false;
    } else if (req.type === "merge") {
      const board = mergeState?.board;
      if (!board) return false;
      let found = 0;
      for (const row of board) {
        for (const cell of row) {
          if (cell && cell.id === req.id) found++;
        }
      }
      if (found < req.qty) return false;
    }
  }
  return true;
}

/** Get the player's current quantity for a quest requirement */
function _getPlayerQty(req) {
  if (req.type === "crop") {
    const res = GameStore.getState("resources");
    return (res?.harvested || {})[req.id] || 0;
  } else if (req.type === "merge") {
    const mergeState = GameStore.getState("merge");
    const board = mergeState?.board;
    if (!board) return 0;
    let found = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.id === req.id) found++;
      }
    }
    return found;
  }
  return 0;
}
function _openQuestLog() {
  document.dispatchEvent(new CustomEvent("toggle-quests"));

  // Auto-generate if empty and never done
  const _autoKey = "_questLogAutoGenDone";
  const pet = GameStore.getState("pet");
  const orders = pet?.activeOrders || [];
  if (orders.length === 0 && !sessionStorage.getItem(_autoKey)) {
    sessionStorage.setItem(_autoKey, "1");
    _generateQuestOrders();
  }
}

async function _generateQuestOrders() {
  const res = GameStore.getState("resources");
  try {
    const data = await api("/api/quests/generate", {
      userId: res?.userId || undefined,
    });
    if (!data?.success) {
      showToast(data?.error || "Could not generate orders", "error");
      return;
    }
    const pet = GameStore.getState("pet");
    if (pet && data.orders)
      GameStore.setState("pet", { ...pet, activeOrders: data.orders });
    showToast(`📜 ${data.newOrders?.length || 0} new orders!`, "success");
  } catch {
    showToast("Network error", "error");
  }
}

async function _submitQuestOrder(orderId) {
  const pet = GameStore.getState("pet");
  const res = GameStore.getState("resources");
  if (!pet || !res) return;
  const order = (pet.activeOrders || []).find((o) => o.id === orderId);
  if (!order) {
    showToast("Order not found", "error");
    return;
  }
  if (!_canFulfillOrder(order)) {
    showToast("Requirements not met", "error");
    return;
  }

  // Optimistic remove
  const oldOrders = [...(pet.activeOrders || [])];
  GameStore.setState("pet", {
    ...pet,
    activeOrders: pet.activeOrders.filter((o) => o.id !== orderId),
  });

  try {
    const data = await api("/api/quests/submit", {
      userId: res.userId || undefined,
      orderId,
    });
    if (!data?.success) {
      GameStore.setState("pet", { ...pet, activeOrders: oldOrders });
      showToast(data?.error || "Quest failed", "error");
      return;
    }
    if (data.pet) GameStore.setState("pet", data.pet);
    if (data.resources)
      GameStore.setState("resources", {
        ...data.resources,
        harvested: data.harvested || {},
      });
    if (data.merge) GameStore.setState("merge", data.merge);
    showToast(
      `✅ Quest complete! ${_formatReward(data.reward || {})}`,
      "success",
    );
    if (data.affectionLeveledUp)
      showToast(
        `💕 Affection Level Up! Lv${data.pet?.affectionLevel}`,
        "success",
      );
  } catch {
    GameStore.setState("pet", { ...pet, activeOrders: oldOrders });
    showToast("Network error", "error");
  }
}

export const HUD = {
  init,
  fetchResources,
  updateDisplay,
  syncFromServer,
  hasEnergy,
  getGold,
  animateGoldChange,
  startRegenTimer,
  stopRegenTimer,
  showEnergyModal,
  hideEnergyModal,
};
