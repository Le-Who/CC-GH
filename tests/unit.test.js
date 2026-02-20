/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Unit Tests
 *  Tests for pure game logic extracted into game-logic.js
 *  Run:  node --test tests/unit.test.js
 * ═══════════════════════════════════════════════════════
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ECONOMY,
  CROPS,
  GEM_TYPES,
  BOARD_SIZE,
  OFFLINE_THRESHOLD_MS,
  createDefaultPlayer,
  calcRegen,
  processOfflineActions,
  getWateringMultiplier,
  getGrowthPct,
  farmPlotsWithGrowth,
  generateBoard,
  findMatches,
  pickQuestions,
  makeClientQuestion,
} from "../game-logic.js";

/* ─────────────────────────────────────────────────────
 *  createDefaultPlayer
 * ───────────────────────────────────────────────────── */
describe("createDefaultPlayer", () => {
  it("returns a player with all required fields", () => {
    const p = createDefaultPlayer("u1", "Alice");
    assert.equal(p.id, "u1");
    assert.equal(p.username, "Alice");
    assert.equal(p.schemaVersion, 2);
    assert.equal(p.resources.gold, ECONOMY.GOLD_START);
    assert.equal(p.resources.energy.current, ECONOMY.ENERGY_START);
    assert.equal(p.resources.energy.max, ECONOMY.ENERGY_MAX);
    assert.ok(p.pet);
    assert.ok(p.farm);
    assert.ok(p.trivia);
    assert.ok(p.match3);
  });

  it("[FIX 1 REGRESSION] initializes _lastSeen to a valid timestamp", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u2", "Bob", now);
    assert.equal(p._lastSeen, now);
    assert.equal(typeof p._lastSeen, "number");
    assert.ok(!isNaN(p._lastSeen), "_lastSeen must not be NaN");
  });

  it("defaults username to 'Player' when omitted", () => {
    const p = createDefaultPlayer("u3");
    assert.equal(p.username, "Player");
  });

  it("creates 6 empty farm plots", () => {
    const p = createDefaultPlayer("u4", "Test");
    assert.equal(p.farm.plots.length, 6);
    for (const plot of p.farm.plots) {
      assert.equal(plot.crop, null);
      assert.equal(plot.plantedAt, null);
      assert.equal(plot.watered, false);
    }
  });

  it("starts with 5 strawberry seeds", () => {
    const p = createDefaultPlayer("u5", "Test");
    assert.equal(p.farm.inventory.strawberry, 5);
  });
});

/* ─────────────────────────────────────────────────────
 *  calcRegen
 * ───────────────────────────────────────────────────── */
describe("calcRegen", () => {
  it("does nothing when energy is already at max", () => {
    const p = createDefaultPlayer("u1", "Test");
    const before = p.resources.energy.current;
    calcRegen(p);
    assert.equal(p.resources.energy.current, before);
  });

  it("regenerates 1 energy after one regen interval", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.resources.energy.current = 5;
    p.resources.energy.lastRegenTimestamp = now;

    const future = now + ECONOMY.ENERGY_REGEN_INTERVAL_MS;
    calcRegen(p, future);
    assert.equal(p.resources.energy.current, 6);
  });

  it("regenerates multiple energy after multiple intervals", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.resources.energy.current = 0;
    p.resources.energy.lastRegenTimestamp = now;

    const future = now + ECONOMY.ENERGY_REGEN_INTERVAL_MS * 5;
    calcRegen(p, future);
    assert.equal(p.resources.energy.current, 5);
  });

  it("caps energy at max", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.resources.energy.current = 18;
    p.resources.energy.lastRegenTimestamp = now;

    const future = now + ECONOMY.ENERGY_REGEN_INTERVAL_MS * 10;
    calcRegen(p, future);
    assert.equal(p.resources.energy.current, ECONOMY.ENERGY_MAX);
  });

  it("preserves partial tick progress", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.resources.energy.current = 5;
    p.resources.energy.lastRegenTimestamp = now;

    // 1.5 intervals — should give 1 energy, preserve half-tick
    const halfInterval = Math.floor(ECONOMY.ENERGY_REGEN_INTERVAL_MS / 2);
    const future = now + ECONOMY.ENERGY_REGEN_INTERVAL_MS + halfInterval;
    calcRegen(p, future);
    assert.equal(p.resources.energy.current, 6);
    // lastRegenTimestamp should be set to preserve the remaining half
    assert.ok(p.resources.energy.lastRegenTimestamp > now);
    assert.ok(p.resources.energy.lastRegenTimestamp < future);
  });
});

/* ─────────────────────────────────────────────────────
 *  processOfflineActions
 * ───────────────────────────────────────────────────── */
