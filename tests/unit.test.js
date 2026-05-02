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
  YARD_REMODELS,
  YARD_VISITORS,
  YARD_HOUR_MS,
  YARD_SIMULATION_CAP_MS,
  MERGE_FREE_TAP_BANK_CAP,
  MERGE_FREE_TAP_RECHARGE_MS,
  GARDEN_ECONOMY_VERSION,
  GARDEN_OFFLINE_CAP_MS,
  GARDEN_OFFLINE_GOLD_RATIO,
  GARDEN_OFFLINE_XP_RATIO,
  GARDEN_STARTER_GOLD,
  GARDEN_TAP_REWARD_COOLDOWN_MS,
  buildGardenDailyQuests,
  createGardenEconomyState,
  getGardenReadyQuestCount,
  getGardenLevelReward,
  getGardenXpRequired,
  normalizeGardenDailyQuestState,
  recordGardenDailyProgress,
  clampYardPointToPlayzone,
  MERGE_CHAINS,
  MERGE_EXCHANGE_OFFERS,
  MERGE_GENERATOR_CHAIN_IDS,
  MERGE_WILD_GENERATOR_ID,
  calculateMergeEssenceReward,
  getYardGoodieActivities,
  isYardPointInPlayzone,
  isYardGoodieBlocking,
  isYardGoodieLayable,
  isYardVisitorPoseStationary,
  isYardVisitUsingGoodie,
} from "../game-logic.js";
import {
  getVisitorMotion,
  isPointInsideObstacle,
} from "../src/games/companion-yard/movement.js";
import { resolveCompanionYardAsset } from "../src/games/companion-yard/assets.js";
import {
  GARDEN_GOLD_DISPLAY_MULTIPLIER,
  PLANT_TYPES,
  formatGardenGoldAmount,
  formatGardenRate,
  getPassiveXpRate,
  getProduction,
} from "../game-logic/garden-shelf-plants.js";
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
    assert.equal(p.merge.alchemyEssence, 0);
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
      economyVersion: GARDEN_ECONOMY_VERSION,
      name: "Window Basil",
      totalGoldEarned: 42,
      level: 4,
      xp: 120,
      xpRequired: getGardenXpRequired(4),
      levelReady: false,
      shelvesUnlocked: 2,
      lastTick: 123456,
      offlineEarnings: 12,
      offlineXp: 3,
      passiveGoldBuffer: 0.4,
      passiveXpBuffer: 0.2,
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
          lastTapped: 0,
        },
      ],
    };

    const result = await applyAction(p, "garden.sync", { state: gardenState });

    assert.equal(result.status, 200);
    assert.equal(p.resources.gold, startGold, "garden.sync must not alter shared gold");
    assert.deepEqual(result.body.snapshot.garden.plants, gardenState.plants);
    assert.equal(result.body.snapshot.garden.level, 4);
    assert.equal(result.body.snapshot.garden.name, "Window Basil");
    assert.equal(result.body.snapshot.garden.economyVersion, GARDEN_ECONOMY_VERSION);
    assert.equal(result.body.snapshot.garden.xpRequired, getGardenXpRequired(4));
    assert.equal(result.body.snapshot.garden.levelReady, false);
    assert.equal(result.body.snapshot.garden.shelvesUnlocked, 2);
    assert.equal(result.body.snapshot.garden.offlineEarnings, null);
    assert.equal(result.body.snapshot.garden.offlineXp, null);
    assert.equal(buildSnapshot(p).garden.xp, 120);
    assert.equal(buildSnapshot(p).garden.offlineEarnings, null);
  });

  it("persists claimed Garden Shelf quest ids without accepting malformed ids", async () => {
    const p = createDefaultPlayer("garden-quest-sync", "Garden");

    const result = await applyAction(p, "garden.sync", {
      state: {
        economyVersion: GARDEN_ECONOMY_VERSION,
        level: 2,
        xp: 0,
        xpRequired: getGardenXpRequired(2),
        levelReady: false,
        shelvesUnlocked: 1,
        plants: [],
        claimedQuests: ["first_plant", "../bad"],
        lastTick: 123456,
      },
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.snapshot.garden.claimedQuests, ["first_plant"]);
    assert.deepEqual(buildSnapshot(p).garden.claimedQuests, ["first_plant"]);
  });

  it("resets Garden daily quests by day and builds three claim-gated portions", () => {
    const dayStart = Date.UTC(2026, 4, 1, 10);
    const state = createGardenEconomyState(dayStart, { starter: true });
    state.dailyQuests = recordGardenDailyProgress(state.dailyQuests, {
      taps: 2,
      waters: 1,
      goldEarned: 12,
      xpEarned: 6,
    }, dayStart);

    const quests = buildGardenDailyQuests(state, dayStart);
    assert.equal(quests.length, 9);
    assert.equal(quests.filter((quest) => quest.groupIndex === 0).every((quest) => quest.unlocked), true);
    assert.equal(quests.filter((quest) => quest.groupIndex === 1).every((quest) => quest.locked), true);
    assert.ok(quests.some((quest) => quest.endowed > 0 && quest.current >= quest.endowed));

    const firstGroupClaimed = quests
      .filter((quest) => quest.groupIndex === 0)
      .map((quest) => quest.id);
    state.dailyQuests.claimed = firstGroupClaimed;
    const nextPortion = buildGardenDailyQuests(state, dayStart);
    assert.equal(nextPortion.filter((quest) => quest.groupIndex === 1).every((quest) => quest.unlocked), true);

    const nextDay = normalizeGardenDailyQuestState(state.dailyQuests, dayStart + 26 * 60 * 60 * 1000);
    assert.deepEqual(nextDay.claimed, []);
    assert.equal(nextDay.stats.taps, 0);
  });

  it("rotates Garden daily quest assignments from a deep reserve without near-repeat days", () => {
    const firstDay = Date.UTC(2026, 4, 1, 12);
    const state = createGardenEconomyState(firstDay, { starter: true });
    const dailyKeysByDay = Array.from({ length: 14 }, (_item, index) => {
      const quests = buildGardenDailyQuests(state, firstDay + index * 86_400_000);
      const keys = quests.map((quest) => quest.templateKey || quest.id.replace(/^daily_\d{8}_\d_/, ""));
      assert.equal(keys.length, 9);
      assert.equal(new Set(keys).size, keys.length, `daily set ${index + 1} should not duplicate templates`);
      return keys;
    });

    const reserve = new Set(dailyKeysByDay.flat());
    assert.ok(reserve.size >= 20, `expected at least 20 templates over two weeks, got ${reserve.size}`);

    for (let index = 1; index < dailyKeysByDay.length; index += 1) {
      const previous = new Set(dailyKeysByDay[index - 1]);
      const overlap = dailyKeysByDay[index].filter((key) => previous.has(key));
      assert.ok(overlap.length <= 5, `day ${index} -> ${index + 1} repeats too many templates: ${overlap.join(", ")}`);
    }
  });

  it("counts ready Garden daily quests without mixing them into story claims", () => {
    const now = Date.UTC(2026, 4, 1, 12);
    const state = createGardenEconomyState(now, { starter: true });
    state.dailyQuests = recordGardenDailyProgress(state.dailyQuests, {
      taps: 20,
      waters: 20,
      plantsBought: 4,
      upgrades: 2,
      goldEarned: 100,
      xpEarned: 100,
    }, now);

    const ready = getGardenReadyQuestCount(state, now);
    assert.ok(ready >= 3);
    const daily = buildGardenDailyQuests(state, now).find((quest) => quest.unlocked && quest.complete);
    assert.ok(daily);
    state.dailyQuests.claimed = [daily.id];
    assert.equal(state.claimedQuests.includes(daily.id), false);
    assert.equal(getGardenReadyQuestCount(state, now), ready - 1);
  });

  it("keeps Garden Shelf display denomination separate from stored economy units", () => {
    assert.equal(GARDEN_GOLD_DISPLAY_MULTIPLIER, 100);
    assert.equal(GARDEN_TAP_REWARD_COOLDOWN_MS, 750);
    assert.equal(formatGardenGoldAmount(25), "2,500");
    assert.equal(formatGardenGoldAmount(100), "10,000");
    assert.equal(formatGardenRate(0.035), "3.5");
  });

  it("sanitizes malformed Garden Shelf sync payloads", async () => {
    const p = createDefaultPlayer("garden-sanitize", "Garden");

    const result = await applyAction(p, "garden.sync", {
      state: {
        economyVersion: GARDEN_ECONOMY_VERSION,
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
    assert.equal(garden.economyVersion, GARDEN_ECONOMY_VERSION);
    assert.equal(garden.level, 24);
    assert.equal(garden.xp, 0);
    assert.equal(garden.xpRequired, getGardenXpRequired(24));
    assert.equal(garden.levelReady, false);
    assert.equal(garden.shelvesUnlocked, 5);
    assert.equal(garden.plants[0].type, "daisy");
    assert.equal(garden.plants[0].level, 1);
    assert.equal(garden.plants[0].shelfIndex, 4);
    assert.equal(garden.plants[0].spotIndex, 2);
    assert.equal(garden.plants[0].phase, 3);
    assert.equal(garden.plants[0].phaseProgress, 86400000);
    assert.equal(garden.offlineEarnings, null);
    assert.equal(garden.offlineXp, null);
  });

  it("marks legacy Garden progress for explicit economy reset", () => {
    const p = createDefaultPlayer("garden-legacy-marker", "Garden");
    p.garden = {
      totalGoldEarned: 600,
      level: 12,
      xp: 220,
      shelvesUnlocked: 3,
      plants: [{ id: "legacy", type: "daisy", level: 8, shelfIndex: 0, spotIndex: 0, phase: 3, phaseProgress: 0 }],
      lastTick: 123,
    };

    const garden = buildSnapshot(p).garden;

    assert.equal(garden.economyVersion, 1);
    assert.equal(garden.level, 12);
    assert.equal(garden.totalGoldEarned, 600);
  });

  it("resets legacy Garden economy by debiting old Garden gold and granting a starter pack", async () => {
    const p = createDefaultPlayer("garden-reset", "Garden");
    p.resources.gold = 1_000;
    p.garden = {
      totalGoldEarned: 600,
      level: 18,
      xp: 1_200,
      shelvesUnlocked: 4,
      plants: [{ id: "legacy", type: "lavender", level: 12, shelfIndex: 1, spotIndex: 0, phase: 3, phaseProgress: 0 }],
      lastTick: 123,
    };

    const result = await applyAction(p, "garden.resetEconomy", {}, { now: 1_800_000_000_000 });

    assert.equal(result.status, 200);
    assert.equal(result.body.debit, 600);
    assert.equal(result.body.grant, GARDEN_STARTER_GOLD);
    assert.equal(p.resources.gold, 1_000 - 600 + GARDEN_STARTER_GOLD);
    assert.equal(p.garden.economyVersion, GARDEN_ECONOMY_VERSION);
    assert.equal(p.garden.level, 1);
    assert.equal(p.garden.xp, 0);
    assert.equal(p.garden.xpRequired, getGardenXpRequired(1));
    assert.equal(p.garden.plants.length, 1);
    assert.equal(p.garden.plants[0].type, "daisy");
    assert.equal(p.garden.plants[0].phase, 3);
  });

  it("keeps Garden XP frozen at 100% until Level Up is pressed", async () => {
    const p = createDefaultPlayer("garden-level-freeze", "Garden");
    p.garden = createGardenEconomyState(1_800_000_000_000);
    p.garden.xp = getGardenXpRequired(1);
    p.garden.levelReady = true;
    const startGold = p.resources.gold;

    const result = await applyAction(p, "garden.levelUp");

    assert.equal(result.status, 200);
    assert.equal(result.body.reward, getGardenLevelReward(1));
    assert.equal(p.resources.gold, startGold + getGardenLevelReward(1));
    assert.equal(p.garden.level, 2);
    assert.equal(p.garden.xp, 0);
    assert.equal(p.garden.xpRequired, getGardenXpRequired(2));
    assert.equal(p.garden.levelReady, false);
  });

  it("does not let stale Garden sync reopen an already claimed level-up reward", async () => {
    const p = createDefaultPlayer("garden-level-stale-sync", "Garden");
    p.garden = createGardenEconomyState(1_800_000_000_000);
    p.garden.xp = getGardenXpRequired(1);
    p.garden.levelReady = true;
    const staleReadyState = { ...p.garden };
    const startGold = p.resources.gold;

    const first = await applyAction(p, "garden.levelUp");
    const staleSync = await applyAction(p, "garden.sync", { state: staleReadyState });
    const second = await applyAction(p, "garden.levelUp");

    assert.equal(first.status, 200);
    assert.equal(staleSync.status, 200);
    assert.equal(p.garden.level, 2);
    assert.equal(p.garden.levelReady, false);
    assert.equal(second.status, 400);
    assert.equal(p.resources.gold, startGold + getGardenLevelReward(1));
  });

  it("rejects Garden Level Up before the XP bar is ready", async () => {
    const p = createDefaultPlayer("garden-level-not-ready", "Garden");
    p.garden = createGardenEconomyState(1_800_000_000_000);
    p.garden.xp = getGardenXpRequired(1) - 1;
    p.garden.levelReady = false;

    const result = await applyAction(p, "garden.levelUp");

    assert.equal(result.status, 400);
    assert.equal(result.body.error, "garden level not ready");
    assert.equal(p.garden.level, 1);
  });

  it("keeps two mostly-idle days of early Garden plants below runaway gold scale", () => {
    const starterPlantIds = ["daisy", "lavender", "basil", "rosemary"];
    const matureLevel = 8;
    const passiveGoldPerSecond = starterPlantIds.reduce((sum, plantId) => {
      const plant = PLANT_TYPES[plantId];
      return sum + getProduction(plant.baseProduction, matureLevel);
    }, 0);
    const passiveXpPerSecond = starterPlantIds.reduce((sum, plantId) => {
      const plant = PLANT_TYPES[plantId];
      return sum + getPassiveXpRate(plant.basePassiveXp, matureLevel);
    }, 0);
    const twoIdleReturnsGold = Math.floor(passiveGoldPerSecond * (GARDEN_OFFLINE_CAP_MS / 1000) * GARDEN_OFFLINE_GOLD_RATIO * 2);
    const twoIdleReturnsXp = Math.floor(passiveXpPerSecond * (GARDEN_OFFLINE_CAP_MS / 1000) * GARDEN_OFFLINE_XP_RATIO * 2);

    assert.ok(twoIdleReturnsGold < 25_000, `early idle gold should stay bounded, got ${twoIdleReturnsGold}`);
    assert.ok(twoIdleReturnsXp < getGardenXpRequired(13), `early idle XP should not skip deep unlocks, got ${twoIdleReturnsXp}`);
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

  it("combines alchemy recipes such as sand plus flame into glass", async () => {
    const p = createDefaultPlayer("merge-recipe", "Merge");
    p.merge.board[0][0] = { id: "sand", chainId: "earth", level: 2 };
    p.merge.board[0][1] = { id: "flame", chainId: "fire", level: 1 };

    const result = await applyAction(p, "merge.merge", { fromR: 0, fromC: 0, toR: 0, toC: 1 });

    assert.equal(result.status, 200);
    assert.deepEqual(p.merge.board[0][0], null);
    assert.deepEqual(p.merge.board[0][1], { id: "glass", chainId: "alchemy", level: 2 });
    assert.equal(result.body.recipeId, "sand_flame_glass");
    assert.equal(result.body.recipeDiscovered, true);
    assert.equal(
      result.body.essenceReward,
      calculateMergeEssenceReward(result.body.newItem, { recipeDiscovered: true }),
    );
    assert.equal(p.merge.alchemyEssence, result.body.essenceReward);
    assert.equal(result.body.snapshot.merge.alchemyEssence, result.body.essenceReward);
    assert.ok(result.body.snapshot.merge.discoveredRecipes.includes("sand_flame_glass"));
    assert.ok(result.body.snapshot.merge.discoveredItems.includes("glass"));
  });

  it("exchanges crafted Essence for Cozy Yard currency atomically", async () => {
    const p = createDefaultPlayer("merge-exchange", "Merge");
    const offer = MERGE_EXCHANGE_OFFERS.find((candidate) => candidate.id === "yard_treats_small");
    assert.ok(offer);
    p.merge.alchemyEssence = offer.cost;
    const treatsBefore = p.yard.currencies.treats;

    const result = await applyAction(p, "merge.exchange", { offerId: offer.id });

    assert.equal(result.status, 200);
    assert.equal(p.merge.alchemyEssence, 0);
    assert.equal(p.yard.currencies.treats, treatsBefore + offer.reward.treats);
    assert.equal(result.body.offerId, offer.id);
    assert.equal(result.body.snapshot.merge.alchemyEssence, 0);
    assert.equal(result.body.snapshot.yard.currencies.treats, p.yard.currencies.treats);
  });

  it("prunes old Merge exchange claim buckets while preserving today's limit", async () => {
    const p = createDefaultPlayer("merge-exchange-prune", "Merge");
    const offer = MERGE_EXCHANGE_OFFERS.find((candidate) => candidate.id === "yard_treats_small");
    assert.ok(offer);
    p.merge.alchemyEssence = offer.cost * 2;
    p.merge.exchangeClaims = {
      "2026-04-20": { [offer.id]: 1 },
      "2026-04-21": { [offer.id]: 1 },
      "2026-04-22": { [offer.id]: 1 },
      "2026-04-23": { [offer.id]: 1 },
      "2026-04-24": { [offer.id]: 1 },
      "2026-04-25": { [offer.id]: 1 },
      "2026-04-26": { [offer.id]: 1 },
      "2026-04-27": { [offer.id]: 1 },
      "2026-04-28": { [offer.id]: 1 },
    };

    const result = await applyAction(p, "merge.exchange", { offerId: offer.id }, { now: Date.UTC(2026, 4, 1, 12) });
    const dates = Object.keys(p.merge.exchangeClaims);

    assert.equal(result.status, 200);
    assert.equal(dates.length, 7);
    assert.equal(dates.includes("2026-04-20"), false);
    assert.equal(p.merge.exchangeClaims["2026-05-01"][offer.id], 1);
  });

  it("starts with known starter recipes and keeps advanced recipes locked until discovered", async () => {
    const p = createDefaultPlayer("merge-discovery", "Merge");
    const initial = buildSnapshot(p).merge;

    assert.ok(initial.discoveredRecipes.includes("seed_dew_sprout"));
    assert.ok(initial.discoveredRecipes.includes("dew_dust_mud"));
    assert.ok(!initial.discoveredRecipes.includes("sand_flame_glass"));
  });

  it("keeps alchemy as a recipe-only chain outside free-pull and gacha generator drops", async () => {
    await withRandomSequence([0.999, 0, 0.999, 0], async () => {
      const p = createDefaultPlayer("merge-no-alchemy-drops", "Merge");
      p.resources.gachaTokens = ECONOMY.GACHA_PULL_COST;

      const free = await applyAction(p, "merge.freePull", {}, { now: 1_800_000_000_000 });
      const paid = await applyAction(p, "merge.gacha");

      assert.equal(free.status, 200);
      assert.equal(paid.status, 200);
      assert.notEqual(free.body.spawned.item.chainId, "alchemy");
      assert.notEqual(paid.body.spawned.item.chainId, "alchemy");
      assert.ok(MERGE_GENERATOR_CHAIN_IDS.includes(free.body.spawned.item.chainId));
      assert.ok(MERGE_GENERATOR_CHAIN_IDS.includes(paid.body.spawned.item.chainId));
    });
  });

  it("does not spend gacha tokens or burn daily free pulls when the board is full", async () => {
    const p = createDefaultPlayer("merge-full-board", "Merge");
    p.resources.gachaTokens = ECONOMY.GACHA_PULL_COST;
    p.merge.board = p.merge.board.map((row) =>
      row.map(() => ({ id: "seed", chainId: "flora", level: 0 })),
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

  it("uses server time for daily free-pull and paced free-tap recharge windows", async () => {
    const start = 1_800_000_000_000;
    const nextDay = start + 26 * 60 * 60 * 1000;
    const p = createDefaultPlayer("merge-server-time", "Merge", start);
    p.merge.lastFreePull = start;
    p.merge.lastFreeTaps = start;
    p.merge.freeTapCharges = 0;

    const sameDayPull = await applyAction(p, "merge.freePull", {}, { now: start + 60_000 });
    const nextDayPull = await applyAction(p, "merge.freePull", {}, { now: nextDay });
    const tooSoonTaps = await applyAction(p, "merge.claimFreeTaps", {}, { now: start + 60_000 });
    const firstRecharge = await applyAction(p, "merge.claimFreeTaps", {}, { now: start + MERGE_FREE_TAP_RECHARGE_MS });
    const laterRecharge = await applyAction(p, "merge.claimFreeTaps", {}, { now: start + 3 * MERGE_FREE_TAP_RECHARGE_MS });

    assert.equal(sameDayPull.status, 400);
    assert.equal(nextDayPull.status, 200);
    assert.equal(p.merge.lastFreePull, nextDay);
    assert.equal(tooSoonTaps.status, 400);
    assert.equal(tooSoonTaps.body.error, "no free taps ready");
    assert.equal(firstRecharge.status, 200);
    assert.equal(firstRecharge.body.freeTapCharges, 1);
    assert.equal(laterRecharge.status, 200);
    assert.equal(p.merge.freeTapCharges, 3);
    assert.equal(p.merge.lastFreeTaps, start + 3 * MERGE_FREE_TAP_RECHARGE_MS);
  });

  it("grants a capped starter bank for first-time Merge free-tap claims", async () => {
    const p = createDefaultPlayer("merge-first-free-taps", "Merge", 1_800_000_000_000);

    const result = await applyAction(p, "merge.claimFreeTaps", {}, { now: 1_800_000_060_000 });

    assert.equal(result.status, 200);
    assert.equal(p.merge.freeTapCharges, MERGE_FREE_TAP_BANK_CAP);
    assert.equal(result.body.freeTapCharges, MERGE_FREE_TAP_BANK_CAP);
  });

  it("surfaces high-tier Merge recipe Yard drops as explicit rewards", async () => {
    await withRandomSequence([0.01, 0.01], async () => {
      const p = createDefaultPlayer("merge-yard-drop", "Merge");
      p.merge.board[0][0] = { id: "crystal", chainId: "earth", level: 5 };
      p.merge.board[0][1] = { id: "elixir", chainId: "alchemy", level: 4 };

      const result = await applyAction(p, "merge.merge", { fromR: 0, fromC: 0, toR: 0, toC: 1 });

      assert.equal(result.status, 200);
      assert.equal(result.body.recipeId, "crystal_elixir_philosopher_stone");
      assert.equal(result.body.reward?.type, "yardGoodie");
      assert.equal(result.body.reward.goodieId, result.body.yardDrop);
      assert.equal(result.body.snapshot.yard.goodieInventory[result.body.yardDrop], 1);
    });
  });

  it("returns the trashed item without changing free taps or rewards", async () => {
    const p = createDefaultPlayer("merge-trash", "Merge");
    p.merge.freeTapCharges = 4;
    p.merge.board[2][3] = { id: "seed", chainId: "flora", level: 0 };

    const result = await applyAction(p, "merge.trash", { r: 2, c: 3 });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.trashedItem, { id: "seed", chainId: "flora", level: 0 });
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
          [{ id: "seed", chainId: "flora", level: 0 }, null],
          [{ id: "seed", chainId: "flora", level: 0 }],
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
    assert.deepEqual(inventory.mergeItems, { seed: 2 });
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

  it("types Yard goodies as layable surfaces or movement blockers", () => {
    assert.equal(isYardGoodieLayable(YARD_GOODIES.sun_cushion), true);
    assert.equal(isYardGoodieLayable(YARD_GOODIES.cloud_bed), true);
    assert.equal(isYardGoodieBlocking(YARD_GOODIES.yarn_mouse), true);
    assert.equal(isYardGoodieBlocking(YARD_GOODIES.sun_cushion), false);

    const cloudActivities = getYardGoodieActivities(YARD_GOODIES.cloud_bed);
    assert.ok(cloudActivities.some((activity) => activity.kind === "lie"));
  });

  it("marks known stationary visitor pose assets as map-still poses", () => {
    assert.equal(isYardVisitorPoseStationary(YARD_VISITORS.mochi_bunny, "nap"), true);
    assert.equal(isYardVisitorPoseStationary(YARD_VISITORS.mika_cat, "nap"), true);
    assert.equal(isYardVisitorPoseStationary(YARD_VISITORS.basil_turtle, "rest"), true);
    assert.equal(isYardVisitorPoseStationary(YARD_VISITORS.pebble_pup, "roll"), true);
    assert.equal(isYardVisitorPoseStationary(YARD_VISITORS.pip_hamster, "peek"), true);
    assert.equal(isYardVisitorPoseStationary(YARD_VISITORS.starlit_fox, "curl"), true);
    assert.equal(isYardVisitorPoseStationary(YARD_VISITORS.willow_fox, "curl"), true);
    assert.equal(isYardVisitorPoseStationary(YARD_VISITORS.mika_cat, "pounce"), false);
  });

  it("keeps stationary visitor poses anchored while routing active movement around blockers", () => {
    const start = 1_800_000_000_000;
    const visit = {
      visitId: "stationary-visit",
      visitorId: "mochi_bunny",
      pose: "nap",
      entryEdge: "left",
      motionSeed: "still",
      arrivedAt: start,
      leavesAt: start + 60 * 60 * 1000,
    };
    const activity = { id: "nap", pose: "nap", x: 0, y: -8, roam: 6, layer: "front", kind: "lie" };
    const justArrived = getVisitorMotion(visit, { x: 50, y: 70 }, activity, start + 60_000, {
      visitorInfo: YARD_VISITORS.mochi_bunny,
    });
    const first = getVisitorMotion(visit, { x: 50, y: 70 }, activity, start + 30 * 60 * 1000, {
      visitorInfo: YARD_VISITORS.mochi_bunny,
    });
    const second = getVisitorMotion(visit, { x: 50, y: 70 }, activity, start + 31 * 60 * 1000, {
      visitorInfo: YARD_VISITORS.mochi_bunny,
    });

    assert.equal(justArrived.phase, "active");
    assert.equal(justArrived.pinned, true);
    assert.equal(justArrived.x, 50);
    assert.equal(justArrived.y, 70);
    assert.equal(first.x, second.x);
    assert.equal(first.y, second.y);

    const moving = getVisitorMotion({
      ...visit,
      pose: "pounce",
      arrivedAt: start,
      leavesAt: start + 60 * 60 * 1000,
    }, { x: 50, y: 50 }, { id: "chase", pose: "pounce", x: 0, y: 0, roam: 5 }, start + 5 * 60 * 1000, {
      visitorInfo: YARD_VISITORS.mika_cat,
      obstacles: [{ x: 20, y: 40, width: 40, height: 20 }],
    });

    assert.equal(isPointInsideObstacle(moving, { x: 20, y: 40, width: 40, height: 20 }), false);
  });

  it("keeps lie poses on their decor instead of snapping the pose to a distant playzone row", () => {
    const start = 1_800_000_000_000;
    const visit = {
      visitId: "stationary-low-row",
      visitorId: "mochi_bunny",
      pose: "nap",
      entryEdge: "left",
      motionSeed: "still-low-row",
      arrivedAt: start,
      leavesAt: start + 60 * 60 * 1000,
    };
    const motion = getVisitorMotion(
      visit,
      { x: 50, y: 28 },
      { id: "nap", pose: "nap", x: 0, y: -12, roam: 6, layer: "front", kind: "lie" },
      start + 30 * 60 * 1000,
      { visitorInfo: YARD_VISITORS.mochi_bunny, playzoneId: "meadow" },
    );

    assert.equal(motion.stationary, true);
    assert.equal(motion.x, 50);
    assert.equal(motion.y, 28);
  });

  it("scales Yard activity offsets before projecting visitor poses into the full stage", () => {
    const start = 1_800_000_000_000;
    const visit = {
      visitId: "stationary-scaled-offset",
      visitorId: "pip_hamster",
      pose: "watch",
      entryEdge: "right",
      motionSeed: "scaled-offset",
      arrivedAt: start,
      leavesAt: start + 60 * 60 * 1000,
    };
    const activity = { id: "watch-right", pose: "watch", kind: "stationary", x: 13, y: -13, roam: 0 };
    const unscaled = getVisitorMotion(visit, { x: 50, y: 50 }, activity, start + 30 * 60 * 1000, {
      visitorInfo: YARD_VISITORS.pip_hamster,
      activityScale: 1,
    });
    const scaled = getVisitorMotion(visit, { x: 50, y: 50 }, activity, start + 30 * 60 * 1000, {
      visitorInfo: YARD_VISITORS.pip_hamster,
      activityScale: 0.4,
    });

    assert.equal(unscaled.x, 63);
    assert.equal(unscaled.y, 37);
    assert.equal(scaled.x, 55.2);
    assert.equal(scaled.y, 44.8);
    assert.ok(Math.hypot(scaled.x - 50, scaled.y - 50) < Math.hypot(unscaled.x - 50, unscaled.y - 50));
  });

  it("lets leaving Yard visitors release their goodie before the visit fully expires", async () => {
    const now = 1_800_000_000_000;
    const buildPlayer = (id, arrivedAt) => {
      const player = createDefaultPlayer(id, "Yard");
      player.yard.lastSimulatedAt = now;
      player.yard.placedGoodies = [{
        slotId: "nap-slot",
        goodieId: "sun_cushion",
        condition: "new",
        uses: 0,
        x: 50,
        y: 70,
        placedAt: now - 60_000,
      }];
      player.yard.activeVisitors = [{
        visitId: `${id}-visit`,
        visitorId: "mochi_bunny",
        goodieId: "sun_cushion",
        slotId: "nap-slot",
        bowlId: "bowl-1",
        pose: "nap",
        activityId: "nap",
        activityLayer: "front",
        entryEdge: "left",
        facing: "right",
        motionSeed: `${id}-motion`,
        arrivedAt,
        leavesAt: now + 5 * 60 * 1000,
      }];
      return player;
    };

    const stillResting = buildPlayer("yard-still-using", now - 20 * 60 * 1000);
    assert.equal(isYardVisitUsingGoodie(stillResting.yard.activeVisitors[0], now), true);
    const blocked = await applyAction(stillResting, "yard.moveGoodie", {
      slotId: "nap-slot",
      x: 62,
      y: 72,
    }, { yardNow: now });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.body.error, "visitor is using this goodie");

    const leaving = buildPlayer("yard-releasing", now - 60 * 60 * 1000);
    assert.equal(isYardVisitUsingGoodie(leaving.yard.activeVisitors[0], now), false);
    const moved = await applyAction(leaving, "yard.moveGoodie", {
      slotId: "nap-slot",
      x: 62,
      y: 72,
    }, { yardNow: now });
    assert.equal(moved.status, 200);
    assert.equal(leaving.yard.placedGoodies[0].x, 62);
    assert.equal(leaving.yard.activeVisitors.length, 0);
    assert.equal(leaving.yard.pendingGifts.length, 1);
  });

  it("clamps Yard visitors and placements into the current background playzone", async () => {
    assert.equal(isYardPointInPlayzone("meadow", 50, 8), false);
    assert.equal(isYardPointInPlayzone("tea_house", 92, 52), false);
    assert.equal(isYardPointInPlayzone("tea_house", 50, 70), true);

    const clampedMeadow = clampYardPointToPlayzone("meadow", { x: 50, y: 8 });
    assert.ok(isYardPointInPlayzone("meadow", clampedMeadow.x, clampedMeadow.y));
    assert.ok(clampedMeadow.y > 18);

    const clampedTea = clampYardPointToPlayzone("tea_house", { x: 92, y: 52 });
    assert.ok(isYardPointInPlayzone("tea_house", clampedTea.x, clampedTea.y));

    const p = createDefaultPlayer("yard-playzone-place", "Yard");
    p.yard.remodel = "tea_house";
    p.yard.ownedRemodels = ["meadow", "moon_garden", "tea_house"];
    const placed = await applyAction(p, "yard.placeGoodie", {
      goodieId: "yarn_mouse",
      x: 92,
      y: 52,
    });

    assert.equal(placed.status, 200);
    assert.ok(isYardPointInPlayzone("tea_house", p.yard.placedGoodies[0].x, p.yard.placedGoodies[0].y));
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
    assert.equal(p.yard.placedGoodies[0].x, 28);
    assert.equal(p.yard.placedGoodies[0].y, 76);

    const picked = await applyAction(p, "yard.pickupGoodie", { slotId: "large-1" });
    assert.equal(picked.status, 200);
    assert.equal(p.yard.placedGoodies.length, 0);
    assert.equal(p.yard.goodieInventory.cardboard_cottage, 1);
  });

  it("places and moves goodies at free yard coordinates", async () => {
    const p = createDefaultPlayer("yard-free-place", "Yard");

    const placed = await applyAction(p, "yard.placeGoodie", {
      goodieId: "yarn_mouse",
      x: 48.5,
      y: 67.25,
    });
    assert.equal(placed.status, 200);
    assert.match(p.yard.placedGoodies[0].slotId, /^free_/);
    assert.equal(p.yard.placedGoodies[0].x, 48.5);
    assert.equal(p.yard.placedGoodies[0].y, 67.25);

    const moved = await applyAction(p, "yard.moveGoodie", {
      slotId: p.yard.placedGoodies[0].slotId,
      x: 72,
      y: 41,
    });
    assert.equal(moved.status, 200);
    assert.equal(p.yard.placedGoodies[0].x, 72);
    assert.equal(p.yard.placedGoodies[0].y, 41);
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
    const treatsAfterExpansion = p.yard.currencies.treats;
    const shinyAfterExpansion = p.yard.currencies.shinyTreats;

    const remodel = await applyAction(p, "yard.setRemodel", { remodelId: "moon_garden", now: start });
    assert.equal(remodel.status, 200);
    assert.equal(p.yard.remodel, "moon_garden");
    assert.equal(p.yard.currencies.treats, treatsAfterExpansion);
    assert.equal(p.yard.currencies.shinyTreats, shinyAfterExpansion);

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

  it("starts Yard with meadow and moon garden owned while Tea House remains the first shop background", async () => {
    const start = 1_800_000_000_000;
    const p = createDefaultPlayer("yard-backgrounds", "Yard", start);

    assert.deepEqual(p.yard.ownedRemodels, ["meadow", "moon_garden"]);
    assert.equal(YARD_REMODELS.tea_house.shopOrder, 1);
    assert.equal(YARD_REMODELS.tea_house.starterOwned, false);

    p.yard.currencies.treats = YARD_REMODELS.tea_house.cost.treats;
    const teaHouse = await applyAction(p, "yard.setRemodel", { remodelId: "tea_house", now: start });

    assert.equal(teaHouse.status, 200);
    assert.equal(p.yard.remodel, "tea_house");
    assert.ok(p.yard.ownedRemodels.includes("tea_house"));
    assert.equal(p.yard.currencies.treats, 0);
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

  it("uses generated runtime assets between manual overrides and legacy fallbacks", () => {
    const manualManifest = {
      graphics: {
        games: {
          companionYard: {
            backgrounds: {
              meadow: "/custom-yard/backgrounds/meadow.webp",
            },
          },
        },
      },
    };
    const runtimeManifest = {
      assets: {
        "companionYard.backgrounds.meadow": {
          type: "image",
          src: "/assets-runtime/companion-yard/backgrounds/meadow.1234abcd.webp",
        },
        "companionYard.backgrounds.tea_house": {
          type: "image",
          src: "/assets-runtime/companion-yard/backgrounds/tea_house.1234abcd.webp",
        },
        "companionYard.visitors.mika_cat_pounce": {
          type: "image",
          src: "/assets-runtime/companion-yard/visitors/mika_cat_pounce.1234abcd.webp",
        },
      },
    };

    assert.equal(
      resolveCompanionYardAsset(manualManifest, "backgrounds", "meadow", runtimeManifest),
      "/custom-yard/backgrounds/meadow.webp",
    );
    assert.equal(
      resolveCompanionYardAsset(manualManifest, "backgrounds", "tea_house", runtimeManifest),
      "/assets-runtime/companion-yard/backgrounds/tea_house.1234abcd.webp",
    );
    assert.equal(
      resolveCompanionYardAsset(manualManifest, "foods", "empty_bowl", runtimeManifest),
      "/games/companion-yard/foods/empty_bowl.png",
    );
    assert.equal(
      resolveCompanionYardAsset(manualManifest, "visitors", "mika_cat_pounce", runtimeManifest),
      "/assets-runtime/companion-yard/visitors/mika_cat_pounce.1234abcd.webp",
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
