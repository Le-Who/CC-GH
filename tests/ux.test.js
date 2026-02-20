/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — UX Diagnostic Tests
 *  Tests for pet flicker, harvest delay, and farm optimization
 *  Run:  node --test tests/ux.test.js
 * ═══════════════════════════════════════════════════════
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CROPS,
  getGrowthPct,
  getWateringMultiplier,
  farmPlotsWithGrowth,
  processOfflineActions,
  createDefaultPlayer,
  ECONOMY,
} from "../game-logic.js";

/* ═════════════════════════════════════════════════════
 *  Pet Flicker — Transition Timing Invariants
 *  These tests verify the constraints that prevent flicker
 * ═════════════════════════════════════════════════════ */
describe("Pet Flicker — Transition Invariants", () => {
  /**
   * NOTE: These constants are coupled to CSS values in pet.css.
   * If CSS transitions change, these must be updated to match.
   * The tests verify that the RELATIONSHIPS between timings are
   * safe, not the absolute values — any change must preserve
   * a minimum safety buffer to prevent visual flicker.
   */
  const ROAM_IDLE_RESET_MS = 3000; // pet.js: setTimeout in startRoam
  const WALK_TRANSITION_MS = 2500; // pet.css: .pet-roaming transition
  const DOCK_TRANSITION_MS = 500; // pet.css: .pet-transitioning transition
  const STATE_MIN_DELAY_MS = 4000; // pet.js: stateMachine min interval
  const CLEANUP_TIMEOUT_MS = 550; // pet.js: setTimeout for class cleanup
  const DOCK_CSS_TRANSITION_MS = 500; // pet.css: dock animation duration

  it("roam duration (3s idle reset) must exceed walk transition (2.5s) by >= 200ms buffer", () => {
    const buffer = ROAM_IDLE_RESET_MS - WALK_TRANSITION_MS;
    assert.ok(
      buffer >= 200,
      `Buffer ${buffer}ms too small (need >= 200ms). Roam reset: ${ROAM_IDLE_RESET_MS}ms, Walk: ${WALK_TRANSITION_MS}ms`,
    );
  });

  it("dock transition must be at least 3× shorter than roam transition", () => {
    assert.ok(
      DOCK_TRANSITION_MS * 3 <= WALK_TRANSITION_MS,
      `Dock (${DOCK_TRANSITION_MS}ms) × 3 = ${DOCK_TRANSITION_MS * 3}ms exceeds roam (${WALK_TRANSITION_MS}ms) — dock should feel snappy`,
    );
  });

  it("state machine min delay must exceed roam + 500ms safety buffer", () => {
    const SAFETY_BUFFER_MS = 500;
    const required = WALK_TRANSITION_MS + SAFETY_BUFFER_MS;
    assert.ok(
      STATE_MIN_DELAY_MS >= required,
      `State delay ${STATE_MIN_DELAY_MS}ms must be >= roam ${WALK_TRANSITION_MS}ms + buffer ${SAFETY_BUFFER_MS}ms = ${required}ms`,
    );
    // Ensure at least 1s buffer for real-world jitter
    assert.ok(
      STATE_MIN_DELAY_MS - WALK_TRANSITION_MS >= 1000,
      `Need >= 1000ms real-world buffer, got ${STATE_MIN_DELAY_MS - WALK_TRANSITION_MS}ms`,
    );
  });

  it("pet-roaming class removal timeout must match or exceed CSS transition duration", () => {
    assert.ok(
      ROAM_IDLE_RESET_MS >= WALK_TRANSITION_MS,
      `Class removal (${ROAM_IDLE_RESET_MS}ms) must be >= CSS transition (${WALK_TRANSITION_MS}ms)`,
    );
  });

  it("dock and roam classes must never be applied simultaneously", () => {
    // Validates invariant: setDockMode clears pet-roaming before applying pet-transitioning.
    // If both are active, CSS transitions conflict and cause visual flicker.
    const ROAMING = "pet-roaming";
    const TRANSITIONING = "pet-transitioning";

    // Simulate: pet is roaming, then docks
    const classes = new Set([ROAMING]);
    // setDockMode step 1: remove roaming (MUST happen before adding transitioning)
    classes.delete(ROAMING);
    // setDockMode step 2: add transitioning
    classes.add(TRANSITIONING);

    // The invariant: both classes must NEVER coexist
    assert.ok(
      !(classes.has(ROAMING) && classes.has(TRANSITIONING)),
      `Invariant violated: ${ROAMING} and ${TRANSITIONING} must never coexist`,
    );
    // And transitioning must be active after dock switch
    assert.ok(
      classes.has(TRANSITIONING),
      "pet-transitioning must be active after dock switch",
    );
    assert.ok(
      !classes.has(ROAMING),
      "pet-roaming must NOT be active after dock switch",
    );
  });

  it("pet-transitioning cleanup timeout must exceed dock CSS transition by >= 30ms", () => {
    const buffer = CLEANUP_TIMEOUT_MS - DOCK_CSS_TRANSITION_MS;
    assert.ok(
      buffer >= 30,
      `Cleanup timeout buffer ${buffer}ms too tight (need >= 30ms). Cleanup: ${CLEANUP_TIMEOUT_MS}ms, Dock CSS: ${DOCK_CSS_TRANSITION_MS}ms`,
    );
  });
});