describe("processOfflineActions", () => {
  it("[FIX 1 REGRESSION] returns null for elapsed < 2 minutes", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    // Simulate being away for 30 seconds
    const result = processOfflineActions(p, now + 30000);
    assert.equal(result, null);
  });

  it("[FIX 1 REGRESSION] returns null for elapsed < 120s (threshold)", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    // 119 seconds — just under threshold
    const result = processOfflineActions(p, now + 119999);
    assert.equal(result, null);
  });

  it("returns null when no abilities are enabled even if away > 2 min", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    // All abilities are false by default (autoHarvest, autoPlant, autoWater)
    const result = processOfflineActions(p, now + 300000);
    assert.equal(result, null);
  });

  it("auto-waters unwatered crops when ability is enabled", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.pet.abilities.autoWater = true;
    // Plant strawberry on plot 0
    p.farm.plots[0].crop = "strawberry";
    p.farm.plots[0].plantedAt = now;
    p.farm.plots[0].watered = false;

    const result = processOfflineActions(p, now + 300000);
    assert.ok(result);
    assert.equal(result.autoWatered, 1);
    assert.equal(p.farm.plots[0].watered, true);
  });

  it("auto-harvests fully grown crops (deducts 1 energy each)", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.pet.abilities.autoHarvest = true;
    p.resources.energy.current = 5;

    // Plant a strawberry that is fully grown (planted long ago)
    p.farm.plots[0].crop = "strawberry";
    p.farm.plots[0].plantedAt = now - CROPS.strawberry.growthTime - 1000;
    p.farm.plots[0].watered = false;

    const result = processOfflineActions(p, now + 300000);
    assert.ok(result);
    assert.equal(result.harvested.strawberry, 1);
    assert.equal(result.energyConsumed, 1);
    assert.equal(result.xpGained, CROPS.strawberry.xp);
    // Plot should be cleared
    assert.equal(p.farm.plots[0].crop, null);
    // Player should have the harvest
    assert.equal(p.farm.harvested.strawberry, 1);
  });

  it("auto-plants seeds on empty plots (deducts 2 energy each)", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.pet.abilities.autoPlant = true;
    p.resources.energy.current = 10;
    p.farm.inventory.strawberry = 3;

    const result = processOfflineActions(p, now + 300000);
    assert.ok(result);
    // Should have planted up to 3 strawberries (6 energy needed, have 10)
    const totalPlanted = Object.values(result.planted).reduce(
      (a, b) => a + b,
      0,
    );
    assert.ok(totalPlanted > 0);
    assert.equal(result.energyConsumed, totalPlanted * 2);
  });

  it("stops auto-harvest when energy runs out", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.pet.abilities.autoHarvest = true;
    p.resources.energy.current = 2;

    // Plant 4 fully grown strawberries
    for (let i = 0; i < 4; i++) {
      p.farm.plots[i].crop = "strawberry";
      p.farm.plots[i].plantedAt = now - CROPS.strawberry.growthTime - 1000;
    }

    const result = processOfflineActions(p, now + 300000);
    assert.ok(result);
    assert.equal(result.energyConsumed, 2); // Only 2 harvested
    assert.equal(result.harvested.strawberry, 2);
  });

  it("updates _lastSeen to current time", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    const future = now + 300000;
    processOfflineActions(p, future);
    assert.equal(p._lastSeen, future);
  });
});

/* ─────────────────────────────────────────────────────
 *  getWateringMultiplier
 * ───────────────────────────────────────────────────── */
describe("getWateringMultiplier", () => {
  it("returns 0.7 for fast crops (strawberry)", () => {
    assert.equal(getWateringMultiplier("strawberry"), 0.7);
  });

  it("returns 0.6 for medium crops (tomato, corn)", () => {
    assert.equal(getWateringMultiplier("tomato"), 0.6);
    assert.equal(getWateringMultiplier("corn"), 0.6);
  });

  it("returns 0.55 for slow crops (sunflower, golden)", () => {
    assert.equal(getWateringMultiplier("sunflower"), 0.55);
    assert.equal(getWateringMultiplier("golden"), 0.55);
  });

  it("returns 0.7 for unknown crops", () => {
    assert.equal(getWateringMultiplier("unknown_crop"), 0.7);
  });
});

/* ─────────────────────────────────────────────────────
 *  getGrowthPct
 * ───────────────────────────────────────────────────── */
