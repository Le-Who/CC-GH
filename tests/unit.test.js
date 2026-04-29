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
  normalizeYardState,
  simulateYardState,
  YARD_GOODIES,
  YARD_HOUR_MS,
  YARD_SIMULATION_CAP_MS,
  MERGE_CHAINS,
  MERGE_WILD_GENERATOR_ID,
} from "../game-logic.js";
import { resolveCompanionYardAsset } from "../src/games/companion-yard/assets.js";
import { normalizeInventory, withNormalizedSnapshot } from "../src/game-state/inventory.js";
import { applyAction, applyActionWithReceipt, buildSnapshot } from "../routes/player.js";

/* ─────────────────────────────────────────────────────
 *  createDefaultPlayer
 * ───────────────────────────────────────────────────── */
describe("createDefaultPlayer", () => {
  it("returns a player with all required fields", () => {
    const p = createDefaultPlayer("u1", "Alice");
    assert.equal(p.id, "u1");
    assert.equal(p.username, "Alice");
    assert.equal(p.schemaVersion, 11);
    assert.equal(p.resources.gold, ECONOMY.GOLD_START);
    assert.equal(p.resources.energy.current, ECONOMY.ENERGY_START);
    assert.equal(p.resources.energy.max, ECONOMY.ENERGY_MAX);
    assert.ok(p.pet);
    assert.ok(p.farm);
    assert.ok(p.trivia);
    assert.ok(p.match3);
    assert.ok(p.bubbo);
    assert.ok(p.garden);
    assert.ok(p.yard);
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
    assert.equal(p.bubbo.highScore, 0);
    assert.equal(p.bubbo.currentGame, null);
    assert.equal(p.garden.level, 1);
    assert.deepEqual(p.garden.plants, []);
    assert.equal(p.yard.currencies.treats, 80);
    assert.equal(p.yard.bowls.length, 1);
    assert.equal(p.yard.companion.name, "Buddy");
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

describe("Garden Shelf shared gold actions", () => {
  it("spends and earns through the shared player gold balance", async () => {
    const p = createDefaultPlayer("garden-gold", "Garden");
    const startGold = p.resources.gold;
    const startGoldEarned = p.stats.totalGoldEarned || 0;

    const spent = await applyAction(p, "garden.goldDelta", { amount: -10, reason: "buyPlant" });
    assert.equal(spent.status, 200);
    assert.equal(p.resources.gold, startGold - 10);

    const earned = await applyAction(p, "garden.goldDelta", { amount: 7, reason: "tapPlant" });
    assert.equal(earned.status, 200);
    assert.equal(p.resources.gold, startGold - 3);
    assert.equal(p.stats.totalGoldEarned, startGoldEarned + 7);
  });

  it("rejects Garden Shelf spending when the shared balance is too low", async () => {
    const p = createDefaultPlayer("garden-low-gold", "Garden");
    p.resources.gold = 4;

    const result = await applyAction(p, "garden.goldDelta", { amount: -10, reason: "buyPlant" });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, "not enough gold");
    assert.equal(p.resources.gold, 4);
  });

  it("persists Garden Shelf level and plants in the shared player snapshot", async () => {
    const p = createDefaultPlayer("garden-sync", "Garden");
    const startGold = p.resources.gold;
    const gardenState = {
      totalGoldEarned: 42,
      level: 4,
      xp: 1300,
      shelvesUnlocked: 2,
      lastTick: 123456,
      offlineEarnings: 12,
      plants: [
        {
          id: "plant-1",
          type: "lavender",
          level: 3,
          shelfIndex: 1,
          spotIndex: 2,
          phase: 3,
          phaseProgress: 0,
          lastWatered: 111,
        },
      ],
    };

    const result = await applyAction(p, "garden.sync", { state: gardenState });

    assert.equal(result.status, 200);
    assert.equal(p.resources.gold, startGold, "garden.sync must not alter shared gold");
    assert.deepEqual(result.body.snapshot.garden.plants, gardenState.plants);
    assert.equal(result.body.snapshot.garden.level, 4);
    assert.equal(result.body.snapshot.garden.shelvesUnlocked, 2);
    assert.equal(result.body.snapshot.garden.offlineEarnings, null);
    assert.equal(buildSnapshot(p).garden.xp, 1300);
    assert.equal(buildSnapshot(p).garden.offlineEarnings, null);
  });

  it("sanitizes malformed Garden Shelf sync payloads", async () => {
    const p = createDefaultPlayer("garden-sanitize", "Garden");

    const result = await applyAction(p, "garden.sync", {
      state: {
        totalGoldEarned: -5,
        level: 999,
        xp: -10,
        shelvesUnlocked: 99,
        plants: [
          {
            id: "bad",
            type: "unknown",
            level: -1,
            shelfIndex: 99,
            spotIndex: 99,
            phase: 99,
            phaseProgress: 999999999999,
          },
        ],
      },
    });

    const garden = result.body.snapshot.garden;
    assert.equal(result.status, 200);
    assert.equal(garden.totalGoldEarned, 0);
    assert.equal(garden.level, 24);
    assert.equal(garden.xp, 0);
    assert.equal(garden.shelvesUnlocked, 5);
    assert.equal(garden.plants[0].type, "daisy");
    assert.equal(garden.plants[0].level, 1);
    assert.equal(garden.plants[0].shelfIndex, 4);
    assert.equal(garden.plants[0].spotIndex, 2);
    assert.equal(garden.plants[0].phase, 3);
    assert.equal(garden.plants[0].phaseProgress, 86400000);
    assert.equal(garden.offlineEarnings, null);
  });
});

describe("Gacha Merge shared generator and recipes", () => {
  function withRandomSequence(sequence, fn) {
    const originalRandom = Math.random;
    let index = 0;
    Math.random = () => sequence[Math.min(index++, sequence.length - 1)];
    return Promise.resolve()
      .then(fn)
      .finally(() => {
        Math.random = originalRandom;
      });
  }

  it("wild generator consumes a free tap and spawns a random configured chain", async () => {
    const p = createDefaultPlayer("merge-wild", "Merge");
    p.merge.freeTapCharges = 1;

    const result = await applyAction(p, "merge.tap", { chainId: MERGE_WILD_GENERATOR_ID });

    assert.equal(result.status, 200);
    assert.equal(p.merge.freeTapCharges, 0);
    assert.equal(p.merge.generatorState[MERGE_WILD_GENERATOR_ID].tapsLeft, ECONOMY.GENERATOR_TAP_LIMIT - 1);
    assert.equal(result.body.spawned.length, 1);
    assert.ok(MERGE_CHAINS[result.body.spawned[0].item.chainId]);
  });

  it("combines alchemy recipes such as sand plus lightning into glass", async () => {
    const p = createDefaultPlayer("merge-recipe", "Merge");
    p.merge.board[0][0] = { id: "sand", chainId: "earth", level: 1 };
    p.merge.board[0][1] = { id: "lightning", chainId: "storm", level: 3 };

    const result = await applyAction(p, "merge.merge", { fromR: 0, fromC: 0, toR: 0, toC: 1 });

    assert.equal(result.status, 200);
    assert.deepEqual(p.merge.board[0][0], null);
    assert.deepEqual(p.merge.board[0][1], { id: "glass", chainId: "earth", level: 5 });
    assert.equal(result.body.recipeId, "sand_lightning_glass");
  });

  it("does not spend gacha tokens or burn daily free pulls when the board is full", async () => {
    const p = createDefaultPlayer("merge-full-board", "Merge");
    p.resources.gachaTokens = ECONOMY.GACHA_PULL_COST;
    p.merge.board = p.merge.board.map((row) =>
      row.map(() => ({ id: "thread", chainId: "textile", level: 0 })),
    );

    const paid = await applyAction(p, "merge.gacha");
    const free = await applyAction(p, "merge.freePull", {}, { now: 1_800_000_000_000 });

    assert.equal(paid.status, 400);
    assert.equal(paid.body.error, "board full");
    assert.equal(p.resources.gachaTokens, ECONOMY.GACHA_PULL_COST);
    assert.equal(free.status, 400);
    assert.equal(free.body.error, "board full");
    assert.equal(p.merge.lastFreePull, 0);
  });

  it("uses server time for daily free-pull and free-tap reset windows", async () => {
    const start = 1_800_000_000_000;
    const nextDay = start + 26 * 60 * 60 * 1000;
    const p = createDefaultPlayer("merge-server-time", "Merge", start);
    p.merge.lastFreePull = start;
    p.merge.lastFreeTaps = start;

    const sameDayPull = await applyAction(p, "merge.freePull", {}, { now: start + 60_000 });
    const nextDayPull = await applyAction(p, "merge.freePull", {}, { now: nextDay });
    const sameDayTaps = await applyAction(p, "merge.claimFreeTaps", {}, { now: start + 60_000 });
    const nextDayTaps = await applyAction(p, "merge.claimFreeTaps", {}, { now: nextDay });

    assert.equal(sameDayPull.status, 400);
    assert.equal(nextDayPull.status, 200);
    assert.equal(p.merge.lastFreePull, nextDay);
    assert.equal(sameDayTaps.status, 400);
    assert.equal(nextDayTaps.status, 200);
    assert.equal(p.merge.lastFreeTaps, nextDay);
    assert.equal(p.merge.freeTapCharges, 30);
  });

  it("surfaces high-tier Merge recipe Yard drops as explicit rewards", async () => {
    await withRandomSequence([0.01, 0.01], async () => {
      const p = createDefaultPlayer("merge-yard-drop", "Merge");
      p.merge.board[0][0] = { id: "sand", chainId: "earth", level: 1 };
      p.merge.board[0][1] = { id: "lightning", chainId: "storm", level: 3 };

      const result = await applyAction(p, "merge.merge", { fromR: 0, fromC: 0, toR: 0, toC: 1 });

      assert.equal(result.status, 200);
      assert.equal(result.body.recipeId, "sand_lightning_glass");
      assert.equal(result.body.reward?.type, "yardGoodie");
      assert.equal(result.body.reward.goodieId, result.body.yardDrop);
      assert.equal(result.body.snapshot.yard.goodieInventory[result.body.yardDrop], 1);
    });
  });

  it("returns the trashed item without changing free taps or rewards", async () => {
    const p = createDefaultPlayer("merge-trash", "Merge");
    p.merge.freeTapCharges = 4;
    p.merge.board[2][3] = { id: "thread", chainId: "textile", level: 0 };

    const result = await applyAction(p, "merge.trash", { r: 2, c: 3 });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.trashedItem, { id: "thread", chainId: "textile", level: 0 });
    assert.equal(p.merge.board[2][3], null);
    assert.equal(p.merge.freeTapCharges, 4);
    assert.equal(result.body.reward, undefined);
  });
});

describe("temporary energy-free game starts", () => {
  it("starts Blox, Match-3, and Bubbo without requiring or spending energy", async () => {
    const p = createDefaultPlayer("energy-free-games", "Energy");
    p.resources.energy.current = 0;
    p.resources.energy.lastRegenTimestamp = Date.now();

    const blox = await applyAction(p, "blox.start");
    assert.equal(blox.status, 200);
    assert.equal(p.resources.energy.current, 0);
    assert.equal(p.blox.activeGame, true);

    const match3 = await applyAction(p, "match3.start", { mode: "classic" });
    assert.equal(match3.status, 200);
    assert.equal(p.resources.energy.current, 0);
    assert.equal(p.match3.currentGame.mode, "classic");

    const bubbo = await applyAction(p, "bubbo.start", { shotsLeft: 36, board: [] });
    assert.equal(bubbo.status, 200);
    assert.equal(p.resources.energy.current, 0);
    assert.equal(p.bubbo.currentGame.shotsLeft, 36);
    assert.equal(p.bubbo.currentGame.mode, "classic");
    assert.equal(p.bubbo.currentGame.pendingRow.length, 9);
  });

  it("stores Bubbo timed runs and preserves internal sync fields", async () => {
    const p = createDefaultPlayer("bubbo-timed", "Timed");
    const pendingRow = ["mint", "amber", "coral", "sky", "berry", "mint", "amber", "coral", "sky"];

    const started = await applyAction(p, "bubbo.start", {
      mode: "timed",
      timeLeft: 90,
      shotsFired: 0,
      pendingRow,
      seed: "timed-seed",
      waveIndex: 5,
    });

    assert.equal(started.status, 200);
    assert.equal(p.bubbo.currentGame.mode, "timed");
    assert.equal(p.bubbo.currentGame.timeLeft, 90);
    assert.equal(p.bubbo.currentGame.shotsFired, 0);
    assert.deepEqual(p.bubbo.currentGame.pendingRow, pendingRow);

    const reversedPending = pendingRow.toReversed();
    const synced = await applyAction(p, "bubbo.sync", {
      game: {
        score: 120,
        mode: "timed",
        timeLeft: 73,
        shotsFired: 8,
        pendingRow: reversedPending,
      },
    });

    assert.equal(synced.status, 200);
    assert.equal(p.bubbo.currentGame.mode, "timed");
    assert.equal(p.bubbo.currentGame.timeLeft, 73);
    assert.equal(p.bubbo.currentGame.shotsFired, 8);
    assert.deepEqual(p.bubbo.currentGame.pendingRow, reversedPending);
    assert.equal(p.bubbo.currentGame.shotsLeft, 36);
  });
});

describe("new-stack player snapshot and inventory contracts", () => {
  it("normalizes harvested, merge, yard, and reward inventory aliases", () => {
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
      yard: {
        goodieInventory: { cozy_chair: 1 },
      },
    };

    const inventory = normalizeInventory(snapshot);

    assert.deepEqual(inventory.seeds, { strawberry: 5 });
    assert.deepEqual(inventory.harvested, { strawberry: 2 });
    assert.deepEqual(inventory.harvestedCrops, { strawberry: 2 });
    assert.deepEqual(inventory.mergeItems, { thread: 2 });
    assert.deepEqual(inventory.yardGoodies, { cozy_chair: 1 });
    assert.equal(inventory.rewards.gold, 125);
    assert.equal(inventory.rewards.gachaTokens, 3);
  });

  it("writes normalized aliases back into snapshot resources and yard state", () => {
    const normalized = withNormalizedSnapshot({
      resources: { harvestedCrops: { carrot: 4 } },
      yard: { goodieInventory: { moon_lamp: 1 } },
    });

    assert.deepEqual(normalized.resources.harvested, { carrot: 4 });
    assert.deepEqual(normalized.resources.harvestedCrops, { carrot: 4 });
    assert.deepEqual(normalized.yard.goodieInventory, { moon_lamp: 1 });
  });

  it("migrates old Room/Pet data into the Cozy Yard snapshot", () => {
    const p = createDefaultPlayer("legacy-room-user", "Roomy");
    delete p.yard;
    p.pet.name = "Pixel";
    p.pet.skinId = "basic_bunny";
    p.room.inventory = ["deco_chair"];
    p.room.roomInventory = ["deco_chair"];
    p.room.decorations = ["deco_lamp"];

    const snapshot = buildSnapshot(p);

    assert.equal(snapshot.yard.companion.name, "Pixel");
    assert.equal(snapshot.yard.companion.species, "bunny");
    assert.equal(snapshot.yard.goodieInventory.cozy_chair, 1);
    assert.equal(snapshot.yard.placedGoodies[0].goodieId, "moon_lamp");
    assert.equal(snapshot.inventory.yardGoodies.cozy_chair, 1);
  });
});

describe("Cozy Yard player contracts", () => {
  it("defines multi-anchor goodie activities for interior interactions", () => {
    const cottage = YARD_GOODIES.cardboard_cottage;

    assert.equal(cottage.capacity, 2);
    assert.ok(cottage.activities.length >= 2);
    assert.ok(cottage.activities.some((activity) => activity.layer === "back"));
    assert.ok(cottage.activities.some((activity) => activity.layer === "front"));
  });

  it("normalizes old active visitor snapshots with stable motion fields", () => {
    const now = 1_800_000_000_000;
    const normalized = normalizeYardState({
      placedGoodies: [{
        slotId: "small-1",
        goodieId: "yarn_mouse",
        condition: "new",
        uses: 0,
        placedAt: now,
      }],
      activeVisitors: [{
        visitId: "legacy-visit",
        visitorId: "mika_cat",
        goodieId: "yarn_mouse",
        slotId: "small-1",
        pose: "sit",
        arrivedAt: now - 60_000,
        leavesAt: now + 60_000,
      }],
      expansion: { level: 1 },
      remodel: "meadow",
      ownedRemodels: ["meadow"],
      lastSimulatedAt: now,
    }, {}, now);

    const visit = normalized.activeVisitors[0];
    assert.ok(visit.activityId);
    assert.ok(visit.motionSeed);
    assert.ok(["left", "right", "top", "bottom"].includes(visit.entryEdge));
    assert.ok(["left", "right"].includes(visit.facing));
  });

  it("keeps broken goodies usable during offline visits", () => {
    const start = 1_800_000_000_000;
    const result = simulateYardState({
      currencies: { treats: 0, shinyTreats: 0 },
      foodInventory: {},
      goodieInventory: {},
      placedGoodies: [{
        slotId: "small-1",
        goodieId: "moon_lamp",
        condition: "broken",
        uses: 99,
        placedAt: start,
      }],
      bowls: [{
        id: "bowl-1",
        foodId: "bonito_bowl",
        servings: 99,
        placedAt: start,
        expiresAt: start + 72 * 60 * 60 * 1000,
      }],
      activeVisitors: [],
      pendingGifts: [],
      petbook: {},
      album: { photos: [], favoritePhotoId: null },
      mementos: {},
      expansion: { level: 1 },
      remodel: "meadow",
      ownedRemodels: ["meadow"],
      helper: { unlocked: false, autoRefill: false, preferredFoodId: "kibble" },
      companion: { name: "Buddy", species: "dog", skinId: "dog", mood: "curious" },
      dailyLetter: { lastClaimedDate: null, stamps: 0 },
      lastSimulatedAt: start,
    }, start + 72 * 60 * 60 * 1000, {}, "broken-goodie-strict");

    assert.ok(Object.keys(result.petbook).length > 0);
    assert.equal(result.placedGoodies[0].condition, "broken");
  });

  it("can host multiple active visitors on a large goodie through separate activity anchors", () => {
    const start = 1_800_000_000_000;
    const result = simulateYardState({
      currencies: { treats: 0, shinyTreats: 0 },
      foodInventory: {},
      goodieInventory: {},
      placedGoodies: [{
        slotId: "large-1",
        goodieId: "fountain_bowl",
        condition: "new",
        uses: 0,
        placedAt: start,
      }],
      bowls: [{
        id: "bowl-1",
        foodId: "berry_plate",
        servings: 99,
        placedAt: start,
        expiresAt: start + 3 * 60 * 60 * 1000,
      }],
      activeVisitors: [],
      pendingGifts: [],
      petbook: {},
      album: { photos: [], favoritePhotoId: null },
      mementos: {},
      expansion: { level: 1 },
      remodel: "meadow",
      ownedRemodels: ["meadow"],
      helper: { unlocked: false, autoRefill: false, preferredFoodId: "kibble" },
      companion: { name: "Buddy", species: "dog", skinId: "dog", mood: "curious" },
      dailyLetter: { lastClaimedDate: null, stamps: 0 },
      lastSimulatedAt: start,
    }, start + 60 * 60 * 1000, {}, "large-goodie-anchors");

    const largeSlotVisitors = result.activeVisitors.filter((visit) => visit.slotId === "large-1");
    assert.ok(largeSlotVisitors.length >= 2);
    assert.equal(new Set(largeSlotVisitors.map((visit) => visit.activityId)).size, largeSlotVisitors.length);
  });

  it("buys, places, and picks up goodies through yard actions", async () => {
    const p = createDefaultPlayer("yard-place", "Yard");
    p.yard.currencies.treats = 500;

    const bought = await applyAction(p, "yard.buyGoodie", { goodieId: "cardboard_cottage" });
    assert.equal(bought.status, 200);
    assert.equal(p.yard.goodieInventory.cardboard_cottage, 1);

    const placed = await applyAction(p, "yard.placeGoodie", { goodieId: "cardboard_cottage", slotId: "large-1" });
    assert.equal(placed.status, 200);
    assert.equal(p.yard.goodieInventory.cardboard_cottage || 0, 0);
    assert.equal(p.yard.placedGoodies[0].goodieId, "cardboard_cottage");

    const picked = await applyAction(p, "yard.pickupGoodie", { slotId: "large-1" });
    assert.equal(picked.status, 200);
    assert.equal(p.yard.placedGoodies.length, 0);
    assert.equal(p.yard.goodieInventory.cardboard_cottage, 1);
  });

  it("does not respawn starter or legacy goodies after they are placed or picked up", async () => {
    const p = createDefaultPlayer("yard-no-respawn", "Yard");

    const starterPlaced = await applyAction(p, "yard.placeGoodie", { goodieId: "yarn_mouse", slotId: "small-1" });
    assert.equal(starterPlaced.status, 200);
    assert.equal(buildSnapshot(p).yard.goodieInventory.yarn_mouse || 0, 0);

    const legacy = createDefaultPlayer("yard-legacy-no-respawn", "Yard");
    delete legacy.yard;
    legacy.room.decorations = ["deco_lamp"];
    buildSnapshot(legacy);

    const picked = await applyAction(legacy, "yard.pickupGoodie", { slotId: "small-1" });
    assert.equal(picked.status, 200);
    assert.equal(buildSnapshot(legacy).yard.placedGoodies.some((placed) => placed.goodieId === "moon_lamp"), false);
  });

  it("simulates classic-hour visits and collects pending gifts", async () => {
    const start = 1_800_000_000_000;
    const p = createDefaultPlayer("yard-visits", "Yard", start);
    p.yard.lastSimulatedAt = start;
    await applyAction(p, "yard.setFood", { foodId: "kibble", bowlId: "bowl-1", now: start });
    await applyAction(p, "yard.placeGoodie", { goodieId: "yarn_mouse", slotId: "small-1", now: start });

    const result = await applyAction(p, "yard.collectGifts", { now: start + 12 * 60 * 60 * 1000 });

    assert.equal(result.status, 200);
    assert.ok(result.body.collected.treats > 0);
    assert.ok(Object.keys(result.body.snapshot.yard.petbook).length > 0);
    assert.equal(result.body.snapshot.yard.pendingGifts.length, 0);
  });

  it("attracts rare visitors from specific food and goodie conditions", async () => {
    const start = 1_800_000_000_000;
    const p = createDefaultPlayer("yard-rare", "Yard", start);
    p.yard.currencies.treats = 2000;
    p.yard.currencies.shinyTreats = 20;
    p.yard.lastSimulatedAt = start;

    await applyAction(p, "yard.buyGoodie", { goodieId: "moon_lamp", now: start });
    await applyAction(p, "yard.placeGoodie", { goodieId: "moon_lamp", slotId: "small-2", now: start });
    await applyAction(p, "yard.buyFood", { foodId: "bonito_bowl", qty: 1, now: start });
    await applyAction(p, "yard.setFood", { foodId: "bonito_bowl", bowlId: "bowl-1", now: start });

    const result = await applyAction(p, "yard.collectGifts", { now: start + 48 * 60 * 60 * 1000 });

    assert.equal(result.status, 200);
    assert.ok(result.body.snapshot.yard.petbook.starlit_fox.visits > 0);
    assert.ok(result.body.snapshot.yard.mementos.starlit_fox);
  });

  it("fixes worn goodies and rejects unknown yard payloads", async () => {
    const p = createDefaultPlayer("yard-fix", "Yard");
    p.yard.currencies.treats = 500;
    p.yard.placedGoodies = [{
      slotId: "small-1",
      goodieId: "yarn_mouse",
      condition: "worn",
      uses: 9,
      placedAt: 1,
    }];

    const fixed = await applyAction(p, "yard.fixGoodie", { slotId: "small-1" });
    assert.equal(fixed.status, 200);
    assert.equal(p.yard.placedGoodies[0].condition, "new");
    assert.equal(p.yard.placedGoodies[0].uses, 0);

    const rejected = await applyAction(p, "yard.buyFood", { foodId: "missing_food" });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error, "unknown food");
  });

  it("unlocks expansion, remodels, helper refill, and album photos", async () => {
    const start = 1_800_000_000_000;
    const p = createDefaultPlayer("yard-meta", "Yard", start);
    p.yard.currencies.treats = 3000;
    p.yard.currencies.shinyTreats = 20;

    const expansion = await applyAction(p, "yard.buyExpansion", { now: start });
    assert.equal(expansion.status, 200);
    assert.equal(p.yard.expansion.level, 2);
    assert.ok(p.yard.bowls.some((bowl) => bowl.id === "bowl-2"));
    assert.equal(p.yard.helper.unlocked, true);

    const remodel = await applyAction(p, "yard.setRemodel", { remodelId: "moon_garden", now: start });
    assert.equal(remodel.status, 200);
    assert.equal(p.yard.remodel, "moon_garden");

    const companion = await applyAction(p, "yard.configureCompanion", {
      name: "Mochi",
      species: "bunny",
      helperAutoRefill: true,
      now: start,
    });
    assert.equal(companion.status, 200);
    assert.equal(p.yard.companion.name, "Mochi");
    assert.equal(p.yard.helper.autoRefill, true);

    p.yard.activeVisitors = [{
      visitId: "visit-1",
      visitorId: "mochi_bunny",
      goodieId: "sun_cushion",
      slotId: "small-1",
      pose: "nap",
      arrivedAt: start,
      leavesAt: start + 60_000,
    }];
    const photo = await applyAction(p, "yard.capturePhoto", { visitId: "visit-1", caption: "soft nap", now: start });
    assert.equal(photo.status, 200);
    assert.equal(p.yard.album.photos[0].visitorId, "mochi_bunny");

    const favorite = await applyAction(p, "yard.favoritePhoto", { photoId: p.yard.album.photos[0].id });
    assert.equal(favorite.status, 200);
    assert.equal(p.yard.album.favoritePhotoId, p.yard.album.photos[0].id);
  });

  it("ignores future payload.now through receipt-backed HTTP mutate flow", async () => {
    const start = 1_800_000_000_000;
    const future = start + 72 * 60 * 60 * 1000;
    const p = createDefaultPlayer("yard-server-time", "Yard", start);
    p.yard.lastSimulatedAt = start;

    const daily = await applyActionWithReceipt(p, "yard.claimDailyLetter", { now: future }, {
      clientActionId: "yard:test:daily-time",
      serverNow: start,
    });
    assert.equal(daily.status, 200);
    assert.equal(p.yard.dailyLetter.lastClaimedDate, new Date(start).toISOString().slice(0, 10));

    await applyActionWithReceipt(p, "yard.setFood", { foodId: "kibble", bowlId: "bowl-1", now: future }, {
      clientActionId: "yard:test:setfood-time",
      serverNow: start,
    });
    await applyActionWithReceipt(p, "yard.placeGoodie", { goodieId: "yarn_mouse", slotId: "small-1", now: future }, {
      clientActionId: "yard:test:place-time",
      serverNow: start,
    });
    const collected = await applyActionWithReceipt(p, "yard.collectGifts", { now: future }, {
      clientActionId: "yard:test:collect-time",
      serverNow: start + 60_000,
    });

    assert.equal(collected.status, 200);
    assert.equal(collected.body.collected.gifts, 0);
    assert.ok(p.yard.lastSimulatedAt <= start + 60_000);
  });

  it("caps long-idle Yard rewards but advances simulation freshness to the reload time", () => {
    const start = 1_800_000_000_000;
    const returnedAt = start + YARD_SIMULATION_CAP_MS + 48 * YARD_HOUR_MS;
    const yard = simulateYardState({
      currencies: { treats: 80, shinyTreats: 0 },
      foodInventory: {},
      goodieInventory: {},
      placedGoodies: [{
        slotId: "small-1",
        goodieId: "yarn_mouse",
        condition: "new",
        uses: 0,
        placedAt: start,
      }],
      bowls: [{
        id: "bowl-1",
        foodId: "kibble",
        servings: 99,
        placedAt: start,
        expiresAt: returnedAt + YARD_HOUR_MS,
      }],
      activeVisitors: [],
      pendingGifts: [],
      petbook: {},
      album: { photos: [], favoritePhotoId: null },
      mementos: {},
      expansion: { level: 1 },
      remodel: "meadow",
      ownedRemodels: ["meadow"],
      helper: { unlocked: false, autoRefill: false, preferredFoodId: "kibble" },
      companion: { name: "Buddy", species: "dog", skinId: "basic_dog", mood: "curious" },
      dailyLetter: { lastClaimedDate: null, stamps: 0 },
      lastSimulatedAt: start,
    }, returnedAt, {}, "long-idle");

    const afterReload = simulateYardState(yard, returnedAt, {}, "long-idle");

    assert.equal(yard.lastSimulatedAt, returnedAt);
    assert.deepEqual(afterReload.pendingGifts, yard.pendingGifts);
    assert.deepEqual(afterReload.activeVisitors, yard.activeVisitors);
  });

  it("clamps future Yard simulation timestamps on reconnect", () => {
    const now = 1_800_000_000_000;
    const yard = simulateYardState({
      lastSimulatedAt: now + YARD_HOUR_MS,
      bowls: [],
      activeVisitors: [],
      pendingGifts: [],
    }, now, {}, "future-clock");

    assert.equal(yard.lastSimulatedAt, now);
  });

  it("deduplicates Yard purchases, gifts, and daily letters by client action id", async () => {
    const start = 1_800_000_000_000;
    const p = createDefaultPlayer("yard-idempotent", "Yard", start);
    p.yard.currencies.treats = 1200;
    p.yard.currencies.shinyTreats = 5;

    const buyFood = await applyActionWithReceipt(p, "yard.buyFood", { foodId: "kibble", qty: 1 }, {
      clientActionId: "yard:test:buy-food",
      serverNow: start,
    });
    const foodAfterBuy = p.yard.foodInventory.kibble;
    const duplicateFood = await applyActionWithReceipt(p, "yard.buyFood", { foodId: "kibble", qty: 1 }, {
      clientActionId: "yard:test:buy-food",
      serverNow: start + 1000,
    });
    assert.equal(buyFood.status, 200);
    assert.equal(duplicateFood.status, 200);
    assert.equal(duplicateFood.body.duplicate, true);
    assert.equal(p.yard.foodInventory.kibble, foodAfterBuy);

    const buyGoodie = await applyActionWithReceipt(p, "yard.buyGoodie", { goodieId: "moon_lamp" }, {
      clientActionId: "yard:test:buy-goodie",
      serverNow: start,
    });
    const goodieAfterBuy = p.yard.goodieInventory.moon_lamp;
    const duplicateGoodie = await applyActionWithReceipt(p, "yard.buyGoodie", { goodieId: "moon_lamp" }, {
      clientActionId: "yard:test:buy-goodie",
      serverNow: start + 1000,
    });
    assert.equal(buyGoodie.status, 200);
    assert.equal(duplicateGoodie.status, 200);
    assert.equal(p.yard.goodieInventory.moon_lamp, goodieAfterBuy);

    p.yard.pendingGifts = [{ id: "gift-1", visitorId: "mika_cat", treats: 25, shinyTreats: 1 }];
    const treatsBeforeCollect = p.yard.currencies.treats;
    const collect = await applyActionWithReceipt(p, "yard.collectGifts", {}, {
      clientActionId: "yard:test:collect",
      serverNow: start + 2000,
    });
    const duplicateCollect = await applyActionWithReceipt(p, "yard.collectGifts", {}, {
      clientActionId: "yard:test:collect",
      serverNow: start + 3000,
    });
    assert.equal(collect.status, 200);
    assert.equal(duplicateCollect.status, 200);
    assert.equal(duplicateCollect.body.duplicate, true);
    assert.equal(p.yard.currencies.treats, treatsBeforeCollect + 25);
    assert.equal(p.yard.pendingGifts.length, 0);

    const daily = await applyActionWithReceipt(p, "yard.claimDailyLetter", {}, {
      clientActionId: "yard:test:daily",
      serverNow: start,
    });
    const stampsAfterDaily = p.yard.dailyLetter.stamps;
    const duplicateDaily = await applyActionWithReceipt(p, "yard.claimDailyLetter", {}, {
      clientActionId: "yard:test:daily",
      serverNow: start + 1000,
    });
    assert.equal(daily.status, 200);
    assert.equal(duplicateDaily.status, 200);
    assert.equal(duplicateDaily.body.duplicate, true);
    assert.equal(p.yard.dailyLetter.stamps, stampsAfterDaily);
  });

  it("treats a reused Yard client action id with different payload as terminal conflict", async () => {
    const start = 1_800_000_000_000;
    const p = createDefaultPlayer("yard-id-conflict", "Yard", start);
    p.yard.currencies.treats = 300;

    const first = await applyActionWithReceipt(p, "yard.buyFood", { foodId: "kibble", qty: 1 }, {
      clientActionId: "yard:test:conflict",
      serverNow: start,
    });
    const conflict = await applyActionWithReceipt(p, "yard.buyFood", { foodId: "berry_plate", qty: 1 }, {
      clientActionId: "yard:test:conflict",
      serverNow: start + 1000,
    });

    assert.equal(first.status, 200);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, "client action conflict");
  });
});

