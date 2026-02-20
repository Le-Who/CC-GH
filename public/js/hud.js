/* ═══════════════════════════════════════════════════
 *  Game Hub — HUD Module (v4.12.3)
 *  TopHUD for Energy & Gold display
 *  Registers 'resources' slice in GameStore
 * ═══════════════════════════════════════════════════ */
const HUD = (function () {
  "use strict";

  let regenTimerId = null;

  /* ─── GameStore Slice Registration ─── */
  function registerSlice() {
    if (typeof GameStore !== "undefined") {
      GameStore.registerSlice("resources", {
        gold: 0,
        energy: { current: 0, max: 20, lastRegenTimestamp: Date.now() },
      });
    }
  }

  /* ─── Fetch from server ─── */
  async function fetchResources() {
    try {
      const data = await api("/api/resources/state");
      if (data && data.resources) {
        if (typeof GameStore !== "undefined") {
          GameStore.setState("resources", data.resources);
        }
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
    const energyText = document.getElementById("hud-energy-text");
    const goldText = document.getElementById("hud-gold-text");
    const energyEl = document.querySelector(".hud-energy");

    if (energyText) {
      energyText.textContent = `${res.energy.current}/${res.energy.max}`;
    }
    if (goldText) {
      goldText.textContent = formatGold(res.gold);
    }

    // Low energy warning
    if (energyEl) {
      energyEl.classList.toggle("hud-energy-low", res.energy.current <= 3);
    }

    // Update tooltip
    updateTooltip(res);
  }

  function formatGold(amount) {
    if (amount >= 10000) return (amount / 1000).toFixed(1) + "k";
    return String(amount);
  }

  /* ─── Regen Timer ─── */
  function updateTooltip(res) {
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
      if (typeof GameStore !== "undefined") {
        const res = GameStore.getState("resources");
        if (res) {
          // Local regen tick
          const e = { ...res.energy };
          const now = Date.now();
          const interval = 150 * 1000; // 2.5 min — matches game-logic.js
          if (e.current < e.max) {
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
            // Update regen micro-progress bar (0-100% within current 5min tick)
            const elapsed = now - e.lastRegenTimestamp;
            const pct = Math.min(100, (elapsed / interval) * 100);
            const regenFill = document.getElementById("hud-energy-regen-fill");
            if (regenFill) regenFill.style.width = `${pct}%`;
          } else {
            // Energy full — hide regen progress
            const regenFill = document.getElementById("hud-energy-regen-fill");
            if (regenFill) regenFill.style.width = "0%";
          }
          updateDisplay({ ...res, energy: e });
        }
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

    const float = document.createElement("span");
    float.className = "hud-gold-change" + (amount < 0 ? " negative" : "");
    float.textContent = (amount > 0 ? "+" : "") + amount;
    goldEl.style.position = "relative";
    goldEl.appendChild(float);
    setTimeout(() => float.remove(), 1500);
  }

  /* ─── Energy Check (for gatekeeping) ─── */
  function hasEnergy(amount) {
    if (typeof GameStore !== "undefined") {
      const res = GameStore.getState("resources");
      return res && res.energy.current >= amount;
    }
    return true; // Fallback: allow
  }

  function getGold() {
    if (typeof GameStore !== "undefined") {
      const res = GameStore.getState("resources");
      return res ? res.gold : 0;
    }
    return 0;
  }

  /* ─── Update from server response ─── */
  function syncFromServer(resources) {
    if (!resources) return;
    if (typeof GameStore !== "undefined") {
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
      // Preserve local __harvested (farm inventory state)
      if (local?.__harvested && !merged.__harvested) {
        merged.__harvested = local.__harvested;
      }
      GameStore.setState("resources", merged);
    }
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
    if (typeof GameStore !== "undefined") {
      GameStore.subscribe("resources", (newState) => {
        updateDisplay(newState);
      });
    }
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
    let harvested = {};
    if (typeof GameStore !== "undefined") {
      harvested = GameStore.getState("resources")?.__harvested || {};
    }

    const res =
      typeof GameStore !== "undefined" ? GameStore.getState("resources") : null;
    const currentEnergy = res ? res.energy.current : 0;
    const needed = requiredEnergy - currentEnergy;

    descEl.textContent = `Need ${needed} more ⚡ — Feed your pet to restore energy!`;

    // Render food items — ensure crop metadata is available via cache fallback
    const cropsCache =
      window.__cropsCache ||
      (() => {
        try {
          const raw = localStorage.getItem("hub_crops_cache");
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          // TTL-wrapped format { data, cachedAt }
          if (parsed && parsed.cachedAt) {
            const TTL = 24 * 60 * 60 * 1000;
            if (Date.now() - parsed.cachedAt > TTL) return null;
            return parsed.data;
          }
          return parsed; // Legacy format
        } catch (_) {
          return null;
        }
      })();
    const entries = Object.entries(harvested).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      itemsEl.innerHTML =
        '<p class="text-dim" style="font-size:0.82rem;margin:12px 0">No food available. Harvest some crops first!</p>';
    } else {
      itemsEl.innerHTML = entries
        .map(([cropId, qty]) => {
          const crop = cropsCache ? cropsCache[cropId] : null;
          const emoji = crop ? crop.emoji : "🌿";
          const name = crop ? crop.name : cropId;
          return `
          <div class="energy-feed-item" data-crop="${cropId}">
            <span class="feed-icon">${emoji}</span>
            <div class="feed-info">
              <div class="feed-name">${name}</div>
              <div class="feed-qty">×${qty} • +2⚡</div>
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
      if (typeof goToScreen === "function") goToScreen(1);
    };
    document.getElementById("energy-modal-close").onclick = hideEnergyModal;

    modal.classList.add("show");
  }

  function hideEnergyModal() {
    const modal = document.getElementById("energy-modal");
    if (modal) modal.classList.remove("show");
    _energyModalPlayCb = null;
  }

  async function _feedFromModal(cropId, btn) {
    btn.disabled = true;
    btn.textContent = "…";

    // Optimistic: add 2 energy locally
    const res =
      typeof GameStore !== "undefined" ? GameStore.getState("resources") : null;
    if (res) {
      const updated = {
        ...res,
        energy: {
          ...res.energy,
          current: Math.min(res.energy.max, res.energy.current + 2),
        },
      };
      syncFromServer(updated);
    }

    // Optimistic: decrement harvested count (unified resources slice)
    if (typeof GameStore !== "undefined") {
      const res = GameStore.getState("resources");
      if (res && res.__harvested && res.__harvested[cropId]) {
        const updated = { ...res, __harvested: { ...res.__harvested } };
        updated.__harvested[cropId]--;
        if (updated.__harvested[cropId] <= 0)
          delete updated.__harvested[cropId];
        GameStore.setState("resources", updated);
      }
    }

    // Server call
    const data = await api("/api/pet/feed", {
      cropId,
      userId: HUB.userId,
    });

    if (data && data.success) {
      if (data.resources) syncFromServer(data.resources);
    }

    // Refresh modal items
    _refreshModalItems();
    _checkEnergyPlayReady();
  }

  function _refreshModalItems() {
    const itemsEl = document.getElementById("energy-modal-items");
    if (!itemsEl) return;

    let harvested = {};
    if (typeof GameStore !== "undefined") {
      harvested = GameStore.getState("resources")?.__harvested || {};
    }

    // Update quantities and disable empty ones
    itemsEl.querySelectorAll(".energy-feed-item").forEach((item) => {
      const cropId = item.dataset.crop;
      const qty = harvested[cropId] || 0;
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
        if (qtyEl) qtyEl.textContent = `×${qty} • +2⚡`;
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

    const res =
      typeof GameStore !== "undefined" ? GameStore.getState("resources") : null;
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

  return {
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
})();