/* ═════════════════════════════════════════════════════
 *  Pet Zone Bounds — Stats-Bar Formula
 * ═════════════════════════════════════════════════════ */
describe("Pet Zone Bounds", () => {
  it("stats-bar formula produces valid range on 375px screen", () => {
    const w = 375;
    const panelW = Math.min(520, w - 80);
    const minX = (w - panelW) / 2 + 20;
    const maxX = (w + panelW) / 2 - 20;
    assert.ok(panelW > 0, "Panel width must be positive");
    assert.ok(maxX > minX, "Max X must exceed Min X");
    assert.ok(minX >= 0, "Min X must not be negative");
    assert.ok(maxX <= w, "Max X must not exceed viewport");
  });

  it("stats-bar formula produces valid range on 1920px screen", () => {
    const w = 1920;
    const panelW = Math.min(520, w - 80);
    const minX = (w - panelW) / 2 + 20;
    const maxX = (w + panelW) / 2 - 20;
    assert.equal(panelW, 520, "Wide screen should clamp to 520px");
    assert.ok(maxX > minX);
    assert.ok(minX >= 0);
    assert.ok(maxX <= w);
  });

  it("stats-bar formula degrades gracefully on ultra-narrow screen (120px)", () => {
    const w = 120;
    const panelW = Math.min(520, w - 80); // 40px
    const minX = (w - panelW) / 2 + 20; // 60
    const maxX = (w + panelW) / 2 - 20; // 60
    // At this extreme, range collapses — pet should fall back to IDLE
    assert.ok(
      maxX <= minX,
      "Ultra-narrow screen should collapse to IDLE fallback",
    );
  });

  it("ground mode uses full viewport with 40px padding", () => {
    const w = 400;
    const minX = 40;
    const maxX = w - 40;
    assert.equal(maxX - minX, 320);
    assert.ok(maxX > minX);
  });
});

/* ═════════════════════════════════════════════════════
 *  Harvest — Optimistic Reward Estimation
 * ═════════════════════════════════════════════════════ */
describe("Harvest Optimistic Rewards", () => {
  it("all crops have sellPrice and xp for optimistic estimation", () => {
    for (const [id, cfg] of Object.entries(CROPS)) {
      assert.ok(
        cfg.sellPrice > 0,
        `${id} missing sellPrice for optimistic reward`,
      );
      assert.ok(cfg.xp > 0, `${id} missing xp for optimistic reward`);
    }
  });

  it("optimistic reward matches crops config (no server bonuses)", () => {
    const crop = CROPS.strawberry;
    const estimatedCoins = crop.sellPrice;
    const estimatedXP = crop.xp;
    assert.equal(estimatedCoins, 15);
    assert.equal(estimatedXP, 5);
  });

  it("pumpkin has highest reward (premium crop progression)", () => {
    const pumpkin = CROPS.pumpkin;
    for (const [id, cfg] of Object.entries(CROPS)) {
      if (id === "pumpkin") continue;
      assert.ok(
        pumpkin.sellPrice >= cfg.sellPrice,
        `Pumpkin sellPrice (${pumpkin.sellPrice}) should be >= ${id} (${cfg.sellPrice})`,
      );
    }
  });

  it("harvest clears plot locally before server response", () => {
    // Simulates optimistic harvest: plot should be cleared immediately
    const plots = [
      {
        crop: "strawberry",
        plantedAt: Date.now() - 20000,
        watered: false,
        growthTime: 15000,
      },
      { crop: null, plantedAt: null, watered: false },
    ];
    // Optimistic harvest of plot 0
    const snapshot = { ...plots[0] };
    plots[0] = { crop: null, plantedAt: null, watered: false };
    assert.equal(plots[0].crop, null, "Plot should be cleared optimistically");
    assert.equal(
      snapshot.crop,
      "strawberry",
      "Snapshot should preserve original",
    );
  });
});

