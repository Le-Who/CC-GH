#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import {
  CROPS,
  createDefaultPlayer,
  createDefaultYardState,
  pickQuestions,
  processOfflineActions,
  simulateYardState,
} from "../game-logic.js";
import { createEmptyBoard, canAnyPieceFit, placePiece } from "../game-logic/blox-engine.js";
import { PIECES } from "../game-logic/blox-pieces.js";
import { hydrateMergeBoard, getEmptyCells } from "../game-logic/merge-board-utils.js";
import {
  generateBoard,
  findMatches,
  hasValidMoves,
  attemptMatch3Move,
  seedDropTokens,
} from "../src/game-core/match3/engine.js";
import {
  advanceBubboPressure,
  applyBubboShot,
  createBubboRun,
  generateBubboWave,
} from "../src/game-core/bubbo/engine.js";

const REPORT_PATH = path.resolve("artifacts", "perf", "perf-guard-report.json");

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[index];
}

function benchmark(fn, { iterations = 200, warmup = 30 } = {}) {
  for (let i = 0; i < warmup; i += 1) fn();
  const times = [];
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    fn();
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return {
    iterations,
    warmup,
    p50: quantile(times, 0.5),
    p95: quantile(times, 0.95),
    max: times[times.length - 1],
    avg: times.reduce((sum, value) => sum + value, 0) / times.length,
  };
}

function findValidMatch3Move(board) {
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[y].length; x += 1) {
      const candidates = [
        { x: x + 1, y },
        { x, y: y + 1 },
      ];
      for (const to of candidates) {
        if (!board[to.y]?.[to.x]) continue;
        const result = attemptMatch3Move(board, { x, y }, to);
        if (result.valid) return { from: { x, y }, to };
      }
    }
  }
  return { from: { x: 0, y: 0 }, to: { x: 1, y: 0 } };
}

function makeFullOfflinePlayer() {
  const now = Date.now();
  const player = createDefaultPlayer("perf_guard_user", "PerfGuard", now - 600_000);
  player.pet.abilities.autoHarvest = true;
  player.pet.abilities.autoPlant = true;
  player.pet.abilities.autoWater = true;
  player.resources.energy.current = 20;
  player.farm.inventory.strawberry = 50;
  for (const plot of player.farm.plots) {
    plot.crop = "strawberry";
    plot.plantedAt = now - CROPS.strawberry.growthTime - 5000;
    plot.watered = false;
  }
  return player;
}

function makeQuestionPool(size = 600) {
  return Array.from({ length: size }, (_, index) => ({
    id: index,
    question: `Question ${index}?`,
    correctAnswer: "A",
    wrongAnswers: ["B", "C", "D"],
    category: index % 2 ? "General" : "Games",
    difficulty: index % 3 === 0 ? "easy" : index % 3 === 1 ? "medium" : "hard",
    points: 10,
    timeLimit: 15,
  }));
}

function makeMergePlayer() {
  const player = createDefaultPlayer("merge_perf", "MergePerf");
  player.merge.board = Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: 9 }, (_, col) => ((row + col) % 5 === 0 ? { id: "thread", level: 1 } : null)),
  );
  return player;
}

function makeYardFixture() {
  const now = Date.now();
  const yard = createDefaultYardState(now - 36 * 60 * 60 * 1000);
  yard.currencies.treats = 1500;
  yard.foodInventory.kibble = 4;
  yard.goodieInventory.leaf_pot = 2;
  yard.placedGoodies = [
    { slotId: "small-1", goodieId: "leaf_pot", condition: "new", uses: 0, placedAt: now - 20 * 60 * 60 * 1000 },
  ];
  yard.bowls = yard.bowls.map((bowl, index) => ({
    ...bowl,
    foodId: index === 0 ? "kibble" : bowl.foodId,
    servings: index === 0 ? 3 : bowl.servings,
    placedAt: index === 0 ? now - 10 * 60 * 1000 : bowl.placedAt,
    expiresAt: index === 0 ? now + 4 * 60 * 60 * 1000 : bowl.expiresAt,
  }));
  return yard;
}

const stableMatchBoard = generateBoard();
const stableMove = findValidMatch3Move(stableMatchBoard);
const stableDropBoard = seedDropTokens(generateBoard(), 4);
const stableDropMove = findValidMatch3Move(stableDropBoard);
const stableBubboRun = createBubboRun("perf_guard_bubbo");
const stableQuestionPool = makeQuestionPool();
const stableMergePlayer = makeMergePlayer();
const stableYard = makeYardFixture();

