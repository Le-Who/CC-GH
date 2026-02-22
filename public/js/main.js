/* ═══════════════════════════════════════════════════
 *  Game Hub — Main Entry Point (v6.1.1)
 *  Single <script type="module"> boot orchestrator.
 *  Imports all modules and runs the init sequence.
 *  v5: Replaces the DOMContentLoaded block from shared.js
 * ═══════════════════════════════════════════════════ */

import { GameStore } from "./store.js";
import {
  HUB,
  setModules,
  initDiscord,
  api,
  showToast,
  sleep,
  navigate,
  goToScreen,
  updatePetDock,
  bindNavigation,
  detectDevice,
  bindKeyboardNav,
  bindTouchSwipe,
  triggerSwipeHint,
  startArrowFlash,
  cacheNavDOM,
  applyInitialScreen,
  safeShowModal,
} from "./shared.js";
import { HUD } from "./hud.js";
import { PetCompanion, setWaterFn } from "./pet.js";
import { FarmGame } from "./farm.js";
import { TriviaModule } from "./trivia.js";
import { Match3Game } from "./match3.js";
import { BloxGame } from "./blox.js";
import { MergeGame } from "./merge.js";

// ─── Wire module references into shared.js ───
// This avoids circular imports: shared.js calls game modules
// through this registry instead of direct imports.
setModules({
  FarmGame,
  TriviaGame: TriviaModule,
  Match3Game,
  BloxGame,
  MergeGame,
  PetCompanion,
  HUD,
});

// ─── Wire pet → farm dependency (avoids circular import) ───
setWaterFn((plotIndex) => FarmGame.water(plotIndex));

// ─── Boot sequence ───
document.addEventListener("DOMContentLoaded", async () => {
  // Device detection (must be first for CSS classes)
  detectDevice();

  // Bind all navigation buttons (CSP-safe)
  bindNavigation();

  // Keyboard arrow keys
  bindKeyboardNav();

  // Touch swipe on mobile
  bindTouchSwipe();

  // Initialize Discord auth (or fallback to demo)
  await initDiscord();

  // Initialize TopHUD (Energy & Gold) + Pet Companion
  await HUD.init();
  PetCompanion.init();

  // Populate cached DOM collections for zero-querySelectorAll navigation
  cacheNavDOM();
  applyInitialScreen();

  // Init the active screen (Farm)
  HUB.initialized.farm = true;
  FarmGame.init();
  FarmGame.onEnter();

  // Bounce hint for first-time / returning visitors (1.4)
  triggerSwipeHint();

  // Start periodic arrow flash on desktop (1.2)
  if (!HUB.isTouchDevice) startArrowFlash();

  // Dismiss boot-loader overlay
  const bootLoader = document.getElementById("boot-loader");
  if (bootLoader) {
    bootLoader.classList.add("hidden");
    setTimeout(() => bootLoader.remove(), 600); // Remove from DOM after fade
  }

  // ═══ Phase 3 (v4.11): Cognitive Load Reduction ═══

  // 7.7: Economy guide overlay toggle
  const econBtn = document.getElementById("econ-guide-btn");
  const econOverlay = document.getElementById("econ-guide-modal");
  if (econBtn && econOverlay) {
    econBtn.addEventListener("click", () => {
      safeShowModal(econOverlay);
    });
  }

  // 7.1: Farm shop FAB → switch to shop tab
  const fab = document.getElementById("farm-shop-fab");
  if (fab) {
    fab.addEventListener("click", () => {
      if (FarmGame.switchFarmTab) {
        FarmGame.switchFarmTab("shop");
      }
    });
    // Show FAB on initial load if on farm screen
    if (HUB.currentScreen === 2) fab.classList.add("visible");
  }

  // 7.6: One-time energy tutorial tooltip
  const ENERGY_TUT_KEY = "hub_energy_tutorial_shown";
  if (!localStorage.getItem(ENERGY_TUT_KEY)) {
    const energyPill = document.getElementById("hud-energy");
    if (energyPill) {
      setTimeout(() => {
        const tip = document.createElement("div");
        tip.className = "energy-tutorial";
        tip.innerHTML =
          "⚡ Energy recharges over time. Feed your pet crops to restore it!" +
          ' <span class="tutorial-dismiss">✕</span>';
        energyPill.style.position = "relative";
        energyPill.appendChild(tip);
        const dismiss = tip.querySelector(".tutorial-dismiss");
        if (dismiss) {
          dismiss.addEventListener("click", () => {
            tip.remove();
            localStorage.setItem(ENERGY_TUT_KEY, "1");
          });
        }
        // Auto-dismiss after 10 seconds
        setTimeout(() => {
          if (tip.parentElement) {
            tip.remove();
            localStorage.setItem(ENERGY_TUT_KEY, "1");
          }
        }, 10000);
      }, 3000); // Show after 3s delay
    }
  }

  // 7.3: Trivia settings panel toggle
  const triviaSettingsToggle = document.getElementById(
    "trivia-settings-toggle",
  );
  const triviaSettingsPanel = document.getElementById("trivia-settings-panel");
  if (triviaSettingsToggle && triviaSettingsPanel) {
    triviaSettingsToggle.addEventListener("click", () => {
      triviaSettingsPanel.classList.toggle("open");
    });
  }

  // Cell size for match-3 based on viewport (responsive, mobile-aware)
  function updateM3CellSize() {
    const maxByWidth = Math.floor((window.innerWidth - 80) / 8);
    const maxByHeight = Math.floor((window.innerHeight - 280) / 8);
    const isMobile = window.innerWidth <= 480 || HUB.isTouchDevice;
    const cs = Math.max(
      isMobile ? 36 : 28,
      Math.min(isMobile ? 56 : 48, maxByWidth, maxByHeight),
    );
    document.documentElement.style.setProperty("--m3-cell", cs + "px");
  }

  // Cell size for Building Blox (10x10 grid, slightly smaller cells)
  function updateBloxCellSize() {
    const maxByWidth = Math.floor((window.innerWidth - 60) / 10);
    const maxByHeight = Math.floor((window.innerHeight - 320) / 10);
    const isMobile = window.innerWidth <= 480 || HUB.isTouchDevice;
    const cs = Math.max(
      isMobile ? 28 : 24,
      Math.min(isMobile ? 44 : 38, maxByWidth, maxByHeight),
    );
    document.documentElement.style.setProperty("--blox-cell", cs + "px");
  }

  updateM3CellSize();
  updateBloxCellSize();
  // v4.15.2: rAF-throttled resize to prevent layout thrashing
  let _resizePending = false;
  window.addEventListener("resize", () => {
    if (_resizePending) return;
    _resizePending = true;
    requestAnimationFrame(() => {
      updateM3CellSize();
      updateBloxCellSize();
      _resizePending = false;
    });
  });
});
