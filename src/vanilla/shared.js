/* ═══════════════════════════════════════════════════
 *  Game Hub — Shared Module (v6.2.0)
 *  Discord SDK auth, API helper, screen navigation
 *  CSP-compliant: no inline handlers, no external fonts
 *  v5: Native ES Module (was global IIFE)
 * ═══════════════════════════════════════════════════ */
import { GameStore } from "./store.js";
import { prefetchCrops } from "./crops.js";
import { validateStoredToken, showAuthDialog, getStoredAuth, logout } from "./auth-ui.js";

export const HUB = {
  userId: null,
  username: "Player",
  accessToken: null,
  authMode: "demo", // "discord" | "simple" | "demo"
  sdk: null,
  currentScreen: 2, // 0=Trivia, 1=Blox, 2=Farm, 3=Match3, 4=Merge
  screenNames: ["trivia", "blox", "farm", "match3", "merge"],
  initialized: {
    trivia: false,
    blox: false,
    farm: false,
    match3: false,
    merge: false,
  },
  isTouchDevice: false,
  swipeBlocked: false, // true when Blox game is active to prevent accidental navigation
  viewTransitionActive: false, // Prevents showModal trapping bug
  // v7.1: Interruption & Comfort System — return-tier tracking
  lastActiveTimestamp: 0,
  lastActiveGame: 2, // screen index at time of backgrounding
};

// ─── Module registry (set by main.js via setModules()) ───
let _modules = {
  FarmGame: null,
  TriviaGame: null,
  Match3Game: null,
  BloxGame: null,
  MergeGame: null,
  PetCompanion: null,
  HUD: null,
};

/** Called by main.js after all modules are imported */
export function setModules(mods) {
  Object.assign(_modules, mods);
}

/* ─── Auth Init (Discord SDK or Simple Auth or Demo) ─── */
export async function initDiscord() {
  // Prefetch crops data in parallel with auth (they're static, so start early)
  prefetchCrops();

  // 1. Fetch server config
  let clientId = "";
  let simpleAuthEnabled = false;
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      clientId = data.clientId || "";
      simpleAuthEnabled = !!data.simpleAuthEnabled;
    }
  } catch (e) {
    console.warn("Failed to fetch config:", e.message);
  }

  // 2. Try Discord Embedded App SDK first (only works inside Discord iframe)
  if (clientId && typeof DiscordSDK !== "undefined") {
    try {
      const sdk = new DiscordSDK(clientId);
      await sdk.ready();
      console.log("Discord SDK ready");

      const { code } = await sdk.commands.authorize({
        client_id: clientId,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "guilds"],
      });

      const tokenRes = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        HUB.accessToken = tokenData.access_token;
        HUB.authMode = "discord";

        const userRes = await fetch("https://discord.com/api/users/@me", {
          headers: { Authorization: `Bearer ${HUB.accessToken}` },
        });
        const user = await userRes.json();
        HUB.userId = user.id;
        HUB.username = user.global_name || user.username || "Player";

        await sdk.commands.authenticate({ access_token: HUB.accessToken });
        HUB.sdk = sdk;
        console.log(`Discord auth OK: ${HUB.username} (${HUB.userId})`);
        return;
      }
    } catch (e) {
      console.warn("Discord SDK init failed (expected outside Discord):", e.message || e);
    }
  }

  // 3. Try Simple Auth (stored session or login dialog)
  if (simpleAuthEnabled) {
    // Check for existing session in localStorage
    const stored = await validateStoredToken();
    if (stored) {
      HUB.accessToken = stored.token;
      HUB.userId = stored.userId;
      HUB.username = stored.username;
      HUB.authMode = "simple";
      console.log(`Simple auth restored: ${HUB.username} (${HUB.userId})`);
      return;
    }

    // No stored session — show login/register dialog
    console.log("No session found — showing login dialog");
    const authResult = await showAuthDialog();
    if (authResult) {
      HUB.accessToken = authResult.token;
      HUB.userId = authResult.userId;
      HUB.username = authResult.username;
      HUB.authMode = "simple";
      console.log(`Simple auth OK: ${HUB.username} (${HUB.userId})`);
      return;
    }
    // User chose "Continue as Guest" — fall through to demo mode
  }

  // 4. Demo mode fallback
  HUB.userId = "hub_" + Math.random().toString(36).slice(2, 8);
  HUB.username = "Player";
  HUB.authMode = "demo";
  console.log(`Demo mode: ${HUB.userId}`);
}

/** Expose logout for external use (React HUD, etc.) */
export { logout };

