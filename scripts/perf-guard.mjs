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
import { applyMigrations } from "../playerManager.js";
import { applyAction, buildSnapshot } from "../routes/player.js";
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

async function maybeAwait(value) {
  if (value && typeof value.then === "function") await value;
}

async function benchmark(fn, { iterations = 200, warmup = 30 } = {}) {
  for (let i = 0; i < warmup; i += 1) await maybeAwait(fn());
  const times = [];
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    await maybeAwait(fn());
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

function makeFullDayOfflinePlayer() {
  const player = makeFullOfflinePlayer();
  player._lastSeen = Date.now() - 24 * 60 * 60 * 1000;
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

function makeMergeGeneratorPlayer() {
  const player = createDefaultPlayer("merge_generator_perf", "MergeGeneratorPerf");
  player.merge.freeTapCharges = 30;
  return player;
}

function makeMergeRecipePlayer() {
  const player = createDefaultPlayer("merge_recipe_perf", "MergeRecipePerf");
  player.merge.board[0][0] = { id: "sand", chainId: "earth", level: 1 };
  player.merge.board[0][1] = { id: "lightning", chainId: "storm", level: 3 };
  return player;
}

function makeAlmostFullBloxBoard() {
  const board = createEmptyBoard();
  for (const row of board) row.fill("#7c3aed");
  board[9][9] = null;
  return board;
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

function makeLongIdleYardFixture() {
  const now = Date.now();
  const yard = createDefaultYardState(now - 9 * 24 * 60 * 60 * 1000);
  yard.currencies.treats = 2000;
  yard.foodInventory.kibble = 10;
  yard.goodieInventory.cardboard_cottage = 1;
  yard.placedGoodies = [
    { slotId: "large-1", goodieId: "cardboard_cottage", condition: "worn", uses: 8, placedAt: now - 8 * 24 * 60 * 60 * 1000 },
  ];
  yard.bowls = [{
    id: "bowl-1",
    foodId: "kibble",
    servings: 99,
    placedAt: now - 8 * 24 * 60 * 60 * 1000,
    expiresAt: now + 60 * 60 * 1000,
  }];
  return yard;
}

function makeLegacyMigrationPlayer() {
  return {
    id: "legacy_perf_guard",
    username: "LegacyPerf",
    schemaVersion: 1,
  };
}

function makeSnapshotPlayer() {
  const now = Date.now();
  const player = createDefaultPlayer("snapshot_perf", "SnapshotPerf", now - 300_000);
  player.resources.gold = 750;
  player.resources.gachaTokens = 3;
  player.farm.harvested = { strawberry: 12, blueberry: 4 };
  player.merge.freeTapCharges = 12;
  player.merge.board[0][0] = { id: "thread", chainId: "textile", level: 0 };
  player.merge.board[0][1] = { id: "cloth", chainId: "textile", level: 1 };
  player.yard.currencies.treats = 250;
  player.yard.goodieInventory.leaf_pot = 1;
  player.yard.placedGoodies = [{
    slotId: "small-1",
    goodieId: "leaf_pot",
    condition: "new",
    uses: 0,
    placedAt: now - 60_000,
  }];
  return player;
}

const stableMatchBoard = generateBoard();
const stableMove = findValidMatch3Move(stableMatchBoard);
const stableDropBoard = seedDropTokens(generateBoard(), 4);
const stableDropMove = findValidMatch3Move(stableDropBoard);
const stableBubboRun = createBubboRun("perf_guard_bubbo");
const stableQuestionPool = makeQuestionPool();
const stableMergePlayer = makeMergePlayer();
const stableMergeGeneratorPlayer = makeMergeGeneratorPlayer();
const stableMergeRecipePlayer = makeMergeRecipePlayer();
const stableAlmostFullBloxBoard = makeAlmostFullBloxBoard();
const stableYard = makeYardFixture();
const stableLongIdleYard = makeLongIdleYardFixture();
const stableCurrentPlayer = createDefaultPlayer("current_perf_guard", "CurrentPerf");
const stableLegacyPlayer = makeLegacyMigrationPlayer();
const stableSnapshotPlayer = makeSnapshotPlayer();

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
    budget: { p95: 0.2, max: 5 },
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
    id: "blox.almost-full-fit-scan",
    group: "Building Blox",
    description: "Scan a nearly full board with only non-fitting tray pieces.",
    budget: { p95: 0.7, max: 3 },
    iterations: 500,
    warmup: 70,
    fn: () => canAnyPieceFit(
      stableAlmostFullBloxBoard,
      PIECES.filter((piece) => piece.cells.length > 1).slice(0, 3).map((piece) => ({ piece, placed: false })),
    ),
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
    budget: { p95: 0.3, max: 8 },
    iterations: 700,
    warmup: 80,
    fn: () => {
      const player = structuredClone(stableMergePlayer);
      hydrateMergeBoard(player);
      getEmptyCells(player.merge.board);
    },
  },
  {
    id: "merge.apply-generator",
    group: "Gacha Merge",
    description: "Apply a server-authoritative random generator tap including snapshot construction.",
    budget: { p95: 1.2, max: 6 },
    iterations: 180,
    warmup: 30,
    fn: () => applyAction(structuredClone(stableMergeGeneratorPlayer), "merge.tap", {}, { now: 1_800_000_000_000 }),
  },
  {
    id: "merge.apply-recipe",
    group: "Gacha Merge",
    description: "Apply the sand plus lightning recipe merge with authoritative rewards and snapshot construction.",
    budget: { p95: 1.2, max: 6 },
    iterations: 180,
    warmup: 30,
    fn: () => applyAction(
      structuredClone(stableMergeRecipePlayer),
      "merge.merge",
      { fromR: 0, fromC: 0, toR: 0, toC: 1 },
      { now: 1_800_000_000_000 },
    ),
  },
  {
    id: "bubbo.pressure-advance",
    group: "Bubbo Bubbo",
    description: "Advance pressure by multiple intervals and insert pending waves.",
    budget: { p95: 0.6, max: 8 },
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
    id: "farm.offline-24h",
    group: "Garden Shelf",
    description: "Process a 24-hour offline return through capped helper actions.",
    budget: { p95: 1.2, max: 6 },
    iterations: 220,
    warmup: 30,
    fn: () => processOfflineActions(makeFullDayOfflinePlayer(), Date.now()),
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
  {
    id: "yard.simulate-long-idle",
    group: "Cozy Yard",
    description: "Simulate a multi-day Yard return through the capped idle window.",
    budget: { p95: 2.8, max: 12 },
    iterations: 150,
    warmup: 25,
    fn: () => simulateYardState(stableLongIdleYard, Date.now(), {}, "perf_guard_long_idle"),
  },
  {
    id: "player.apply-migrations-current",
    group: "Player JSON",
    description: "Run the no-op current-schema JSON migration path used on every locked player load.",
    budget: { p95: 0.35, max: 2 },
    iterations: 500,
    warmup: 70,
    fn: () => applyMigrations(structuredClone(stableCurrentPlayer)),
  },
  {
    id: "player.apply-migrations-legacy",
    group: "Player JSON",
    description: "Upgrade a minimal legacy player document through the full JSON migration ladder.",
    budget: { p95: 0.65, max: 3 },
    iterations: 420,
    warmup: 60,
    fn: () => applyMigrations(structuredClone(stableLegacyPlayer)),
  },
  {
    id: "player.build-snapshot",
    group: "Player JSON",
    description: "Build an authoritative mutation snapshot with inventory, Yard, Merge, achievements, and meta catalogs.",
    budget: { p95: 0.8, max: 4 },
    iterations: 320,
    warmup: 50,
    fn: () => buildSnapshot(structuredClone(stableSnapshotPlayer)),
  },
];

function aggregateRoundStats(rounds) {
  return {
    iterations: rounds.reduce((sum, round) => sum + round.iterations, 0),
    warmup: rounds.reduce((sum, round) => sum + round.warmup, 0),
    p50: quantile([...rounds.map((round) => round.p50)].sort((a, b) => a - b), 0.5),
    p95: Math.max(...rounds.map((round) => round.p95)),
    max: Math.max(...rounds.map((round) => round.max)),
    avg: rounds.reduce((sum, round) => sum + round.avg, 0) / rounds.length,
  };
}

async function resultForSuite(suite, repeat = 1) {
  const rounds = [];
  for (let round = 0; round < repeat; round += 1) {
    rounds.push(await benchmark(suite.fn, suite));
  }
  const stats = aggregateRoundStats(rounds);
  const failures = [];
  if (stats.p95 > suite.budget.p95) failures.push(`p95 ${stats.p95.toFixed(3)}ms > ${suite.budget.p95}ms`);
  if (stats.max > suite.budget.max) failures.push(`max ${stats.max.toFixed(3)}ms > ${suite.budget.max}ms`);
  return {
    id: suite.id,
    group: suite.group,
    description: suite.description,
    budget: suite.budget,
    stats,
    rounds,
    passed: failures.length === 0,
    failures,
  };
}

function budgetRatio(result) {
  const p95Ratio = result.budget.p95 > 0 ? result.stats.p95 / result.budget.p95 : 0;
  const maxRatio = result.budget.max > 0 ? result.stats.max / result.budget.max : 0;
  return Math.max(p95Ratio, maxRatio);
}

function buildSummary(results) {
  const failed = results.filter((result) => !result.passed);
  const slowest = [...results]
    .sort((a, b) => budgetRatio(b) - budgetRatio(a))
    .slice(0, 5)
    .map((result) => ({
      id: result.id,
      ratio: Number(budgetRatio(result).toFixed(3)),
      p95: result.stats.p95,
      max: result.stats.max,
    }));
  return {
    totalSuites: results.length,
    passedSuites: results.length - failed.length,
    failedSuites: failed.length,
    slowestBudgetRatios: slowest,
  };
}

function selectSuites(suiteIds = []) {
  if (!suiteIds?.length) return PERF_SUITES;
  const wanted = new Set(suiteIds);
  const selected = PERF_SUITES.filter((suite) => wanted.has(suite.id));
  const found = new Set(selected.map((suite) => suite.id));
  const missing = [...wanted].filter((id) => !found.has(id));
  if (missing.length) {
    throw new Error(`Unknown perf suite id(s): ${missing.join(", ")}`);
  }
  return selected;
}

export async function runPerfGuard({ writeReport = true, quiet = false, reportPath = REPORT_PATH, suiteIds = [], repeat = 1 } = {}) {
  const startedAt = new Date().toISOString();
  const suites = selectSuites(suiteIds);
  const safeRepeat = Math.max(1, Math.floor(Number(repeat) || 1));
  const results = [];
  for (const suite of suites) {
    results.push(await resultForSuite(suite, safeRepeat));
  }
  const failed = results.filter((result) => !result.passed);
  const summary = buildSummary(results);
  const report = {
    schemaVersion: 2,
    generatedAt: startedAt,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    budgets: "milliseconds; p95 and max must both stay inside budget",
    suiteFilter: suiteIds,
    repeat: safeRepeat,
    summary,
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
    console.log(
      `Summary: ${summary.passedSuites}/${summary.totalSuites} suites passed; slowest budget ratio ${summary.slowestBudgetRatios[0]?.ratio ?? 0}`,
    );
    if (writeReport) console.log(`Report: ${reportPath}`);
  }

  return report;
}

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== "--");
  const suiteArgIndex = args.indexOf("--suite");
  const repeatArgIndex = args.indexOf("--repeat");
  const suiteIds = suiteArgIndex >= 0
    ? String(args[suiteArgIndex + 1] || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
    : [];
  return {
    quiet: args.includes("--quiet"),
    list: args.includes("--list"),
    suiteIds,
    repeat: repeatArgIndex >= 0 ? Number(args[repeatArgIndex + 1] || 1) : 1,
    writeReport: !args.includes("--no-write"),
    reportPath: args.includes("--report")
      ? path.resolve(args[args.indexOf("--report") + 1] || REPORT_PATH)
      : REPORT_PATH,
  };
}

const currentFile = pathToFileURL(fileURLToPath(import.meta.url)).href;
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === currentFile) {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    for (const suite of PERF_SUITES) {
      console.log(`${suite.id}\t${suite.group}\t${suite.description}`);
    }
    process.exit(0);
  }
  const report = await runPerfGuard(args);
  if (!report.passed) process.exitCode = 1;
}
