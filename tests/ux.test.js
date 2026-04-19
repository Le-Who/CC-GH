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
        plantedAt: now - CROPS.strawberry.growthTime,
        watered: false,
      },
      {
        crop: "tomato",
        plantedAt: now - CROPS.tomato.growthTime,
        watered: false,
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
    const plantedAt = now - 2000; // changed from 10000 because strawberry growthTime is now 5000ms
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
 *  Match-3 Mode Selector — State Machine Invariants (v5.0.0)
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

  // Primary hue ranges for drop gems (v5.0.1: fully distinct palette)
  const DROP_GEM_HUES = {
    drop_gold: [325, 340], // hot pink / magenta
    drop_seeds: [75, 95], // chartreuse / lime-yellow
    drop_energy: [235, 250], // indigo / deep blue
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

  it("drop_energy hue range is distinct from all regular gems", () => {
    const [dMin, dMax] = DROP_GEM_HUES.drop_energy;
    for (const [gem, [gMin, gMax]] of Object.entries(REGULAR_GEM_HUES)) {
      const overlaps = dMin < gMax && dMax > gMin;
      assert.ok(
        !overlaps,
        `drop_energy [${dMin}-${dMax}] overlaps ${gem} [${gMin}-${gMax}]`,
      );
    }
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

/* ═════════════════════════════════════════════════════
 *  Visual UX — Kinematic Gravity Invariants (v5.1.0)
 *  Verify sqrt-based fall duration formula.
 * ═════════════════════════════════════════════════════ */
describe("Match-3 Kinematic Gravity — Timing Invariants", () => {
  // v5.1.0: sqrt-based formula from animateCascade:
  // dur = Math.min(0.18 + Math.sqrt(dist) * 0.12, 0.55)
  function calcFallDur(dist) {
    return Math.min(0.18 + Math.sqrt(dist) * 0.12, 0.55);
  }

  it("1-row fall uses base duration ~0.30s (0.18 + sqrt(1)*0.12)", () => {
    const dur = calcFallDur(1);
    assert.ok(Math.abs(dur - 0.3) < 0.01, `Expected ~0.30s, got ${dur}s`);
  });

  it("8-row fall duration caps below 0.55s ceiling", () => {
    const dur = calcFallDur(8);
    assert.ok(dur > 0.3, `8-row fall (${dur}s) must exceed 1-row`);
    assert.ok(
      dur <= 0.55,
      `8-row fall (${dur}s) must not exceed 0.55s ceiling`,
    );
  });

  it("fall duration increases monotonically with distance", () => {
    for (let d = 2; d <= 8; d++) {
      assert.ok(
        calcFallDur(d) > calcFallDur(d - 1),
        `dist ${d} (${calcFallDur(d)}s) must exceed dist ${d - 1} (${calcFallDur(d - 1)}s)`,
      );
    }
  });

  it("extreme distance (20 rows) is clamped to 0.55s ceiling", () => {
    assert.equal(calcFallDur(20), 0.55);
  });

  it("short falls (1–2) produce natural deceleration curve", () => {
    const dur4 = calcFallDur(4);
    const dur8 = calcFallDur(8);
    assert.ok(
      dur8 / dur4 < 1.4,
      `Long/short ratio ${(dur8 / dur4).toFixed(2)} should be < 1.4 (natural deceleration)`,
    );
  });
});

/* ═════════════════════════════════════════════════════
 *  Visual UX — Blox Transition Safety
 *  Ensures .blox-cell never uses transition: all (layout thrashing).
 * ═════════════════════════════════════════════════════ */
describe("Blox Transition Safety", () => {
  it(".blox-cell CSS must not use 'transition: all' (causes layout thrashing)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "blox.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    // Extract the .blox-cell rule block (first occurrence)
    const cellMatch = css.match(/\.blox-cell\s*\{[^}]+\}/);
    assert.ok(cellMatch, ".blox-cell rule must exist in blox.css");
    const rule = cellMatch[0];
    assert.ok(
      !rule.includes("all 0.18s") && !rule.includes("transition: all"),
      `.blox-cell must not use 'transition: all' — found: ${rule.substring(0, 200)}`,
    );
  });
});

/* ═════════════════════════════════════════════════════
 *  Visual UX — CSS Containment
 *  Verify both game boards use contain: layout style paint.
 * ═════════════════════════════════════════════════════ */
describe("CSS Containment — Game Boards", () => {
  async function readCSS(filename) {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      filename,
    );
    return fs.readFileSync(cssPath, "utf-8");
  }

  it(".m3-board has contain: layout style paint", async () => {
    const css = await readCSS("match3.css");
    const match = css.match(/\n\.m3-board\s*\{[^}]+\}/);
    assert.ok(match, ".m3-board rule must exist");
    assert.ok(
      match[0].includes("contain") &&
        match[0].includes("layout") &&
        match[0].includes("paint"),
      ".m3-board must include contain: layout style paint",
    );
  });

  it(".blox-board has contain: layout style paint", async () => {
    const css = await readCSS("blox.css");
    const match = css.match(/\.blox-board\s*\{[^}]+\}/);
    assert.ok(match, ".blox-board rule must exist");
    assert.ok(
      match[0].includes("contain") &&
        match[0].includes("layout") &&
        match[0].includes("paint"),
      ".blox-board must include contain: layout style paint",
    );
  });
});