describe("getGrowthPct", () => {
  it("returns 0 for empty plot", () => {
    assert.equal(getGrowthPct({ crop: null, plantedAt: null }), 0);
  });

  it("returns 0 for unknown crop", () => {
    const now = Date.now();
    assert.equal(getGrowthPct({ crop: "unknown", plantedAt: now }, now), 0);
  });

  it("returns 0 at planting time", () => {
    const now = Date.now();
    const pct = getGrowthPct(
      { crop: "strawberry", plantedAt: now, watered: false },
      now,
    );
    assert.equal(pct, 0);
  });

  it("returns 1 at full growth time (unwatered)", () => {
    const now = Date.now();
    const plantedAt = now - CROPS.strawberry.growthTime;
    const pct = getGrowthPct(
      { crop: "strawberry", plantedAt, watered: false },
      now,
    );
    assert.equal(pct, 1);
  });

  it("returns 1 sooner when watered (multiplier applies)", () => {
    const now = Date.now();
    const mult = getWateringMultiplier("strawberry"); // 0.7
    const effectiveTime = CROPS.strawberry.growthTime * mult;
    const plantedAt = now - effectiveTime;
    const pct = getGrowthPct(
      { crop: "strawberry", plantedAt, watered: true },
      now,
    );
    assert.ok(pct >= 1, `Expected >= 1, got ${pct}`);
  });

  it("caps at 1 even if way past growth time", () => {
    const now = Date.now();
    const plantedAt = now - CROPS.strawberry.growthTime * 10;
    const pct = getGrowthPct(
      { crop: "strawberry", plantedAt, watered: false },
      now,
    );
    assert.equal(pct, 1);
  });

  it("returns intermediate value during growth", () => {
    const now = Date.now();
    const half = Math.floor(CROPS.strawberry.growthTime / 2);
    const plantedAt = now - half;
    const pct = getGrowthPct(
      { crop: "strawberry", plantedAt, watered: false },
      now,
    );
    assert.ok(pct > 0.4 && pct < 0.6, `Expected ~0.5, got ${pct}`);
  });
});

/* ─────────────────────────────────────────────────────
 *  farmPlotsWithGrowth
 * ───────────────────────────────────────────────────── */
describe("farmPlotsWithGrowth", () => {
  it("adds growth, growthTime, and wateringMultiplier to each plot", () => {
    const now = Date.now();
    const farm = {
      plots: [
        { crop: "strawberry", plantedAt: now - 5000, watered: false },
        { crop: null, plantedAt: null, watered: false },
      ],
    };
    const result = farmPlotsWithGrowth(farm, now);
    assert.equal(result.length, 2);
    // Plot with crop
    assert.ok(result[0].growth > 0);
    assert.equal(result[0].growthTime, CROPS.strawberry.growthTime);
    assert.equal(
      result[0].wateringMultiplier,
      getWateringMultiplier("strawberry"),
    );
    // Empty plot
    assert.equal(result[1].growth, 0);
    assert.equal(result[1].growthTime, 0);
    assert.equal(result[1].wateringMultiplier, 1);
  });
});

/* ─────────────────────────────────────────────────────
 *  generateBoard & findMatches
 * ───────────────────────────────────────────────────── */
describe("generateBoard", () => {
  it("creates an 8×8 grid", () => {
    const board = generateBoard();
    assert.equal(board.length, BOARD_SIZE);
    for (const row of board) {
      assert.equal(row.length, BOARD_SIZE);
    }
  });

  it("uses only valid gem types", () => {
    const board = generateBoard();
    for (const row of board) {
      for (const gem of row) {
        assert.ok(GEM_TYPES.includes(gem), `Invalid gem type: ${gem}`);
      }
    }
  });

  it("has no initial matches (3-in-a-row)", () => {
    // Run multiple times to increase confidence
    for (let attempt = 0; attempt < 10; attempt++) {
      const board = generateBoard();
      const matches = findMatches(board);
      assert.equal(
        matches.length,
        0,
        `Board had ${matches.length} initial matches on attempt ${attempt}`,
      );
    }
  });
});

describe("findMatches", () => {
  it("detects horizontal 3-in-a-row", () => {
    // Create a board with a deliberate horizontal match
    const board = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => "fire"),
    );
    // Make most cells unique to avoid extra matches
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        board[y][x] = GEM_TYPES[(y * 8 + x) % GEM_TYPES.length];
      }
    }
    // Set a deliberate horizontal match at row 0, cols 0-2
    board[0][0] = "dark";
    board[0][1] = "dark";
    board[0][2] = "dark";

    const matches = findMatches(board);
    const horiz = matches.find(
      (m) => m.type === "dark" && m.gems.some((g) => g.y === 0),
    );
    assert.ok(horiz, "Should detect horizontal match");
    assert.ok(horiz.gems.length >= 3);
  });

  it("detects vertical 3-in-a-row", () => {
    const board = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => "fire"),
    );
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        board[y][x] = GEM_TYPES[(y * 8 + x) % GEM_TYPES.length];
      }
    }
    // Set a deliberate vertical match at col 7, rows 0-2
    board[0][7] = "light";
    board[1][7] = "light";
    board[2][7] = "light";

    const matches = findMatches(board);
    const vert = matches.find(
      (m) => m.type === "light" && m.gems.some((g) => g.x === 7),
    );
    assert.ok(vert, "Should detect vertical match");
    assert.ok(vert.gems.length >= 3);
  });

  it("returns empty array when no matches exist", () => {
    // Checkerboard pattern — no 3-in-a-row possible
    const board = Array.from({ length: 8 }, (_, y) =>
      Array.from(
        { length: 8 },
        (_, x) => GEM_TYPES[(x + y * 2) % GEM_TYPES.length],
      ),
    );
    const matches = findMatches(board);
    assert.equal(matches.length, 0);
  });
});