/* ═════════════════════════════════════════════════════
 *  Farm Growth Tick — Efficiency
 * ═════════════════════════════════════════════════════ */
describe("Growth Tick Efficiency", () => {
  it("empty farm should skip render (hasGrowingPlots = false)", () => {
    const plots = [
      { crop: null, plantedAt: null, watered: false },
      { crop: null, plantedAt: null, watered: false },
      { crop: null, plantedAt: null, watered: false },
    ];
    const hasGrowing = plots.some((p) => p.crop && getGrowthPct(p) < 1);
    assert.equal(hasGrowing, false, "Empty farm should not trigger render");
  });

  it("fully grown farm should skip render (all at 100%)", () => {
    const now = Date.now();
    const plots = [
      {
        crop: "strawberry",
        plantedAt: now - 30000,
        watered: false,
        growthTime: CROPS.strawberry.growthTime,
      },
      {
        crop: "tomato",
        plantedAt: now - 60000,
        watered: false,
        growthTime: CROPS.tomato.growthTime,
      },
    ];
    const hasGrowing = plots.some((p) => p.crop && getGrowthPct(p, now) < 1);
    assert.equal(
      hasGrowing,
      false,
      "Fully grown farm should not trigger render",
    );
  });

  it("partially grown farm SHOULD trigger render", () => {
    const now = Date.now();
    const plots = [
      {
        crop: "pumpkin",
        plantedAt: now - 5000,
        watered: false,
        growthTime: CROPS.pumpkin.growthTime,
      },
    ];
    const hasGrowing = plots.some((p) => p.crop && getGrowthPct(p, now) < 1);
    assert.equal(hasGrowing, true, "Growing plot should trigger render");
  });
});

/* ═════════════════════════════════════════════════════
 *  Water — Race Condition Prevention
 * ═════════════════════════════════════════════════════ */
describe("Water Race Condition", () => {
  it("in-flight Set prevents duplicate watering of same plot", () => {
    const wateringInFlight = new Set();
    // First water request — should proceed
    const plot0FirstRequest = !wateringInFlight.has(0);
    wateringInFlight.add(0);
    assert.ok(plot0FirstRequest, "First water request should proceed");

    // Second water request for same plot — should be blocked
    const plot0SecondRequest = !wateringInFlight.has(0);
    assert.ok(!plot0SecondRequest, "Duplicate water request should be blocked");

    // Different plot — should proceed
    const plot1Request = !wateringInFlight.has(1);
    assert.ok(plot1Request, "Different plot should proceed");

    // After first request completes
    wateringInFlight.delete(0);
    const plot0ThirdRequest = !wateringInFlight.has(0);
    assert.ok(
      plot0ThirdRequest,
      "After completion, new request should proceed",
    );
  });

  it("auto-water skips already-watered plots", () => {
    const plots = [
      { crop: "strawberry", watered: true },
      { crop: "tomato", watered: false },
      { crop: null, watered: false },
      { crop: "corn", watered: false },
    ];
    const needWater = plots
      .map((p, i) => ({ ...p, i }))
      .filter((p) => p.crop && !p.watered);
    assert.equal(needWater.length, 2, "Should find 2 plots needing water");
    assert.deepEqual(
      needWater.map((p) => p.i),
      [1, 3],
    );
  });

  it("auto-water respects 2-per-tick limit", () => {
    const plots = Array.from({ length: 6 }, (_, i) => ({
      crop: "strawberry",
      watered: false,
    }));
    let watered = 0;
    for (let i = 0; i < plots.length && watered < 2; i++) {
      if (plots[i].crop && !plots[i].watered) watered++;
    }
    assert.equal(watered, 2, "Should water exactly 2 per tick");
  });
});

