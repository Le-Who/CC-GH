import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis;
globalThis.document = {
  hidden: false,
  querySelector: () => null,
  getElementById: () => null,
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      style: {
        cssText: "",
        transform: "",
        boxShadow: "",
        transition: "",
        fontSize: "",
        left: "",
        top: "",
        opacity: ""
      },
      textContent: "",
      parentElement: null,
      remove: function() {
        this.parentElement = null;
      },
      getBoundingClientRect: () => ({ left: 10, top: 10, width: 100, height: 100 }),
      animate: () => {
        let finishCb;
        const animation = {
          finished: new Promise((resolve) => { finishCb = resolve; }),
        };
        setTimeout(finishCb, 0);
        return animation;
      }
    };
    return el;
  },
  body: {
    appendChild: (el) => {
      el.parentElement = globalThis.document.body;
    }
  },
  addEventListener: () => {}
};

globalThis.performance = {
  now: () => Date.now()
};

globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);

const store = {};
globalThis.localStorage = {
  getItem: (key) => store[key] || null,
  setItem: (key, val) => { store[key] = String(val); },
  removeItem: (key) => { delete store[key]; },
  clear: () => { for (const k in store) delete store[k]; }
};

// Handle node globalThis.navigator correctly
if (!globalThis.navigator) {
  globalThis.navigator = {};
}
Object.defineProperty(globalThis.navigator, 'vibrate', {
  value: () => {},
  writable: true,
  configurable: true
});

// Now import the module dynamically to ensure globals exist when it evaluates
const {
  debounce,
  perlinShake,
  colorSplash,
  SoundEngine,
  spawnCoinFly,
  spawnWaterDroplets
} = await import(`../src/vanilla/effects.js?t=${Date.now()}`);

describe("effects.js - debounce", () => {
  it("delays execution", async () => {
    let called = 0;
    const fn = debounce(() => { called++; }, 50);
    fn();
    assert.equal(called, 0);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(called, 1);
  });

  it("coalesces multiple calls", async () => {
    let called = 0;
    const fn = debounce(() => { called++; }, 50);
    fn();
    fn();
    fn();
    assert.equal(called, 0);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(called, 1);
  });

  it("cancel prevents execution", async () => {
    let called = 0;
    const fn = debounce(() => { called++; }, 50);
    fn();
    fn.cancel();
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(called, 0);
  });

  it("flush executes immediately", async () => {
    let called = 0;
    const fn = debounce(() => { called++; }, 50);
    fn();
    fn.flush();
    assert.equal(called, 1);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(called, 1); // doesn't run again
  });
});

describe("effects.js - perlinShake", () => {
  it("skips if el is falsy", () => {
    assert.doesNotThrow(() => perlinShake(null, 10, 100));
  });

  it("skips if document.hidden is true", () => {
    globalThis.document.hidden = true;
    const el = globalThis.document.createElement("div");
    el.style.transform = "initial";
    perlinShake(el, 10, 100);
    assert.equal(el.style.transform, "initial");
    globalThis.document.hidden = false;
  });

  it("applies transform over time and resets", async () => {
    const el = globalThis.document.createElement("div");
    perlinShake(el, 10, 50);
    await new Promise(r => setTimeout(r, 20));
    assert.notEqual(el.style.transform, "");
    assert.ok(el.style.transform.includes("translate"));
    await new Promise(r => setTimeout(r, 60));
    assert.equal(el.style.transform, ""); // resets
  });
});

describe("effects.js - colorSplash", () => {
  it("skips if el is falsy", () => {
    assert.doesNotThrow(() => colorSplash(null, "#fff", 100));
  });

  it("applies box-shadow immediately and removes it on next frame", async () => {
    const el = globalThis.document.createElement("div");
    colorSplash(el, "#ff0000", 100);
    assert.ok(el.style.boxShadow.includes("#ff0000"));
    assert.equal(el.style.transition, "box-shadow 0s");

    await new Promise(r => setTimeout(r, 20));
    assert.equal(el.style.boxShadow, "");
    assert.ok(el.style.transition.includes("100ms ease-out"));
  });
});

