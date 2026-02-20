/* ═══════════════════════════════════════════════════
 *  Game Hub — Shared Module (v4.12.3)
 *  Discord SDK auth, API helper, screen navigation
 *  CSP-compliant: no inline handlers, no external fonts
 * ═══════════════════════════════════════════════════ */

const HUB = {
  userId: null,
  username: "Player",
  accessToken: null,
  sdk: null,
  currentScreen: 2, // 0=Trivia, 1=Blox, 2=Farm, 3=Match3
  screenNames: ["trivia", "blox", "farm", "match3"],
  initialized: { trivia: false, blox: false, farm: false, match3: false },
  isTouchDevice: false,
  swipeBlocked: false, // true when Blox game is active to prevent accidental navigation
};

/* ─── Discord SDK Init ─── */
/* ─── Discord SDK Init ─── */
async function initDiscord() {
  // Prefetch crops data in parallel with auth (they're static, so start early)
  window.__cropsPromise = fetch("/api/content/crops")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => {
      // Try localStorage cache as fallback (with TTL check)
      try {
        const raw = localStorage.getItem("hub_crops_cache");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // Support TTL-wrapped format { data, cachedAt }
        if (parsed && parsed.cachedAt) {
          const TTL = 24 * 60 * 60 * 1000; // 24h
          if (Date.now() - parsed.cachedAt > TTL) return null; // Expired
          return parsed.data;
        }
        // Legacy format (plain object) — use but it won't have TTL protection
        return parsed;
      } catch (_) {
        return null;
      }
    });

  // 1. Fetch Client ID Config
  let clientId = "";
  try {
    const res = await fetch("/api/config/discord");
    if (res.ok) {
      const data = await res.json();
      clientId = data.clientId;
    }
  } catch (e) {
    console.warn("Failed to fetch Discord config:", e.message);
  }

  // Fallback / Demo Mode
  if (!clientId) {
    console.log("No client_id configured — running in demo mode");
    // Fallback: demo mode — random userId
    HUB.userId = "hub_" + Math.random().toString(36).slice(2, 8);
    HUB.username = "Player";
    console.log(`Demo mode: ${HUB.userId}`);
    return;
  }

  // Try Discord Embedded App SDK (only works inside Discord iframe)
  if (typeof DiscordSDK !== "undefined") {
    try {
      const sdk = new DiscordSDK(clientId);
      await sdk.ready();
      console.log("Discord SDK ready");

      // Authorize and get code
      const { code } = await sdk.commands.authorize({
        client_id: clientId,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "guilds"],
      });

      // Exchange code for access token via our server
      const tokenRes = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        HUB.accessToken = tokenData.access_token;

        // Fetch user info
        const userRes = await fetch("https://discord.com/api/users/@me", {
          headers: { Authorization: `Bearer ${HUB.accessToken}` },
        });
        const user = await userRes.json();
        HUB.userId = user.id;
        HUB.username = user.global_name || user.username || "Player";

        // Notify SDK we're authenticated
        await sdk.commands.authenticate({ access_token: HUB.accessToken });
        HUB.sdk = sdk; // Store for voice invite access
        console.log(`Discord auth OK: ${HUB.username} (${HUB.userId})`);
        return;
      }
    } catch (e) {
      console.warn(
        "Discord SDK init failed (expected outside Discord):",
        e.message || e,
      );
    }
  } else {
    console.log("DiscordSDK not available — running in demo mode");
  }

  // If we reached here, auth failed or SDK missing -> Demo Mode as fallback
  HUB.userId = "hub_" + Math.random().toString(36).slice(2, 8);
  HUB.username = "Player";
  console.log(`Fallback Demo mode: ${HUB.userId}`);
}

/* ─── API Helper (auto-attaches auth, with retry) ─── */
async function api(path, body) {
  const MAX_RETRIES = 1;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const headers = { "Content-Type": "application/json" };
    if (HUB.accessToken) {
      headers["Authorization"] = `Bearer ${HUB.accessToken}`;
    }
    try {
      const res = await fetch(path, {
        method: body ? "POST" : "GET",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`API ${path} → ${res.status}: ${text}`);
        return { error: `Server error ${res.status}`, _httpStatus: res.status };
      }
      return res.json();
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        showToast("⚠️ Connection lost — retrying…");
        await sleep(2000);
        continue;
      }
      console.error(`API ${path} network error:`, err);
      showToast("❌ Network error — please check your connection");
      return { error: "NETWORK_ERROR" };
    }
  }
}

/* ─── Navigation ─── */
function navigate(dir) {
  const next = HUB.currentScreen + dir;
  if (next < 0 || next > 3) return;
  HUB.currentScreen = next;
  applyScreenPosition();
  updateNavUI();
  updatePetDock();
  triggerScreenCallbacks();
}

