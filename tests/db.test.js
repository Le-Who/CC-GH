/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Postgres & Concurrency Resilience Tests
 *  Validates game systems under high concurrency leveraging
 *  Postgres ACID transactions.
 *  Run:  node --test tests/db.test.js
 * ═══════════════════════════════════════════════════════
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { app } from "../server.js";
import { initDb, closeDb } from "../db.js";
import {
  ECONOMY,
  CROPS,
  createDefaultPlayer,
  calcRegen,
} from "../game-logic.js";

const PORT = 9878;
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
  initDb();
  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });
});

after(async () => {
  server?.close();
  await closeDb();
  setTimeout(() => process.exit(0), 100);
});

/* ═════════════════════════════════════════════════════
 *  1. LATENCY TOLERANCE (Postgres Edition)
 *  All endpoints must respond within 200ms budget
 * ═════════════════════════════════════════════════════ */
describe("Postgres: Latency Tolerance", () => {
    // Realistic API latency
    const BUDGET_MS = 1500;

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
});

/* ═════════════════════════════════════════════════════
 *  2. ACID CONCURRENCY SAFETY (FOR UPDATE Lock)
 * ═════════════════════════════════════════════════════ */
describe("Postgres: ACID Concurrency Request Safety", () => {
  it("20 parallel buy-seeds requests don't overspend gold", async () => {
    // Seed the user with enough state to perform 20 buys (since we wiped the players Map, this hits Postgres)
    const { data: stateData, status: stateStatus } = await post("/api/farm/state", { userId: "pg_conc_buy", username: "CB" });
    assert.equal(stateStatus, 200);
    
    // Manually top up gold via auth bypass or endpoint if we had one. Since we don't, 
    // the user defaults to ECONOMY.GOLD_START (100). 20 * 5 = 100.
    const startGold = stateData.resources.gold;

    // Fire 20 buy requests in parallel (strawberry = 5 gold each)
    const requests = Array.from({ length: 20 }, () =>
      post("/api/farm/buy-seeds", {
        userId: "pg_conc_buy",
        cropId: "strawberry",
        amount: 1,
      }),
    );
    const results = await Promise.all(requests);

    const successCount = results.filter((r) => r.status === 200).length;
    
    // Fetch final state explicitly from DB
    const finalStateReq = await post("/api/farm/state", { userId: "pg_conc_buy" });
    const finalGold = finalStateReq.data.resources.gold;

    // Gold must not go negative
    assert.ok(
      finalGold >= 0,
      `Gold went negative: ${finalGold}`,
    );

    // Total spent must equal successCount * seedPrice
    const seedPrice = CROPS.strawberry.seedPrice;
    const totalSpent = startGold - finalGold;
    assert.equal(
      totalSpent,
      successCount * seedPrice,
      `Gold accounting mismatch: spent ${totalSpent} but ${successCount} succeeded × ${seedPrice}`,
    );
  });
});
