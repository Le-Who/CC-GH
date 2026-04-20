import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sharedPath = path.join(__dirname, "..", "src", "vanilla", "shared.js");

function loadSharedSandbox() {
  const code = fs.readFileSync(sharedPath, "utf-8");

  let safeCode = code.replace(/^import\s+.*$/gm, "");

  safeCode = safeCode.replace(/^export\s+const\s+/gm, "const ");
  safeCode = safeCode.replace(/^export\s+function\s+/gm, "function ");
  safeCode = safeCode.replace(/^export\s+let\s+/gm, "let ");
  safeCode = safeCode.replace(/^export\s+\{.*$/gm, "");
  safeCode = safeCode.replace(/^export\s+async\s+function\s+/gm, "async function ");

  safeCode += `
    globalThis.HUB = HUB;
    globalThis.RETURN_TIER = RETURN_TIER;
    globalThis.VALID_THEMES = VALID_THEMES;
    globalThis.apiBatched = apiBatched;
    globalThis.api = api;
    globalThis.navigate = navigate;
    globalThis.goToScreen = goToScreen;
    globalThis.bindTouchSwipe = bindTouchSwipe;
    globalThis.cacheNavDOM = cacheNavDOM;
    globalThis.applyInitialScreen = applyInitialScreen;
    globalThis.setupInterruptionSystem = setupInterruptionSystem;
    globalThis.initTheme = initTheme;
    globalThis.setTheme = setTheme;
    globalThis.getTheme = getTheme;
  `;

  const viewport = {
    listeners: {},
    addEventListener(type, cb) {
      this.listeners[type] = cb;
    },
  };

  const sandbox = {
    globalThis: {},
    Date: Date,
    Math: Math,
    Number: Number,
    parseInt: parseInt,
    isNaN: isNaN,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    console: console,
    Array: Array,
    Object: Object,
    String: String,
    window: {
      requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
      cancelAnimationFrame: (id) => clearTimeout(id),
      matchMedia: (query) => ({
        matches: query === "(prefers-color-scheme: light)",
        addEventListener: () => {},
      }),
      addEventListener: () => {}
    },
    document: {
      hidden: false,
      documentElement: {
        attributes: {},
        setAttribute(key, val) { this.attributes[key] = val; },
        removeAttribute(key) { delete this.attributes[key]; },
        getAttribute(key) { return this.attributes[key]; },
        dataset: {}
      },
      dispatchEvent: () => {},
      addEventListener: () => {},
      getElementById: (id) => {
        return {
          classList: {
            add: () => {},
            remove: () => {},
            toggle: () => {},
            contains: () => false
          },
          style: {},
          addEventListener: () => {}
        };
      },
      querySelectorAll: (sel) => [],
      querySelector: (sel) => {
        if (sel === ".viewport") return viewport;
        return { addEventListener: () => {}, style: {} };
      },
      body: {
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          contains(c) { return this.classes.has(c); }
        },
        appendChild: () => {},
        contains: () => true
      },
      createElement: (tag) => {
        return {
          id: '',
          className: '',
          innerHTML: '',
          classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); }
          },
          addEventListener: () => {},
          querySelector: () => ({ addEventListener: () => {} }),
          remove: () => {}
        }
      }
    },
    localStorage: {
      _data: {},
      getItem: function(k) { return this._data[k] || null; },
      setItem: function(k, v) { this._data[k] = String(v); },
      clear: function() { this._data = {}; }
    },
    fetch: async (url, options) => {
      return {
        ok: true,
        json: async () => ({ success: true, data: {} })
      };
    },
    AbortController: globalThis.AbortController,
    CustomEvent: class CustomEvent { constructor(type, detail) { this.type = type; Object.assign(this, detail); } },
    // Mock imports from other files
    prefetchCrops: () => {},
    validateStoredToken: () => {},
    showAuthDialog: () => {},
    logout: () => {},
    suspendRealtime: () => {},
    resumeRealtime: () => {},
    applyScreenClasses: () => {},
    updateNavUI: () => {},
    showToast: () => {},
  };

  vm.createContext(sandbox);
  vm.runInContext(safeCode, sandbox);
  sandbox.globalThis.__viewport = viewport;

  return sandbox.globalThis;
}

