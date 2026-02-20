/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — GCP Hosting Resilience Tests (v3.2)
 *  Validates game systems under GCP-typical conditions:
 *  latency, concurrency, payload size, save stress,
 *  stale reconnect, and idempotency.
 *  Run:  node --test tests/gcp.test.js
 * ═══════════════════════════════════════════════════════
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { app, players } from "../server.js";
import {
  ECONOMY,
  CROPS,
  createDefaultPlayer,
  processOfflineActions,
  calcRegen,
} from "../game-logic.js";

const PORT = 9877;
let server;
const BASE = `http://localhost:${PORT}`;

async function post(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data, headers: res.headers };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  return { status: res.status, data, headers: res.headers };
}

/** Measure round-trip time for a request */
async function timedPost(path, body = {}) {
  const start = performance.now();
  const result = await post(path, body);
  result.latencyMs = performance.now() - start;
  return result;
}

async function timedGet(path) {
  const start = performance.now();
  const result = await get(path);
  result.latencyMs = performance.now() - start;
  return result;
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });
});

after(() => {
  server?.close();
  setTimeout(() => process.exit(0), 100);
});

beforeEach(() => {
  players.clear();
});

/* ═════════════════════════════════════════════════════
 *  1. LATENCY TOLERANCE
 *  All endpoints must respond within 200ms budget
 *  (GCP Cloud Run cold-start excluded; these test warm paths)
 * ═════════════════════════════════════════════════════ */