function goToScreen(index) {
  if (index < 0 || index > 3 || index === HUB.currentScreen) return;
  HUB.currentScreen = index;
  applyScreenPosition();
  updateNavUI();
  updatePetDock();
  triggerScreenCallbacks();
  // Update farm notification badge when switching screens
  if (typeof FarmGame !== "undefined" && FarmGame.updateFarmBadge) {
    FarmGame.updateFarmBadge();
  }
}

/** Smart Docking: smooth transition between dock positions */
function updatePetDock() {
  const overlay = document.getElementById("pet-overlay");
  const container = document.getElementById("pet-container");
  if (!overlay || !container) return;

  const isFarm = HUB.currentScreen === 2;
  const isTrivia = HUB.currentScreen === 0;
  const isMatch3 = HUB.currentScreen === 3;
  const isBlox = HUB.currentScreen === 1;

  // Determine new dock mode
  const newDockClass = isFarm
    ? "dock-ground"
    : isMatch3
      ? "dock-match3"
      : "dock-trivia";
  const newPetMode = isFarm ? "ground" : isMatch3 ? "match3" : "trivia";

  // Clear any roaming class to prevent transition conflicts
  container.classList.remove("pet-roaming");

  // Apply new dock class
  overlay.classList.remove("dock-ground", "dock-match3", "dock-trivia");
  overlay.classList.add(newDockClass);

  // Add transitioning class for smooth animation to dock center
  container.classList.add("pet-transitioning");
  // Clear inline transform so CSS default transform takes over (smoothly via transition)
  container.style.transform = "";

  // Clean up transition class after animation completes
  setTimeout(() => {
    container.classList.remove("pet-transitioning");
  }, 550);

  // Notify pet module of new dock mode
  if (typeof PetCompanion !== "undefined" && PetCompanion.setDockMode) {
    PetCompanion.setDockMode(newPetMode);
  }
}

function applyScreenPosition() {
  const track = document.getElementById("track");
  track.style.transform = `translateX(-${HUB.currentScreen * 100}vw)`;
}

function updateNavUI() {
  const $left = document.getElementById("nav-left");
  const $right = document.getElementById("nav-right");
  $left.classList.toggle("hidden", HUB.currentScreen === 0);
  $right.classList.toggle("hidden", HUB.currentScreen === 3);

  // Desktop dots
  document.querySelectorAll(".nav-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === HUB.currentScreen);
  });
  // Mobile bottom nav-bar
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    const idx = parseInt(tab.dataset.screen, 10);
    tab.classList.toggle("active", idx === HUB.currentScreen);
  });
}

async function triggerScreenCallbacks() {
  const name = HUB.screenNames[HUB.currentScreen];
  // Ensure the game script is loaded
  await SmartLoader.loadScreen(HUB.currentScreen);
  // Prefetch neighbors in background
  SmartLoader.prefetchNeighbors(HUB.currentScreen);

  // Screen leave callbacks (hide elements that might leak into other screens)
  if (
    name !== "trivia" &&
    typeof TriviaGame !== "undefined" &&
    TriviaGame.onLeave
  ) {
    TriviaGame.onLeave();
  }

  // Lazy init
  if (!HUB.initialized[name]) {
    HUB.initialized[name] = true;
    if (name === "farm" && typeof FarmGame !== "undefined") FarmGame.init();
    if (name === "trivia" && typeof TriviaGame !== "undefined")
      TriviaGame.init();
    if (name === "match3" && typeof Match3Game !== "undefined")
      Match3Game.init();
    if (name === "blox" && typeof BloxGame !== "undefined") BloxGame.init();
  }
  // Screen enter callbacks
  if (name === "farm" && typeof FarmGame !== "undefined") FarmGame.onEnter();
  if (name === "trivia" && typeof TriviaGame !== "undefined")
    TriviaGame.onEnter();
  if (name === "match3" && typeof Match3Game !== "undefined")
    Match3Game.onEnter();
  if (name === "blox" && typeof BloxGame !== "undefined") BloxGame.onEnter();

  // 7.1: Farm Shop FAB — visible only on farm screen
  const fab = document.getElementById("farm-shop-fab");
  if (fab) fab.classList.toggle("visible", name === "farm");
}