/* ─── API Helper (auto-attaches auth, with retry + timeout) ─── */
export async function api(path, body) {
  const MAX_RETRIES = 1;
  const TIMEOUT_MS = 8000; // v6.2.0: hard timeout to prevent perceived freeze
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const headers = { "Content-Type": "application/json" };
    if (HUB.accessToken) {
      headers["Authorization"] = `Bearer ${HUB.accessToken}`;
    }
    // v6.2.0: AbortController timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(path, {
        method: body ? "POST" : "GET",
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`API ${path} → ${res.status}: ${text}`);
        return { error: `Server error ${res.status}`, _httpStatus: res.status };
      }
      return res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        console.error(`API ${path} timed out after ${TIMEOUT_MS}ms`);
        showToast("⏳ Server too slow — try again", "error");
        return { error: "TIMEOUT" };
      }
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
export function navigate(dir) {
  const maxScreen = HUB.screenNames.length - 1;
  const next = HUB.currentScreen + dir;
  if (next < 0 || next > maxScreen) return;
  goToScreen(next);
}

export function goToScreen(index) {
  const maxScreen = HUB.screenNames.length - 1;
  if (index < 0 || index > maxScreen || index === HUB.currentScreen) return;

  // v6.2.0: Set spatial slide direction
  const isBack = index < HUB.currentScreen;
  document.documentElement.dataset.transition = isBack
    ? "slide-right"
    : "slide-left";

  // v6.2.0: Close ALL open dialogs before screen transition
  // Prevents invisible backdrops from trapping pointer events
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());

  const updateDOM = () => {
    HUB.currentScreen = index;
    applyScreenClasses();
    updateNavUI();
    updatePetDock();
    triggerScreenCallbacks();
    // Update farm notification badge when switching screens
    if (_modules.FarmGame?.updateFarmBadge) {
      _modules.FarmGame.updateFarmBadge();
    }
  };

  // v6.2.0: View Transition safety wrapper — prevents permanent blocking
  // pseudo-layer in Discord Electron if transition fails or hangs.
  if (document.startViewTransition) {
    try {
      HUB.viewTransitionActive = true;
      const vt = document.startViewTransition(() => updateDOM());
      // Safety: force-skip if transition hangs >500ms
      const safetyTimer = setTimeout(() => {
        try {
          vt.skipTransition();
        } catch (_) {}
      }, 500);
      vt.finished
        .then(() => {
          clearTimeout(safetyTimer);
          HUB.viewTransitionActive = false;
        })
        .catch(() => {
          clearTimeout(safetyTimer);
          HUB.viewTransitionActive = false;
        });
    } catch (_) {
      HUB.viewTransitionActive = false;
      // Fallback: View Transitions API threw — just update immediately
      updateDOM();
    }
  } else {
    // Fallback for older browsers (instant switch)
    updateDOM();
  }
}

/**
 * v6.2.0: Safe modal opener — prevents dialog stacking traps.
 * Closes all open dialogs before showing a new one.
 * Adds backdrop click-to-close on every modal.
 */
export function safeShowModal(dialogEl) {
  if (!dialogEl) return;

  // Prevent invisible dialogs: If the dialog belongs to an inactive screen, drop it.
  const screenNode = dialogEl.closest(".screen");
  if (screenNode && !screenNode.classList.contains("active")) {
    console.warn(
      "safeShowModal aborted: screen is not active for",
      dialogEl.id,
    );
    return;
  }

  const show = () => {
    // Close any other open dialogs first (prevent stacking)
    document.querySelectorAll("dialog[open]").forEach((d) => {
      if (d !== dialogEl) d.close();
    });
    if (!dialogEl.open) {
      dialogEl.showModal();

      // Backdrop click-to-close (Fixed: no { once: true } trap)
      const onBackdropClick = (e) => {
        // We only want to close if clicking exactly ON the backdrop element,
        // not on the inner dialog card itself.
        // Because <dialog> pads the content, the actual click targets are:
        if (e.target === dialogEl) {
          // Double check bounds to be absolutely certain
          const rect = dialogEl.getBoundingClientRect();
          const isInDialog =
            rect.top <= e.clientY &&
            e.clientY <= rect.top + rect.height &&
            rect.left <= e.clientX &&
            e.clientX <= rect.left + rect.width;

          if (!isInDialog) {
            dialogEl.close();
            dialogEl.removeEventListener("click", onBackdropClick);
          }
        }
      };

      dialogEl.addEventListener("click", onBackdropClick);
    }
  };

  // If a view transition is currently capturing the DOM, the top layer intercepts all pointer events.
  // Delay modal opening until transition safely resolves.
  if (HUB.viewTransitionActive) {
    const checkInterval = setInterval(() => {
      if (!HUB.viewTransitionActive) {
        clearInterval(checkInterval);
        show();
      }
    }, 50);
  } else {
    show();
  }
}

