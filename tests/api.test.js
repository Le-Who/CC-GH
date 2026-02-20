/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — API Integration Tests
 *  Tests for HTTP endpoints via Express app import
 *  Run:  node --test tests/api.test.js
 * ═══════════════════════════════════════════════════════
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { app, players } from "../server.js";
import { ECONOMY, CROPS } from "../game-logic.js";

const PORT = 9876;
let server;
const BASE = `http://localhost:${PORT}`;

/** POST helper */
async function post(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

/** GET helper */
async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });
});

after(() => {
  server?.close();
  // Force exit since Express keeps event loop alive
  setTimeout(() => process.exit(0), 100);
});

beforeEach(() => {
  // Clear all player data between tests
  players.clear();
});

/* ─────────────────────────────────────────────────────
 *  Config & Content Endpoints
 * ───────────────────────────────────────────────────── */
describe("GET /api/config/discord", () => {
  it("returns clientId field", async () => {
    const { status, data } = await get("/api/config/discord");
    assert.equal(status, 200);
    assert.ok("clientId" in data);
  });
});

describe("GET /api/content/crops", () => {
  it("returns all crop definitions", async () => {
    const { status, data } = await get("/api/content/crops");
    assert.equal(status, 200);
    assert.ok(data.strawberry);
    assert.ok(data.tomato);
    assert.ok(data.golden);
    assert.equal(data.strawberry.emoji, "🍓");
  });
});

/* ─────────────────────────────────────────────────────
 *  Farm State
 * ───────────────────────────────────────────────────── */
describe("POST /api/farm/state", () => {
  it("returns default state for new player", async () => {
    const { status, data } = await post("/api/farm/state", {
      userId: "test_user_1",
      username: "Tester",
    });
    assert.equal(status, 200);
    assert.ok(data.plots);
    assert.equal(data.plots.length, 6);
    assert.ok(data.resources);
    assert.equal(data.resources.energy.current, ECONOMY.ENERGY_START);
  });

  it("[FIX 1 REGRESSION] does not return offlineReport for new player", async () => {
    const { data } = await post("/api/farm/state", {
      userId: "brand_new_user",
      username: "Newbie",
    });
    // New player should not get a welcome-back report (null or undefined)
    assert.ok(
      data.offlineReport == null,
      `Expected null/undefined offlineReport, got: ${JSON.stringify(data.offlineReport)}`,
    );
  });

  it("requires userId", async () => {
    const { status, data } = await post("/api/farm/state", {});
    assert.equal(status, 400);
    assert.ok(data.error);
  });
});

/* ─────────────────────────────────────────────────────
 *  Farm Plant
 * ───────────────────────────────────────────────────── */
describe("POST /api/farm/plant", () => {
  it("plants a seed on an empty plot", async () => {
    // First get state to create the player
    await post("/api/farm/state", { userId: "farmer1", username: "Farmer" });

    const { status, data } = await post("/api/farm/plant", {
      userId: "farmer1",
      plotId: 0,
      cropId: "strawberry",
    });
    assert.equal(status, 200);
    assert.equal(data.success, true);
    assert.ok(data.plots[0].crop === "strawberry" || data.plots[0].crop);
  });

  it("rejects planting with no seeds", async () => {
    await post("/api/farm/state", { userId: "farmer2", username: "F2" });
    const { status } = await post("/api/farm/plant", {
      userId: "farmer2",
      plotId: 0,
      cropId: "golden", // No golden seeds by default
    });
    assert.equal(status, 400);
  });

  it("rejects invalid crop", async () => {
    await post("/api/farm/state", { userId: "farmer3", username: "F3" });
    const { status } = await post("/api/farm/plant", {
      userId: "farmer3",
      plotId: 0,
      cropId: "nonexistent_crop",
    });
    assert.equal(status, 400);
  });
});

/* ─────────────────────────────────────────────────────
 *  Farm Water
 * ───────────────────────────────────────────────────── */