/* ─── Toast (v4.9: dedup + type variants + leading icons 2.4) ─── */
let _lastToastMsg = "";
let _lastToastTime = 0;
const _toastIcons = { success: "✅ ", error: "❌ ", info: "ℹ️ " };
function showToast(msg, type) {
  // Dedup: skip if same message within 1.5s
  const now = Date.now();
  if (msg === _lastToastMsg && now - _lastToastTime < 1500) return;
  _lastToastMsg = msg;
  _lastToastTime = now;

  const el = document.createElement("div");
  el.className = "toast" + (type ? ` toast-${type}` : "");
  // Prepend leading icon if type-specific icon defined and not already present (2.4)
  const icon = type && _toastIcons[type] ? _toastIcons[type] : "";
  el.textContent = icon + msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

/* ─── Sleep ─── */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ─── SmartLoader (Predictive Proximity Loading) ─── */
const SmartLoader = {
  loaded: { farm: false, trivia: false, match3: false, blox: false },
  loading: { farm: null, trivia: null, match3: null, blox: null },

  loadScript(name) {
    if (this.loaded[name]) return Promise.resolve();
    if (this.loading[name]) return this.loading[name];
    this.loading[name] = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `js/${name}.js?v=${window.__APP_VERSION__ || Date.now()}`;
      script.onload = () => {
        this.loaded[name] = true;
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed to load ${name}.js`));
      document.body.appendChild(script);
    });
    return this.loading[name];
  },

  async loadScreen(index) {
    const name = HUB.screenNames[index];
    if (name) await this.loadScript(name);
  },

  prefetchNeighbors(index) {
    setTimeout(() => {
      if (index > 0) this.loadScript(HUB.screenNames[index - 1]);
      if (index < 3) this.loadScript(HUB.screenNames[index + 1]);
    }, 2000);
  },
};

/* ─── Bind Navigation Buttons (CSP-safe, no inline handlers) ─── */
function bindNavigation() {
  // Nav arrows
  document
    .getElementById("nav-left")
    .addEventListener("click", () => navigate(-1));
  document
    .getElementById("nav-right")
    .addEventListener("click", () => navigate(1));

  // Nav dots
  document
    .getElementById("nav-dot-trivia")
    .addEventListener("click", () => goToScreen(0));
  document
    .getElementById("nav-dot-blox")
    .addEventListener("click", () => goToScreen(1));
  document
    .getElementById("nav-dot-farm")
    .addEventListener("click", () => goToScreen(2));
  document
    .getElementById("nav-dot-match3")
    .addEventListener("click", () => goToScreen(3));

  // Mobile bottom nav-bar tabs
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const idx = parseInt(tab.dataset.screen, 10);
      if (!isNaN(idx)) goToScreen(idx);
    });
  });

  // Trivia buttons
  document
    .getElementById("btn-trivia-solo")
    ?.addEventListener("click", () => TriviaGame.startSolo());
  document
    .getElementById("btn-trivia-create-duel")
    ?.addEventListener("click", () => TriviaGame.createDuel());
  document
    .getElementById("btn-trivia-join-duel")
    ?.addEventListener("click", () => TriviaGame.showJoinDuel());
  document
    .getElementById("btn-duel-copy-code")
    ?.addEventListener("click", () => TriviaGame.copyInviteCode());
  document
    .getElementById("btn-duel-create-cancel")
    ?.addEventListener("click", () => TriviaGame.cancelDuel());
  document
    .getElementById("btn-duel-join-submit")
    ?.addEventListener("click", () => TriviaGame.joinDuel());
  document
    .getElementById("btn-duel-join-back")
    ?.addEventListener("click", () => TriviaGame.showMenu());
  document
    .getElementById("btn-duel-wait-cancel")
    ?.addEventListener("click", () => TriviaGame.cancelDuel());
  document
    .getElementById("btn-trivia-forfeit")
    ?.addEventListener("click", () => TriviaGame.forfeitSolo());
  document
    .getElementById("btn-trivia-play-again")
    ?.addEventListener("click", () => TriviaGame.showMenu());
  // New v1.4 buttons
  document
    .getElementById("btn-duel-voice-invite")
    ?.addEventListener("click", () => TriviaGame.inviteFromVoice());
  document
    .getElementById("btn-duel-ready")
    ?.addEventListener("click", () => TriviaGame.duelReady());
  document
    .getElementById("btn-duel-lobby-cancel")
    ?.addEventListener("click", () => TriviaGame.cancelDuel());

  // Match-3 buttons
  document.getElementById("btn-m3-dismiss")?.addEventListener("click", () => {
    // v4.8: Dismiss game-over overlay, show mode selector with last mode pre-highlighted
    const ov = document.getElementById("m3-overlay");
    if (ov) ov.classList.remove("show");
    Match3Game.showModeSelector();
  });
  document
    .getElementById("btn-lb-tab-all")
    ?.addEventListener("click", () => Match3Game.setLbTab("all"));
  document
    .getElementById("btn-lb-tab-room")
    ?.addEventListener("click", () => Match3Game.setLbTab("room"));

  // Building Blox buttons
  document
    .getElementById("btn-blox-play-again")
    ?.addEventListener("click", () => BloxGame.startGame());
}

/* ─── Device Detection ─── */
function detectDevice() {
  HUB.isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  document.body.classList.add(
    HUB.isTouchDevice ? "touch-device" : "pointer-device",
  );
}

/* ─── Keyboard Navigation ─── */
function bindKeyboardNav() {
  document.addEventListener("keydown", (e) => {
    // Don't hijack keyboard when user is typing in an input/textarea
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "TEXTAREA" ||
      e.target.isContentEditable
    )
      return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      navigate(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      navigate(1);
    }
  });
}

/* ─── Touch Swipe Gestures ─── */
function bindTouchSwipe() {
  const viewport = document.querySelector(".viewport");
  if (!viewport) return;

  let startX = 0;
  let startY = 0;
  let swiping = false;

  viewport.addEventListener(
    "touchstart",
    (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      swiping = true;
    },
    { passive: true },
  );

  viewport.addEventListener(
    "touchend",
    (e) => {
      if (!swiping) return;
      if (HUB.swipeBlocked) {
        swiping = false;
        return;
      }
      swiping = false;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - startX;
      const dy = endY - startY;
      const THRESHOLD = 50;

      // Only trigger if horizontal swipe is dominant
      if (Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (dx < 0)
          navigate(1); // swipe left → next
        else navigate(-1); // swipe right → prev
      }
    },
    { passive: true },
  );
}

/* ─── Bounce Hint (v4.9: re-show after 3 days, item 1.4) ─── */
function triggerSwipeHint() {
  const HINT_KEY = "hub_swipe_hint_ts";
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  const last = parseInt(localStorage.getItem(HINT_KEY) || "0", 10);
  if (last && Date.now() - last < THREE_DAYS) return;
  localStorage.setItem(HINT_KEY, String(Date.now()));

  const track = document.getElementById("track");
  if (!track) return;

  // Small delay so user sees the initial state first
  setTimeout(() => {
    track.classList.add("hint-bounce");
    track.addEventListener(
      "animationend",
      () => {
        track.classList.remove("hint-bounce");
        applyScreenPosition(); // Restore correct position
      },
      { once: true },
    );
  }, 800);
}

/* ─── Nav Bar Auto-Hide (1.1 / 1.5: hide during active gameplay) ─── */
function navBarAutoHide(hide) {
  const bar = document.getElementById("nav-bar");
  if (bar) bar.classList.toggle("nav-hidden", !!hide);
}

/* ─── Arrow Hint Flash (1.2: subtle periodic flash every ~90s for 2s) ─── */
let _arrowFlashInterval = null;
function flashNavArrows() {
  const $left = document.getElementById("nav-left");
  const $right = document.getElementById("nav-right");
  if (!$left || !$right) return;

  // Only flash arrows that aren't .hidden
  [$left, $right].forEach((arrow) => {
    if (arrow.classList.contains("hidden")) return;
    arrow.classList.add("arrow-hint-flash");
    arrow.addEventListener(
      "animationend",
      () => arrow.classList.remove("arrow-hint-flash"),
      { once: true },
    );
  });
}
function startArrowFlash() {
  if (_arrowFlashInterval) return;
  _arrowFlashInterval = setInterval(flashNavArrows, 90000); // every 90s
}

/* ─── Init on load ─── */
window.addEventListener("DOMContentLoaded", async () => {
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
  if (typeof HUD !== "undefined") await HUD.init();
  if (typeof PetCompanion !== "undefined") PetCompanion.init();

  applyScreenPosition();
  updateNavUI();

  // Load ONLY the active screen (Farm), then init
  await SmartLoader.loadScreen(HUB.currentScreen);
  HUB.initialized.farm = true;
  if (typeof FarmGame !== "undefined") FarmGame.init();
  if (typeof FarmGame !== "undefined") FarmGame.onEnter();

  // Prefetch neighbor screens after 2s idle
  SmartLoader.prefetchNeighbors(HUB.currentScreen);

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
  const econOverlay = document.getElementById("econ-guide-overlay");
  const econClose = document.getElementById("econ-guide-close");
  if (econBtn && econOverlay) {
    econBtn.addEventListener("click", () => econOverlay.classList.add("show"));
    if (econClose)
      econClose.addEventListener("click", () =>
        econOverlay.classList.remove("show"),
      );
    econOverlay.addEventListener("click", (e) => {
      if (e.target === econOverlay) econOverlay.classList.remove("show");
    });
  }

  // 7.1: Farm shop FAB → switch to shop tab
  const fab = document.getElementById("farm-shop-fab");
  if (fab) {
    fab.addEventListener("click", () => {
      if (typeof FarmGame !== "undefined" && FarmGame.switchFarmTab) {
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
  window.addEventListener("resize", () => {
    updateM3CellSize();
    updateBloxCellSize();
  });
});