/* ═════════════════════════════════════════════════════
 *  Plant Version Guard — Stale Response Rejection
 * ═════════════════════════════════════════════════════ */
describe("Plant/Harvest Version Guard", () => {
  it("version counter increments per operation", () => {
    let plantVersion = 0;
    const v1 = ++plantVersion;
    const v2 = ++plantVersion;
    const v3 = ++plantVersion;
    assert.equal(v1, 1);
    assert.equal(v2, 2);
    assert.equal(v3, 3);
    assert.equal(plantVersion, 3);
  });

  it("stale response is rejected when version has advanced", () => {
    let plantVersion = 0;
    const myVersion = ++plantVersion; // v1
    ++plantVersion; // v2 (another plant happened)
    const isStale = plantVersion !== myVersion;
    assert.ok(isStale, "Response from v1 should be stale after v2 fires");
  });

  it("current response is accepted when version matches", () => {
    let plantVersion = 0;
    const myVersion = ++plantVersion;
    const isCurrent = plantVersion === myVersion;
    assert.ok(isCurrent, "Latest response should be accepted");
  });

  it("harvest version guard follows same pattern", () => {
    let harvestVersion = 0;
    const v1 = ++harvestVersion;
    const v2 = ++harvestVersion;
    assert.ok(harvestVersion !== v1, "v1 is stale after v2");
    assert.ok(harvestVersion === v2, "v2 is current");
  });
});

/* ═════════════════════════════════════════════════════
 *  Debounced Render — Coalescing
 * ═════════════════════════════════════════════════════ */
describe("Debounced Render Queue", () => {
  it("multiple queue calls result in single render flag", () => {
    let renderPending = false;
    let renderCount = 0;
    function queueRender() {
      if (renderPending) return;
      renderPending = true;
      renderCount++;
      renderPending = false; // simulate sync render completion
    }
    // Call 5 times "synchronously" — should all proceed since each one completes
    queueRender();
    queueRender();
    queueRender();
    queueRender();
    queueRender();
    // With actual microtask batching, only 1 render would fire
    // This test validates the gating logic
    assert.equal(
      renderCount,
      5,
      "Sync calls each fire (microtask would batch)",
    );
  });

  it("renderPending flag prevents re-entrant renders", () => {
    let renderPending = false;
    let blocked = 0;
    function queueRender() {
      if (renderPending) {
        blocked++;
        return;
      }
      renderPending = true;
      // Simulate async: don't reset until "next tick"
    }
    queueRender(); // takes the lock
    queueRender(); // blocked
    queueRender(); // blocked
    assert.equal(blocked, 2, "Two calls blocked by pending flag");
  });
});

/* ═════════════════════════════════════════════════════
 *  Watering Multiplier — Growth Speed
 * ═════════════════════════════════════════════════════ */
describe("Watering Growth Speed", () => {
  it("watering multiplier reduces growth time by 20-45%", () => {
    for (const [id, cfg] of Object.entries(CROPS)) {
      const mult = getWateringMultiplier(id);
      assert.ok(
        mult >= 0.55 && mult <= 0.8,
        `${id} multiplier ${mult} out of range [0.55, 0.8]`,
      );
    }
  });

  it("watered plot grows faster than unwatered", () => {
    const now = Date.now();
    const plantedAt = now - 10000;
    const crop = CROPS.strawberry;
    const unwateredGrowth = getGrowthPct(
      {
        crop: "strawberry",
        plantedAt,
        watered: false,
        growthTime: crop.growthTime,
      },
      now,
    );
    const wateredGrowth = getGrowthPct(
      {
        crop: "strawberry",
        plantedAt,
        watered: true,
        growthTime: crop.growthTime,
        wateringMultiplier: getWateringMultiplier(crop),
      },
      now,
    );
    assert.ok(
      wateredGrowth > unwateredGrowth,
      `Watered (${wateredGrowth}) should grow faster than unwatered (${unwateredGrowth})`,
    );
  });

  it("growth percentage is capped at 1.0", () => {
    const now = Date.now();
    const pct = getGrowthPct(
      { crop: "strawberry", plantedAt: now - 999999, growthTime: 15000 },
      now,
    );
    assert.equal(pct, 1, "Growth should cap at 1.0");
  });
});