describe("POST /api/farm/water", () => {
  it("waters a planted plot", async () => {
    await post("/api/farm/state", { userId: "water1", username: "W1" });
    await post("/api/farm/plant", {
      userId: "water1",
      plotId: 0,
      cropId: "strawberry",
    });
    const { status, data } = await post("/api/farm/water", {
      userId: "water1",
      plotId: 0,
    });
    assert.equal(status, 200);
    assert.ok(data.success);
  });

  it("rejects double-watering", async () => {
    await post("/api/farm/state", { userId: "water2", username: "W2" });
    await post("/api/farm/plant", {
      userId: "water2",
      plotId: 0,
      cropId: "strawberry",
    });
    await post("/api/farm/water", { userId: "water2", plotId: 0 });
    // Second water attempt
    const { status } = await post("/api/farm/water", {
      userId: "water2",
      plotId: 0,
    });
    assert.equal(status, 400);
  });

  it("rejects watering empty plot", async () => {
    await post("/api/farm/state", { userId: "water3", username: "W3" });
    const { status } = await post("/api/farm/water", {
      userId: "water3",
      plotId: 0,
    });
    assert.equal(status, 400);
  });
});

/* ─────────────────────────────────────────────────────
 *  Farm Buy Seeds
 * ───────────────────────────────────────────────────── */
describe("POST /api/farm/buy-seeds", () => {
  it("buys seeds with sufficient gold", async () => {
    await post("/api/farm/state", { userId: "buyer1", username: "B1" });
    const { status, data } = await post("/api/farm/buy-seeds", {
      userId: "buyer1",
      cropId: "strawberry",
      amount: 2,
    });
    assert.equal(status, 200);
    assert.ok(data.success);
    // Should have 5 (default) + 2 = 7 strawberry seeds
    assert.equal(data.inventory.strawberry, 7);
  });

  it("rejects purchase with insufficient gold", async () => {
    await post("/api/farm/state", { userId: "buyer2", username: "B2" });
    // Try to buy 100 golden roses (60 gold each = 6000 gold needed)
    const { status } = await post("/api/farm/buy-seeds", {
      userId: "buyer2",
      cropId: "golden",
      amount: 100,
    });
    assert.equal(status, 400);
  });
});

/* ─────────────────────────────────────────────────────
 *  Pet Feed
 * ───────────────────────────────────────────────────── */
describe("POST /api/pet/feed", () => {
  it("feeds pet with harvested crop and gains energy", async () => {
    // Create player and manually add harvested crop
    await post("/api/farm/state", { userId: "feeder1", username: "F1" });
    const player = players.get("feeder1");
    player.farm.harvested.strawberry = 3;
    player.resources.energy.current = 5;

    const { status, data } = await post("/api/pet/feed", {
      userId: "feeder1",
      cropId: "strawberry",
    });
    assert.equal(status, 200);
    assert.ok(data.success);
    assert.equal(data.resources.energy.current, 5 + ECONOMY.FEED_ENERGY);
    assert.equal(data.harvested.strawberry, 2);
  });

  it("rejects feeding with no harvested crop", async () => {
    await post("/api/farm/state", { userId: "feeder2", username: "F2" });
    const { status } = await post("/api/pet/feed", {
      userId: "feeder2",
      cropId: "strawberry",
    });
    assert.equal(status, 400);
  });
});

/* ─────────────────────────────────────────────────────
 *  Trivia Start
 * ───────────────────────────────────────────────────── */
describe("POST /api/trivia/start", () => {
  it("starts a trivia session and deducts energy", async () => {
    await post("/api/farm/state", { userId: "trivia1", username: "T1" });
    const { status, data } = await post("/api/trivia/start", {
      userId: "trivia1",
      count: 5,
    });
    assert.equal(status, 200);
    assert.ok(data.question);
    assert.ok(data.question.answers);
    assert.equal(data.question.answers.length, 4);
    assert.equal(
      data.resources.energy.current,
      ECONOMY.ENERGY_START - ECONOMY.COST_TRIVIA,
    );
  });

  it("rejects when energy is insufficient", async () => {
    await post("/api/farm/state", { userId: "trivia2", username: "T2" });
    const player = players.get("trivia2");
    player.resources.energy.current = 0;

    const { status, data } = await post("/api/trivia/start", {
      userId: "trivia2",
    });
    assert.equal(status, 400);
    assert.equal(data.error, "NOT_ENOUGH_ENERGY");
  });
});