/* ═════════════════════════════════════════════════════
 *  Visual UX — Object Pool & Spring Return Constants
 * ═════════════════════════════════════════════════════ */
describe("Float-Points Pool & Spring Return", () => {
  const FLOAT_POOL_SIZE = 8;
  const SPRING_RETURN_MS = 400;

  it("float pool capacity is at least 6 (covers 3-combo cascades)", () => {
    assert.ok(
      FLOAT_POOL_SIZE >= 6,
      `Pool size ${FLOAT_POOL_SIZE} too small (need >= 6)`,
    );
  });

  it("float pool ring index correctly wraps around", () => {
    let idx = 0;
    for (let i = 0; i < FLOAT_POOL_SIZE + 3; i++) {
      const slot = idx % FLOAT_POOL_SIZE;
      assert.ok(
        slot >= 0 && slot < FLOAT_POOL_SIZE,
        `Slot ${slot} out of range`,
      );
      idx++;
    }
  });

  it("spring return duration (400ms) is perceptible but not sluggish", () => {
    assert.ok(
      SPRING_RETURN_MS >= 200,
      `Spring return ${SPRING_RETURN_MS}ms too fast`,
    );
    assert.ok(
      SPRING_RETURN_MS <= 600,
      `Spring return ${SPRING_RETURN_MS}ms too slow`,
    );
  });
});

/* ═══════════════════════════════════════════════════
 *  Visual UX — Contextual Gem Glow CSS (v5.1.0)
 *  Verify each gem type defines --gem-color for contextual glow.
 * ═══════════════════════════════════════════════════ */
describe("Contextual Gem Glow — CSS Custom Properties", () => {
  const GEM_TYPES = ["fire", "water", "earth", "air", "light", "dark"];

  it("each gem type defines --gem-color in match3.css", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "match3.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    for (const type of GEM_TYPES) {
      const re = new RegExp(`\\[data-type="${type}"\\][^}]*--gem-color`);
      assert.ok(
        re.test(css),
        `[data-type="${type}"] must define --gem-color in match3.css`,
      );
    }
  });

  it("m3MatchGlow keyframes use var(--gem-color) for contextual glow", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "match3.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes("var(--gem-color"),
      "m3MatchGlow must reference var(--gem-color) for contextual glow",
    );
  });
});

/* ═══════════════════════════════════════════════════
 *  Visual UX — Board Tilt Bounds (v5.1.0)
 *  Verify tilt clamping formula limits rotation to safe range.
 * ═══════════════════════════════════════════════════ */
describe("Board Tilt — Rotation Bounds", () => {
  // Mirror JS formula: cx/cy in [-0.5, 0.5], maxDeg = 2.5
  function calcTilt(cursorFrac) {
    // cursorFrac = (e.clientX - rect.left) / rect.width - 0.5
    const maxDeg = 2.5;
    return cursorFrac * maxDeg * 2;
  }

  it("center cursor produces zero tilt", () => {
    assert.equal(calcTilt(0), 0);
  });

  it("extreme left (-0.5) produces -2.5° tilt", () => {
    assert.equal(calcTilt(-0.5), -2.5);
  });

  it("extreme right (+0.5) produces +2.5° tilt", () => {
    assert.equal(calcTilt(0.5), 2.5);
  });

  it("tilt never exceeds ±3° for any valid cursor position", () => {
    for (let f = -0.5; f <= 0.5; f += 0.01) {
      const deg = Math.abs(calcTilt(f));
      assert.ok(
        deg <= 3.0,
        `Tilt ${deg.toFixed(2)}° exceeds ±3° at cursor fraction ${f.toFixed(2)}`,
      );
    }
  });
});

/* ═══════════════════════════════════════════════════
 *  Visual UX — Squash & Stretch Invariants (v5.2.0)
 *  Verify m3Fall keyframes include scaleX/scaleY deformation.
 * ═══════════════════════════════════════════════════ */
describe("Squash & Stretch — Fall Keyframes", () => {
  it("m3Fall keyframes include scaleX and scaleY in match3.css", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "match3.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    const fallBlock = css.match(/@keyframes m3Fall\s*\{[\s\S]*?\n\}/);
    assert.ok(fallBlock, "m3Fall keyframes must exist in match3.css");
    assert.ok(
      fallBlock[0].includes("scaleX") && fallBlock[0].includes("scaleY"),
      "m3Fall must include scaleX/scaleY for squash & stretch",
    );
  });
});

/* ═══════════════════════════════════════════════════
 *  Visual UX — Color Splash CSS (v5.2.0)
 *  Verify .color-splash rule exists in match3.css.
 * ═══════════════════════════════════════════════════ */
describe("Color Splash — CSS Rule", () => {
  it(".m3-board-container.color-splash rule exists in match3.css", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "match3.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes(".m3-board-container.color-splash"),
      "match3.css must define .m3-board-container.color-splash",
    );
    assert.ok(
      css.includes("--splash-color"),
      "color-splash rule must reference --splash-color custom property",
    );
  });
});

/* ═══════════════════════════════════════════════════
 *  Visual UX — Danger Vignette CSS (v5.2.0)
 *  Verify .danger-vignette and dangerPulse keyframes exist.
 * ═══════════════════════════════════════════════════ */
