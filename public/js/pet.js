/* ═══════════════════════════════════════════════════
 *  Game Hub — Pet Module (v4.15.2)
 *  Living Pet Entity with state machine & interactions
 *  v1.8: Weighted behavior, zone roaming, FLIP dock
 * ═══════════════════════════════════════════════════ */
const PetCompanion = (function () {
  "use strict";

  const STATES = {
    IDLE: "idle",
    ROAM: "roam",
    SLEEP: "sleep",
    HAPPY: "happy",
    DIZZY: "dizzy",
  };
  const SKINS = {
    basic_dog: "🐕",
    basic_cat: "🐱",
    basic_bunny: "🐰",
  };

  let currentState = STATES.IDLE;
  let petData = null;
  let clickCount = 0;
  let clickResetTimer = null;
  let stateTimer = null;
  let inactivityTimer = null;
  let sleepTimer = null;
  let roamTimeoutId = null; // Track active roam timeout for cancellation
  let previousState = STATES.IDLE; // For anti-repeat logic
  let panelOpen = false;
  let dockMode = "ground"; // "ground" | "match3" | "trivia"

  // v4.15.2: Heart particle object pool (eliminates DOM churn)
  const HEART_POOL_SIZE = 5;
  let heartPool = [];
  let heartPoolIdx = 0;

  /* ─── GameStore Slice ─── */
  function registerSlice() {
    if (typeof GameStore !== "undefined") {
      GameStore.registerSlice("pet", {
        name: "Buddy",
        level: 1,
        xp: 0,
        xpToNextLevel: 100,
        skinId: "basic_dog",
        stats: { happiness: 100 },
        abilities: { autoHarvest: false, autoWater: false },
      });
    }
  }

  /* ─── Init ─── */
  async function init() {
    registerSlice();
    const container = document.getElementById("pet-container");
    const sprite = document.getElementById("pet-sprite");
    if (!container || !sprite) return;

    // Fetch pet data (included in resources/state)
    try {
      const data = await api("/api/resources/state");
      if (data && data.pet) {
        petData = data.pet;
        if (typeof GameStore !== "undefined") {
          GameStore.setState("pet", data.pet);
        }
        sprite.textContent = SKINS[data.pet.skinId] || SKINS.basic_dog;
      }
    } catch (e) {
      console.warn("Pet: failed to fetch state", e);
    }

    // Click handler
    container.addEventListener("click", onPetClick);
    container.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        onPetClick();
      },
      { passive: false },
    );

    // Start state machine
    setState(STATES.IDLE);
    scheduleNextState();
    resetInactivityTimer();

    // Subscribe to store
    if (typeof GameStore !== "undefined") {
      GameStore.subscribe("pet", (newState) => {
        petData = newState;
        if (panelOpen) renderInfoPanel();
      });
    }

    // Start auto-water butler ability
    startAutoWater();

    // GPU cleanup: clear will-change after roam transition ends
    container.addEventListener("transitionend", () => {
      if (!container.classList.contains("pet-roaming")) {
        container.style.willChange = "auto";
      }
    });

    // Click-outside to close info panel (Fix 3)
    document.addEventListener("click", (e) => {
      if (!panelOpen) return;
      const panel = document.getElementById("pet-info-panel");
      const petContainer = document.getElementById("pet-container");
      if (!panel) return;
      // Close if click is outside both the panel and the pet itself
      if (!panel.contains(e.target) && !petContainer?.contains(e.target)) {
        panelOpen = false;
        panel.style.display = "none";
      }
    });

    // v4.15.2: Pre-create heart particle pool
    const heartsEl = document.getElementById("pet-hearts");
    if (heartsEl && heartPool.length === 0) {
      for (let i = 0; i < HEART_POOL_SIZE; i++) {
        const el = document.createElement("span");
        el.className = "pet-heart";
        el.style.display = "none";
        heartsEl.appendChild(el);
        heartPool.push(el);
      }
    }
  }

  /* ─── State Machine (class-based — synchronous, zero-flicker) ─── */
  const STATE_CLASSES = [
    "state-idle",
    "state-roam",
    "state-sleep",
    "state-happy",
    "state-dizzy",
  ];

  function setState(newState) {
    currentState = newState;
    const container = document.getElementById("pet-container");
    if (!container) return;

    // Cancel any active roam (prevents orphaned timeout removing classes later)
    if (roamTimeoutId) {
      clearTimeout(roamTimeoutId);
      roamTimeoutId = null;
    }
    container.classList.remove("pet-roaming");

    // Synchronous class swap — no rAF, no animation reset, zero flicker
    STATE_CLASSES.forEach((cls) => container.classList.remove(cls));
    container.classList.add(`state-${newState}`);

    // Sleep overlay
    const heartsEl = document.getElementById("pet-hearts");
    if (heartsEl) {
      heartsEl.querySelectorAll(".pet-zzz").forEach((el) => el.remove());
      if (newState === STATES.SLEEP) {
        const zzz = document.createElement("span");
        zzz.className = "pet-zzz";
        zzz.textContent = "💤";
        heartsEl.appendChild(zzz);
      }
    }
  }

  function scheduleNextState() {
    if (stateTimer) clearTimeout(stateTimer);
    const delay = 3000 + Math.random() * 4000; // 3-7s (lively tempo)
    stateTimer = setTimeout(() => {
      if (currentState === STATES.HAPPY || currentState === STATES.DIZZY) {
        // Don't interrupt reaction states
        scheduleNextState();
        return;
      }
      if (currentState === STATES.SLEEP) {
        // Stay asleep until interaction or auto-wake
        return;
      }

      // Weighted behavior: 80% ROAM, 15% IDLE, 5% SLEEP
      // Anti-repeat: skip SLEEP if previous was SLEEP
      let roll = Math.random();
      const canRoam =
        dockMode === "ground" || dockMode === "match3" || dockMode === "trivia";

      // Anti-repeat adjustments
      if (previousState === STATES.SLEEP) {
        // After waking, never immediately sleep again
        roll = Math.random() * 0.95; // Clamp out SLEEP range (0.95-1.0)
      }

      previousState = currentState;

      if (roll < 0.8 && canRoam) {
        // 80%: ROAM (most movement — lively pet)
        setState(STATES.ROAM);
        roamToRandomPosition();
      } else if (roll < 0.95) {
        // 15%: IDLE (brief pause)
        setState(STATES.IDLE);
      } else {
        // 5%: SLEEP (short nap, 12s max)
        enterSleep();
      }
      scheduleNextState();
    }, delay);
  }

  /** Enter sleep state with 30s auto-wake timer */
  function enterSleep() {
    setState(STATES.SLEEP);
    if (sleepTimer) clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => {
      // Auto-wake after 12 seconds (short nap)
      if (currentState === STATES.SLEEP) {
        setState(STATES.IDLE);
        scheduleNextState();
      }
    }, 12000);
  }

  function roamToRandomPosition() {
    const container = document.getElementById("pet-container");
    const overlay = document.getElementById("pet-overlay");
    if (!container || !overlay) return;

    let minX, maxX;
    const w = window.innerWidth;

    if (dockMode === "ground") {
      // Farm: full-screen roaming with padding
      minX = 40;
      maxX = w - 40;
    } else if (dockMode === "match3" || dockMode === "trivia") {
      // Mirror CSS stats-bar width: min(520px, calc(100vw - 80px)), centered
      const panelW = Math.min(520, w - 80);
      minX = (w - panelW) / 2 + 20; // 20px inner padding
      maxX = (w + panelW) / 2 - 20;
    } else {
      setState(STATES.IDLE);
      return;
    }

    // Ensure valid range
    if (maxX <= minX) {
      setState(STATES.IDLE);
      return;
    }

    const newX = minX + Math.random() * (maxX - minX);

    // Determine direction from current position
    const computedStyle = getComputedStyle(container);
    const matrix = new DOMMatrix(computedStyle.transform);
    const currentX = matrix.m41;

    // Set direction for walk animation (invert: emoji 🐕 faces LEFT, so scaleX(-1) = going right)
    const goingRight = newX > currentX;
    container.style.setProperty("--pet-dir", goingRight ? "-1" : "1");

    // Unified flow: set state class synchronously, then position via single rAF
    STATE_CLASSES.forEach((cls) => container.classList.remove(cls));
    container.classList.add("state-roam");
    currentState = STATES.ROAM;
    container.classList.add("pet-roaming");

    requestAnimationFrame(() => {
      container.style.transform = `translate3d(${newX}px, 0, 0) translateX(-50%)`;
    });

    // Return to idle after reaching destination
    roamTimeoutId = setTimeout(() => {
      roamTimeoutId = null;
      container.classList.remove("pet-roaming");
      if (currentState === STATES.ROAM) {
        setState(STATES.IDLE);
      }
    }, 3000);
  }

  /* ─── Pet Action Bubble ─── */
  function showBubble(text) {
    const container = document.getElementById("pet-container");
    if (!container) return;
    // Remove any existing bubble
    const old = container.querySelector(".pet-bubble");
    if (old) old.remove();
    const bubble = document.createElement("div");
    bubble.className = "pet-bubble";
    bubble.textContent = text;
    container.appendChild(bubble);
    setTimeout(() => bubble.remove(), 2500);
  }

  /* ─── Auto-Water (Butler ability, level ≥ 3) ─── */
  let autoWaterTimer = null;
  function startAutoWater() {
    if (autoWaterTimer) clearInterval(autoWaterTimer);
    autoWaterTimer = setInterval(() => {
      if (!petData || petData.level < 3) return;
      if (currentState === STATES.SLEEP) return;
      // Check for crops needing water via GameStore
      if (typeof GameStore === "undefined") return;
      const farmState = GameStore.getState("farm");
      if (!farmState || !farmState.plots) return;

      // Water up to 2 plots per tick
      let watered = 0;
      for (let i = 0; i < farmState.plots.length && watered < 2; i++) {
        const p = farmState.plots[i];
        if (p.crop && !p.watered) {
          if (typeof FarmGame !== "undefined" && FarmGame.water) {
            FarmGame.water(i);
            watered++;
          }
        }
      }
      if (watered > 0) {
        showBubble(`💧 Watered ${watered}!`);
        // No setState(HAPPY) — bubble is sufficient, avoids animation pop
      }
    }, 10000); // Every 10s, up to 2 plants
  }

  /* ─── Inactivity → Sleep ─── */
  function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      if (currentState !== STATES.HAPPY && currentState !== STATES.DIZZY) {
        setState(STATES.SLEEP);
      }
    }, 30000); // 30s
  }

  /* ─── Click Interaction ─── */
  function onPetClick() {
    resetInactivityTimer();

    // Wake up from sleep (cancel auto-wake timer)
    if (currentState === STATES.SLEEP) {
      if (sleepTimer) {
        clearTimeout(sleepTimer);
        sleepTimer = null;
      }
      setState(STATES.IDLE);
      scheduleNextState();
      spawnHeart();
      return;
    }

    clickCount++;
    if (clickResetTimer) clearTimeout(clickResetTimer);
    clickResetTimer = setTimeout(() => {
      clickCount = 0;
    }, 2000);

    if (clickCount >= 5) {
      // Easter egg: dizzy
      setState(STATES.DIZZY);
      clickCount = 0;
      setTimeout(() => {
        setState(STATES.IDLE);
        scheduleNextState();
      }, 2000);
    } else {
      setState(STATES.HAPPY);
      spawnHeart();
      setTimeout(() => {
        setState(STATES.IDLE);
      }, 1200);
    }

    // Toggle info panel on double-tap
    if (clickCount === 2) {
      toggleInfoPanel();
    }
  }

  function spawnHeart() {
    if (heartPool.length === 0) return;
    const el = heartPool[heartPoolIdx % HEART_POOL_SIZE];
    heartPoolIdx++;

    const emojis = ["❤️", "💕", "✨", "⭐"];
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.setProperty("--hx", Math.random() * 30 - 15 + "px");

    // Re-trigger animation by removing/re-adding class
    el.classList.remove("pet-heart");
    el.style.display = "";
    void el.offsetWidth;
    el.classList.add("pet-heart");
    setTimeout(() => {
      el.style.display = "none";
    }, 1200);
  }

  /* ─── Info Panel ─── */
  function toggleInfoPanel() {
    panelOpen = !panelOpen;
    const panel = document.getElementById("pet-info-panel");
    if (panel) {
      panel.style.display = panelOpen ? "block" : "none";
      if (panelOpen) renderInfoPanel();
    }
  }

  function renderInfoPanel() {
    const panel = document.getElementById("pet-info-panel");
    if (!panel || !petData) return;

    const xpPct = ((petData.xp / petData.xpToNextLevel) * 100).toFixed(1);

    panel.innerHTML = `
      <button class="pet-info-close" id="pet-info-close">✕</button>
      <div class="pet-info-header">
        <span class="pet-info-name">${SKINS[petData.skinId] || "🐕"} ${petData.name}</span>
        <span class="pet-info-level">Lv ${petData.level}</span>
      </div>
      <div class="pet-info-xp-bar">
        <div class="pet-info-xp-fill" style="width: ${xpPct}%"></div>
      </div>
      <div class="pet-info-xp-text">${petData.xp} / ${petData.xpToNextLevel} XP</div>
      <div class="pet-info-abilities">
        <span class="pet-ability ${petData.abilities.autoHarvest ? "unlocked" : ""}"
              title="Automatically harvests fully grown crops while you're offline (costs 1⚡ each)">
          ${petData.abilities.autoHarvest ? "✅" : "🔒"} Auto-Harvest (Lv 3)
        </span>
        <span class="pet-ability ${petData.abilities.autoWater ? "unlocked" : ""}"
              title="Automatically waters unwatered crops while you're offline (free)">
          ${petData.abilities.autoWater ? "✅" : "🔒"} Auto-Water (Lv 5)
        </span>
        <span class="pet-ability ${petData.abilities.autoPlant ? "unlocked" : ""}"
              title="Automatically plants seeds on empty plots while you're offline (costs 2⚡ each)">
          ${petData.abilities.autoPlant ? "✅" : "🔒"} Auto-Plant (Lv 7)
        </span>
      </div>
    `;

    // Setup close button
    const closeBtn = document.getElementById("pet-info-close");
    if (closeBtn) {
      closeBtn.onclick = () => toggleInfoPanel();
    }
  }

  /* ─── Sync from server data ─── */
  function syncFromServer(pet) {
    if (!pet) return;
    petData = pet;
    if (typeof GameStore !== "undefined") {
      GameStore.setState("pet", pet);
    }
    const sprite = document.getElementById("pet-sprite");
    if (sprite) {
      sprite.textContent = SKINS[pet.skinId] || SKINS.basic_dog;
    }
  }

  /* ─── Smart Docking ─── */
  function setDockMode(mode) {
    dockMode = mode;
    const container = document.getElementById("pet-container");
    if (container) {
      // Clear roaming transition to prevent flicker during dock switch
      container.classList.remove("pet-roaming");
    }
    if (mode === "match3" || mode === "trivia") {
      // Cancel active roam, let state machine pick zone-aware roam
      if (currentState === STATES.ROAM) {
        setState(STATES.IDLE);
      }
    }
  }

  function getDockMode() {
    return dockMode;
  }

  return {
    init,
    syncFromServer,
    toggleInfoPanel,
    setDockMode,
    getDockMode,
  };
})();