/* ─────────────────────────────────────────────────────
 *  Trivia Answer
 * ───────────────────────────────────────────────────── */
describe("POST /api/trivia/answer", () => {
  it("scores correct answer with points and streak", async () => {
    await post("/api/farm/state", { userId: "answer1", username: "A1" });
    const start = await post("/api/trivia/start", {
      userId: "answer1",
      count: 2,
    });

    // Find the correct answer from the server's session
    const player = players.get("answer1");
    const correctAnswer = player.trivia.session.questions[0].correctAnswer;

    const { status, data } = await post("/api/trivia/answer", {
      userId: "answer1",
      answer: correctAnswer,
      timeMs: 3000,
    });
    assert.equal(status, 200);
    assert.equal(data.correct, true);
    assert.ok(data.points > 0);
    assert.equal(data.streak, 1);
  });

  it("scores wrong answer with 0 points", async () => {
    await post("/api/farm/state", { userId: "answer2", username: "A2" });
    await post("/api/trivia/start", { userId: "answer2", count: 2 });

    const { data } = await post("/api/trivia/answer", {
      userId: "answer2",
      answer: "DEFINITELY_WRONG_ANSWER_XYZ",
      timeMs: 3000,
    });
    assert.equal(data.correct, false);
    assert.equal(data.points, 0);
    assert.equal(data.streak, 0);
  });

  it("rejects when no active session", async () => {
    await post("/api/farm/state", { userId: "answer3", username: "A3" });
    const { status } = await post("/api/trivia/answer", {
      userId: "answer3",
      answer: "A",
      timeMs: 1000,
    });
    assert.equal(status, 400);
  });
});

/* ─────────────────────────────────────────────────────
 *  Farm Harvest
 * ───────────────────────────────────────────────────── */
describe("POST /api/farm/harvest", () => {
  it("harvests a fully grown crop", async () => {
    await post("/api/farm/state", { userId: "harvester1", username: "H1" });
    const player = players.get("harvester1");
    // Manually plant a fully grown strawberry
    player.farm.plots[0].crop = "strawberry";
    player.farm.plots[0].plantedAt =
      Date.now() - CROPS.strawberry.growthTime - 1000;
    player.farm.plots[0].watered = false;

    const { status, data } = await post("/api/farm/harvest", {
      userId: "harvester1",
      plotId: 0,
    });
    assert.equal(status, 200);
    assert.ok(data.reward);
    assert.equal(data.reward.coins, CROPS.strawberry.sellPrice);
    assert.equal(data.reward.xp, CROPS.strawberry.xp);
  });

  it("rejects harvesting unready crop", async () => {
    await post("/api/farm/state", { userId: "harvester2", username: "H2" });
    await post("/api/farm/plant", {
      userId: "harvester2",
      plotId: 0,
      cropId: "strawberry",
    });
    // Try to harvest immediately (not grown yet)
    const { status } = await post("/api/farm/harvest", {
      userId: "harvester2",
      plotId: 0,
    });
    assert.equal(status, 400);
  });
});

/* ─────────────────────────────────────────────────────
 *  Match-3 State
 * ───────────────────────────────────────────────────── */
describe("POST /api/game/state (match-3)", () => {
  it("returns match-3 state for new player", async () => {
    const { status, data } = await post("/api/game/state", {
      userId: "match1",
      username: "M1",
    });
    assert.equal(status, 200);
    assert.ok(data.game || data.highScore !== undefined);
  });
});

/* ─────────────────────────────────────────────────────
 *  Health Check
 * ───────────────────────────────────────────────────── */
describe("GET /api/health", () => {
  it("returns healthy status", async () => {
    const { status, data } = await get("/api/health");
    assert.equal(status, 200);
    assert.equal(data.status, "ok");
  });
});