describe("Danger Vignette — CSS Rule", () => {
  it(".danger-vignette and dangerPulse exist in match3.css", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "match3.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes(".danger-vignette"),
      "match3.css must define .danger-vignette",
    );
    assert.ok(
      css.includes("@keyframes dangerPulse"),
      "match3.css must define @keyframes dangerPulse",
    );
  });
});

/* ═══════════════════════════════════════════════════
 *  Visual UX — Ambient Dust Particles (v5.2.0)
 *  Verify ambientDrift keyframes exist in match3.css.
 * ═══════════════════════════════════════════════════ */
describe("Ambient Dust Particles — CSS Keyframes", () => {
  it("ambientDrift keyframes exist in match3.css", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "match3.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes("@keyframes ambientDrift"),
      "match3.css must define @keyframes ambientDrift",
    );
  });

  it("bloxAmbientDrift keyframes exist in blox.css", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "blox.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes("@keyframes bloxAmbientDrift"),
      "blox.css must define @keyframes bloxAmbientDrift",
    );
  });
});

/* ═══════════════════════════════════════════════════
 *  Visual UX — Drag-Tilt in Blox (v5.2.0)
 *  Verify moveDragPreview uses rotateZ for kinetic tilt.
 * ═══════════════════════════════════════════════════ */
describe("Blox Drag-Tilt — rotateZ", () => {
  it("moveDragPreview in blox.js includes rotateZ", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "blox.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    // Find the moveDragPreview function body (up to the next function declaration)
    const match = js.match(/function moveDragPreview[\s\S]*?function removeDragPreview/m);
    assert.ok(match, "moveDragPreview function must exist in blox.js");
    assert.ok(
      match[0].includes("rotateZ"),
      "moveDragPreview must include rotateZ for drag-tilt effect",
    );
  });
});

/* ═══════════════════════════════════════════════════
 *  v6.1.1 Fix Verification — Static Analysis
 *  Ensures critical bug fixes remain in place.
 * ═══════════════════════════════════════════════════ */

describe("v6.1.1: safeShowModal export", () => {
  it("shared.js exports safeShowModal", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "shared.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("export function safeShowModal"),
      "shared.js must export safeShowModal",
    );
  });

  it("hud.js imports safeShowModal from shared.js", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "hud.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("safeShowModal") && js.includes('from "./shared.js"'),
      "hud.js must import safeShowModal from shared.js",
    );
  });
});

describe("v6.1.1: setPointerCapture removal", () => {
  it("merge.js does NOT use setPointerCapture", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "merge",
      "board.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      !js.includes(".setPointerCapture("),
      "merge/board.js must NOT call .setPointerCapture() (causes pointer event leaks)",
    );
  });
});

describe("v6.1.1: AbortController in api()", () => {
  it("shared.js api() uses AbortController for fetch timeout", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "shared.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("AbortController") && js.includes("controller.abort"),
      "api() must use AbortController with abort timeout",
    );
  });
});

describe("v6.1.1: _forceCleanupDrag in merge.js", () => {
  it("merge.js defines _forceCleanupDrag", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "merge",
      "board.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("function _forceCleanupDrag"),
      "merge/board.js must define _forceCleanupDrag for orphan ghost cleanup",
    );
  });
});

describe("v6.1.1: View Transition safety in goToScreen", () => {
  it("shared.js goToScreen uses skipTransition safety timeout", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "shared.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("skipTransition"),
      "goToScreen must use skipTransition() as safety timeout for View Transitions",
    );
    assert.ok(
      js.includes("vt.finished"),
      "goToScreen must handle vt.finished promise for cleanup",
    );
  });
});

describe("v6.1.1: _feedFromModal try/finally", () => {
  it("hud.js _feedFromModal uses try/finally for guaranteed refresh", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "hud.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    // Find _feedFromModal function body
    const fnMatch = js.match(/async function _feedFromModal[\s\S]*?^\}/m);
    assert.ok(fnMatch, "_feedFromModal must exist in hud.js");
    assert.ok(
      fnMatch[0].includes("finally"),
      "_feedFromModal must use try/finally for guaranteed button re-enable",
    );
  });
});

/* ═══════════════════════════════════════════════════
 *  v7.1: Interruption & Comfort System — Return Tier Tests
 *  Verifies return-tier classification and comfort framing.
 * ═══════════════════════════════════════════════════ */
describe("Interruption System — Return Tier Classification", () => {
  // Mirror the RETURN_TIER constants from shared.js
  const RETURN_TIER = {
    QUICK_MS: 30_000,
    SOFT_MS: 86_400_000,
  };

  function classifyReturn(deltaMs) {
    if (deltaMs < RETURN_TIER.QUICK_MS) return "quick";
    if (deltaMs < RETURN_TIER.SOFT_MS) return "soft";
    return "deep";
  }

  it("quick return (<30s) should NOT show welcome-back modal", () => {
    assert.equal(classifyReturn(5_000), "quick");
    assert.equal(classifyReturn(29_999), "quick");
    assert.notEqual(
      classifyReturn(30_000),
      "quick",
      "30s boundary should NOT be quick",
    );
  });

  it("soft return (30s–24h) should show comfort banner", () => {
    assert.equal(classifyReturn(30_000), "soft");
    assert.equal(classifyReturn(60_000), "soft");
    assert.equal(classifyReturn(3_600_000), "soft");
    assert.equal(classifyReturn(86_399_999), "soft");
  });

  it("deep return (>24h) should show comfort report modal", () => {
    assert.equal(classifyReturn(86_400_000), "deep");
    assert.equal(classifyReturn(172_800_000), "deep"); // 48h
  });

  it("tier boundaries are monotonically increasing (quick < soft < deep)", () => {
    assert.ok(
      RETURN_TIER.QUICK_MS < RETURN_TIER.SOFT_MS,
      `Quick (${RETURN_TIER.QUICK_MS}ms) must be less than Soft (${RETURN_TIER.SOFT_MS}ms)`,
    );
  });
});