/** Smart Docking: smooth transition between dock positions */
export function updatePetDock() {
  const overlay = document.getElementById("pet-overlay");
  const container = document.getElementById("pet-container");
  if (!overlay || !container) return;

  const isFarm = HUB.currentScreen === 2;
  const isTrivia = HUB.currentScreen === 0;
  const isMatch3 = HUB.currentScreen === 3;
  const isBlox = HUB.currentScreen === 1;
  const isMerge = HUB.currentScreen === 4;

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
  if (_modules.PetCompanion?.setDockMode) {
    _modules.PetCompanion.setDockMode(newPetMode);
  }
}

// v4.16: Cached DOM collections (populated once at init)
let _cachedScreens = [];
let _cachedNavDots = [];
let _cachedNavTabs = [];

function applyScreenClasses() {
  // Re-query if cache is empty or contains detached (replaced by React) nodes
  if (_cachedScreens.length === 0 || !_cachedScreens[0].isConnected) {
    _cachedScreens = Array.from(document.querySelectorAll(".screen"));
  }
  for (let i = 0; i < _cachedScreens.length; i++) {
    _cachedScreens[i].classList.toggle("active", i === HUB.currentScreen);
  }
}

function updateNavUI() {
  const $left = document.getElementById("nav-left");
  const $right = document.getElementById("nav-right");
  const maxScreen = HUB.screenNames.length - 1;
  if ($left) $left.classList.toggle("hidden", HUB.currentScreen === 0);
  if ($right)
    $right.classList.toggle("hidden", HUB.currentScreen === maxScreen);

  // Desktop dots (cached)
  for (let i = 0; i < _cachedNavDots.length; i++) {
    _cachedNavDots[i].classList.toggle("active", i === HUB.currentScreen);
  }
  // Mobile bottom nav-bar (cached)
  for (const tab of _cachedNavTabs) {
    const idx = parseInt(tab.dataset.screen, 10);
    tab.classList.toggle("active", idx === HUB.currentScreen);
  }
}

function triggerScreenCallbacks() {
  const name = HUB.screenNames[HUB.currentScreen];

  // v6.2.1: onLeave callbacks — cancel pending timers and syncs
  for (const screenName of HUB.screenNames) {
    if (screenName !== name) {
      if (screenName === "match3") _modules.Match3Game?.onLeave?.();
      if (screenName === "blox") _modules.BloxGame?.onLeave?.();
      if (screenName === "merge") _modules.MergeGame?.onLeave?.();
    }
  }

  // Screen leave callbacks (hide elements that might leak into other screens)
  if (name !== "trivia" && _modules.TriviaGame?.onLeave) {
    _modules.TriviaGame.onLeave();
  }

  // Lazy init
  if (!HUB.initialized[name]) {
    HUB.initialized[name] = true;
    if (name === "farm") _modules.FarmGame?.init();
    if (name === "trivia") _modules.TriviaGame?.init();
    if (name === "match3") _modules.Match3Game?.init();
    if (name === "blox") _modules.BloxGame?.init();
    if (name === "merge") _modules.MergeGame?.init();
  }
  // Screen enter callbacks
  if (name === "farm") _modules.FarmGame?.onEnter();
  if (name === "trivia") _modules.TriviaGame?.onEnter();
  if (name === "match3") _modules.Match3Game?.onEnter();
  if (name === "blox") _modules.BloxGame?.onEnter();
  if (name === "merge") _modules.MergeGame?.onEnter();

  // 7.1: Farm Shop FAB — visible only on farm screen
  const fab = document.getElementById("farm-shop-fab");
  if (fab) fab.classList.toggle("visible", name === "farm");
}

/* ─── Centralized Toast Queue ─── */
const MAX_TOASTS = 3;
const _toastIcons = { success: "✅ ", error: "❌ ", info: "ℹ️ " };
let _lastToastMsg = "";
let _lastToastTime = 0;