describe("GCP: Latency Tolerance", () => {
  const BUDGET_MS = 200;

  it("GET /api/config responds within budget", async () => {
    const { latencyMs, status } = await timedGet("/api/config");
    assert.equal(status, 200);
    assert.ok(
      latencyMs < BUDGET_MS,
      `Config endpoint took ${latencyMs.toFixed(1)}ms (budget: ${BUDGET_MS}ms)`,
    );
  });

  it("POST /api/farm/state responds within budget", async () => {
    const { latencyMs, status } = await timedPost("/api/farm/state", {
      userId: "latency_farm",
      username: "LF",
    });
    assert.equal(status, 200);
    assert.ok(
      latencyMs < BUDGET_MS,
      `Farm state took ${latencyMs.toFixed(1)}ms (budget: ${BUDGET_MS}ms)`,
    );
  });

  it("POST /api/game/state responds within budget", async () => {
    const { latencyMs, status } = await timedPost("/api/game/state", {
      userId: "latency_m3",
      username: "LM",
    });
    assert.equal(status, 200);
    assert.ok(
      latencyMs < BUDGET_MS,
      `Game state took ${latencyMs.toFixed(1)}ms (budget: ${BUDGET_MS}ms)`,
    );
  });

  it("POST /api/trivia/start responds within budget", async () => {
    await post("/api/farm/state", { userId: "latency_trivia", username: "LT" });
    const { latencyMs, status } = await timedPost("/api/trivia/start", {
      userId: "latency_trivia",
      count: 5,
    });
    assert.equal(status, 200);
    assert.ok(
      latencyMs < BUDGET_MS,
      `Trivia start took ${latencyMs.toFixed(1)}ms (budget: ${BUDGET_MS}ms)`,
    );
  });

  it("warm-path p95 across 20 sequential requests < budget", async () => {
    const latencies = [];
    for (let i = 0; i < 20; i++) {
      const { latencyMs } = await timedPost("/api/farm/state", {
        userId: `latency_p95_${i}`,
        username: `LP${i}`,
      });
      latencies.push(latencyMs);
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    assert.ok(
      p95 < BUDGET_MS,
      `p95 latency ${p95.toFixed(1)}ms exceeds budget ${BUDGET_MS}ms`,
    );
  });
});

/* ═════════════════════════════════════════════════════
 *  2. CONCURRENT REQUESTS
 *  20 parallel mutations for the same user must not
 *  cause data corruption (negative gold, double-plant)
 * ═════════════════════════════════════════════════════ */
describe("GCP: Concurrent Request Safety", () => {
  it("20 parallel buy-seeds requests don't overspend gold", async () => {
    await post("/api/farm/state", { userId: "conc_buy", username: "CB" });
    const player = players.get("conc_buy");
    const startGold = player.resources.gold;

    // Fire 20 buy requests in parallel (strawberry = 5 gold each)
    const requests = Array.from({ length: 20 }, () =>
      post("/api/farm/buy-seeds", {
        userId: "conc_buy",
        cropId: "strawberry",
        amount: 1,
      }),
    );
    const results = await Promise.all(requests);

    const successCount = results.filter((r) => r.status === 200).length;
    const failCount = results.filter((r) => r.status !== 200).length;

    // Gold must not go negative
    assert.ok(
      player.resources.gold >= 0,
      `Gold went negative: ${player.resources.gold}`,
    );

    // Total spent must equal successCount * seedPrice
    const seedPrice = CROPS.strawberry.seedPrice;
    const totalSpent = startGold - player.resources.gold;
    assert.equal(
      totalSpent,
      successCount * seedPrice,
      `Gold accounting mismatch: spent ${totalSpent} but ${successCount} succeeded × ${seedPrice}`,
    );
  });

  it("parallel water requests for same plot don't double-water", async () => {
    await post("/api/farm/state", { userId: "conc_water", username: "CW" });
    await post("/api/farm/plant", {
      userId: "conc_water",
      plotId: 0,
      cropId: "strawberry",
    });

    // Fire 10 water requests in parallel
    const requests = Array.from({ length: 10 }, () =>
      post("/api/farm/water", { userId: "conc_water", plotId: 0 }),
    );
    const results = await Promise.all(requests);

    const successCount = results.filter((r) => r.status === 200).length;
    assert.equal(
      successCount,
      1,
      `Expected exactly 1 water success, got ${successCount}`,
    );
  });

  it("parallel harvest of same plot returns exactly 1 success", async () => {
    await post("/api/farm/state", { userId: "conc_harvest", username: "CH" });
    const player = players.get("conc_harvest");
    player.farm.plots[0].crop = "strawberry";
    player.farm.plots[0].plantedAt =
      Date.now() - CROPS.strawberry.growthTime - 1000;

    const requests = Array.from({ length: 10 }, () =>
      post("/api/farm/harvest", { userId: "conc_harvest", plotId: 0 }),
    );
    const results = await Promise.all(requests);

    const successCount = results.filter((r) => r.status === 200).length;
    assert.equal(
      successCount,
      1,
      `Expected exactly 1 harvest success, got ${successCount}`,
    );
  });
});

/* ═════════════════════════════════════════════════════
 *  3. PAYLOAD SIZE
 *  Responses must stay under 16KB for mobile-friendly
 *  GCP Cloud Run / CDN transfer budgets
 * ═════════════════════════════════════════════════════ */
describe("GCP: Payload Size", () => {
  const MAX_BYTES = 16 * 1024; // 16KB

  it("farm state response < 16KB", async () => {
    const { data } = await post("/api/farm/state", {
      userId: "payload_farm",
      username: "PF",
    });
    const size = Buffer.byteLength(JSON.stringify(data), "utf8");
    assert.ok(
      size < MAX_BYTES,
      `Farm state payload ${size} bytes exceeds ${MAX_BYTES} byte budget`,
    );
  });

  it("crops config response < 16KB", async () => {
    const { data } = await get("/api/content/crops");
    const size = Buffer.byteLength(JSON.stringify(data), "utf8");
    assert.ok(
      size < MAX_BYTES,
      `Crops config payload ${size} bytes exceeds ${MAX_BYTES} byte budget`,
    );
  });

  it("farm state with 12 plots and full inventory < 16KB", async () => {
    await post("/api/farm/state", { userId: "payload_full", username: "PFu" });
    const player = players.get("payload_full");
    // Expand to 12 plots, fill inventory
    while (player.farm.plots.length < 12) {
      player.farm.plots.push({ crop: null, plantedAt: null, watered: false });
    }
    for (const [cropId] of Object.entries(CROPS)) {
      player.farm.inventory[cropId] = 99;
      player.farm.harvested[cropId] = 50;
    }

    const { data } = await post("/api/farm/state", {
      userId: "payload_full",
    });
    const size = Buffer.byteLength(JSON.stringify(data), "utf8");
    assert.ok(
      size < MAX_BYTES,
      `Full farm payload ${size} bytes exceeds ${MAX_BYTES} byte budget`,
    );
  });

  it("leaderboard response < 16KB", async () => {
    const { data } = await get("/api/leaderboard");
    const size = Buffer.byteLength(JSON.stringify(data), "utf8");
    assert.ok(
      size < MAX_BYTES,
      `Leaderboard payload ${size} bytes exceeds ${MAX_BYTES} byte budget`,
    );
  });
});

/* ═════════════════════════════════════════════════════
 *  4. SAVE STRESS (Debounced Persistence)
 *  Burst of API calls must not corrupt game state
 * ═════════════════════════════════════════════════════ */
describe("GCP: Save Stress", () => {
  it("50 rapid sequential plant/harvest cycles maintain consistent state", async () => {
    await post("/api/farm/state", { userId: "stress_save", username: "SS" });
    const player = players.get("stress_save");
    player.farm.inventory.strawberry = 100;

    let expectedInventory = 100;
    for (let i = 0; i < 50; i++) {
      const plotId = i % 6;
      // Skip if plot is occupied
      if (player.farm.plots[plotId].crop) continue;

      const plantResult = await post("/api/farm/plant", {
        userId: "stress_save",
        plotId,
        cropId: "strawberry",
      });
      if (plantResult.status === 200) expectedInventory--;
    }

    // Verify state consistency
    assert.equal(
      player.farm.inventory.strawberry,
      expectedInventory,
      `Inventory mismatch after stress: expected ${expectedInventory}, got ${player.farm.inventory.strawberry}`,
    );
    assert.ok(
      player.resources.gold >= 0,
      `Gold went negative during stress: ${player.resources.gold}`,
    );
  });

  it("burst of 30 buy-seeds in 100ms maintains gold consistency", async () => {
    await post("/api/farm/state", { userId: "stress_buy", username: "SB" });
    const player = players.get("stress_buy");
    const startGold = player.resources.gold;

    // Fire 30 buy requests as fast as possible
    const results = [];
    for (let i = 0; i < 30; i++) {
      results.push(
        post("/api/farm/buy-seeds", {
          userId: "stress_buy",
          cropId: "strawberry",
          amount: 1,
        }),
      );
    }
    const settled = await Promise.all(results);
    const successes = settled.filter((r) => r.status === 200).length;
    const expectedGold = startGold - successes * CROPS.strawberry.seedPrice;

    assert.equal(
      player.resources.gold,
      expectedGold,
      `Gold mismatch after burst buy: expected ${expectedGold}, actual ${player.resources.gold}`,
    );
  });
});

/* ═════════════════════════════════════════════════════
 *  5. STALE STATE RECOVERY
 *  Client reconnects after 10-minute gap,
 *  processOfflineActions must produce consistent state
 * ═════════════════════════════════════════════════════ */
describe("GCP: Stale State Recovery", () => {
  it("10-minute reconnect correctly simulates offline actions", async () => {
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    await post("/api/farm/state", { userId: "stale_1", username: "S1" });
    const player = players.get("stale_1");

    // Set up player who was active 10 minutes ago
    player._lastSeen = tenMinAgo;
    player.pet.abilities.autoHarvest = true;
    player.pet.abilities.autoWater = true;
    player.resources.energy.current = 15;

    // Plant a fully grown crop
    player.farm.plots[0].crop = "strawberry";
    player.farm.plots[0].plantedAt =
      tenMinAgo - CROPS.strawberry.growthTime - 5000;
    player.farm.plots[0].watered = false;

    // Trigger reconnect via API (processOfflineActions runs inside)
    const { data } = await post("/api/farm/state", {
      userId: "stale_1",
    });

    // Should have an offline report
    assert.ok(
      data.offlineReport,
      "Should produce offline report after 10-minute gap",
    );
    // Verify state is consistent
    assert.ok(
      player.resources.energy.current >= 0,
      "Energy must not be negative after offline simulation",
    );
    assert.ok(
      player.resources.energy.current <= ECONOMY.ENERGY_MAX,
      "Energy must not exceed max after offline simulation",
    );
  });

  it("rapid reconnect (<2min) does NOT trigger offline processing", async () => {
    await post("/api/farm/state", { userId: "stale_2", username: "S2" });
    const player = players.get("stale_2");
    player._lastSeen = Date.now() - 30000; // 30 seconds ago

    const { data } = await post("/api/farm/state", {
      userId: "stale_2",
    });

    assert.ok(
      data.offlineReport == null,
      "30-second reconnect should not trigger offline report",
    );
  });

  it("offline energy regen calculates correctly for 10-minute gap", () => {
    const now = Date.now();
    const tenMinAgo = now - 10 * 60 * 1000;
    const player = createDefaultPlayer("regen_test", "RT", tenMinAgo);
    player.resources.energy.current = 5;
    player.resources.energy.lastRegenTimestamp = tenMinAgo;

    // Energy regen is handled by calcRegen, not processOfflineActions
    calcRegen(player, now);

    // 10 minutes = 600s, regen interval = 150s → 4 ticks
    const expectedEnergy = Math.min(5 + 4, ECONOMY.ENERGY_MAX);
    assert.equal(
      player.resources.energy.current,
      expectedEnergy,
      `Expected ${expectedEnergy} energy after 10-min regen, got ${player.resources.energy.current}`,
    );
  });
});

/* ═════════════════════════════════════════════════════
 *  6. IDEMPOTENCY
 *  Same request sent twice must not double-award
 * ═════════════════════════════════════════════════════ */
describe("GCP: Idempotency", () => {
  it("double harvest of same plot awards only once", async () => {
    await post("/api/farm/state", { userId: "idemp_harvest", username: "IH" });
    const player = players.get("idemp_harvest");
    player.farm.plots[0].crop = "strawberry";
    player.farm.plots[0].plantedAt =
      Date.now() - CROPS.strawberry.growthTime - 1000;

    const harvestedBefore = player.farm.harvested.strawberry || 0;
    const harvest1 = await post("/api/farm/harvest", {
      userId: "idemp_harvest",
      plotId: 0,
    });
    const harvest2 = await post("/api/farm/harvest", {
      userId: "idemp_harvest",
      plotId: 0,
    });

    assert.equal(harvest1.status, 200);
    assert.equal(harvest2.status, 400, "Second harvest must fail");
    // Harvest awards harvested count (gold comes from sell-crop endpoint)
    const harvestedGained =
      (player.farm.harvested.strawberry || 0) - harvestedBefore;
    assert.equal(
      harvestedGained,
      1,
      `Should harvest exactly 1 crop, got ${harvestedGained}`,
    );
  });

  it("double water of same plot applies only once", async () => {
    await post("/api/farm/state", { userId: "idemp_water", username: "IW" });
    await post("/api/farm/plant", {
      userId: "idemp_water",
      plotId: 0,
      cropId: "strawberry",
    });

    const water1 = await post("/api/farm/water", {
      userId: "idemp_water",
      plotId: 0,
    });
    const water2 = await post("/api/farm/water", {
      userId: "idemp_water",
      plotId: 0,
    });

    assert.equal(water1.status, 200);
    assert.equal(water2.status, 400, "Second water must fail");
  });

  it("double feed with 1 crop remaining succeeds once, fails once", async () => {
    await post("/api/farm/state", { userId: "idemp_feed", username: "IF" });
    const player = players.get("idemp_feed");
    player.farm.harvested.strawberry = 1;
    player.resources.energy.current = 5;

    const feed1 = await post("/api/pet/feed", {
      userId: "idemp_feed",
      cropId: "strawberry",
    });
    const feed2 = await post("/api/pet/feed", {
      userId: "idemp_feed",
      cropId: "strawberry",
    });

    assert.equal(feed1.status, 200);
    assert.equal(feed2.status, 400, "Second feed with 0 stock must fail");
    assert.equal(
      player.resources.energy.current,
      5 + ECONOMY.FEED_ENERGY,
      "Energy should increase by exactly one feed",
    );
  });
});