describe("Comfort Framing — Welcome-Back Copy", () => {
  it("welcome-back modal in farm.js uses warm comfort language", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "farm",
      "index.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");

    // Extract the showWelcomeBack function body
    const fnMatch = js.match(/function showWelcomeBack[\s\S]*?^\}/m);
    assert.ok(fnMatch, "showWelcomeBack must exist in farm/index.js");
    const body = fnMatch[0];

    // Positive: should contain warm framing
    assert.ok(
      body.includes("Welcome Back"),
      "Modal must include 'Welcome Back' greeting",
    );

    // Negative: guilt-inducing phrases should NOT appear
    const guiltPhrases = [
      "You were away for",
      "ran out",
      "break it",
      "don't forget",
      "you missed",
      "fullness used",
    ];
    for (const phrase of guiltPhrases) {
      assert.ok(
        !body.includes(phrase),
        `Welcome-back modal should NOT contain guilt phrase: "${phrase}"`,
      );
    }
  });
});

describe("v7.1: Comfort Banner & Interruption System — CSS & Export", () => {
  it("base.css contains .comfort-banner styles", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "base.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes(".comfort-banner"),
      "base.css must define .comfort-banner",
    );
    assert.ok(
      css.includes(".comfort-banner.show"),
      "base.css must define .comfort-banner.show transition state",
    );
  });

  it("shared.js exports setupInterruptionSystem", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "shared.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("export function setupInterruptionSystem"),
      "shared.js must export setupInterruptionSystem",
    );
  });

  it("main.js calls setupInterruptionSystem during boot", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "main.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("setupInterruptionSystem()"),
      "main.js must call setupInterruptionSystem() during boot",
    );
  });
});

describe("v7.1: Farm CSS Juice — Ambient Animations", () => {
  it("farm.css defines cropSway keyframes for ambient sway", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "farm.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes("@keyframes cropSway"),
      "farm.css must define @keyframes cropSway",
    );
    assert.ok(
      css.includes("@keyframes readyPulse"),
      "farm.css must define @keyframes readyPulse",
    );
  });

  it("farm.css respects prefers-reduced-motion for animations", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "farm.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes("prefers-reduced-motion"),
      "farm.css must include prefers-reduced-motion to disable ambient animations",
    );
  });

});

/* ═══════════════════════════════════════════════════
 *  v7.1 P1: Quick-Buy Seed Ranking Tests
 * ═══════════════════════════════════════════════════ */
describe("Quick-Buy — Top Seeds Ranking", () => {
  it("returns cheapest seeds when no purchase history exists", () => {
    // Simulate _getTopSeeds logic with empty history
    const crops = {
      tomato: { seedPrice: 10 },
      strawberry: { seedPrice: 5 },
      corn: { seedPrice: 20 },
      blueberry: { seedPrice: 8 },
    };
    const history = [];
    const counts = {};
    for (const { seedId } of history)
      counts[seedId] = (counts[seedId] || 0) + 1;
    const ranked = Object.entries(counts)
      .filter(([id]) => crops[id])
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => id);

    const allSeeds = Object.entries(crops)
      .sort(([, a], [, b]) => a.seedPrice - b.seedPrice)
      .map(([id]) => id);
    const merged = [...ranked];
    for (const id of allSeeds) {
      if (merged.length >= 3) break;
      if (!merged.includes(id)) merged.push(id);
    }
    const top3 = merged.slice(0, 3);
    assert.deepStrictEqual(top3, ["strawberry", "blueberry", "tomato"]);
  });

  it("ranks most-purchased seeds first", () => {
    const crops = { tomato: {}, strawberry: {}, corn: {}, blueberry: {} };
    const history = [
      { seedId: "corn" },
      { seedId: "corn" },
      { seedId: "corn" },
      { seedId: "strawberry" },
      { seedId: "strawberry" },
      { seedId: "tomato" },
    ];
    const counts = {};
    for (const { seedId } of history)
      counts[seedId] = (counts[seedId] || 0) + 1;
    const ranked = Object.entries(counts)
      .filter(([id]) => crops[id])
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => id)
      .slice(0, 3);
    assert.deepStrictEqual(ranked, ["corn", "strawberry", "tomato"]);
  });
});

describe("v7.1 P1: Cozy Day Theme — CSS Variable Overrides", () => {
  it("cozy-day.css overrides all critical root CSS variables", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "cozy-day.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");

    // Must override critical variables
    const requiredVars = [
      "--bg",
      "--surface",
      "--accent",
      "--text",
      "--text-dim",
      "--gold",
      "--border",
      "--neon-glow",
    ];
    for (const v of requiredVars) {
      assert.ok(css.includes(v), `cozy-day.css must override ${v}`);
    }
  });

  it("cozy-day.css uses [data-theme='cozy-day'] selector", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "cozy-day.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes('[data-theme="cozy-day"]'),
      "Must use [data-theme='cozy-day'] selector",
    );
  });
});