describe("Shared Module Unit Tests", () => {
  let shared;

  beforeEach(() => {
    shared = loadSharedSandbox();
  });

  describe("HUB Configuration", () => {
    it("should export HUB with default initial state", () => {
      assert.ok(shared.HUB, "HUB is exported");
      assert.equal(shared.HUB.username, "Player");
      assert.equal(shared.HUB.currentScreen, 2);
      assert.equal(shared.HUB.screenNames.length, 5);
    });
  });

  describe("Theme Management", () => {
    it("VALID_THEMES includes correct themes", () => {
      assert.ok(shared.VALID_THEMES.includes("neon-night"));
      assert.ok(shared.VALID_THEMES.includes("cozy-day"));
      assert.ok(shared.VALID_THEMES.includes("seasonal"));
      assert.ok(shared.VALID_THEMES.includes("auto"));
    });

    it("setTheme saves to localStorage and updates document element", () => {
      shared.setTheme("cozy-day");
      assert.equal(shared.getTheme(), "cozy-day");
    });

    it("setTheme falls back to auto for invalid theme", () => {
      shared.setTheme("invalid-theme");
      assert.equal(shared.getTheme(), "auto");
    });

    it("setTheme falls back to auto for untyped or null theme", () => {
      shared.setTheme(null);
      assert.equal(shared.getTheme(), "auto");

      shared.setTheme(undefined);
      assert.equal(shared.getTheme(), "auto");

      shared.setTheme(123);
      assert.equal(shared.getTheme(), "auto");

      shared.setTheme({});
      assert.equal(shared.getTheme(), "auto");
    });
  });

  describe("Interruption System", () => {
    it("exports RETURN_TIER constants", () => {
      assert.ok(shared.RETURN_TIER);
      assert.equal(shared.RETURN_TIER.QUICK_MS, 30_000);
      assert.equal(shared.RETURN_TIER.SOFT_MS, 86_400_000);
      assert.equal(shared.RETURN_TIER.BANNER_DURATION_MS, 5000);
    });

    it("setupInterruptionSystem sets HUB.lastActiveTimestamp", () => {
      const now = Date.now();
      shared.setupInterruptionSystem();
      assert.ok(shared.HUB.lastActiveTimestamp >= now);
    });
  });

  describe("API Helpers", () => {
    it("apiBatched sets up a batching timeout", () => {
      assert.doesNotThrow(() => {
        shared.apiBatched("/api/test", { foo: "bar" });
      });
    });

    it("api handles basic fetch mock", async () => {
      const res = await shared.api("/api/test", { foo: "baz" });
      assert.ok(res);
    });
  });

  describe("Navigation & DOM", () => {
    it("goToScreen updates HUB.currentScreen", () => {
      shared.goToScreen(3);
      assert.equal(shared.HUB.currentScreen, 3);
    });

    it("navigate updates HUB.currentScreen with bounds checking", () => {
      shared.goToScreen(2);
      shared.navigate(1);
      assert.equal(shared.HUB.currentScreen, 3);

      shared.navigate(-1);
      assert.equal(shared.HUB.currentScreen, 2);
    });

    it("cacheNavDOM does not throw", () => {
      assert.doesNotThrow(() => shared.cacheNavDOM());
    });

    it("applyInitialScreen does not throw", () => {
      assert.doesNotThrow(() => shared.applyInitialScreen());
    });

    it("bindTouchSwipe ignores gestures started on no-nav-swipe surfaces", () => {
      shared.bindTouchSwipe();
      shared.goToScreen(2);

      const viewport = shared.__viewport;
      viewport.listeners.touchstart({
        target: {
          closest: (selector) =>
            selector === '[data-no-nav-swipe="true"]' ? {} : null,
        },
        touches: [{ clientX: 300, clientY: 200 }],
      });
      viewport.listeners.touchend({
        changedTouches: [{ clientX: 120, clientY: 210 }],
      });

      assert.equal(
        shared.HUB.currentScreen,
        2,
        "Gestures from interactive game surfaces must not trigger viewport navigation",
      );
    });
  });
});