describe("effects.js - SoundEngine", () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.window.AudioContext = class {
      constructor() {
        this.state = "suspended";
        this.currentTime = 0;
        this.destination = {};
      }
      resume() { this.state = "running"; }
      createOscillator() {
        return {
          type: "sine",
          frequency: { setValueAtTime: () => {} },
          connect: () => {},
          start: () => {},
          stop: () => {}
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          },
          connect: () => {}
        };
      }
    };
  });

  it("gets and sets volume", () => {
    SoundEngine.setVolume(0.8);
    assert.equal(SoundEngine.getVolume(), 0.8);
    assert.equal(globalThis.localStorage.getItem("hub_sfx_vol"), "0.8");
  });

  it("clamps volume between 0 and 1", () => {
    SoundEngine.setVolume(1.5);
    assert.equal(SoundEngine.getVolume(), 1);
    SoundEngine.setVolume(-0.5);
    assert.equal(SoundEngine.getVolume(), 0);
  });

  it("handles audio events gracefully", () => {
    SoundEngine.setVolume(0.5);
    assert.doesNotThrow(() => SoundEngine.match());
    assert.doesNotThrow(() => SoundEngine.combo(2));
    assert.doesNotThrow(() => SoundEngine.harvest());
    assert.doesNotThrow(() => SoundEngine.merge());
    assert.doesNotThrow(() => SoundEngine.gacha());
    assert.doesNotThrow(() => SoundEngine.plant());
    assert.doesNotThrow(() => SoundEngine.error());
    assert.doesNotThrow(() => SoundEngine.multiLine());
    assert.doesNotThrow(() => SoundEngine.gameOver());
    assert.doesNotThrow(() => SoundEngine.questComplete());
    assert.doesNotThrow(() => SoundEngine.click());
  });

  it("skips playing when volume is 0", () => {
    SoundEngine.setVolume(0);
    assert.doesNotThrow(() => SoundEngine.click());
  });

  it("handles missing AudioContext gracefully", () => {
    delete globalThis.window.AudioContext;
    SoundEngine.setVolume(0.5);
    assert.doesNotThrow(() => SoundEngine.click());
  });
});

describe("effects.js - spawnCoinFly", () => {
  it("skips if sourceEl is falsy", () => {
    assert.doesNotThrow(() => spawnCoinFly(null, 3));
  });

  it("skips if document.hidden is true", () => {
    globalThis.document.hidden = true;
    const sourceEl = globalThis.document.createElement("div");
    assert.doesNotThrow(() => spawnCoinFly(sourceEl, 3));
    globalThis.document.hidden = false;
  });

  it("skips if target is not found", () => {
    const origQuerySelector = globalThis.document.querySelector;
    const origGetElementById = globalThis.document.getElementById;
    globalThis.document.querySelector = () => null;
    globalThis.document.getElementById = () => null;

    const sourceEl = globalThis.document.createElement("div");
    assert.doesNotThrow(() => spawnCoinFly(sourceEl, 3));

    globalThis.document.querySelector = origQuerySelector;
    globalThis.document.getElementById = origGetElementById;
  });

  it("spawns particles and they resolve animation", async () => {
    const target = globalThis.document.createElement("div");
    globalThis.document.querySelector = () => target;
    const sourceEl = globalThis.document.createElement("div");
    spawnCoinFly(sourceEl, 2);

    // Allow animation to "finish"
    await new Promise(r => setTimeout(r, 20));
  });
});

describe("effects.js - spawnWaterDroplets", () => {
  it("skips if plotEl is falsy", () => {
    assert.doesNotThrow(() => spawnWaterDroplets(null, 3));
  });

  it("skips if document.hidden is true", () => {
    globalThis.document.hidden = true;
    const plotEl = globalThis.document.createElement("div");
    assert.doesNotThrow(() => spawnWaterDroplets(plotEl, 3));
    globalThis.document.hidden = false;
  });

  it("spawns particles and they resolve animation", async () => {
    const plotEl = globalThis.document.createElement("div");
    spawnWaterDroplets(plotEl, 2);

    // Allow animation to "finish"
    await new Promise(r => setTimeout(r, 20));
  });
});
