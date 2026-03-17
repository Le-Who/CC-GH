/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Performance Tests
 *  Timing benchmarks for hot-path game logic functions
 *  Run:  node --test tests/perf.test.js
 * ═══════════════════════════════════════════════════════
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  CROPS,
  createDefaultPlayer,
  processOfflineActions,
  generateBoard,
  findMatches,
  pickQuestions,
} from "../game-logic.js";

/**
 * Run a function N times, return p50/p95/max in ms.
 * Includes a warmup phase that is discarded.
 */
function benchmark(fn, { iterations = 100, warmup = 10 } = {}) {
  // Warmup
  for (let i = 0; i < warmup; i++) fn();

  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  return {
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    max: times[times.length - 1],
    avg: times.reduce((a, b) => a + b, 0) / times.length,
  };
}

/* ─────────────────────────────────────────────────────
 *  generateBoard — Must produce match-free 8×8 grid
 * ───────────────────────────────────────────────────── */
describe("perf: generateBoard", () => {
  it("generates 100 boards in < 50ms total", () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) generateBoard();
    const elapsed = performance.now() - start;
    assert.ok(
      elapsed < 50,
      `100 boards took ${elapsed.toFixed(2)}ms (budget: 50ms)`,
    );
  });

  it("single board p95 < 1ms", () => {
    const stats = benchmark(() => generateBoard(), {
      iterations: 200,
      warmup: 20,
    });
    assert.ok(stats.p95 < 1, `p95=${stats.p95.toFixed(3)}ms (budget: 1ms)`);
    console.log(
      `    generateBoard: p50=${stats.p50.toFixed(3)}ms p95=${stats.p95.toFixed(3)}ms max=${stats.max.toFixed(3)}ms`,
    );
  });
});

/* ─────────────────────────────────────────────────────
 *  findMatches — 8×8 grid scan
 * ───────────────────────────────────────────────────── */
describe("perf: findMatches", () => {
  it("scans 1000 boards in < 20ms total", () => {
    const boards = Array.from({ length: 100 }, () => generateBoard());
    const start = performance.now();
    for (let run = 0; run < 10; run++) {
      for (const board of boards) findMatches(board);
    }
    const elapsed = performance.now() - start;
    assert.ok(
      elapsed < 20,
      `1000 scans took ${elapsed.toFixed(2)}ms (budget: 20ms)`,
    );
  });

  it("single scan p95 < 0.1ms", () => {
    const board = generateBoard();
    const stats = benchmark(() => findMatches(board), {
      iterations: 500,
      warmup: 50,
    });
    assert.ok(stats.p95 < 0.1, `p95=${stats.p95.toFixed(4)}ms (budget: 0.1ms)`);
    console.log(
      `    findMatches: p50=${stats.p50.toFixed(4)}ms p95=${stats.p95.toFixed(4)}ms max=${stats.max.toFixed(4)}ms`,
    );
  });
});

/* ─────────────────────────────────────────────────────
 *  processOfflineActions — Full simulation loop
 * ───────────────────────────────────────────────────── */
describe("perf: processOfflineActions", () => {
  function makeFullPlayer() {
    const now = Date.now();
    const p = createDefaultPlayer("perf_user", "PerfTest", now - 600000);
    p.pet.abilities.autoHarvest = true;
    p.pet.abilities.autoPlant = true;
    p.pet.abilities.autoWater = true;
    p.resources.energy.current = 20;
    p.farm.inventory.strawberry = 50;
    // Fill all plots with fully grown crops
    for (const plot of p.farm.plots) {
      plot.crop = "strawberry";
      plot.plantedAt = now - CROPS.strawberry.growthTime - 5000;
      plot.watered = false;
    }
    return p;
  }

  it("full simulation (6 plots, all abilities) p95 < 0.5ms", () => {
    const stats = benchmark(
      () => {
        const p = makeFullPlayer();
        processOfflineActions(p, Date.now());
      },
      { iterations: 200, warmup: 20 },
    );
    assert.ok(stats.p95 < 0.5, `p95=${stats.p95.toFixed(3)}ms (budget: 0.5ms)`);
    console.log(
      `    processOfflineActions (full): p50=${stats.p50.toFixed(3)}ms p95=${stats.p95.toFixed(3)}ms max=${stats.max.toFixed(3)}ms`,
    );
  });

  it("no-op simulation (< 2min offline) p95 < 0.05ms", () => {
    const now = Date.now();
    const p = createDefaultPlayer("noop_user", "NoOp", now - 30000);
    const stats = benchmark(() => processOfflineActions(p, now), {
      iterations: 500,
      warmup: 50,
    });
    assert.ok(
      stats.p95 < 0.05,
      `p95=${stats.p95.toFixed(4)}ms (budget: 0.05ms)`,
    );
    console.log(
      `    processOfflineActions (no-op): p50=${stats.p50.toFixed(4)}ms p95=${stats.p95.toFixed(4)}ms max=${stats.max.toFixed(4)}ms`,
    );
  });
});

/* ─────────────────────────────────────────────────────
 *  pickQuestions — Question filtering + shuffle
 * ───────────────────────────────────────────────────── */
describe("perf: pickQuestions", () => {
  // Build a large question pool
  const bigPool = Array.from({ length: 500 }, (_, i) => ({
    id: i,
    question: `Q${i}?`,
    correctAnswer: "A",
    wrongAnswers: ["B", "C", "D"],
    category: "Test",
    difficulty: i % 3 === 0 ? "easy" : i % 3 === 1 ? "medium" : "hard",
    points: 10,
    timeLimit: 15,
  }));

  it("picks from 500 questions p95 < 0.5ms", () => {
    const stats = benchmark(() => pickQuestions(bigPool, 10, "easy"), {
      iterations: 300,
      warmup: 30,
    });
    assert.ok(stats.p95 < 0.5, `p95=${stats.p95.toFixed(3)}ms (budget: 0.5ms)`);
    console.log(
      `    pickQuestions (500 pool): p50=${stats.p50.toFixed(3)}ms p95=${stats.p95.toFixed(3)}ms max=${stats.max.toFixed(3)}ms`,
    );
  });
});