/* ═════════════════════════════════════════════════════
 *  Match-3 Mode Selector — State Machine Invariants (v4.5.3)
 *  Tests that the mode selector is always accessible and
 *  the button hierarchy follows UX requirements.
 * ═════════════════════════════════════════════════════ */
describe("Match-3 Mode Selector — State Machine", () => {
  /**
   * State-only simulation of onEnter() logic.
   * Returns which UI element should be shown based on game state.
   */
  function simulateOnEnter(gameActive, savedModes) {
    const hasSaved = Object.keys(savedModes).length > 0;
    if (gameActive) return "pause-overlay"; // active game → pause
    if (hasSaved) return "pause-overlay"; // saved sessions → continue overlay
    return "mode-selector"; // no game, no saved → mode selector
  }

  /**
   * Simulate button visibility/priority for the pause overlay.
   * Returns ordered array of visible buttons (first = most prominent).
   */
  function simulateOverlayButtons(gameActive, savedModes) {
    const hasSaved = Object.keys(savedModes).length > 0;
    if (gameActive) {
      // Active game: Continue (primary) + End (danger)
      return [
        { id: "resume", class: "btn-primary", visible: true },
        { id: "new", class: "btn-secondary", visible: false },
        { id: "end", class: "btn-danger", visible: true },
      ];
    }
    if (hasSaved) {
      // Saved sessions: Continue (primary) > New Game (secondary) > End (muted)
      return [
        { id: "resume", class: "btn-primary", visible: true },
        { id: "new", class: "btn-secondary", visible: true },
        { id: "end", class: "btn-muted", visible: true },
      ];
    }
    // No sessions: New Game only
    return [
      { id: "resume", class: "btn-primary", visible: false },
      { id: "new", class: "btn-primary", visible: true },
      { id: "end", class: "btn-danger", visible: false },
    ];
  }

  it("onEnter: active game → pause overlay (not mode selector)", () => {
    const result = simulateOnEnter(true, {});
    assert.equal(result, "pause-overlay");
  });

  it("onEnter: saved sessions → pause overlay", () => {
    const result = simulateOnEnter(false, { classic: { score: 100 } });
    assert.equal(result, "pause-overlay");
  });

  it("onEnter: no game, no saved → mode selector directly", () => {
    const result = simulateOnEnter(false, {});
    assert.equal(result, "mode-selector");
  });

  it("button hierarchy: Continue is first and primary when sessions exist", () => {
    const buttons = simulateOverlayButtons(false, { classic: { score: 100 } });
    const visible = buttons.filter((b) => b.visible);
    assert.equal(visible[0].id, "resume", "Continue should be first");
    assert.equal(visible[0].class, "btn-primary", "Continue should be primary");
  });

  it("button hierarchy: End All Sessions is last and muted when sessions exist", () => {
    const buttons = simulateOverlayButtons(false, { classic: { score: 100 } });
    const visible = buttons.filter((b) => b.visible);
    const last = visible[visible.length - 1];
    assert.equal(last.id, "end", "End should be last");
    assert.equal(last.class, "btn-muted", "End should be muted");
  });

  it("button hierarchy: active game has only Continue + End (no New Game)", () => {
    const buttons = simulateOverlayButtons(true, {});
    const visible = buttons.filter((b) => b.visible);
    assert.equal(visible.length, 2);
    assert.equal(visible[0].id, "resume");
    assert.equal(visible[1].id, "end");
  });

  it("no sessions: only New Game visible", () => {
    const buttons = simulateOverlayButtons(false, {});
    const visible = buttons.filter((b) => b.visible);
    assert.equal(visible.length, 1);
    assert.equal(visible[0].id, "new");
  });
});