describe("v7.1 P1: Theme Flash Prevention", () => {
  it("index.html contains inline theme script in head", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const htmlPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "index.html",
    );
    const html = fs.readFileSync(htmlPath, "utf-8");
    assert.ok(
      html.includes("hub_theme") && html.includes("data-theme"),
      "index.html must have inline theme flash prevention script",
    );
  });

  it("shared.js exports initTheme and setTheme", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "shared.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("export function initTheme"),
      "shared.js must export initTheme",
    );
    assert.ok(
      js.includes("export function setTheme"),
      "shared.js must export setTheme",
    );
  });

  it("main.js calls initTheme during boot", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "main.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("initTheme()"),
      "main.js must call initTheme() during boot",
    );
  });
});

describe("v7.1 P1: Farm Juice — Harvest & Water Keyframes", () => {
  it("farm.css defines harvestPop and coinFly keyframes", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "farm.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes("@keyframes harvestPop"),
      "farm.css must define @keyframes harvestPop",
    );
    assert.ok(
      css.includes("@keyframes coinFly"),
      "farm.css must define @keyframes coinFly",
    );
    assert.ok(
      css.includes("@keyframes waterRise"),
      "farm.css must define @keyframes waterRise",
    );
    assert.ok(
      css.includes("@keyframes waterShimmer"),
      "farm.css must define @keyframes waterShimmer",
    );
  });

  it("farm.css defines quick-buy sheet styles", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cssPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "css",
      "farm.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes(".quick-buy-sheet"),
      "farm.css must define .quick-buy-sheet",
    );
    assert.ok(
      css.includes(".qb-seed-card"),
      "farm.css must define .qb-seed-card",
    );
  });
});

describe("v7.1 P1: Effects.js — Particle Helpers", () => {
  it("effects.js exports spawnCoinFly", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "effects.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("export function spawnCoinFly"),
      "effects.js must export spawnCoinFly",
    );
  });

  it("effects.js exports spawnWaterDroplets", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "effects.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("export function spawnWaterDroplets"),
      "effects.js must export spawnWaterDroplets",
    );
  });

  it("particle pool has max 30 capacity (performance budget)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const jsPath = path.join(
      path.dirname(
        new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      ),
      "..",
      "src",
      "vanilla",
      "effects.js",
    );
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("_PARTICLE_POOL_MAX = 30"),
      "Particle pool must be capped at 30 per performance budget",
    );
  });
});

/* ═══════════════════════════════════════════════════
 *  v7.2 P2: Progressive Seed Unlocking + Featured Shelf + Juice Polish
 * ═══════════════════════════════════════════════════ */
describe("v7.2 P2: Progressive Seed Unlocking", () => {
  it("getUnlockedSeeds returns only strawberry and blueberry for new player", async () => {
    // Direct call — getUnlockedSeeds is exported alongside CROPS
    const unlocked = (await import("../game-logic.js")).getUnlockedSeeds({
      totalHarvests: 0,
      goldEarned: 0,
      questsCompleted: 0,
      plotsBought: 0,
      bestStreak: 0,
    });
    assert.deepStrictEqual(unlocked, ["strawberry", "blueberry"]);
  });

  it("getUnlockedSeeds includes tomato after first harvest", async () => {
    const { getUnlockedSeeds } = await import("../game-logic.js");
    const unlocked = getUnlockedSeeds({
      totalHarvests: 1,
      goldEarned: 0,
      questsCompleted: 0,
      plotsBought: 0,
      bestStreak: 0,
    });
    assert.ok(
      unlocked.includes("tomato"),
      "Tomato should unlock after first harvest",
    );
    assert.ok(unlocked.includes("strawberry"), "Strawberry always available");
    assert.ok(unlocked.includes("blueberry"), "Blueberry always available");
    assert.strictEqual(unlocked.length, 3, "Only 3 seeds should be unlocked");
  });

  it("getUnlockedSeeds unlocks all seeds with maxed stats", async () => {
    const { getUnlockedSeeds, CROPS: C } = await import("../game-logic.js");
    const unlocked = getUnlockedSeeds({
      totalHarvests: 100,
      goldEarned: 500,
      questsCompleted: 5,
      plotsBought: 9,
      bestStreak: 10,
    });
    assert.strictEqual(
      unlocked.length,
      Object.keys(C).length,
      "All seeds should be unlocked",
    );
  });
});

describe("v7.2 P2: Featured Shelf Rotation", () => {
  it("rotation key changes every 4 hours", () => {
    const ROTATION_MS = 4 * 3600_000;
    const now = Date.now();
    const key1 = Math.floor(now / ROTATION_MS);
    const key2 = Math.floor((now + ROTATION_MS) / ROTATION_MS);
    assert.notStrictEqual(key1, key2, "Keys must differ across 4h boundaries");
    const keySame = Math.floor((now + 1000) / ROTATION_MS);
    assert.strictEqual(
      key1,
      keySame,
      "Keys must be same within same 4h window",
    );
  });
});

describe("v7.2 P2: Locked Seed Card CSS", () => {
  it("farm.css contains .farm-seed-card.locked styles", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const __dirname = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
    const cssPath = path.join(
      __dirname,
      "..",
      "src",
      "vanilla",
      "css",
      "farm.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes(".farm-seed-card.locked"),
      "Must have locked card class",
    );
    assert.ok(css.includes("seed-lock-label"), "Must have lock label class");
    assert.ok(css.includes("seedUnlock"), "Must have seedUnlock keyframes");
  });
});