function initToastContainer() {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(msg, type) {
  // Dedup: skip if same exact message within 1s
  const now = Date.now();
  if (msg === _lastToastMsg && now - _lastToastTime < 1000) return;
  _lastToastMsg = msg;
  _lastToastTime = now;

  const container = initToastContainer();

  // Enforce max stack size by popping the oldest (first child)
  while (container.children.length >= MAX_TOASTS) {
    container.firstChild.remove();
  }

  const el = document.createElement("div");
  el.className = "toast" + (type ? ` toast-${type}` : "");
  const icon = type && _toastIcons[type] ? _toastIcons[type] : "";
  el.innerHTML = `<span>${icon}${msg}</span>`;

  container.appendChild(el);

  // Trigger reflow for intro animation
  void el.offsetWidth;
  el.classList.add("show");

  // Audit 9: Swipe to dismiss (Fixed memory leak)
  let startX = 0,
    currentX = 0;

  const onPointerMove = (e) => {
    if (!startX) return;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    currentX = Math.max(0, clientX - startX); // Only swipe right
    el.style.setProperty("--swipe-x", `${currentX}px`);
  };

  const onPointerUp = () => {
    if (!startX) return;
    startX = 0;
    el.style.transition = ""; // Restore css transition

    // Clean up window listeners immediately to prevent memory leaks
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);
    window.removeEventListener("touchmove", onPointerMove);
    window.removeEventListener("touchend", onPointerUp);

    if (currentX > 75) {
      el.classList.add("swiped-out");
      el.addEventListener("transitionend", () => el.remove(), { once: true });
    } else {
      el.style.setProperty("--swipe-x", "0px"); // snap back
    }
    currentX = 0;
  };

  const onPointerDown = (e) => {
    startX = e.clientX || (e.touches && e.touches[0].clientX);
    el.style.transition = "none";

    // Attach move/up listeners dynamically only when actively dragging
    window.addEventListener("mousemove", onPointerMove, { passive: true });
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchmove", onPointerMove, { passive: true });
    window.addEventListener("touchend", onPointerUp);
  };

  el.addEventListener("mousedown", onPointerDown);
  el.addEventListener("touchstart", onPointerDown, { passive: true });

  // Auto remove after 2.5s (matching CSS progress bar)
  setTimeout(() => {
    if (!el.classList.contains("swiped-out") && document.body.contains(el)) {
      el.classList.remove("show");
      el.addEventListener("transitionend", () => el.remove(), { once: true });
    }
  }, 2500);
}

/* ─── Sleep ─── */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ─── Bind Navigation Buttons (CSP-safe, no inline handlers) ─── */
export function bindNavigation() {
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
  const mergeNavDot = document.getElementById("nav-dot-merge");
  if (mergeNavDot) mergeNavDot.addEventListener("click", () => goToScreen(4));

  // Mobile bottom nav-bar tabs
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const idx = parseInt(tab.dataset.screen, 10);
      if (!isNaN(idx)) goToScreen(idx);
    });
  });
}

/* ─── Device Detection ─── */
export function detectDevice() {
  HUB.isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  document.body.classList.add(
    HUB.isTouchDevice ? "touch-device" : "pointer-device",
  );
}

/* ─── Keyboard Navigation ─── */
export function bindKeyboardNav() {
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
export function bindTouchSwipe() {
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
export function triggerSwipeHint() {
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
        applyScreenClasses(); // Restore correct position
      },
      { once: true },
    );
  }, 800);
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
export function startArrowFlash() {
  if (_arrowFlashInterval) return;
  // v4.16: Visibility gate — skip CSS class manipulation when tab is hidden (saves battery)
  _arrowFlashInterval = setInterval(() => {
    if (document.hidden) return;
    flashNavArrows();
  }, 90000); // every 90s
}

/**
 * Populate cached DOM collections for zero-querySelectorAll navigation.
 * Must be called once after DOM is ready.
 */
export function cacheNavDOM() {
  _cachedScreens = Array.from(document.querySelectorAll(".screen"));
  _cachedNavDots = Array.from(document.querySelectorAll(".nav-dot"));
  _cachedNavTabs = Array.from(document.querySelectorAll(".nav-tab"));
}

/** Apply initial screen state */
export function applyInitialScreen() {
  applyScreenClasses();
  updateNavUI();
}

/* ═══════════════════════════════════════════════════
 *  v7.1: Interruption & Comfort System
 *  Classifies player returns into 3 tiers:
 *   Quick  (<30s)  → toast only, no modal
 *   Soft   (30s–24h) → floating comfort banner
 *   Deep   (>24h)  → welcome-back modal (handled by farm.js)
 * ═══════════════════════════════════════════════════ */
const RETURN_TIER = {
  QUICK_MS: 30_000,
  SOFT_MS: 86_400_000, // 24h
  BANNER_DURATION_MS: 5000,
};

