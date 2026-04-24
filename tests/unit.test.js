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
  OFFLINE_THRESHOLD_MS,
  createDefaultPlayer,
  calcRegen,
  processOfflineActions,
  getWateringMultiplier,
  getGrowthPct,
  farmPlotsWithGrowth,
  pickQuestions,
  makeClientQuestion,
  calculateSatietyDelta,
  getScaledTime,
  forceGrowAll,
} from "../game-logic.js";
import { normalizeInventory, withNormalizedSnapshot } from "../src/game-state/inventory.js";
import { applyAction } from "../routes/player.js";

/* ─────────────────────────────────────────────────────
 *  createDefaultPlayer
 * ───────────────────────────────────────────────────── */
describe("createDefaultPlayer", () => {
  it("returns a player with all required fields", () => {
    const p = createDefaultPlayer("u1", "Alice");
    assert.equal(p.id, "u1");
    assert.equal(p.username, "Alice");
    assert.equal(p.schemaVersion, 7);
    assert.equal(p.resources.gold, ECONOMY.GOLD_START);
    assert.equal(p.resources.energy.current, ECONOMY.ENERGY_START);
    assert.equal(p.resources.energy.max, ECONOMY.ENERGY_MAX);
    assert.ok(p.pet);
    assert.ok(p.farm);
    assert.ok(p.trivia);
    assert.ok(p.match3);
    // v6.0: Economy fields
    assert.equal(p.pet.stats.fullness, 0);
    assert.ok(Array.isArray(p.pet.activeOrders));
    assert.equal(p.resources.gachaTokens, 0);
    // v7.0: Merge + Affection fields
    assert.ok(p.merge);
    assert.equal(p.merge.board.length, 7);
    assert.equal(p.merge.board[0].length, 9);
    assert.ok(Array.isArray(p.merge.generators));
    assert.equal(p.pet.affectionXp, 0);
    assert.equal(p.pet.affectionLevel, 1);
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

describe("new-stack player snapshot and inventory contracts", () => {
  it("normalizes harvested, merge, room, and reward inventory aliases", () => {
    const snapshot = {
      resources: {
        gold: 125,
        gachaTokens: 3,
        harvested: { strawberry: 2 },
        energy: { current: 4, max: 20 },
      },
      farm: {
        inventory: { strawberry: 5 },
        harvested: { blueberry: 1 },
      },
      merge: {
        board: [
          [{ id: "thread", chainId: "textile", level: 0 }, null],
          [{ id: "thread", chainId: "textile", level: 0 }],
        ],
      },
      room: {
        inventory: ["deco_chair"],
      },
    };

    const inventory = normalizeInventory(snapshot);

    assert.deepEqual(inventory.seeds, { strawberry: 5 });
    assert.deepEqual(inventory.harvested, { strawberry: 2 });
    assert.deepEqual(inventory.harvestedCrops, { strawberry: 2 });
    assert.deepEqual(inventory.mergeItems, { thread: 2 });
    assert.deepEqual(inventory.roomInventory, ["deco_chair"]);
    assert.equal(inventory.rewards.gold, 125);
    assert.equal(inventory.rewards.gachaTokens, 3);
  });

  it("writes normalized aliases back into snapshot resources and room state", () => {
    const normalized = withNormalizedSnapshot({
      resources: { harvestedCrops: { carrot: 4 } },
      room: { roomInventory: ["deco_lamp"] },
    });

    assert.deepEqual(normalized.resources.harvested, { carrot: 4 });
    assert.deepEqual(normalized.resources.harvestedCrops, { carrot: 4 });
    assert.deepEqual(normalized.room.inventory, ["deco_lamp"]);
    assert.deepEqual(normalized.room.roomInventory, ["deco_lamp"]);
  });

  it("places and picks up room decorations through authoritative player actions", async () => {
    const p = createDefaultPlayer("room-user", "Roomy");
    p.room.inventory = ["deco_chair"];
    p.room.roomInventory = ["deco_chair"];

    const placed = await applyAction(p, "room.place", { decoId: "deco_chair" });
    assert.equal(placed.status, 200);
    assert.deepEqual(p.room.decorations, ["deco_chair"]);
    assert.deepEqual(p.room.inventory, []);
    assert.deepEqual(p.room.roomInventory, []);
    assert.deepEqual(placed.body.snapshot.room.decorations, ["deco_chair"]);

    const picked = await applyAction(p, "room.pickup", { decoId: "deco_chair" });
    assert.equal(picked.status, 200);
    assert.deepEqual(p.room.decorations, []);
    assert.deepEqual(p.room.inventory, ["deco_chair"]);
    assert.deepEqual(picked.body.snapshot.inventory.roomInventory, ["deco_chair"]);
  });
});

/* ─────────────────────────────────────────────────────
 *  calcRegen
 * ───────────────────────────────────────────────────── */
describe("calcRegen", () => {
  it("does nothing when energy is already at max", () => {
    // Arrange
    const p = createDefaultPlayer("u1", "Test");
    const before = p.resources.energy.current;

    // Act
    calcRegen(p);

    // Assert
    assert.equal(p.resources.energy.current, before);
  });

  it("regenerates 1 energy after one regen interval", () => {
    // Arrange
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.resources.energy.current = 5;
    p.resources.energy.lastRegenTimestamp = now;
    const future = now + ECONOMY.ENERGY_REGEN_INTERVAL_MS;

    // Act
    calcRegen(p, future);

    // Assert
    assert.equal(p.resources.energy.current, 6);
  });

  it("regenerates multiple energy after multiple intervals", () => {
    // Arrange
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.resources.energy.current = 0;
    p.resources.energy.lastRegenTimestamp = now;
    const future = now + ECONOMY.ENERGY_REGEN_INTERVAL_MS * 5;

    // Act
    calcRegen(p, future);

    // Assert
    assert.equal(p.resources.energy.current, 5);
  });

  it("caps energy at max", () => {
    // Arrange
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.resources.energy.current = 18;
    p.resources.energy.lastRegenTimestamp = now;
    const future = now + ECONOMY.ENERGY_REGEN_INTERVAL_MS * 10;

    // Act
    calcRegen(p, future);

    // Assert
    assert.equal(p.resources.energy.current, ECONOMY.ENERGY_MAX);
  });

  it("preserves partial tick progress", () => {
    // Arrange
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.resources.energy.current = 5;
    p.resources.energy.lastRegenTimestamp = now;
    const halfInterval = Math.floor(ECONOMY.ENERGY_REGEN_INTERVAL_MS / 2);
    const future = now + ECONOMY.ENERGY_REGEN_INTERVAL_MS + halfInterval;

    // Act
    calcRegen(p, future);

    // Assert
    assert.equal(p.resources.energy.current, 6);
    assert.ok(p.resources.energy.lastRegenTimestamp > now);
    assert.ok(p.resources.energy.lastRegenTimestamp < future);
  });
});

/* ─────────────────────────────────────────────────────
 *  processOfflineActions (v6.2.2 — fullness-based)
 * ───────────────────────────────────────────────────── */
describe("processOfflineActions", () => {
  it("[FIX 1 REGRESSION] returns null for elapsed < 2 minutes", () => {
    // Arrange
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    const future = now + 30000; // 30 seconds

    // Act
    const result = processOfflineActions(p, future);

    // Assert
    assert.equal(result, null);
  });

  it("[FIX 1 REGRESSION] returns null for elapsed < 120s (threshold)", () => {
    // Arrange
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    const future = now + 119999; // 119 seconds — just under threshold

    // Act
    const result = processOfflineActions(p, future);

    // Assert
    assert.equal(result, null);
  });

  it("returns null when no abilities are enabled even if away > 2 min", () => {
    // Arrange
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    const future = now + 300000;

    // Act
    const result = processOfflineActions(p, future);

    // Assert
    assert.equal(result, null);
  });

  it("auto-waters unwatered crops when ability is enabled", () => {
    // Arrange
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.pet.abilities.autoWater = true;
    p.farm.plots[0].crop = "strawberry";
    p.farm.plots[0].plantedAt = now;
    p.farm.plots[0].watered = false;
    const future = now + 300000;

    // Act
    const result = processOfflineActions(p, future);

    // Assert
    assert.ok(result);
    assert.equal(result.autoWatered, 1);
    assert.equal(p.farm.plots[0].watered, true);
  });

  it("auto-harvests fully grown crops (costs fullness, not energy)", () => {
    // Arrange
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.pet.abilities.autoHarvest = true;
    p.pet.stats.fullness = 50;
    const energyBefore = p.resources.energy.current;

    p.farm.plots[0].crop = "strawberry";
    p.farm.plots[0].plantedAt = now - CROPS.strawberry.growthTime - 1000;
    p.farm.plots[0].watered = false;
    const future = now + 300000;

    // Act
    const result = processOfflineActions(p, future);

    // Assert
    assert.ok(result);
    assert.equal(result.harvested.strawberry, 1);
    assert.ok(result.fullnessConsumed > 0, "Should consume fullness");
    assert.equal(result.xpGained, CROPS.strawberry.xp);
    assert.equal(p.farm.plots[0].crop, null);
    assert.equal(p.farm.harvested.strawberry, 1);
    assert.equal(p.resources.energy.current, energyBefore);
  });

  it("auto-plants seeds on empty plots (costs fullness, not energy)", () => {
    // Arrange
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.pet.abilities.autoPlant = true;
    p.pet.stats.fullness = 50;
    const energyBefore = p.resources.energy.current;
    p.farm.inventory.strawberry = 3;
    const future = now + 300000;

    // Act
    const result = processOfflineActions(p, future);

    // Assert
    assert.ok(result);
    const totalPlanted = Object.values(result.planted).reduce((a, b) => a + b, 0);
    assert.ok(totalPlanted > 0);
    assert.ok(result.fullnessConsumed > 0, "Should consume fullness");
    assert.equal(p.resources.energy.current, energyBefore);
  });

  it("stops auto-harvest when fullness runs out (no cheap food)", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.pet.abilities.autoHarvest = true;
    p.pet.stats.fullness = 3; // Only enough for 1 harvest (cost=2)
    p.farm.inventory = {}; // No food to eat

    // Plant 4 fully grown strawberries
    for (let i = 0; i < 4; i++) {
      p.farm.plots[i].crop = "strawberry";
      p.farm.plots[i].plantedAt = now - CROPS.strawberry.growthTime - 1000;
    }

    const result = processOfflineActions(p, now + 300000);
    assert.ok(result);
    assert.equal(result.harvested.strawberry, 1); // Only 1 affordable
    assert.equal(result.fullnessConsumed, 2);
  });

  it("auto-eats cheap crops to refuel when fullness is 0", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.pet.abilities.autoHarvest = true;
    p.pet.stats.fullness = 0; // Empty!
    p.farm.inventory.strawberry = 5; // Cheap crop available

    // Plant 1 fully grown strawberry
    p.farm.plots[0].crop = "strawberry";
    p.farm.plots[0].plantedAt = now - CROPS.strawberry.growthTime - 1000;

    const result = processOfflineActions(p, now + 300000);
    assert.ok(result);
    assert.equal(result.harvested.strawberry, 1);
    assert.ok(
      result.foodEaten.strawberry > 0,
      "Should have eaten strawberries",
    );
  });

  it("does NOT eat mid/expensive crops for refuel", () => {
    const now = Date.now();
    const p = createDefaultPlayer("u1", "Test", now);
    p.pet.abilities.autoHarvest = true;
    p.pet.stats.fullness = 0;
    p.farm.inventory = { tomato: 10, pumpkin: 5 }; // Only mid+expensive

    p.farm.plots[0].crop = "strawberry";
    p.farm.plots[0].plantedAt = now - CROPS.strawberry.growthTime - 1000;

    const result = processOfflineActions(p, now + 300000);
    // Should fail to harvest — no cheap food, no fullness
    assert.equal(result, null);
    // Inventory untouched
    assert.equal(p.farm.inventory.tomato, 10);
    assert.equal(p.farm.inventory.pumpkin, 5);
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
  it("returns 0.7 for fast crops (strawberry, blueberry)", () => {
    assert.equal(getWateringMultiplier("strawberry"), 0.7);
    assert.equal(getWateringMultiplier("blueberry"), 0.7);
  });

  it("returns 0.6 for medium crops (tomato, golden, corn)", () => {
    assert.equal(getWateringMultiplier("tomato"), 0.6);
    assert.equal(getWateringMultiplier("golden"), 0.6);
    assert.equal(getWateringMultiplier("corn"), 0.6);
  });

  it("returns 0.55 for slow crops (sunflower, watermelon, pumpkin)", () => {
    assert.equal(getWateringMultiplier("sunflower"), 0.55);
    assert.equal(getWateringMultiplier("watermelon"), 0.55);
    assert.equal(getWateringMultiplier("pumpkin"), 0.55);
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

  it("CROPS have energyYield and fullnessYield", () => {
    for (const [id, cfg] of Object.entries(CROPS)) {
      assert.ok(cfg.energyYield > 0, `${id} missing energyYield`);
      assert.ok(cfg.fullnessYield > 0, `${id} missing fullnessYield`);
    }
  });
});

/* ─────────────────────────────────────────────────────
 *  calculateSatietyDelta (v6.0)
 * ───────────────────────────────────────────────────── */
describe("calculateSatietyDelta", () => {
  it("returns unchanged fullness if no time has passed", () => {
    const now = Date.now();
    const result = calculateSatietyDelta(
      { stats: { fullness: 50 }, lastDigestionTimestamp: now },
      now,
    );
    assert.equal(result.fullness, 50);
  });

  it("reduces fullness by 10 per hour", () => {
    const now = Date.now();
    const twoHoursAgo = now - 2 * 3_600_000;
    const result = calculateSatietyDelta(
      { stats: { fullness: 80 }, lastDigestionTimestamp: twoHoursAgo },
      now,
    );
    assert.equal(result.fullness, 60); // 80 - (2 * 10)
  });

  it("clamps fullness to 0 (never negative)", () => {
    const now = Date.now();
    const result = calculateSatietyDelta(
      { stats: { fullness: 5 }, lastDigestionTimestamp: now - 24 * 3_600_000 },
      now,
    );
    assert.equal(result.fullness, 0);
  });

  it("caps offline progress at 24 hours", () => {
    const now = Date.now();
    // 48 hours ago — but cap at 24h = 240 digested, from fullness 100 → 0 (not -140)
    const result = calculateSatietyDelta(
      {
        stats: { fullness: 100 },
        lastDigestionTimestamp: now - 48 * 3_600_000,
      },
      now,
    );
    assert.equal(result.fullness, 0);
  });

  it("handles missing stats gracefully", () => {
    const now = Date.now();
    const result = calculateSatietyDelta({}, now);
    assert.equal(result.fullness, 0);
  });
});

/* ─────────────────────────────────────────────────────
 *  getScaledTime (v6.0)
 * ───────────────────────────────────────────────────── */
describe("getScaledTime", () => {
  it("returns the same time when DEV_MODE is off", () => {
    assert.equal(getScaledTime(300_000), 300_000);
  });

  it("returns minimum 1ms", () => {
    assert.equal(getScaledTime(0), 1);
  });
});

/* ─────────────────────────────────────────────────────
 *  forceGrowAll (v6.0)
 * ───────────────────────────────────────────────────── */
describe("forceGrowAll", () => {
  it("sets planted crops to fully grown", () => {
    const now = Date.now();
    const plots = [
      { crop: "strawberry", plantedAt: now },
      { crop: null, plantedAt: null },
    ];
    forceGrowAll(plots, now);
    // First plot should be fully grown
    assert.ok(plots[0].plantedAt < now - 999_000_000);
    // Empty plot unchanged
    assert.equal(plots[1].plantedAt, null);
  });

  it("handles null input gracefully", () => {
    assert.doesNotThrow(() => forceGrowAll(null));
  });
});

/* ─────────────────────────────────────────────────────
 *  Additional Coverage: Offline Engine Edge Cases
 * ───────────────────────────────────────────────────── */
describe("processOfflineActions - Edge Cases", () => {
  it("prevents negative duration offline calculations", () => {
    const now = Date.now();
    const lastSeenStr = now + 100000;
    const player = {
      _lastSeen: lastSeenStr, 
      resources: { 
        energy: { current: 10, max: 200, lastRegenTimestamp: now } 
      },
      farm: { plots: [] },
      pet: { abilities: {} },
    };
    const result = processOfflineActions(player, now);
    // Should return null (no actions taken)
    assert.equal(result, null);
    // lastSeen was in the future, elapsed became 0, _lastSeen stays as lastSeenStr
    assert.equal(player._lastSeen, lastSeenStr);
  });

  it("handles offline generation when energy is already maxed", () => {
    const lastSeen = Date.now() - 3600000;
    const player = {
      _lastSeen: lastSeen,
      resources: { 
        energy: { current: 200, max: 200, lastRegenTimestamp: lastSeen } 
      },
      farm: { plots: [] },
      pet: { abilities: {} },
    };
    const result = processOfflineActions(player, Date.now());
    // No activities => null report
    assert.equal(result, null);
    assert.ok(player._lastSeen > lastSeen);
  });
});

/* ─────────────────────────────────────────────────────
 *  Additional Coverage: Trivia Questions
 * ───────────────────────────────────────────────────── */
describe("makeClientQuestion - Edge Cases", () => {
  it("handles missing question gracefully", () => {
    assert.doesNotThrow(() => {
      const q = makeClientQuestion(undefined);
      assert.equal(q, undefined);
    });
  });
});