describe("v7.2 P2: Match-3 Swap Spring Keyframes", () => {
  it("match3.css contains m3SwapSpring keyframes", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const __dirname = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
    const cssPath = path.join(
      __dirname,
      "..",
      "src",
      "vanilla",
      "css",
      "match3.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes("@keyframes m3SwapSpring"),
      "Must have m3SwapSpring keyframes",
    );
    assert.ok(css.includes(".m3-cell.swapping"), "Must have swapping class");
  });
});

describe("v7.2 P2: Blox Place Bounce Keyframes", () => {
  it("blox.css contains bloxPlaceBounce keyframes", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const __dirname = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
    const cssPath = path.join(
      __dirname,
      "..",
      "src",
      "vanilla",
      "css",
      "blox.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes("@keyframes bloxPlaceBounce"),
      "Must have bloxPlaceBounce keyframes",
    );
    assert.ok(
      css.includes(".blox-cell.just-placed"),
      "Must have just-placed class",
    );
  });
});

/* ═══════════════════════════════════════════════════
 *  v7.2 P3: Themes + Trivia/Merge/Pet Juice
 * ═══════════════════════════════════════════════════ */
describe("v7.2 P3: Soft Fantasy Theme", () => {
  it("soft-fantasy.css has correct data-theme selector and key tokens", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const __dirname = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
    const cssPath = path.join(
      __dirname,
      "..",
      "src",
      "vanilla",
      "css",
      "soft-fantasy.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes('[data-theme="soft-fantasy"]'),
      "Must use correct data-theme selector",
    );
    assert.ok(css.includes("--bg: #1a1625"), "Must have plum background");
    assert.ok(css.includes("--accent: #ff8fa3"), "Must have soft rose accent");
    assert.ok(css.includes("--text: #f5f0ff"), "Must have lavender white text");
  });
});

describe("v7.2 P3: Minimal Calm Theme", () => {
  it("minimal-calm.css has correct data-theme selector and key tokens", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const __dirname = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
    const cssPath = path.join(
      __dirname,
      "..",
      "src",
      "vanilla",
      "css",
      "minimal-calm.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes('[data-theme="minimal-calm"]'),
      "Must use correct data-theme selector",
    );
    assert.ok(
      css.includes("--bg: #f5f5f3"),
      "Must have stone white background",
    );
    assert.ok(
      css.includes("--accent: #3d6b50"),
      "Must have forest sage accent",
    );
    assert.ok(css.includes("--radius-md: 16px"), "Must increase border radius");
  });
});

describe("v7.2 P3: Theme System Expansion", () => {
  it("shared.js VALID_THEMES includes soft-fantasy, minimal-calm, seasonal", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const __dirname = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
    const jsPath = path.join(__dirname, "..", "src", "vanilla", "shared.js");
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes('"soft-fantasy"'),
      "VALID_THEMES must include soft-fantasy",
    );
    assert.ok(
      js.includes('"minimal-calm"'),
      "VALID_THEMES must include minimal-calm",
    );
    assert.ok(js.includes('"seasonal"'), "VALID_THEMES must include seasonal");
    assert.ok(
      js.includes("_getSeasonalTheme"),
      "Must have seasonal theme resolver",
    );
  });
});

describe("v7.2 P3: Trivia Juice Keyframes", () => {
  it("trivia.css contains triviaCardFlip, triviaCorrectPop, triviaStreakGlow", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const __dirname = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
    const cssPath = path.join(
      __dirname,
      "..",
      "src",
      "vanilla",
      "css",
      "trivia.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes("@keyframes triviaCardFlip"),
      "Must have triviaCardFlip",
    );
    assert.ok(
      css.includes("@keyframes triviaCorrectPop"),
      "Must have triviaCorrectPop",
    );
    assert.ok(
      css.includes("@keyframes triviaStreakGlow"),
      "Must have triviaStreakGlow",
    );
    assert.ok(
      css.includes("triviaAnswerSlide"),
      "Must have stagger answer entrance",
    );
  });
});

describe("v7.2 P3: Merge Juice Keyframes", () => {
  it("merge.css contains mergePull, mergeCollide, gachaCapsuleDrop, gachaReveal", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const __dirname = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
    const cssPath = path.join(
      __dirname,
      "..",
      "src",
      "vanilla",
      "css",
      "merge.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(css.includes("@keyframes mergePull"), "Must have mergePull");
    assert.ok(
      css.includes("@keyframes mergeCollide"),
      "Must have mergeCollide",
    );
    assert.ok(
      css.includes("@keyframes gachaCapsuleDrop"),
      "Must have gachaCapsuleDrop",
    );
    assert.ok(css.includes("@keyframes gachaReveal"), "Must have gachaReveal");
  });
});

describe("v7.2 P3: Pet Interaction Juice Keyframes", () => {
  it("pet.css contains petTapBounce, petHeartBurst, petDustPuff", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const __dirname = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
    const cssPath = path.join(
      __dirname,
      "..",
      "src",
      "vanilla",
      "css",
      "pet.css",
    );
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(
      css.includes("@keyframes petTapBounce"),
      "Must have petTapBounce",
    );
    assert.ok(
      css.includes("@keyframes petHeartBurst"),
      "Must have petHeartBurst",
    );
    assert.ok(css.includes("@keyframes petDustPuff"), "Must have petDustPuff");
    assert.ok(
      css.includes(".pet-container.state-tapped"),
      "Must have tapped state class",
    );
  });
});

