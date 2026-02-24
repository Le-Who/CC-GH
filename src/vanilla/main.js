/* ═══════════════════════════════════════════════════
 *  Game Hub — Main Entry Point (v6.2.0)
 *  Single <script type="module"> boot orchestrator.
 *  Imports all modules and runs the init sequence.
 *  v5: Replaces the DOMContentLoaded block from shared.js
 * ═══════════════════════════════════════════════════ */

import { GameStore } from "./store.js";
import { GameStore as MonetizationStore } from "./store-ui.js";
import { QuestDropdown } from "./quest.js";
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
  setupInterruptionSystem,
  initTheme,
  setTheme,
  VALID_THEMES,
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
export async function bootApp() {
  // Wait a tick for React to finish rendering strictly
  await new Promise((resolve) => setTimeout(resolve, 0));

  // v7.1: Apply saved theme before any DOM renders (prevents flash)
  initTheme();

  // Device detection (must be first for CSS classes)
  detectDevice();

  // Bind all navigation buttons (CSP-safe)
  // Disable the old vanilla bottom nav binding so it doesn't conflict with React
  // bindNavigation();

  // Keyboard arrow keys
  bindKeyboardNav();

  // Touch swipe on mobile
  bindTouchSwipe();

  // Initialize Discord auth (or fallback to demo)
  await initDiscord();

  // Initialize Resources & Timers (HUD now acts purely as a logic controller)
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

  // v7.1: Interruption & Comfort System (return-tier detection)
  setupInterruptionSystem();

  // Expose HUB and navigation to window for React integration
  window.HUB = HUB;
  window.HUB.goToScreen = goToScreen;
  window.HUB.showToast = showToast;
  window.HUB.api = api;

  // ═══ Phase 3 (v4.11): Cognitive Load Reduction ═══

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

  // v7.2: Theme picker cycle button
  const themeBtn = document.getElementById("theme-cycle-btn");
  if (themeBtn) {
    const themeLabels = {
      "neon-night": "🌙 Neon Night",
      "cozy-day": "☀️ Cozy Day",
      "soft-fantasy": "🌸 Soft Fantasy",
      "minimal-calm": "🍃 Minimal Calm",
      seasonal: "🗓️ Seasonal",
      auto: "🔄 Auto",
    };
    const themes = VALID_THEMES;
    let idx = themes.indexOf(localStorage.getItem("hub_theme") || "auto");
    if (idx < 0) idx = themes.length - 1;
    themeBtn.textContent = themeLabels[themes[idx]] || themes[idx];
    themeBtn.addEventListener("click", () => {
      idx = (idx + 1) % themes.length;
      setTheme(themes[idx]);
      themeBtn.textContent = themeLabels[themes[idx]] || themes[idx];
    });
  }

  // Signal to React (WelcomeScreen) that boot is complete
  window.HUB.bootComplete = true;
}

// Ensure the default export is bootApp
export default bootApp;