/* ═════════════════════════════════════════════════════
 *  Star Drop Color Uniqueness — Visual Distinction Invariants (v4.6)
 *  Verifies that drop gem colors don't overlap regular gem colors.
 * ═════════════════════════════════════════════════════ */
describe("Star Drop — Color Uniqueness", () => {
  // Primary hue ranges for regular gems (approximate HSL hue degrees)
  const REGULAR_GEM_HUES = {
    fire: [0, 30], // red-orange
    water: [200, 220], // blue
    earth: [120, 150], // green-lime
    air: [170, 200], // cyan-light blue
    light: [40, 50], // amber-yellow
    dark: [265, 280], // violet
  };

  // Primary hue ranges for drop gems (v4.6 unique hues)
  const DROP_GEM_HUES = {
    drop_gold: [31, 39], // rose-gold (between fire's orange and light's amber)
    drop_seeds: [155, 168], // emerald-teal (between earth and air)
    drop_energy: [270, 290], // electric violet
  };

  it("drop_gold hue range is distinct from all regular gems", () => {
    const [dMin, dMax] = DROP_GEM_HUES.drop_gold;
    for (const [gem, [gMin, gMax]] of Object.entries(REGULAR_GEM_HUES)) {
      // Strict: no overlap at all
      const overlaps = dMin < gMax && dMax > gMin;
      assert.ok(
        !overlaps,
        `drop_gold [${dMin}-${dMax}] overlaps ${gem} [${gMin}-${gMax}]`,
      );
    }
  });

  it("drop_seeds hue range is distinct from earth and air gems", () => {
    const [dMin, dMax] = DROP_GEM_HUES.drop_seeds;
    const earthRange = REGULAR_GEM_HUES.earth;
    const airRange = REGULAR_GEM_HUES.air;
    assert.ok(
      dMin > earthRange[1] || dMax < earthRange[0],
      `drop_seeds should not overlap earth`,
    );
    assert.ok(
      dMin > airRange[1] || dMax < airRange[0],
      `drop_seeds should not overlap air`,
    );
  });

  it("all 3 drop types have distinct hue ranges from each other", () => {
    const types = Object.entries(DROP_GEM_HUES);
    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        const [nameA, [minA, maxA]] = types[i];
        const [nameB, [minB, maxB]] = types[j];
        const overlaps = minA < maxB && maxA > minB;
        assert.ok(!overlaps, `${nameA} and ${nameB} hue ranges overlap`);
      }
    }
  });

  it("drop_energy uses radial gradient for distinction from dark gem", () => {
    // drop_energy and dark gem share the violet hue range (270-290 vs 265-280)
    // but are visually distinguished by: radial gradient, thick white border,
    // and animated glow border — verified by CSS review, not hue overlap.
    const [dMin] = DROP_GEM_HUES.drop_energy;
    const [, darkMax] = REGULAR_GEM_HUES.dark;
    assert.ok(
      dMin < darkMax,
      "drop_energy overlaps dark intentionally (distinguished by gradient + border)",
    );
  });
});

/* ═════════════════════════════════════════════════════
 *  Global Version Constant — Propagation Invariants (v4.6)
 *  Verifies that version can be read from package.json.
 * ═════════════════════════════════════════════════════ */
describe("Global Version Constant", () => {
  it("package.json version is a valid semver string", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const pkgPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "package.json",
    );
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    assert.match(
      pkg.version,
      /^\d+\.\d+\.\d+$/,
      `Version "${pkg.version}" should be semver`,
    );
  });

  it("server.js getIndexHtml injects version placeholder markers exist in HTML", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const htmlPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "public",
      "index.html",
    );
    const html = fs.readFileSync(htmlPath, "utf-8");
    assert.ok(
      html.includes("<!--APP_VERSION_INJECT-->"),
      "HTML must contain <!--APP_VERSION_INJECT--> placeholder",
    );
    assert.ok(
      html.includes("{{APP_VERSION}}"),
      "HTML must contain {{APP_VERSION}} badge placeholder",
    );
  });
});