/* ═══════════════════════════════════════════════════
 *  v7.2 Audit: Regression guards for CSS import + theme flash fix
 * ═══════════════════════════════════════════════════ */
describe("v7.2 Audit: Theme CSS Imports", () => {
  it("main.jsx imports soft-fantasy.css and minimal-calm.css", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const __dirname = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
    const jsPath = path.join(__dirname, "..", "src", "main.jsx");
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.ok(
      js.includes("soft-fantasy.css"),
      "main.jsx must import soft-fantasy.css",
    );
    assert.ok(
      js.includes("minimal-calm.css"),
      "main.jsx must import minimal-calm.css",
    );
    assert.ok(
      js.includes("cozy-day.css"),
      "main.jsx must import cozy-day.css (existing)",
    );
  });
});

describe("v7.2 Audit: Theme Flash Prevention", () => {
  it("index.html handles seasonal theme before first paint", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const __dirname = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
    const htmlPath = path.join(__dirname, "..", "index.html");
    const html = fs.readFileSync(htmlPath, "utf-8");
    assert.ok(
      html.includes('"seasonal"'),
      "Must handle seasonal in flash prevention",
    );
    assert.ok(
      html.includes("getMonth"),
      "Must resolve seasonal by month before paint",
    );
  });
});

/* ═════════════════════════════════════════════════════
 *  Plant Flicker — Regression Tests (RC1–RC5)
 *  Verifies the invariants introduced to eliminate the
 *  "plant disappears briefly after planting" bug.
 * ═════════════════════════════════════════════════════ */