describe("Cozy Yard asset resolver", () => {
  it("uses manifest overrides for backgrounds and falls back to stable runtime paths", () => {
    const manifest = {
      graphics: {
        games: {
          companionYard: {
            backgrounds: {
              meadow: "/custom-yard/backgrounds/meadow.webp",
            },
            goodies: "/custom-yard/goodies/",
          },
        },
      },
    };

    assert.equal(
      resolveCompanionYardAsset(manifest, "backgrounds", "meadow"),
      "/custom-yard/backgrounds/meadow.webp",
    );
    assert.equal(
      resolveCompanionYardAsset(manifest, "backgrounds", "tea_house"),
      "/games/companion-yard/backgrounds/tea_house.png",
    );
    assert.equal(
      resolveCompanionYardAsset(manifest, "goodies", "yarn_mouse_worn"),
      "/custom-yard/goodies/yarn_mouse_worn.png",
    );
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

  it("does not keep old Room decoration bonuses after Cozy Yard migration", () => {
    const now = Date.now();
    const p = createDefaultPlayer("legacy-room-energy", "Test", now);
    p.room.decorations = ["deco_bed"];
    p.resources.energy.current = ECONOMY.ENERGY_MAX;
    p.resources.energy.lastRegenTimestamp = now - ECONOMY.ENERGY_REGEN_INTERVAL_MS;

    calcRegen(p, now);

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