/** Call once from main.js after boot */
export function setupInterruptionSystem() {
  HUB.lastActiveTimestamp = Date.now();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // Player backgrounded — snapshot state
      HUB.lastActiveTimestamp = Date.now();
      HUB.lastActiveGame = HUB.currentScreen;
    } else {
      // Player returned — classify tier
      const delta = Date.now() - HUB.lastActiveTimestamp;
      if (delta < RETURN_TIER.QUICK_MS) {
        // Quick Return: instant resume, subtle toast
        showToast("🌱 Back already! Nothing missed.", "success");
      } else if (delta < RETURN_TIER.SOFT_MS) {
        // Soft Return: floating comfort banner (non-blocking)
        _showComfortBanner(delta);
      }
      // Deep Return (≥24h): farm.js showWelcomeBack handles this via API response
    }
  });
}

/** Soft-return comfort banner — auto-dismissing, non-intrusive */
function _showComfortBanner(deltaMs) {
  // Prevent duplicate banners
  const existing = document.getElementById("comfort-banner");
  if (existing) existing.remove();

  const mins = Math.round(deltaMs / 60_000);
  const hours = Math.floor(mins / 60);
  const timeLabel = hours >= 1 ? `${hours}h ${mins % 60}m` : `${mins}m`;

  const gameName = HUB.screenNames[HUB.lastActiveGame] || "farm";
  const gameEmojis = {
    trivia: "🧠",
    blox: "🧱",
    farm: "🌱",
    match3: "💎",
    merge: "✨",
  };
  const emoji = gameEmojis[gameName] || "🌱";

  const banner = document.createElement("div");
  banner.id = "comfort-banner";
  banner.className = "comfort-banner";
  banner.innerHTML = `
    <span class="comfort-banner-text">${emoji} Your ${gameName} grew while you were away (${timeLabel})</span>
    <button class="comfort-banner-dismiss" aria-label="Dismiss">✕</button>
  `;
  document.body.appendChild(banner);

  // Trigger enter animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => banner.classList.add("show"));
  });

  // Dismiss handler
  banner
    .querySelector(".comfort-banner-dismiss")
    .addEventListener("click", () => {
      banner.classList.remove("show");
      banner.addEventListener("transitionend", () => banner.remove(), {
        once: true,
      });
    });

  // Auto-dismiss
  setTimeout(() => {
    if (document.body.contains(banner)) {
      banner.classList.remove("show");
      banner.addEventListener("transitionend", () => banner.remove(), {
        once: true,
      });
    }
  }, RETURN_TIER.BANNER_DURATION_MS);
}

/** Exported for tests: return-tier thresholds */
export { RETURN_TIER };

/* ═══════════════════════════════════════════════════
 *  v7.2: Theme System — Expanded Cozy Identity Layer
 *  Manages [data-theme] on <html>. Supports:
 *  - "neon-night" (default dark, no attribute needed)
 *  - "cozy-day" (warm light mode)
 *  - "soft-fantasy" (plum/rose/lavender dark)
 *  - "minimal-calm" (stone white/sage zen)
 *  - "seasonal" (auto-rotate by month)
 *  - "auto" (follows OS prefers-color-scheme)
 * ═══════════════════════════════════════════════════ */
const THEME_KEY = "hub_theme";
export const VALID_THEMES = [
  "neon-night",
  "cozy-day",
  "soft-fantasy",
  "minimal-calm",
  "seasonal",
  "auto",
];

/** Map month (0-11) → seasonal theme suggestion */
function _getSeasonalTheme() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return "soft-fantasy"; // Spring: Mar-May
  if (month >= 5 && month <= 7) return "cozy-day"; // Summer: Jun-Aug
  if (month >= 8 && month <= 10) return "neon-night"; // Autumn: Sep-Nov
  return "neon-night"; // Winter: Dec-Feb
}

function _resolveTheme(pref) {
  if (pref === "seasonal") return _getSeasonalTheme();
  if (pref === "auto" || !VALID_THEMES.includes(pref)) {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "cozy-day"
      : "neon-night";
  }
  return pref;
}

function _applyTheme(resolved) {
  if (resolved === "neon-night") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", resolved);
  }
}

export function initTheme() {
  const pref = localStorage.getItem(THEME_KEY) || "auto";
  _applyTheme(_resolveTheme(pref));

  // Live OS preference change listener
  window
    .matchMedia("(prefers-color-scheme: light)")
    .addEventListener("change", () => {
      const current = localStorage.getItem(THEME_KEY) || "auto";
      if (current === "auto") {
        _applyTheme(_resolveTheme("auto"));
      }
    });
}

export function setTheme(name) {
  if (!VALID_THEMES.includes(name)) name = "auto";
  localStorage.setItem(THEME_KEY, name);
  _applyTheme(_resolveTheme(name));
}

export function getTheme() {
  return localStorage.getItem(THEME_KEY) || "auto";
}