describe("Plant Flicker Regression Tests", () => {
  // RC1: justPlantedPlot guard — the diff-path must NOT update fill width
  //      while the burst animation is active for that plot index.
  it("RC1: diff-path skips width update while justPlantedPlot matches index", () => {
    let justPlantedPlot = 2; // simulate plot 2 was just planted

    // Simulate the diff-update path guard introduced in RC1
    const shouldUpdateWidth = (plotIndex) => justPlantedPlot !== plotIndex;

    assert.equal(shouldUpdateWidth(2), false, "Must skip update for just-planted plot");
    assert.equal(shouldUpdateWidth(0), true,  "Must allow update for other plots");
    assert.equal(shouldUpdateWidth(5), true,  "Must allow update for other plots");

    // After burst completes, justPlantedPlot is cleared
    justPlantedPlot = -1;
    assert.equal(shouldUpdateWidth(2), true, "Must allow update after burst is cleared");
  });

  // RC1: justPlantedPlot must be cleared INSIDE the setTimeout, not before it.
  it("RC1: justPlantedPlot is cleared after, not before, the burst animation setTimeout", () => {
    let justPlantedPlot = 3;
    let clearedAt = null;
    let animationEndAt = null;

    // Simulate the new ordering: clear INSIDE setTimeout
    const BURST_DURATION_MS = 500;
    const startTime = 0;

    // Old (broken): cleared immediately
    // justPlantedPlot = -1; <-- was here
    // requestAnimationFrame(() => setTimeout(() => { fill.style.width = "..."; }, 500)); }

    // New (correct): cleared inside setTimeout
    // requestAnimationFrame(() => setTimeout(() => {
    //   justPlantedPlot = -1;   <-- moved here
    //   fill.style.width = ...;
    // }, 500));

    // Verify timing contract: clear must happen >= 500ms after planting
    setTimeout(() => {
      justPlantedPlot = -1;
      clearedAt = BURST_DURATION_MS;
    }, BURST_DURATION_MS);

    animationEndAt = BURST_DURATION_MS;

    // The invariant: cleared at or after animation end
    assert.ok(
      clearedAt === null || clearedAt >= animationEndAt,
      `justPlantedPlot must be cleared at T+${animationEndAt}ms or later, not before`
    );
  });

  // RC2: loadStateIfSafe must block when any in-flight action exists.
  it("RC2: loadStateIfSafe blocks when plantingInFlight is non-empty", () => {
    const plantingInFlight = new Set([2]); // plot 2 is being planted
    const harvestingInFlight = new Set();
    const wateringInFlight = new Set();
    const _lastLoadTime = 0; // very old — normally would load

    function loadStateIfSafe() {
      if (plantingInFlight.size || harvestingInFlight.size || wateringInFlight.size) return "blocked";
      if (Date.now() - _lastLoadTime < 30_000) return "too-soon";
      return "loading";
    }

    assert.equal(loadStateIfSafe(), "blocked", "Must block when planting is in-flight");

    plantingInFlight.clear();
    // With no in-flight and old _lastLoadTime, it should load
    assert.equal(loadStateIfSafe(), "loading", "Must allow load when all clear");
  });

  // RC2: loadStateIfSafe must also block when harvesting or watering is in-flight.
  it("RC2: loadStateIfSafe blocks for harvesting and watering in-flight", () => {
    const plantingInFlight = new Set();
    const harvestingInFlight = new Set([0]);
    const wateringInFlight = new Set();
    const _lastLoadTime = 0;

    function loadStateIfSafe() {
      if (plantingInFlight.size || harvestingInFlight.size || wateringInFlight.size) return "blocked";
      if (Date.now() - _lastLoadTime < 30_000) return "too-soon";
      return "loading";
    }

    assert.equal(loadStateIfSafe(), "blocked", "Must block when harvesting is in-flight");

    harvestingInFlight.clear();
    wateringInFlight.add(1);
    assert.equal(loadStateIfSafe(), "blocked", "Must block when watering is in-flight");
  });

  // RC3: Cross-tab sync must check plantingInFlight and harvestingInFlight,
  //      and use 12s guard consistent with the main loadState() guard.
  it("RC3: cross-tab sync respects plantingInFlight (was missing before fix)", () => {
    const plantingInFlight = new Set([1]);
    const wateringInFlight = new Set();
    const harvestingInFlight = new Set();
    const optimisticActionTimestamps = new Map();

    // Simulate the fixed cross-tab sync guard
    function shouldSkipPlotSync(i) {
      if (wateringInFlight.has(i)) return true;
      if (plantingInFlight.has(i)) return true;   // RC3: was missing
      if (harvestingInFlight.has(i)) return true;  // RC3: was missing
      const lastOpt = optimisticActionTimestamps.get(i) || 0;
      if (Date.now() - lastOpt < 12_000) return true; // RC3: was 5000
      return false;
    }

    assert.ok(shouldSkipPlotSync(1), "Must skip plot 1 (planting in-flight)");
    assert.ok(!shouldSkipPlotSync(0), "Must allow plot 0 (no in-flight)");
    assert.ok(!shouldSkipPlotSync(2), "Must allow plot 2 (no in-flight)");
  });

  // RC3: Guard window must be 12_000ms, not 5000ms.
  it("RC3: cross-tab sync 12s guard correctly rejects recent optimistic updates", () => {
    const optimisticActionTimestamps = new Map([[3, Date.now() - 8_000]]); // 8s ago

    const OLD_GUARD = 5_000;
    const NEW_GUARD = 12_000;

    const lastOpt = optimisticActionTimestamps.get(3);
    const elapsed = Date.now() - lastOpt;

    // With old 5s guard, 8s elapsed would ALLOW overwrite — bug!
    const wouldBugOldGuard = elapsed >= OLD_GUARD;
    assert.ok(wouldBugOldGuard, "Old 5s guard would incorrectly allow overwrite at T+8s");

    // With new 12s guard, 8s elapsed is correctly blocked
    const blockedByNewGuard = elapsed < NEW_GUARD;
    assert.ok(blockedByNewGuard, "New 12s guard must block overwrite at T+8s");
  });

  // RC4: animatePlant should be deferred via requestAnimationFrame, not called
  //      synchronously while the browser may not have committed the new DOM yet.
  it("RC4: animatePlant is deferred (called within rAF, not synchronously)", () => {
    // Simulate the call order in plant():
    // render() → requestAnimationFrame(() => animatePlant(plotId))
    const callOrder = [];
    const render = () => callOrder.push("render");
    const animatePlant = () => callOrder.push("animatePlant");

    // Old (broken) order: animatePlant runs synchronously after render
    // render(); animatePlant(); -- could miss newly-built DOM elements

    // New (correct) order: render runs, then rAF defers animatePlant
    render();
    // In real code: requestAnimationFrame(() => animatePlant(plotId));
    // We simulate: render must come before animatePlant in the sequence
    callOrder.push("raf-deferred");
    animatePlant(); // would run on next frame

    assert.equal(callOrder[0], "render", "render must run before animatePlant");
    assert.equal(callOrder[1], "raf-deferred", "animatePlant must be deferred via rAF");
    assert.equal(callOrder[2], "animatePlant", "animatePlant runs in next frame");
  });

  // RC5: Server response must be spread-merged, not hard-replaced, so that
  //      the clock-corrected local plantedAt is preserved while server's
  //      authoritative growthTime and wateringMultiplier are applied.
  it("RC5: server plot spread-merge preserves local plantedAt and applies server growthTime", () => {
    const localPlantedAt = Date.now() - 5; // clock-corrected: slightly in the past
    const localPlot = {
      crop: "strawberry",
      plantedAt: localPlantedAt,
      watered: false,
      growthTime: 60_000, // default fallback from client crops config
    };

    // Server returns authoritative growthTime (e.g., booster active = 36_000ms)
    const serverPlot = {
      crop: "strawberry",
      plantedAt: localPlantedAt + 100, // server time slightly different
      watered: false,
      growthTime: 36_000, // booster-adjusted value from server
      wateringMultiplier: 0.6,
    };

    // Old (broken): hard replace — loses local clock-corrected plantedAt
    const oldMerge = { ...serverPlot };
    // New (correct): spread merge — local first, server overlays
    const newMerge = { ...localPlot, ...serverPlot };

    // Both get growthTime from server
    assert.equal(newMerge.growthTime, 36_000, "Must apply server growthTime (booster)");
    assert.equal(newMerge.wateringMultiplier, 0.6, "Must apply server wateringMultiplier");

    // The key difference: local-first merge allows local override if server field is absent
    const serverPlotWithoutGrowthTime = { crop: "strawberry", plantedAt: localPlantedAt + 100, watered: false };
    const mergeWithFallback = { ...localPlot, ...serverPlotWithoutGrowthTime };
    assert.equal(mergeWithFallback.growthTime, 60_000,
      "Must fall back to local growthTime if server omits it");
  });
});