/* ─────────────────────────────────────────────────────
 *  pickQuestions & makeClientQuestion
 * ───────────────────────────────────────────────────── */
const SAMPLE_QUESTIONS = [
  {
    id: 1,
    question: "Q1?",
    correctAnswer: "A",
    wrongAnswers: ["B", "C", "D"],
    category: "Test",
    difficulty: "easy",
    points: 10,
    timeLimit: 15,
  },
  {
    id: 2,
    question: "Q2?",
    correctAnswer: "X",
    wrongAnswers: ["Y", "Z", "W"],
    category: "Test",
    difficulty: "hard",
    points: 30,
    timeLimit: 20,
  },
  {
    id: 3,
    question: "Q3?",
    correctAnswer: "M",
    wrongAnswers: ["N", "O", "P"],
    category: "Test",
    difficulty: "easy",
    points: 10,
    timeLimit: 15,
  },
];

describe("pickQuestions", () => {
  it("returns the requested number of questions", () => {
    const result = pickQuestions(SAMPLE_QUESTIONS, 2);
    assert.equal(result.length, 2);
  });

  it("returns all if count exceeds pool size", () => {
    const result = pickQuestions(SAMPLE_QUESTIONS, 10);
    assert.equal(result.length, 3);
  });

  it("filters by difficulty", () => {
    const result = pickQuestions(SAMPLE_QUESTIONS, 10, "easy");
    assert.equal(result.length, 2);
    for (const q of result) {
      assert.equal(q.difficulty, "easy");
    }
  });

  it("returns all when difficulty is 'all'", () => {
    const result = pickQuestions(SAMPLE_QUESTIONS, 10, "all");
    assert.equal(result.length, 3);
  });
});

describe("makeClientQuestion", () => {
  it("includes all 4 answers (1 correct + 3 wrong)", () => {
    const q = SAMPLE_QUESTIONS[0];
    const client = makeClientQuestion(q, 0, 3);
    assert.equal(client.answers.length, 4);
    assert.ok(client.answers.includes(q.correctAnswer));
    for (const w of q.wrongAnswers) {
      assert.ok(client.answers.includes(w));
    }
  });

  it("includes metadata (category, difficulty, points, timeLimit)", () => {
    const q = SAMPLE_QUESTIONS[0];
    const client = makeClientQuestion(q, 0, 3);
    assert.equal(client.category, q.category);
    assert.equal(client.difficulty, q.difficulty);
    assert.equal(client.points, q.points);
    assert.equal(client.timeLimit, q.timeLimit);
  });

  it("includes index and total", () => {
    const client = makeClientQuestion(SAMPLE_QUESTIONS[0], 2, 5);
    assert.equal(client.index, 2);
    assert.equal(client.total, 5);
  });

  it("does NOT expose correctAnswer directly", () => {
    const client = makeClientQuestion(SAMPLE_QUESTIONS[0], 0, 1);
    assert.equal(client.correctAnswer, undefined);
  });
});

/* ─────────────────────────────────────────────────────
 *  Constants integrity
 * ───────────────────────────────────────────────────── */
describe("Constants", () => {
  it("ECONOMY has required fields", () => {
    assert.ok(ECONOMY.ENERGY_MAX > 0);
    assert.ok(ECONOMY.ENERGY_START > 0);
    assert.ok(ECONOMY.ENERGY_REGEN_INTERVAL_MS > 0);
    assert.ok(ECONOMY.GOLD_START > 0);
  });

  it("CROPS has at least 5 crop types", () => {
    assert.ok(Object.keys(CROPS).length >= 5);
    for (const [id, cfg] of Object.entries(CROPS)) {
      assert.ok(cfg.emoji, `${id} missing emoji`);
      assert.ok(cfg.growthTime > 0, `${id} missing growthTime`);
      assert.ok(cfg.sellPrice > 0, `${id} missing sellPrice`);
      assert.ok(cfg.seedPrice > 0, `${id} missing seedPrice`);
    }
  });

  it("OFFLINE_THRESHOLD_MS is 2 minutes", () => {
    assert.equal(OFFLINE_THRESHOLD_MS, 120000);
  });

  it("BOARD_SIZE is 8", () => {
    assert.equal(BOARD_SIZE, 8);
  });

  it("GEM_TYPES has 6 gem types", () => {
    assert.equal(GEM_TYPES.length, 6);
  });
});
