import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const hudPath = path.join(__dirname, "..", "src", "vanilla", "hud.js");

function loadHudSandbox(apiMock) {
  const code = fs.readFileSync(hudPath, "utf-8");

  // Remove imports
  let safeCode = code.replace(/^import\s+.*$/gm, "");

  // Transform exports to local variables
  safeCode = safeCode.replace(/^export\s+const\s+/gm, "const ");
  safeCode = safeCode.replace(/^export\s+function\s+/gm, "function ");
  safeCode = safeCode.replace(/^export\s+let\s+/gm, "let ");

  // Expose HUD
  safeCode += `
    globalThis.HUD = HUD;
  `;

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
    console: {
      warn: (...args) => {
        if (sandbox.console.warnCalls) {
          sandbox.console.warnCalls.push(args);
        } else {
          sandbox.console.warnCalls = [args];
        }
      },
      log: () => {},
      error: () => {}
    },
    Array: Array,
    Object: Object,
    String: String,
    window: {
      dispatchEvent: () => {},
      addEventListener: () => {}
    },
    document: {
      hidden: false,
      addEventListener: () => {},
      getElementById: () => null,
      dispatchEvent: () => {}
    },
    CustomEvent: class CustomEvent { constructor(type, detail) { this.type = type; Object.assign(this, detail); } },

    // Mocks for dependencies
    GameStore: {
      registerSlice: () => {},
      setState: () => {},
      getState: () => null,
      subscribe: () => {}
    },
    getCropsCache: () => null,
    loadCropsFromStorage: () => null,
    HUB: { userId: "test_user" },
    api: apiMock,
    apiBatched: () => {},
    goToScreen: () => {},
    showToast: () => {},
    safeShowModal: () => {},
    CROPS: {},
    MERGE_CHAINS: {},
    hudStore: {
      getState: () => ({
        activeQuests: 0,
        setActiveQuests: () => {}
      })
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(safeCode, sandbox);

  return { HUD: sandbox.globalThis.HUD, sandbox };
}

describe("HUD Module", () => {
  describe("fetchResources", () => {
    it("catches api error, logs warning, and returns null", async () => {
      const apiMock = async () => {
        throw new Error("Network error");
      };

      const { HUD, sandbox } = loadHudSandbox(apiMock);

      const result = await HUD.fetchResources();

      assert.strictEqual(result, null);
      assert.ok(sandbox.console.warnCalls);
      assert.strictEqual(sandbox.console.warnCalls.length, 1);
      assert.strictEqual(sandbox.console.warnCalls[0][0], "HUD: failed to fetch resources");
      assert.ok(sandbox.console.warnCalls[0][1] instanceof Error);
      assert.strictEqual(sandbox.console.warnCalls[0][1].message, "Network error");
    });
  });
});