export const PERF_SUITES = [
  {
    id: "match3.generate-board",
    group: "Gem Crush",
    description: "Generate an initial match-free 8x8 board.",
    budget: { p95: 1.25, max: 5 },
    iterations: 260,
    warmup: 40,
    fn: () => generateBoard(),
  },
  {
    id: "match3.find-matches",
    group: "Gem Crush",
    description: "Scan an 8x8 board for matches during input and cascades.",
    budget: { p95: 0.2, max: 1.5 },
    iterations: 900,
    warmup: 80,
    fn: () => findMatches(stableMatchBoard),
  },
  {
    id: "match3.valid-moves",
    group: "Gem Crush",
    description: "Check whether a playable board still has a legal move.",
    budget: { p95: 1.2, max: 5 },
    iterations: 300,
    warmup: 40,
    fn: () => hasValidMoves(stableMatchBoard),
  },
  {
    id: "match3.resolve-valid-swap",
    group: "Gem Crush",
    description: "Resolve a real adjacent swap including cascades and board snapshots.",
    budget: { p95: 6, max: 18 },
    iterations: 160,
    warmup: 25,
    fn: () => attemptMatch3Move(stableMatchBoard, stableMove.from, stableMove.to),
  },
  {
    id: "match3.star-drop-swap",
    group: "Gem Crush",
    description: "Resolve Star Drop collection and repeated bottom-row backfill.",
    budget: { p95: 7, max: 22 },
    iterations: 140,
    warmup: 25,
    fn: () => attemptMatch3Move(stableDropBoard, stableDropMove.from, stableDropMove.to, { collectDrops: true }),
  },
  {
    id: "blox.fit-scan",
    group: "Building Blox",
    description: "Find whether any tray piece can fit on the 10x10 board.",
    budget: { p95: 0.45, max: 2 },
    iterations: 700,
    warmup: 80,
    fn: () => canAnyPieceFit(createEmptyBoard(), PIECES.slice(0, 3).map((piece) => ({ piece, placed: false }))),
  },
  {
    id: "blox.place-piece",
    group: "Building Blox",
    description: "Apply an authoritative piece placement mutation.",
    budget: { p95: 0.08, max: 0.8 },
    iterations: 1000,
    warmup: 100,
    fn: () => {
      const board = createEmptyBoard();
      placePiece(board, PIECES[7], 4, 4);
    },
  },
  {
    id: "merge.board-hydrate",
    group: "Gacha Merge",
    description: "Hydrate persisted merge board and scan empty cells.",
    budget: { p95: 0.3, max: 1.5 },
    iterations: 700,
    warmup: 80,
    fn: () => {
      const player = structuredClone(stableMergePlayer);
      hydrateMergeBoard(player);
      getEmptyCells(player.merge.board);
    },
  },
  {
    id: "bubbo.pressure-advance",
    group: "Bubbo Bubbo",
    description: "Advance pressure by multiple intervals and insert pending waves.",
    budget: { p95: 0.6, max: 3 },
    iterations: 500,
    warmup: 60,
    fn: () => advanceBubboPressure(stableBubboRun, 29_500),
  },
  {
    id: "bubbo.apply-shot",
    group: "Bubbo Bubbo",
    description: "Place a shot, pop clusters, and settle unsupported bubbles.",
    budget: { p95: 0.8, max: 4 },
    iterations: 500,
    warmup: 60,
    fn: () => applyBubboShot(stableBubboRun.board, generateBubboWave("perf_guard_bubbo", 1)[0], 5, 4, { rowOffset: 0 }),
  },
  {
    id: "farm.offline-full",
    group: "Garden Shelf",
    description: "Process offline farm actions for all plots with helper abilities.",
    budget: { p95: 1, max: 5 },
    iterations: 220,
    warmup: 30,
    fn: () => processOfflineActions(makeFullOfflinePlayer(), Date.now()),
  },
  {
    id: "trivia.pick-questions",
    group: "Brain Blitz",
    description: "Filter and shuffle a large question pool.",
    budget: { p95: 0.8, max: 4 },
    iterations: 320,
    warmup: 40,
    fn: () => pickQuestions(stableQuestionPool, 10, "easy"),
  },
  {
    id: "yard.simulate-36h",
    group: "Cozy Yard",
    description: "Simulate a 36-hour visitor/gift window with bowls and goodies.",
    budget: { p95: 2.5, max: 10 },
    iterations: 160,
    warmup: 25,
    fn: () => simulateYardState(stableYard, Date.now(), {}, "perf_guard"),
  },
];

function resultForSuite(suite) {
  const stats = benchmark(suite.fn, suite);
  const failures = [];
  if (stats.p95 > suite.budget.p95) failures.push(`p95 ${stats.p95.toFixed(3)}ms > ${suite.budget.p95}ms`);
  if (stats.max > suite.budget.max) failures.push(`max ${stats.max.toFixed(3)}ms > ${suite.budget.max}ms`);
  return {
    id: suite.id,
    group: suite.group,
    description: suite.description,
    budget: suite.budget,
    stats,
    passed: failures.length === 0,
    failures,
  };
}

export async function runPerfGuard({ writeReport = true, quiet = false, reportPath = REPORT_PATH } = {}) {
  const startedAt = new Date().toISOString();
  const results = PERF_SUITES.map(resultForSuite);
  const failed = results.filter((result) => !result.passed);
  const report = {
    schemaVersion: 1,
    generatedAt: startedAt,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    budgets: "milliseconds; p95 and max must both stay inside budget",
    results,
    passed: failed.length === 0,
  };

  if (writeReport) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (!quiet) {
    for (const result of results) {
      const status = result.passed ? "PASS" : "FAIL";
      const { stats, budget } = result;
      console.log(
        `${status} ${result.id} p50=${stats.p50.toFixed(3)}ms p95=${stats.p95.toFixed(3)}ms/${budget.p95}ms max=${stats.max.toFixed(3)}ms/${budget.max}ms`,
      );
      if (result.failures.length) console.log(`  ${result.failures.join("; ")}`);
    }
    if (writeReport) console.log(`Report: ${reportPath}`);
  }

  return report;
}

function parseArgs(argv) {
  return {
    quiet: argv.includes("--quiet"),
    writeReport: !argv.includes("--no-write"),
    reportPath: argv.includes("--report")
      ? path.resolve(argv[argv.indexOf("--report") + 1] || REPORT_PATH)
      : REPORT_PATH,
  };
}

const currentFile = pathToFileURL(fileURLToPath(import.meta.url)).href;
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === currentFile) {
  const report = await runPerfGuard(parseArgs(process.argv.slice(2)));
  if (!report.passed) process.exitCode = 1;
}
